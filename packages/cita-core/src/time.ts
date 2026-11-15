/**
 * Tarih yardımcıları. Çita'da "gün" daima Europe/Istanbul takvim günüdür:
 * foto hakları, seri ve haftalık hedef bu güne göre hesaplanır.
 * Tarihler 'YYYY-MM-DD' dizgisi olarak taşınır (saat dilimi kayması olmasın diye).
 */

export const CITA_TZ = "Europe/Istanbul";

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: CITA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Verilen anın İstanbul'daki takvim günü. */
export function istanbulDate(at: Date = new Date()): string {
  return fmt.format(at);
}

function toUtcNoon(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = toUtcNoon(value);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(iso: string, days: number): string {
  const d = toUtcNoon(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO hafta günü: 1 = Pazartesi … 7 = Pazar. */
export function isoWeekday(iso: string): number {
  const wd = toUtcNoon(iso).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** Haftanın pazartesi günü. */
export function weekStart(iso: string): string {
  return addDays(iso, 1 - isoWeekday(iso));
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUtcNoon(toIso).getTime() - toUtcNoon(fromIso).getTime()) / 86_400_000);
}

export const WEEKDAY_NAMES = [
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
  "Pazar",
] as const;

export function weekdayName(iso: string): string {
  return WEEKDAY_NAMES[isoWeekday(iso) - 1];
}
