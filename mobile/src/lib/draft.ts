/**
 * Hesap açmadan hazırlanan program taslağı. Cihazda saklanır; kayıt/giriş
 * sonrası tek bir requestId ile sunucuya aktarılır. Aynı requestId ile tekrar
 * deneme sunucuda 'already_imported' döner → çift kayıt olmaz.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import {
  generateWeekPlan, planSummary, suggestedWeeklyTarget, istanbulDate, addDays,
  type OnboardingProfile, type WeekPlan,
} from "@cita/core";
import { supabase } from "./supabase";

const KEY = "cita.onboardingDraft.v1";

export type Draft = { requestId: string; profile: OnboardingProfile; startDate: string; createdAt: string };

/** Program yarın başlar. */
export function defaultStartDate(): string {
  return addDays(istanbulDate(), 1);
}

export async function saveDraft(profile: OnboardingProfile, startDate: string): Promise<Draft> {
  const prev = await loadDraft();
  const draft: Draft = { requestId: prev?.requestId ?? randomUUID(), profile, startDate, createdAt: new Date().toISOString() };
  await AsyncStorage.setItem(KEY, JSON.stringify(draft));
  return draft;
}

export async function loadDraft(): Promise<Draft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export async function clearDraft() {
  await AsyncStorage.removeItem(KEY);
}

export function draftPlan(d: Draft): WeekPlan {
  return generateWeekPlan(d.profile, d.startDate);
}

export type ImportResult = { status: "imported" | "already_imported" | "plan_exists"; task_count: number };

export async function importDraft(d: Draft): Promise<ImportResult> {
  const plan = draftPlan(d);
  const target = suggestedWeeklyTarget(planSummary(plan).totalMinutes);
  const { data, error } = await supabase.rpc("cita_import_onboarding", {
    p_request_id: d.requestId,
    p_start: d.startDate,
    p_profile: d.profile,
    p_tasks: plan.tasks.map((t) => ({ date: t.date, subject: t.subject, kind: t.kind, title: t.title, minutes: t.minutes })),
    p_target_minutes: target,
  });
  if (error) throw new Error(error.message);
  await clearDraft();
  return data as ImportResult;
}
