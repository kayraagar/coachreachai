/**
 * Çita+ yanlış defteri. Öğrenci soruyu İSTEYEREK kaydeder. Hata türü önerilir;
 * öğrenci onaylamadan "doğrulanmış" sayılmaz (örüntü analizine girmez).
 * Paket kontrolü hem burada hem RLS'te (mistakes_insert_plus).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isErrorType, recurringPatterns, type MistakeRecord } from "@cita/core";
import { errorResponse, HttpError, json, readJson, requireStudent } from "@/lib/cita/server";

type Body = {
  photoRequestId?: string | null;
  subject?: string;
  topic?: string | null;
  questionText?: string;
  errorType?: string | null;
  confirmed?: boolean;
  note?: string;
};

async function requirePlus(db: SupabaseClient) {
  const { data: tier } = await db.rpc("cita_my_tier");
  if (tier !== "plus" && tier !== "bire_bir") throw new HttpError(402, "plus_required", "Yanlış defteri Çita+ ile açılır.");
}

export async function GET(req: Request) {
  try {
    const { db, user } = await requireStudent(req);
    const { data } = await db
      .from("mistakes")
      .select("id, created_at, subject, topic, question_text, error_type, error_type_suggested, error_type_confirmed, learning_note, next_review_date")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as (MistakeRecord & Record<string, unknown>)[];
    const patterns = recurringPatterns(rows);
    return json({ mistakes: rows, patterns });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const { db, user } = await requireStudent(req);
    await requirePlus(db);
    const b = await readJson<Body>(req);
    const subject = String(b.subject ?? "").trim();
    if (!subject || subject.length > 80) throw new HttpError(400, "subject", "Ders gerekli.");
    const errorType = b.errorType && isErrorType(b.errorType) ? b.errorType : null;

    let questionText = String(b.questionText ?? "").slice(0, 4000);
    let suggested: string | null = null;
    if (b.photoRequestId) {
      const { data: pr } = await db.from("photo_requests").select("id, question_text, solution, status").eq("id", b.photoRequestId).maybeSingle();
      if (!pr || pr.status !== "hint") throw new HttpError(404, "photo_not_found", "Kaydedilecek soru bulunamadı.");
      questionText = questionText || pr.question_text || "";
      suggested = (pr.solution as { likelyErrorTypes?: string[] } | null)?.likelyErrorTypes?.[0] ?? null;
    }
    const row = {
      student_id: user.id,
      photo_request_id: b.photoRequestId ?? null,
      subject,
      topic: b.topic?.trim() || null,
      question_text: questionText,
      error_type: errorType,
      error_type_suggested: suggested,
      error_type_confirmed: Boolean(errorType && b.confirmed),
      learning_note: String(b.note ?? "").slice(0, 1000),
    };
    const ins = await db.from("mistakes").upsert(row, { onConflict: "student_id,photo_request_id" }).select("*").single();
    if (ins.error) throw new HttpError(ins.error.code === "42501" ? 402 : 500, "db", ins.error.message);
    return json({ mistake: ins.data });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Hata türünü öğrenciyle doğrula ("Denklemi kurarken mi, işlemi yaparken mi takıldın?"). */
export async function PATCH(req: Request) {
  try {
    const { db } = await requireStudent(req);
    await requirePlus(db);
    const b = await readJson<{ id?: string; errorType?: string; note?: string }>(req);
    if (!b.id || !isErrorType(b.errorType)) throw new HttpError(400, "invalid", "Geçerli hata türü seç.");
    const upd = await db
      .from("mistakes")
      .update({ error_type: b.errorType, error_type_confirmed: true, ...(b.note !== undefined ? { learning_note: String(b.note).slice(0, 1000) } : {}) })
      .eq("id", b.id)
      .select("*")
      .single();
    if (upd.error) throw new HttpError(500, "db", upd.error.message);
    return json({ mistake: upd.data });
  } catch (e) {
    return errorResponse(e);
  }
}
