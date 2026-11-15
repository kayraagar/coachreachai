/**
 * Haftalık hedef, çalışma serisi ve rozetler — tüm paketlerde açık.
 *
 * Kurallar (CITA-STATUS.md'de de belgeli):
 * - Seri: planlı çalışma gününde (en az bir görev planlanmış gün) en az bir
 *   görev tamamlanırsa seri ilerler. Görev planlanmamış gün (planlı dinlenme)
 *   seriyi kesmez ve saymaz. Bugün henüz bitmediği için bugünün eksikliği
 *   seriyi kesmez.
 * - Haftalık hedef: hafta (Pzt–Paz) için hedef dakika; kayıtlı gerçek çalışma
 *   dakikası hedefe ulaşınca tamamlanır.
 * - Rozetler gerçek olaylardan verilir ve kanıt (evidence) ile saklanır.
 */
import { addDays, weekStart } from "./time.ts";

export type DayActivity = { date: string; planned: number; completed: number };

export function computeStreak(days: DayActivity[], today: string): { current: number; best: number } {
  const map = new Map(days.map((d) => [d.date, d]));
  const dates = days.map((d) => d.date).filter((d) => d <= today).sort();
  if (!dates.length) return { current: 0, best: 0 };

  // En iyi seri: kronolojik tarama.
  let best = 0;
  let run = 0;
  for (let d = dates[0]; d <= today; d = addDays(d, 1)) {
    const a = map.get(d);
    if (!a || a.planned === 0) continue; // dinlenme günü: nötr
    if (a.completed > 0) {
      run += 1;
      best = Math.max(best, run);
    } else if (d !== today) run = 0;
  }

  // Güncel seri: bugünden geriye.
  let current = 0;
  for (let d = today; d >= dates[0]; d = addDays(d, -1)) {
    const a = map.get(d);
    if (!a || a.planned === 0) continue;
    if (a.completed > 0) current += 1;
    else if (d === today) continue;
    else break;
  }
  return { current, best };
}

export type MinutesRecord = { date: string; minutes: number };

export function minutesByWeek(records: MinutesRecord[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of records) {
    if (!(r.minutes > 0)) continue;
    const w = weekStart(r.date);
    out.set(w, (out.get(w) ?? 0) + r.minutes);
  }
  return out;
}

export type WeeklyTarget = { weekStart: string; targetMinutes: number };

export function weeklyTargetStatus(target: WeeklyTarget, records: MinutesRecord[]) {
  const done = minutesByWeek(records).get(target.weekStart) ?? 0;
  return {
    weekStart: target.weekStart,
    targetMinutes: target.targetMinutes,
    doneMinutes: done,
    pct: target.targetMinutes > 0 ? Math.min(100, Math.round((done / target.targetMinutes) * 100)) : 0,
    met: target.targetMinutes > 0 && done >= target.targetMinutes,
  };
}

/** Programdan önerilen haftalık hedef: planlanan sürenin %80'i, 10 dk'ya yuvarlı. */
export function suggestedWeeklyTarget(plannedMinutes: number): number {
  return Math.max(30, Math.round((plannedMinutes * 0.8) / 10) * 10);
}

export type BadgeKey = "first_exam" | "first_week" | "three_weekly_goals";

export const BADGES: Record<BadgeKey, { title: string; description: string }> = {
  first_exam: { title: "İlk Deneme", description: "İlk deneme sonucunu kaydettin." },
  first_week: { title: "İlk Hafta", description: "İlk program haftanı bitirdin (görevlerin en az %70'i)." },
  three_weekly_goals: { title: "Üç Hedef", description: "Üç haftalık hedefi tamamladın." },
};

export const FIRST_WEEK_COMPLETION = 0.7;

export type BadgeInput = {
  today: string;
  exams: { id: string; exam_date: string }[];
  firstPlanDate: string | null;
  planItems: { date: string; completed: boolean }[];
  targets: WeeklyTarget[];
  minutes: MinutesRecord[];
};

export type BadgeAward = { key: BadgeKey; evidence: Record<string, unknown> };

export function evaluateBadges(input: BadgeInput): BadgeAward[] {
  const awards: BadgeAward[] = [];
  if (input.exams.length) {
    const first = [...input.exams].sort((a, b) => a.exam_date.localeCompare(b.exam_date))[0];
    awards.push({ key: "first_exam", evidence: { exam_id: first.id, exam_date: first.exam_date } });
  }
  if (input.firstPlanDate) {
    const end = addDays(input.firstPlanDate, 6);
    if (input.today > end) {
      const week = input.planItems.filter((i) => i.date >= input.firstPlanDate! && i.date <= end);
      const done = week.filter((i) => i.completed).length;
      if (week.length && done / week.length >= FIRST_WEEK_COMPLETION)
        awards.push({ key: "first_week", evidence: { from: input.firstPlanDate, to: end, completed: done, planned: week.length } });
    }
  }
  const metWeeks = input.targets
    .filter((t) => t.weekStart <= input.today)
    .map((t) => weeklyTargetStatus(t, input.minutes))
    .filter((s) => s.met)
    .map((s) => s.weekStart)
    .sort();
  if (metWeeks.length >= 3) awards.push({ key: "three_weekly_goals", evidence: { weeks: metWeeks.slice(0, 3) } });
  return awards;
}
