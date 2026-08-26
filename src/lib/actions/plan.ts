"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormResult } from "@/lib/actions/types";
import { parseAgendaPayload, weekDays, type AgendaPayloadRow } from "@/lib/agenda";

/**
 * Bir haftanın ajandasını istemciden gelen JSON'a göre eşitler.
 *
 * Tek bir yazma yolu var: hem öğrencinin Program sayfası hem koçun görüşme
 * formundaki 7. madde buraya düşer. Haftanın dışındaki satırlara dokunulmaz;
 * hafta içinde gönderilmeyen satırlar silinir.
 *
 * Yetki RLS'e bırakılır: öğrenci kendi satırlarını, koç kendi öğrencisinin
 * satırlarını yazabilir (bkz. migration 005).
 */
export async function syncWeekPlan(
  studentId: string,
  weekStart: string,
  rows: AgendaPayloadRow[]
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const days = weekDays(weekStart);
  if (days.length === 0) return { error: "Geçersiz hafta." };
  const dayset = new Set(days);

  const clean = rows
    .filter((r) => dayset.has(r.date) && r.title.trim() !== "")
    .map((r) => ({
      id: r.id || null,
      student_id: studentId,
      plan_date: r.date,
      title: r.title.trim().slice(0, 300),
      planned_minutes:
        r.minutes === null || Number.isNaN(r.minutes) || r.minutes < 0 ? null : Math.round(r.minutes),
      completed: Boolean(r.completed),
      sort_order: r.sort,
    }));

  // Bu haftada hâlihazırda duran satırlar — gönderilmeyenler silinecek.
  const { data: existing, error: readErr } = await supabase
    .from("study_plan_items")
    .select("id")
    .eq("student_id", studentId)
    .gte("plan_date", days[0])
    .lte("plan_date", days[6]);

  if (readErr) return { error: "Mevcut program okunamadı: " + readErr.message };

  const keep = new Set(clean.map((r) => r.id).filter(Boolean) as string[]);
  const removed = (existing ?? []).map((r) => r.id).filter((id) => !keep.has(id));

  if (removed.length > 0) {
    const { error } = await supabase.from("study_plan_items").delete().in("id", removed);
    if (error) return { error: "Silinemedi: " + error.message };
  }

  const updates = clean.filter((r) => r.id);
  const inserts = clean.filter((r) => !r.id);

  for (const row of updates) {
    const { id, ...fields } = row;
    const { error } = await supabase
      .from("study_plan_items")
      .update(fields)
      .eq("id", id!)
      .eq("student_id", studentId);
    if (error) return { error: "Güncellenemedi: " + error.message };
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("study_plan_items").insert(
      inserts.map((r) => ({
        student_id: r.student_id,
        plan_date: r.plan_date,
        title: r.title,
        planned_minutes: r.planned_minutes,
        completed: r.completed,
        sort_order: r.sort_order,
        subject_id: null,
        topic_id: null,
        actual_minutes: null,
      }))
    );
    if (error) return { error: "Eklenemedi: " + error.message };
  }

  return {};
}

/** Öğrencinin Program sayfasındaki "Haftayı kaydet" düğmesi. */
export async function saveWeekPlan(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const weekStart = String(formData.get("week_start") || "");
  const rows = parseAgendaPayload(formData.get("plan_json"));
  if (rows === null) return { error: "Program okunamadı." };

  const { error } = await syncWeekPlan(user.id, weekStart, rows);
  if (error) return { error };

  revalidatePath("/ogrenci");
  revalidatePath("/ogrenci/program");
  return { ok: true };
}
