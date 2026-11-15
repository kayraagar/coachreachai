/** Öğrencinin kendi kayıtları (RLS: yalnızca kendi satırları). */
import { useCallback, useEffect, useState } from "react";
import { addDays, istanbulDate, weekStart } from "@cita/core";
import { supabase } from "./supabase";

export type PlanItem = {
  id: string;
  plan_date: string;
  title: string;
  planned_minutes: number | null;
  completed: boolean;
  actual_minutes: number | null;
  kind: string | null;
  sort_order: number;
  subject_id: string | null;
};

export type OpenSession = { id: string; started_at: string; plan_item_id: string | null };

export function useWeek(start: string) {
  const [items, setItems] = useState<PlanItem[]>([]);
  const [open, setOpen] = useState<OpenSession | null>(null);
  const [minutes, setMinutes] = useState(0);
  const [target, setTarget] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const end = addDays(start, 6);
    const [pi, os, mins, tg] = await Promise.all([
      supabase
        .from("study_plan_items")
        .select("id, plan_date, title, planned_minutes, completed, actual_minutes, kind, sort_order, subject_id")
        .gte("plan_date", start)
        .lte("plan_date", end)
        .order("plan_date")
        .order("sort_order"),
      supabase.from("study_sessions").select("id, started_at, plan_item_id").is("ended_at", null).maybeSingle(),
      supabase.from("cita_study_minutes").select("minutes").gte("day", start).lte("day", end),
      supabase.from("weekly_targets").select("target_minutes").eq("week_start", start).maybeSingle(),
    ]);
    if (pi.error) setError(pi.error.message);
    setItems((pi.data as PlanItem[]) ?? []);
    setOpen((os.data as OpenSession) ?? null);
    setMinutes(((mins.data as { minutes: number }[]) ?? []).reduce((s, r) => s + (r.minutes ?? 0), 0));
    setTarget((tg.data as { target_minutes: number } | null)?.target_minutes ?? null);
    setLoading(false);
  }, [start]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, open, minutes, target, loading, error, reload };
}

export function thisWeek() {
  return weekStart(istanbulDate());
}

export async function toggleTask(item: PlanItem) {
  const { error } = await supabase.from("study_plan_items").update({ completed: !item.completed }).eq("id", item.id);
  if (error) throw new Error(error.message);
}

export async function startTimer(item: PlanItem | null) {
  const { error } = await supabase.from("study_sessions").insert({
    student_id: (await supabase.auth.getUser()).data.user?.id,
    subject_id: item?.subject_id ?? null,
    plan_item_id: item?.id ?? null,
  });
  if (error) throw new Error(error.code === "23505" ? "Zaten açık bir kronometren var." : error.message);
}

export async function stopTimer(sessionId: string, complete: boolean) {
  const { data, error } = await supabase.rpc("cita_stop_study_session", { p_session: sessionId, p_complete_task: complete });
  if (error) throw new Error(error.message);
  return data as { minutes: number };
}

export async function addStudyTime(minutes: number, date = istanbulDate()) {
  const user = (await supabase.auth.getUser()).data.user;
  const { error } = await supabase.from("study_time_entries").insert({ student_id: user?.id, entry_date: date, minutes, source: "manual" });
  if (error) throw new Error(error.message);
}
