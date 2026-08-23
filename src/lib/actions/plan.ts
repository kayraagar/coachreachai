"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormResult } from "@/lib/actions/logs";

export async function addPlanItem(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const plan_date = String(formData.get("plan_date") || "");
  const title = String(formData.get("title") || "").trim();
  const subject_id = String(formData.get("subject_id") || "") || null;
  const planned_minutes = formData.get("planned_minutes")
    ? Number(formData.get("planned_minutes"))
    : null;

  if (!plan_date || !title) return { error: "Tarih ve başlık zorunlu." };

  const { error } = await supabase.from("study_plan_items").insert({
    student_id: user.id,
    plan_date,
    title,
    subject_id,
    planned_minutes,
    completed: false,
    actual_minutes: null,
    topic_id: null,
  });

  if (error) return { error: "Kaydedilemedi: " + error.message };

  revalidatePath("/ogrenci");
  revalidatePath("/ogrenci/program");
  return { ok: true };
}

export async function toggleCompleted(id: string, completed: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("study_plan_items")
    .update({ completed })
    .eq("id", id)
    .eq("student_id", user.id);

  revalidatePath("/ogrenci");
  revalidatePath("/ogrenci/program");
}

export async function deletePlanItem(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("study_plan_items").delete().eq("id", id).eq("student_id", user.id);
  revalidatePath("/ogrenci");
  revalidatePath("/ogrenci/program");
}
