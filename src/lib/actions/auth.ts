"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/database.types";

export type AuthResult = { error: string } | void;

export async function signIn(
  _prev: AuthResult,
  formData: FormData
): Promise<AuthResult> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { error: "E-posta ve şifre gerekli." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Giriş başarısız: " + error.message };;
  }

  redirect("/");
}

export async function signUp(
  _prev: AuthResult,
  formData: FormData
): Promise<AuthResult> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("full_name") || "").trim();
  const role = String(formData.get("role") || "student") as Role;
  const coachCode = String(formData.get("coach_code") || "").trim();

  if (!email || !password || !fullName) {
    return { error: "Tüm alanları doldur." };
  }
  if (password.length < 6) {
    return { error: "Şifre en az 6 karakter olmalı." };
  }
  if (role === "student" && !coachCode) {
    return { error: "Koçunun sana verdiği koç kodunu (e-postasını) gir." };
  }

  const supabase = await createClient();

  let coachId: string | null = null;
  if (role === "student") {
    const { data: coach } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("email", coachCode)
      .maybeSingle();

    if (!coach || coach.role !== "coach") {
      return { error: "Bu koç koduna (e-posta) sahip bir koç bulunamadı." };
    }
    coachId = coach.id;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, role },
    },
  });

  if (error) {
    return { error: "Kayıt başarısız: " + error.message };
  }

  // coach_id'yi trigger sonrası ayrıca güncelle (trigger sadece role/full_name/email atıyor).
  if (data.user && coachId) {
    await supabase
      .from("profiles")
      .update({ coach_id: coachId })
      .eq("id", data.user.id);
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/giris");
}
