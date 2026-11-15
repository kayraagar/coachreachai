"use server";

/**
 * Çita ekip/koç işlemleri. Yetki veritabanında doğrulanır:
 * - cita_admin_assign_coach → is_admin
 * - resources / cita_settings yazma → RLS (is_admin)
 * - cita_coach_decide → is_coach_of(öğrenci)
 */
import { revalidatePath } from "next/cache";
import { validateOps, type PlanOp } from "@cita/core";
import { createClient } from "@/lib/supabase/server";
import type { FormResult } from "@/lib/actions/types";

export async function assignCoach(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const supabase = await createClient();
  const student = String(formData.get("student_id") || "");
  const coach = String(formData.get("coach_id") || "") || null;
  const { data, error } = await supabase.rpc("cita_admin_assign_coach", { p_student: student, p_coach: coach });
  if (error) return { error: "Atanamadı: " + error.message };
  if (data !== "ok") return { error: data === "coach_not_found" ? "Koç bulunamadı." : "Öğrenci bulunamadı." };
  revalidatePath("/admin");
  return { ok: true };
}

const LEVELS = ["başlangıç", "orta", "ileri", "tümü"];
const TYPES = ["kitap", "soru bankası", "video", "deneme", "site", "uygulama", "diğer"];

function resourceFromForm(formData: FormData) {
  const url = String(formData.get("url") || "").trim();
  const row = {
    exam: String(formData.get("exam") || ""),
    exam_part: String(formData.get("exam_part") || "") || null,
    subject: String(formData.get("subject") || "").trim(),
    topic: String(formData.get("topic") || "").trim() || null,
    level: String(formData.get("level") || ""),
    type: String(formData.get("type") || ""),
    title: String(formData.get("title") || "").trim(),
    url: url || null,
    source_name: String(formData.get("source_name") || "").trim(),
    notes: String(formData.get("notes") || "").trim(),
    approved: formData.get("approved") === "on",
    last_checked: String(formData.get("last_checked") || "") || new Date().toISOString().slice(0, 10),
  };
  if (!["YKS", "LGS"].includes(row.exam)) return { error: "Sınav YKS ya da LGS olmalı." };
  if (!row.subject || row.title.length < 2) return { error: "Ders ve başlık gerekli." };
  if (!LEVELS.includes(row.level) || !TYPES.includes(row.type)) return { error: "Seviye/tür geçersiz." };
  if (row.url && !/^https?:\/\//.test(row.url)) return { error: "Bağlantı http(s) ile başlamalı." };
  return { row };
}

export async function saveResource(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const supabase = await createClient();
  const parsed = resourceFromForm(formData);
  if ("error" in parsed) return { error: parsed.error! };
  const id = String(formData.get("id") || "");
  const { error } = id
    ? await supabase.from("resources").update(parsed.row).eq("id", id)
    : await supabase.from("resources").insert({ ...parsed.row, created_by: (await supabase.auth.getUser()).data.user?.id });
  if (error) return { error: "Kaydedilemedi: " + error.message };
  revalidatePath("/admin/kaynaklar");
  return { ok: true };
}

export async function deleteResource(id: string) {
  const supabase = await createClient();
  await supabase.from("resources").delete().eq("id", id);
  revalidatePath("/admin/kaynaklar");
}

export async function savePhotoLimits(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const supabase = await createClient();
  const val: Record<string, number> = {};
  for (const t of ["free", "plus", "bire_bir"]) {
    const n = Number(formData.get(t));
    if (!Number.isInteger(n) || n < 0 || n > 100) return { error: "Limitler 0–100 arası tam sayı olmalı." };
    val[t] = n;
  }
  const { error } = await supabase.from("cita_settings").upsert({ key: "photo_limits", value: val, updated_at: new Date().toISOString() });
  if (error) return { error: "Kaydedilemedi: " + error.message };
  revalidatePath("/admin/ayarlar");
  return { ok: true };
}

/** Koç: Bire Bir öğrencisinin onayladığı öneriyi onayla / düzenleyip uygula / reddet. */
export async function coachDecide(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const supabase = await createClient();
  const id = String(formData.get("proposal_id") || "");
  const decision = String(formData.get("decision") || "");
  const note = String(formData.get("note") || "").slice(0, 500);
  let ops: PlanOp[] | null = null;
  if (decision === "edit") {
    try {
      const original = JSON.parse(String(formData.get("ops_json") || "[]")) as PlanOp[];
      // Koç yalnızca "sonra" alanlarını düzenler; "önce" değerleri sunucudaki kayıttan gelir.
      ops = original
        .map((o, i) => {
          if (formData.get(`drop_${i}`) === "on") return null;
          if (o.op === "remove") return o;
          const after = {
            date: String(formData.get(`date_${i}`) || o.after.date),
            title: String(formData.get(`title_${i}`) || o.after.title),
            minutes: formData.get(`minutes_${i}`) === "" ? null : Number(formData.get(`minutes_${i}`) ?? o.after.minutes),
          };
          return { ...o, after } as PlanOp;
        })
        .filter((o): o is PlanOp => o !== null);
    } catch {
      return { error: "Düzenleme okunamadı." };
    }
    const v = validateOps(ops);
    if (!v.ok) return { error: v.error };
  }
  const { data, error } = await supabase.rpc("cita_coach_decide", { p_proposal: id, p_decision: decision, p_ops: ops, p_note: note });
  if (error) return { error: "İşlem başarısız: " + error.message };
  revalidatePath("/koc/onaylar");
  if (data?.status === "stale") return { error: "Öğrencinin programı bu arada değişti; öneri uygulanmadı (hiçbir şey değişmedi)." };
  return { ok: true };
}
