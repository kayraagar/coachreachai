"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormResult } from "@/lib/actions/types";

/** Ajandanın 6. maddesi: uyku / ekran / beslenme / mola günlük takibi.
 *  Aynı gün için tekrar gönderilirse kayıt güncellenir (upsert). */
export async function saveRoutine(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const log_date = String(formData.get("log_date") || "");
  if (!log_date) return { error: "Tarih zorunlu." };

  const sleepRaw = String(formData.get("sleep_hours") || "").trim();
  const screenRaw = String(formData.get("screen_minutes") || "").trim();
  const mood = String(formData.get("mood") || "").trim() || null;

  const sleep_hours = sleepRaw === "" ? null : Number(sleepRaw);
  const screen_minutes = screenRaw === "" ? null : Number(screenRaw);

  if (sleep_hours !== null && (Number.isNaN(sleep_hours) || sleep_hours < 0 || sleep_hours > 24)) {
    return { error: "Uyku süresi 0–24 saat aralığında olmalı." };
  }
  if (screen_minutes !== null && (Number.isNaN(screen_minutes) || screen_minutes < 0)) {
    return { error: "Ekran süresi geçerli bir dakika değeri olmalı." };
  }

  const { error } = await supabase.from("daily_routines").upsert(
    {
      student_id: user.id,
      log_date,
      sleep_hours,
      screen_minutes,
      nutrition_ok: formData.get("nutrition_ok") === "on",
      breaks_ok: formData.get("breaks_ok") === "on",
      mood: mood as never,
      note: String(formData.get("note") || "").trim(),
    },
    { onConflict: "student_id,log_date" }
  );

  if (error) return { error: "Kaydedilemedi: " + error.message };

  revalidatePath("/ogrenci");
  revalidatePath("/ogrenci/rutinler");
  return { ok: true };
}

export async function deleteRoutine(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("daily_routines").delete().eq("id", id).eq("student_id", user.id);
  revalidatePath("/ogrenci/rutinler");
}
