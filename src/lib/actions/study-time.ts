"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormResult } from "@/lib/actions/types";

/**
 * Sorulardan bağımsız çalışma süresi (migration 007).
 * Süre saat + dakika olarak girilir, toplam dakika olarak yazılır.
 */
export async function addStudyTime(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const entry_date = String(formData.get("entry_date") || "");
  const hours = Number(formData.get("hours") || 0);
  const mins = Number(formData.get("minutes") || 0);
  const subject_id = String(formData.get("subject_id") || "") || null;
  const note = String(formData.get("note") || "").trim().slice(0, 200);

  if (!entry_date) return { error: "Tarih zorunlu." };
  if ([hours, mins].some((n) => Number.isNaN(n) || n < 0 || !Number.isInteger(n))) {
    return { error: "Saat ve dakika tam sayı olmalı." };
  }

  const minutes = hours * 60 + mins;
  if (minutes <= 0) return { error: "Çalışma süresi girmelisin." };
  if (minutes > 1440) return { error: "Bir kayıt 24 saati geçemez." };

  const { error } = await supabase.from("study_time_entries").insert({
    student_id: user.id,
    entry_date,
    minutes,
    subject_id,
    note,
  });

  if (error) return { error: "Kaydedilemedi: " + error.message };

  revalidatePath("/ogrenci");
  revalidatePath("/ogrenci/soru-girisi");
  return { ok: true };
}

export async function deleteStudyTime(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("study_time_entries").delete().eq("id", id).eq("student_id", user.id);
  revalidatePath("/ogrenci");
  revalidatePath("/ogrenci/soru-girisi");
}
