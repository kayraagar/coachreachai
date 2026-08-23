"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormResult } from "@/lib/actions/logs";

export async function addExam(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const name = String(formData.get("name") || "").trim();
  const exam_date = String(formData.get("exam_date") || "");
  const exam_type = String(formData.get("exam_type") || "") as "TYT" | "AYT" | "Branş";

  if (!name || !exam_date || !exam_type) {
    return { error: "Sınav adı, tarih ve tür zorunlu." };
  }

  const { data: exam, error } = await supabase
    .from("exams")
    .insert({ student_id: user.id, name, exam_date, exam_type })
    .select("id")
    .single();

  if (error || !exam) return { error: "Sınav kaydedilemedi: " + error?.message };

  // Ders bazlı sonuçlar subject_ids[] / correct[] / wrong[] / blank[] paralel dizileri olarak gelir.
  const subjectIds = formData.getAll("subject_id") as string[];
  const corrects = formData.getAll("correct") as string[];
  const wrongs = formData.getAll("wrong") as string[];
  const blanks = formData.getAll("blank") as string[];

  const rows = subjectIds
    .map((subject_id, i) => ({
      exam_id: exam.id,
      subject_id,
      correct_count: Number(corrects[i] || 0),
      wrong_count: Number(wrongs[i] || 0),
      blank_count: Number(blanks[i] || 0),
    }))
    .filter((r) => r.subject_id && (r.correct_count || r.wrong_count || r.blank_count));

  if (rows.length > 0) {
    const { error: resErr } = await supabase.from("exam_results").insert(rows);
    if (resErr) return { error: "Ders sonuçları kaydedilemedi: " + resErr.message };
  }

  revalidatePath("/ogrenci");
  revalidatePath("/ogrenci/denemeler");
  return { ok: true };
}

export async function deleteExam(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("exams").delete().eq("id", id).eq("student_id", user.id);
  revalidatePath("/ogrenci");
  revalidatePath("/ogrenci/denemeler");
}
