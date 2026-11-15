/**
 * Çita+ tanıtımı için öğrencinin KENDİ verisinden tek bir gerçek analiz örneği.
 * Öncelik: doğrulanmış yanlış örüntüsü → aynı türde ≥2 deneme → çalışma kayıtları.
 * Hiçbiri yeterli değilse "insufficient" döner; kişisel bulgu uydurulmaz.
 */
import { addDays, analysisPreview, istanbulDate, type StoredExam } from "@cita/core";
import { errorResponse, json, requireStudent } from "@/lib/cita/server";

export async function GET(req: Request) {
  try {
    const { db, user } = await requireStudent(req);
    const since = addDays(istanbulDate(), -30);
    const [m, e, st] = await Promise.all([
      db.from("mistakes").select("id, created_at, subject, topic, error_type, error_type_confirmed").eq("student_id", user.id),
      db.from("exams").select("id, exam_type, exam_date, name, exam_results(correct_count, wrong_count, blank_count, net, subjects(name))").eq("student_id", user.id),
      db.from("study_time_entries").select("entry_date, minutes, subjects(name)").eq("student_id", user.id).gte("entry_date", since),
    ]);
    const exams: StoredExam[] = (e.data ?? []).map((x) => ({
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
    const studyMinutes = (st.data ?? []).map((s) => ({
      date: s.entry_date,
      minutes: s.minutes,
      subject: (s.subjects as unknown as { name: string } | null)?.name ?? null,
    }));
    const preview = analysisPreview({ mistakes: m.data ?? [], exams, studyMinutes });
    return json({ preview });
  } catch (e) {
    return errorResponse(e);
  }
}
