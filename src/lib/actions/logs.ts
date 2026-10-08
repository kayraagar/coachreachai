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
  // Süre saat olarak girilir (1.5 = 1 sa 30 dk), mevcut duration_minutes
  // kolonuna dakika olarak yazılır.
  const durationHoursRaw = String(formData.get("duration_hours") || "").replace(",", ".").trim();
  const duration_hours = durationHoursRaw ? Number(durationHoursRaw) : null;

  if (!log_date || !subject_id) {
    return { error: "Tarih ve ders zorunlu." };
  }
  if ([correct_count, wrong_count, blank_count].some((n) => Number.isNaN(n) || n < 0)) {
    return { error: "Doğru/yanlış/boş sayıları geçerli olmalı." };
  }
  if (duration_hours !== null && (Number.isNaN(duration_hours) || duration_hours < 0 || duration_hours > 24)) {
    return { error: "Çalışma süresi 0 ile 24 saat arasında olmalı." };
  }
  const duration_minutes = duration_hours === null ? null : Math.round(duration_hours * 60);

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
