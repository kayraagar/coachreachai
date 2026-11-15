/**
 * Sohbet. Idempotent: istemci her mesaj için sabit bir clientId gönderir;
 * tekrar denemede aynı kullanıcı mesajı ve (varsa) aynı cevap döner.
 * Model programı değiştirmez; değişiklik bir öneri (plan_proposals) olur.
 */
import { randomUUID } from "node:crypto";
import { aiProvider, AiUnavailableError } from "@/lib/cita/ai";
import { findResources, loadStudentContext, toSafeOps, type ResourceCard } from "@/lib/cita/context";
import { errorResponse, HttpError, json, readJson, requireStudent, serviceClient } from "@/lib/cita/server";

type Body = { clientId?: string; text?: string };

export async function GET(req: Request) {
  try {
    const { db, user } = await requireStudent(req);
    const { data } = await db
      .from("chat_messages")
      .select("id, role, content, card, provider, created_at")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60);
    return json({ messages: (data ?? []).reverse() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const { db, user } = await requireStudent(req);
    const body = await readJson<Body>(req);
    const text = String(body.text ?? "").trim();
    const clientId = String(body.clientId ?? "");
    if (!text || text.length > 2000) throw new HttpError(400, "invalid_text", "Mesaj 1–2000 karakter olmalı.");
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(clientId)) throw new HttpError(400, "invalid_client_id", "clientId gerekli.");

    // 1) Kullanıcı mesajı (öğrencinin kendi oturumuyla, RLS)
    let userMsgId: string;
    const ins = await db.from("chat_messages").insert({ student_id: user.id, role: "user", content: text, client_id: clientId }).select("id").single();
    if (ins.error) {
      if (ins.error.code !== "23505") throw new HttpError(500, "db", ins.error.message);
      const ex = await db.from("chat_messages").select("id").eq("student_id", user.id).eq("client_id", clientId).single();
      userMsgId = ex.data!.id;
      const prev = await db.from("chat_messages").select("id, role, content, card, provider, created_at").eq("reply_to", userMsgId).maybeSingle();
      if (prev.data) return json({ userMessageId: userMsgId, reply: prev.data, replayed: true });
    } else userMsgId = ins.data.id;

    // 2) Cevap
    const ctx = await loadStudentContext(db, user.id);
    ctx.history = ctx.history.filter((h, i, a) => !(i === a.length - 1 && h.role === "user" && h.content === text));
    const ai = aiProvider();
    let out;
    try {
      out = await ai.chat(ctx, text);
    } catch (e) {
      if (e instanceof AiUnavailableError) throw new HttpError(503, "ai_unavailable", "Çita şu an cevap veremiyor. Biraz sonra tekrar dene.");
      throw e;
    }

    let card: Record<string, unknown> | null = null;
    let reply = out.reply;
    if (out.planChange) {
      const ops = toSafeOps(ctx, out.planChange);
      if (ops) {
        const { data: proposal, error } = await db.rpc("cita_create_proposal", {
          p_idempotency_key: `chat-${userMsgId}`,
          p_source: "chat",
          p_summary: out.planChange.summary.slice(0, 500) || "Program değişikliği",
          p_ops: ops,
        });
        if (error) throw new HttpError(500, "proposal", error.message);
        card = { type: "proposal", proposalId: proposal.id };
      } else {
        reply += " (Önerdiğim değişiklik mevcut programınla eşleşmedi; bu yüzden kart oluşturmadım. Hangi günü değiştirmek istediğini yazar mısın?)";
      }
    } else if (out.resourceQuery) {
      const res: ResourceCard = await findResources(db, ctx.track, out.resourceQuery);
      card = { type: "resources", ...res };
      if (!res.items.length) reply += " Şu an uygun bir kaynak bulamadım; ekip kataloğu genişletiyor.";
    }
    if (out.verifyTopicQuestion) reply += `\n\n${out.verifyTopicQuestion}`;

    // 3) Asistan mesajı (servis rolü; reply_to benzersiz → eşzamanlı tekrar denemede tek cevap)
    const svc = serviceClient();
    const saved = await svc
      .from("chat_messages")
      .insert({ id: randomUUID(), student_id: user.id, role: "assistant", content: reply.slice(0, 6000), card, provider: ai.name, reply_to: userMsgId })
      .select("id, role, content, card, provider, created_at")
      .single();
    if (saved.error) {
      if (saved.error.code === "23505") {
        const prev = await svc.from("chat_messages").select("id, role, content, card, provider, created_at").eq("reply_to", userMsgId).single();
        return json({ userMessageId: userMsgId, reply: prev.data, replayed: true });
      }
      throw new HttpError(500, "db", saved.error.message);
    }
    return json({ userMessageId: userMsgId, reply: saved.data, replayed: false });
  } catch (e) {
    return errorResponse(e);
  }
}
