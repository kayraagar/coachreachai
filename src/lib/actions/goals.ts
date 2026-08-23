"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormResult } from "@/lib/actions/logs";
import type { GoalType, Period } from "@/lib/database.types";

export async function addGoal(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const student_id = String(formData.get("student_id") || "");
  const goal_type = String(formData.get("goal_type") || "") as GoalType;
  const subject_id = String(formData.get("subject_id") || "") || null;
  const target_value = Number(formData.get("target_value") || 0);
  const period = String(formData.get("period") || "daily") as Period;

  if (!student_id || !goal_type || !target_value) {
    return { error: "Öğrenci, hedef türü ve değer zorunlu." };
  }

  const { error } = await supabase.from("goals").insert({
    student_id,
    created_by: user.id,
    goal_type,
    subject_id,
    target_value,
    period,
    start_date: new Date().toISOString().slice(0, 10),
    end_date: null,
    active: true,
  });

  if (error) return { error: "Hedef kaydedilemedi: " + error.message };

  revalidatePath(`/koc/${student_id}`);
  revalidatePath("/ogrenci");
  return { ok: true };
}

export async function deactivateGoal(id: string, studentId: string) {
  const supabase = await createClient();
  await supabase.from("goals").update({ active: false }).eq("id", id);
  revalidatePath(`/koc/${studentId}`);
  revalidatePath("/ogrenci");
}
