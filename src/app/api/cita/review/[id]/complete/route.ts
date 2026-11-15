/**
 * Tekrar oturumunu bitir: her soru için bağımsız doğru / ipucu kullanımı /
 * bağımsız adım sayısı kaydedilir. Sonraki tekrar tarihi hesaplanır ve
 * programa eklenmesi ÖNERİ olarak aynı onay akışına girer (doğrudan yazılmaz).
 */
import { istanbulDate, nextReviewDate, type ReviewItem, type ReviewResult } from "@cita/core";
import { errorResponse, HttpError, json, readJson, requireStudent, serviceClient } from "@/lib/cita/server";

type Answer = { itemIndex: number; choice: string | null; usedHint: boolean; independentSteps: number };

export async function POST(req: Request, ctx: RouteContext<"/api/cita/review/[id]/complete">) {
  try {
    const { id } = await ctx.params;
    const { db, user } = await requireStudent(req);
    const { data: s } = await db.from("review_sessions").select("*").eq("id", id).maybeSingle();
    if (!s) throw new HttpError(404, "not_found", "Tekrar oturumu bulunamadı.");
    const items = s.items as ReviewItem[];
    if (s.status === "completed") {
      return json({ results: s.results, summary: s.summary, nextReviewDate: s.next_review_date, proposalId: s.proposal_id, solutions: items, replayed: true });
    }
    const { answers } = await readJson<{ answers?: Answer[] }>(req);
    if (!Array.isArray(answers) || answers.length !== items.length) throw new HttpError(400, "answers", "Her soru için sonuç gerekli.");

    const results: ReviewResult[] = answers.map((a, idx) => {
      const item = items[idx];
      // Eski soru açık uçluysa (şık yok) öğrencinin öz değerlendirmesi: choice === "dogru".
      const correct = item.choices ? a.choice === item.answer : a.choice === "dogru";
      return { itemIndex: idx, correct, usedHint: Boolean(a.usedHint), independentSteps: Math.max(0, Math.min(20, Math.round(a.independentSteps || 0))) };
    });

    const { data: m } = await db.from("mistakes").select("subject, topic, next_review_date, last_reviewed_at").eq("id", s.mistake_id).single();
    const prevInterval = m?.last_reviewed_at && m?.next_review_date
      ? Math.max(0, Math.round((Date.parse(m.next_review_date) - Date.parse(m.last_reviewed_at)) / 86_400_000))
      : 0;
    const next = nextReviewDate(istanbulDate(), results, prevInterval);

    // Sonraki tekrar → program önerisi (öğrenci / Bire Bir'de koç onayıyla uygulanır)
    const { data: proposal, error: pErr } = await db.rpc("cita_create_proposal", {
      p_idempotency_key: `review-${id}`,
      p_source: "review",
      p_summary: `Kişisel tekrar: ${m?.subject ?? ""}${m?.topic ? ` · ${m.topic}` : ""} (${next.date})`,
      p_ops: [{ op: "add", after: { date: next.date, title: `Tekrar: ${m?.subject ?? "Yanlış"}${m?.topic ? ` · ${m.topic}` : ""}`, minutes: 20 } }],
    });
    if (pErr) throw new HttpError(500, "proposal", pErr.message);

    const svc = serviceClient();
    await svc.from("review_sessions").update({
      status: "completed", results, summary: next.summary, next_review_date: next.date, proposal_id: proposal.id, completed_at: new Date().toISOString(),
    }).eq("id", id).eq("status", "active");
    await svc.from("mistakes").update({ last_reviewed_at: new Date().toISOString(), next_review_date: next.date }).eq("id", s.mistake_id).eq("student_id", user.id);

    return json({ results, summary: next.summary, nextReviewDate: next.date, proposalId: proposal.id, solutions: items, replayed: false });
  } catch (e) {
    return errorResponse(e);
  }
}
