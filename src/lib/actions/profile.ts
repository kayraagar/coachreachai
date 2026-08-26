"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormResult } from "@/lib/actions/types";
import { asTrack, isTrack } from "@/lib/track";

/**
 * Öğrencinin sınav kolunu değiştirir (koç yetkisi).
 *
 * Yanlış kolda açılmış ya da 003 migration'ından önce oluşmuş hesapları
 * düzeltmek için gerekli. RLS + protect_profile_fields koçun bu satırda
 * yalnızca track alanına dokunabilmesini garanti eder (bkz. migration 004).
 */
export async function setStudentTrack(
  _prev: FormResult,
  formData: FormData
): Promise<FormResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const studentId = String(formData.get("student_id") || "");
  const raw = formData.get("track");

  if (!studentId) return { error: "Öğrenci bulunamadı." };
  if (!isTrack(raw)) return { error: "Geçersiz sınav seçimi." };

  const track = asTrack(raw);

  const { data, error } = await supabase
    .from("profiles")
    .update({ track })
    .eq("id", studentId)
    .eq("role", "student")
    .select("id, track")
    .maybeSingle();

  if (error) return { error: "Sınav değiştirilemedi: " + error.message };
  if (!data) {
    return {
      error:
        "Bu öğrencinin sınavını değiştiremedin. 004 numaralı migration'ın çalıştırıldığından emin ol.",
    };
  }

  // Kol değişince ders kataloğu, deneme türleri ve net başlıkları da değişir;
  // her iki tarafın panelleri de tazelenmeli.
  revalidatePath(`/koc/${studentId}`);
  revalidatePath(`/koc/${studentId}/gorusmeler`);
  revalidatePath("/koc");
  revalidatePath("/ogrenci");

  return { ok: true };
}
