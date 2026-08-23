"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
    return { error: "Koçunun sana verdiği koç kodunu gir." };
  }

  const supabase = await createClient();

  // Koç doğrulaması SECURITY DEFINER bir fonksiyon üzerinden yapılır: kayıt
  // anında kullanıcı henüz anonim olduğu için profiles tablosu RLS nedeniyle
  // doğrudan sorgulanamaz (auth.uid() NULL → daima 0 satır).
  if (role === "student") {
    const { data: coachId, error: rpcError } = await supabase.rpc("resolve_coach", {
      code: coachCode,
    });

    if (rpcError) {
      return { error: "Koç kodu doğrulanamadı: " + rpcError.message };
    }
    if (!coachId) {
      return {
        error:
          "Bu koç kodu bulunamadı. Koçunun paylaştığı 6 haneli kodu ya da e-posta adresini kontrol et.",
      };
    }
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // coach_code metadata'ya konur; profil satırı oluşurken handle_new_user
      // trigger'ı coach_id'yi atomik olarak yazar. Böylece e-posta doğrulaması
      // açıkken (oturum yokken) de bağlantı kurulur.
      data: {
        full_name: fullName,
        role,
        ...(role === "student" ? { coach_code: coachCode } : {}),
      },
    },
  });

  if (error) {
    return { error: "Kayıt başarısız: " + error.message };
  }

  redirect("/");
}

/** Kayıtlı ama koçu atanmamış öğrenciyi koçuna bağlar. */
export async function linkCoach(
  _prev: AuthResult,
  formData: FormData
): Promise<AuthResult> {
  const code = String(formData.get("coach_code") || "").trim();
  if (!code) return { error: "Koç kodunu gir." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_coach", { code });

  if (error) return { error: "Bağlanılamadı: " + error.message };

  switch (data) {
    case "ok":
      break;
    case "not_found":
      return { error: "Bu koç kodu bulunamadı. Koçunla birlikte kontrol edin." };
    case "already_linked":
      return { error: "Zaten bir koça bağlısın." };
    default:
      return { error: "Bu işlemi yalnızca öğrenci hesapları yapabilir." };
  }

  revalidatePath("/ogrenci");
  redirect("/ogrenci");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/giris");
}
