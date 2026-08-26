import { addDays, format } from "date-fns";

/**
 * Haftalık ajandanın ortak tipleri ve saf yardımcıları.
 * Hem istemci bileşeni hem sunucu action'ları buradan besleniyor
 * ("use server" dosyaları yalnızca async fonksiyon export edebildiği için
 * bu yardımcılar ayrı modülde duruyor).
 */

/** Ajanda satırının istemciden gelen ham hâli. */
export type AgendaPayloadRow = {
  /** Mevcut satırsa kimliği; yeni satırlarda null. */
  id: string | null;
  date: string;
  title: string;
  minutes: number | null;
  completed: boolean;
  sort: number;
};

export const DAY_LABELS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;
export const DAY_LABELS_LONG = [
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
  "Pazar",
] as const;

/**
 * Hafta başından itibaren 7 günün yyyy-MM-dd listesi.
 *
 * date-fns `format` ile yerel saatte biçimlenir; `toISOString()` kullanılsaydı
 * UTC+3'te yerel gece yarısı bir önceki güne kayardı.
 */
export function weekDays(weekStart: string): string[] {
  const start = new Date(weekStart + "T00:00:00");
  if (Number.isNaN(start.getTime())) return [];
  return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), "yyyy-MM-dd"));
}

/** "18 – 24 Ağustos 2026" biçiminde hafta aralığı başlığı. */
export function weekRangeLabel(weekStart: string) {
  const start = new Date(weekStart + "T00:00:00");
  if (Number.isNaN(start.getTime())) return weekStart;
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const left = start.toLocaleDateString("tr-TR", {
    day: "numeric",
    ...(sameMonth ? {} : { month: "long" }),
  });
  const right = end.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${left} – ${right}`;
}

/** weekStart'ı verilen hafta sayısı kadar kaydırır. */
export function shiftWeek(weekStart: string, weeks: number) {
  const start = new Date(weekStart + "T00:00:00");
  if (Number.isNaN(start.getTime())) return weekStart;
  return format(addDays(start, weeks * 7), "yyyy-MM-dd");
}

/** Gizli alandaki JSON'u güvenle çözer; bozuksa null döner. */
export function parseAgendaPayload(raw: unknown): AgendaPayloadRow[] | null {
  if (raw === null || raw === undefined) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
      .map((r, i) => ({
        id: typeof r.id === "string" && r.id ? r.id : null,
        date: String(r.date ?? ""),
        title: String(r.title ?? ""),
        minutes:
          r.minutes === null || r.minutes === undefined || r.minutes === ""
            ? null
            : Number(r.minutes),
        completed: Boolean(r.completed),
        sort: Number.isFinite(r.sort) ? Number(r.sort) : i,
      }));
  } catch {
    return null;
  }
}
