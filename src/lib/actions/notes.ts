"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormResult } from "@/lib/actions/logs";
import type { Mood } from "@/lib/database.types";

export async function addNote(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const student_id = String(formData.get("student_id") || user.id);
  const content = String(formData.get("content") || "").trim();
  const mood = String(formData.get("mood") || "") || null;

  if (!content) return { error: "Not boş olamaz." };

  const { error } = await supabase.from("notes").insert({
    student_id,
    author_id: user.id,
    content,
    mood: mood as Mood | null,
    note_date: new Date().toISOString().slice(0, 10),
  });

  if (error) return { error: "Kaydedilemedi: " + error.message };

  revalidatePath("/ogrenci/notlar");
  revalidatePath(`/koc/${student_id}`);
  return { ok: true };
}
