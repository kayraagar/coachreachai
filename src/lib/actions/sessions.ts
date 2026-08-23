"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { FormResult } from "@/lib/actions/types";

const TEXT_FIELDS = [
  "adherence_note",
  "net_note",
  "weak_topics",
  "slow_question_types",
  "positives",
  "negatives",
  "missing_areas",
  "recommendations",
  "target_net_range",
  "roadmap",
  "school_action",
  "conflict_action",
  "environment_action",
  "other_action",
  "routines_note",
  "main_focus",
  "planned_exams",
  "coach_feedback",
  "open_item",
] as const;

const NUM_FIELDS = [
  "duration_minutes",
  "total_questions",
  "total_study_minutes",
  "adherence_pct",
  "tyt_net",
  "ayt_net",
] as const;

const ENUM_FIELDS = [
  "sleep_status",
  "screen_status",
  "nutrition_status",
  "break_status",
  "mood",
] as const;

function readPayload(formData: FormData) {
  const payload: Record<string, unknown> = {};
  TEXT_FIELDS.forEach((f) => {
    payload[f] = String(formData.get(f) ?? "").trim();
  });
  NUM_FIELDS.forEach((f) => {
    const raw = String(formData.get(f) ?? "").trim();
    payload[f] = raw === "" ? null : Number(raw);
  });
  ENUM_FIELDS.forEach((f) => {
    const raw = String(formData.get(f) ?? "").trim();
    payload[f] = raw === "" ? null : raw;
  });
  return payload;
}

/** Aksiyon maddeleri textarea'sı: her satır bir madde. Mevcut "yapıldı"
 *  işaretlerini korumak için başlık eşleşmesiyle senkronize edilir. */
async function syncActions(sessionId: string, studentId: string, raw: string) {
  const supabase = await createClient();
  const titles = raw
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  const { data: existing } = await supabase
    .from("session_actions")
    .select("id, title")
    .eq("session_id", sessionId);

  const existingByTitle = new Map((existing ?? []).map((a) => [a.title, a.id]));

  const keptIds = new Set<string>();
  const toInsert: { session_id: string; student_id: string; title: string; category: string; done: boolean; sort_order: number }[] = [];

  titles.forEach((title, i) => {
    const id = existingByTitle.get(title);
    if (id) keptIds.add(id);
    else
      toInsert.push({
        session_id: sessionId,
        student_id: studentId,
        title,
        category: "genel",
        done: false,
        sort_order: i,
      });
  });

  const removed = (existing ?? []).filter((a) => !keptIds.has(a.id)).map((a) => a.id);
  if (removed.length > 0) {
    await supabase.from("session_actions").delete().in("id", removed);
  }
  if (toInsert.length > 0) {
    await supabase.from("session_actions").insert(toInsert);
  }
}

export async function saveWeeklySession(
  _prev: FormResult,
  formData: FormData
): Promise<FormResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const sessionId = String(formData.get("session_id") || "") || null;
  const studentId = String(formData.get("student_id") || "");
  const weekNo = Number(formData.get("week_no") || 0);
  const meetingDate = String(formData.get("meeting_date") || "");
  const status = String(formData.get("status") || "draft") as "draft" | "shared";

  if (!studentId || !weekNo || !meetingDate) {
    return { error: "Öğrenci, hafta no ve görüşme tarihi zorunlu." };
  }

  const payload = {
    ...readPayload(formData),
    student_id: studentId,
    coach_id: user.id,
    week_no: weekNo,
    meeting_date: meetingDate,
    status,
  };

  let id = sessionId;

  if (id) {
    const { error } = await supabase.from("weekly_sessions").update(payload).eq("id", id);
    if (error) return { error: "Görüşme güncellenemedi: " + error.message };
  } else {
    const { data, error } = await supabase
      .from("weekly_sessions")
      .insert(payload)
      .select("id")
      .single();
    if (error || !data) {
      return {
        error:
          error?.code === "23505"
            ? "Bu hafta numarası için zaten bir görüşme kaydı var."
            : "Görüşme kaydedilemedi: " + error?.message,
      };
    }
    id = data.id;
  }

  await syncActions(id!, studentId, String(formData.get("actions_raw") ?? ""));

  revalidatePath(`/koc/${studentId}`);
  revalidatePath(`/koc/${studentId}/gorusmeler`);
  revalidatePath("/ogrenci");
  revalidatePath("/ogrenci/gorusmeler");
  redirect(`/koc/${studentId}/gorusmeler/${id}`);
}

export async function setSessionStatus(
  sessionId: string,
  studentId: string,
  status: "draft" | "shared"
) {
  const supabase = await createClient();
  await supabase.from("weekly_sessions").update({ status }).eq("id", sessionId);
  revalidatePath(`/koc/${studentId}/gorusmeler/${sessionId}`);
  revalidatePath(`/koc/${studentId}/gorusmeler`);
  revalidatePath("/ogrenci/gorusmeler");
}

export async function deleteWeeklySession(sessionId: string, studentId: string) {
  const supabase = await createClient();
  await supabase.from("weekly_sessions").delete().eq("id", sessionId);
  revalidatePath(`/koc/${studentId}/gorusmeler`);
  redirect(`/koc/${studentId}/gorusmeler`);
}

/** Öğrenci aksiyon maddesini yapıldı / yapılmadı olarak işaretler. */
export async function toggleAction(actionId: string, done: boolean) {
  const supabase = await createClient();
  await supabase
    .from("session_actions")
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq("id", actionId);
  revalidatePath("/ogrenci");
  revalidatePath("/ogrenci/gorusmeler");
}
