"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormResult } from "@/lib/actions/types";

export type { FormResult };

export async function addDailyLog(
  _prev: FormResult,
  formData: FormData
): Promise<FormResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const log_date = String(formData.get("log_date") || "");
  const subject_id = String(formData.get("subject_id") || "");
  // Konu listeden seçilmez, öğrenci elle yazar (migration 006).
  const topic_text = String(formData.get("topic_text") || "").trim().slice(0, 120) || null;
  const correct_count = Number(formData.get("correct_count") || 0);
  const wrong_count = Number(formData.get("wrong_count") || 0);
  const blank_count = Number(formData.get("blank_count") || 0);

  if (!log_date || !subject_id) {
    return { error: "Tarih ve ders zorunlu." };
  }
  if ([correct_count, wrong_count, blank_count].some((n) => Number.isNaN(n) || n < 0)) {
    return { error: "Doğru/yanlış/boş sayıları geçerli olmalı." };
  }
  // Çalışma süresi artık soru girişinden bağımsız, ayrı formdan girilir
  // (study_time_entries, migration 007). Eski kayıtlardaki süreler aynen durur.
  const duration_minutes = null;

  const { error } = await supabase.from("daily_logs").insert({
    student_id: user.id,
    log_date,
    subject_id,
    topic_text,
    correct_count,
    wrong_count,
    blank_count,
    duration_minutes,
  });

  if (error) return { error: "Kaydedilemedi: " + error.message };

  revalidatePath("/ogrenci");
  revalidatePath("/ogrenci/soru-girisi");
  return { ok: true };
}

export async function deleteDailyLog(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("daily_logs").delete().eq("id", id).eq("student_id", user.id);
  revalidatePath("/ogrenci");
  revalidatePath("/ogrenci/soru-girisi");
}
