"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormResult } from "@/lib/actions/types";

function touch() {
  revalidatePath("/ogrenci");
  revalidatePath("/ogrenci/soru-girisi");
  revalidatePath("/koc");
}

/** Kronometreyi başlatır: açık bir çalışma oturumu satırı oluşturur. */
export async function startStudySession(
  _prev: FormResult,
  formData: FormData
): Promise<FormResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const subject_id = String(formData.get("subject_id") || "") || null;
  const topic_id = String(formData.get("topic_id") || "") || null;

  const { error } = await supabase.from("study_sessions").insert({
    student_id: user.id,
    subject_id,
    topic_id,
    started_at: new Date().toISOString(),
    ended_at: null,
    minutes: null,
    note: "",
  });

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Zaten devam eden bir çalışma oturumun var."
          : "Oturum başlatılamadı: " + error.message,
    };
  }

  touch();
  return { ok: true };
}

/**
 * Kronometreyi durdurur. Doğru/yanlış/boş girildiyse aynı anda bir
 * daily_logs kaydı da açılır — böylece süre ve soru sayısı birlikte işlenir.
 */
export async function stopStudySession(
  _prev: FormResult,
  formData: FormData
): Promise<FormResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const id = String(formData.get("session_id") || "");
  if (!id) return { error: "Oturum bulunamadı." };

  const { data: session } = await supabase
    .from("study_sessions")
    .select("id, started_at, subject_id, topic_id")
    .eq("id", id)
    .eq("student_id", user.id)
    .maybeSingle();

  if (!session) return { error: "Oturum bulunamadı." };

  const endedAt = new Date();
  const minutes = Math.max(
    0,
    Math.round((endedAt.getTime() - new Date(session.started_at).getTime()) / 60000)
  );

  const note = String(formData.get("note") || "").trim();

  const { error } = await supabase
    .from("study_sessions")
    .update({ ended_at: endedAt.toISOString(), minutes, note })
    .eq("id", id)
    .eq("student_id", user.id);

  if (error) return { error: "Oturum kapatılamadı: " + error.message };

  const correct = Number(formData.get("correct_count") || 0);
  const wrong = Number(formData.get("wrong_count") || 0);
  const blank = Number(formData.get("blank_count") || 0);
  const total = correct + wrong + blank;

  if (session.subject_id && total > 0) {
    const { error: logError } = await supabase.from("daily_logs").insert({
      student_id: user.id,
      log_date: endedAt.toISOString().slice(0, 10),
      subject_id: session.subject_id,
      topic_id: session.topic_id,
      correct_count: correct,
      wrong_count: wrong,
      blank_count: blank,
      duration_minutes: minutes,
    });
    if (logError) {
      return { error: "Süre kaydedildi ama soru kaydı eklenemedi: " + logError.message };
    }
  }

  touch();
  return { ok: true };
}

/** Yanlışlıkla başlatılan oturumu kayıt bırakmadan iptal eder. */
export async function cancelStudySession(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("study_sessions").delete().eq("id", id).eq("student_id", user.id);
  touch();
}
