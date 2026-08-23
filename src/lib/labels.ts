import type { Mood, RoutineStatus } from "@/lib/database.types";

export const MOOD_LABEL: Record<Mood, string> = {
  great: "Harika",
  good: "İyi",
  neutral: "Normal",
  bad: "Kötü",
  struggling: "Zorlanıyor",
};

export const MOOD_OPTIONS = (Object.keys(MOOD_LABEL) as Mood[]).map((value) => ({
  value,
  label: MOOD_LABEL[value],
}));

export const MOOD_TONE: Record<Mood, "good" | "warn" | "bad" | "neutral"> = {
  great: "good",
  good: "good",
  neutral: "neutral",
  bad: "warn",
  struggling: "bad",
};

export const ROUTINE_LABEL: Record<RoutineStatus, string> = {
  good: "İyi",
  ok: "Orta",
  bad: "Sorunlu",
};

export const ROUTINE_OPTIONS = (Object.keys(ROUTINE_LABEL) as RoutineStatus[]).map((value) => ({
  value,
  label: ROUTINE_LABEL[value],
}));

export const ROUTINE_TONE: Record<RoutineStatus, "good" | "warn" | "bad"> = {
  good: "good",
  ok: "warn",
  bad: "bad",
};

/** Dakikayı "3 sa 20 dk" biçimine çevirir. */
export function formatDuration(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes < 60) return `${minutes} dk`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} sa` : `${h} sa ${m} dk`;
}

/** yyyy-MM-dd → 12 Mart 2026 */
export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value + (value.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

export function formatShortDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value + (value.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

/** Verilen tarihin üzerinden geçen tam gün sayısı. */
export function daysSince(value: string | null | undefined) {
  if (!value) return Infinity;
  const d = new Date(value + (value.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
