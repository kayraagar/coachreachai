/**
 * Deneme kaydı: sınav türüne göre ders/soru/net kuralları @cita/core ile
 * doğrulanır, sonra atomik + idempotent RPC ile yazılır (client_id).
 * Karşılaştırmalar yalnızca aynı deneme türü içinde yapılır (netSeries).
 */
import { isIsoDate, netSeries, validateExam, type ExamEntry, type StoredExam } from "@cita/core";
import { errorResponse, HttpError, json, readJson, requireStudent } from "@/lib/cita/server";

type Body = { clientId?: string; examType?: string; name?: string; date?: string; branchQuestions?: number; entries?: ExamEntry[] };

export async function POST(req: Request) {
  try {
    const { db, profile } = await requireStudent(req);
    const b = await readJson<Body>(req);
    if (!b.clientId || !/^[0-9a-f-]{36}$/i.test(b.clientId)) throw new HttpError(400, "client_id", "clientId (UUID) gerekli.");
    if (!isIsoDate(b.date)) throw new HttpError(400, "date", "Tarih YYYY-AA-GG olmalı.");
    const v = validateExam(profile.track, String(b.examType ?? ""), b.entries ?? [], b.branchQuestions);
    if (!v.ok) return json({ error: v.errors.join(" "), code: "invalid_exam", errors: v.errors }, 400);
    const { data, error } = await db.rpc("cita_save_exam", {
      p_client_id: b.clientId,
      p_exam_type: v.rule.type,
      p_name: String(b.name ?? "").slice(0, 120),
      p_date: b.date,
      p_rows: v.rows.map((r) => ({ subject: r.subject, correct: r.correct, wrong: r.wrong, blank: r.blank, questions: r.questions })),
    });
    if (error) throw new HttpError(400, "save_failed", error.message);
    return json({ ...data, totalNet: v.totalNet, rows: v.rows });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET(req: Request) {
  try {
    const { db, user } = await requireStudent(req);
    const { data } = await db
      .from("exams")
      .select("id, exam_type, exam_date, name, exam_results(correct_count, wrong_count, blank_count, net, subjects(name))")
      .eq("student_id", user.id)
      .order("exam_date");
    const exams: StoredExam[] = (data ?? []).map((x) => ({
      id: x.id,
      exam_type: x.exam_type,
      exam_date: x.exam_date,
      name: x.name,
      results: ((x.exam_results ?? []) as unknown as { correct_count: number; wrong_count: number; blank_count: number; net: number; subjects: { name: string } | null }[]).map((r) => ({
        subject: r.subjects?.name ?? "?",
        correct: r.correct_count,
        wrong: r.wrong_count,
        blank: r.blank_count,
        net: Number(r.net),
      })),
    }));
    return json({ exams, series: netSeries(exams) });
  } catch (e) {
    return errorResponse(e);
  }
}
