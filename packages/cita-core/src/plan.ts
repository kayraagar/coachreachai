/**
 * Yedi günlük kişisel program üretici ve doğal dil düzenleyici.
 *
 * Tamamen deterministiktir: aynı girdi daima aynı programı verir. Böylece
 * hesap açmadan gösterilen önizleme ile kaydedilen program birebir aynıdır
 * ve sunucu aynı girdiyle yeniden üretip doğrulayabilir.
 */
import { addDays, isIsoDate, weekdayName } from "./time.ts";
import type { Track } from "./exams.ts";

export type YksField = "SAY" | "EA" | "SÖZ" | "DİL";
export type YksFocus = "TYT" | "AYT" | "TYT+AYT" | "YDT";
export type Level = "başlangıç" | "orta" | "iyi";

export type OnboardingProfile = {
  track: Track;
  field?: YksField | null;
  focus?: YksFocus | null;
  goal: string;
  level: Level;
  weakSubjects: string[];
  weakTopics?: { subject: string; topic: string }[];
  lastExamNet?: number | null;
  /** Pazartesi→Pazar dakika; 0 = planlı dinlenme günü. */
  availability: number[];
  /** Haftalık deneme istemiyorsa true. */
  noExam?: boolean;
  /** Ders ağırlığı çarpanları (düzenleme isteklerinden). */
  boosts?: Record<string, number>;
};

export type TaskKind = "konu" | "soru" | "tekrar" | "deneme" | "analiz";

export type PlanTask = {
  key: string;
  date: string;
  subject: string | null;
  topic: string | null;
  kind: TaskKind;
  title: string;
  minutes: number;
};

export type WeekPlan = { startDate: string; tasks: PlanTask[]; restDays: string[] };

const KIND_LABEL: Record<TaskKind, string> = {
  konu: "konu çalışması",
  soru: "soru çözümü",
  tekrar: "tekrar",
  deneme: "deneme",
  analiz: "yanlış analizi",
};

type Weighted = { subject: string; weight: number };

const LGS_POOL: Weighted[] = [
  { subject: "Matematik", weight: 3 },
  { subject: "Fen Bilimleri", weight: 3 },
  { subject: "Türkçe", weight: 3 },
  { subject: "T.C. İnkılap Tarihi", weight: 1 },
  { subject: "Din Kültürü", weight: 1 },
  { subject: "Yabancı Dil", weight: 1 },
];
const TYT_POOL: Weighted[] = [
  { subject: "Türkçe", weight: 3 },
  { subject: "Matematik", weight: 3 },
  { subject: "Fizik", weight: 1 },
  { subject: "Kimya", weight: 1 },
  { subject: "Biyoloji", weight: 1 },
  { subject: "Tarih", weight: 1 },
  { subject: "Coğrafya", weight: 1 },
  { subject: "Felsefe", weight: 0.5 },
  { subject: "Din Kültürü", weight: 0.5 },
];
const AYT_POOL: Record<YksField, Weighted[]> = {
  SAY: [
    { subject: "Matematik (AYT)", weight: 3 },
    { subject: "Fizik (AYT)", weight: 2 },
    { subject: "Kimya (AYT)", weight: 2 },
    { subject: "Biyoloji (AYT)", weight: 2 },
  ],
  EA: [
    { subject: "Matematik (AYT)", weight: 3 },
    { subject: "Edebiyat", weight: 2 },
    { subject: "Tarih (AYT)", weight: 1.5 },
    { subject: "Coğrafya (AYT)", weight: 1 },
  ],
  SÖZ: [
    { subject: "Edebiyat", weight: 3 },
    { subject: "Tarih (AYT)", weight: 2 },
    { subject: "Coğrafya (AYT)", weight: 2 },
    { subject: "Felsefe Grubu (AYT)", weight: 1 },
    { subject: "Din Kültürü (AYT)", weight: 0.5 },
  ],
  DİL: [{ subject: "Yabancı Dil (YDT)", weight: 4 }],
};

export const EXAM_MINUTES: Record<string, number> = { TYT: 165, AYT: 180, YDT: 180, LGS: 155 };

export function subjectPool(p: OnboardingProfile): Weighted[] {
  let pool: Weighted[];
  if (p.track === "LGS") pool = LGS_POOL;
  else {
    const field = p.field ?? "SAY";
    const focus = p.focus ?? "TYT+AYT";
    if (focus === "TYT") pool = TYT_POOL;
    else if (focus === "AYT") pool = AYT_POOL[field];
    else if (focus === "YDT") pool = [...AYT_POOL.DİL, ...TYT_POOL.map((w) => ({ ...w, weight: w.weight * 0.3 }))];
    else pool = [...TYT_POOL.map((w) => ({ ...w, weight: w.weight * 0.6 })), ...AYT_POOL[field]];
  }
  const weak = new Set(p.weakSubjects ?? []);
  return pool
    .map((w) => ({ subject: w.subject, weight: w.weight * (weak.has(w.subject) ? 2 : 1) * (p.boosts?.[w.subject] ?? 1) }))
    .filter((w) => w.weight > 0);
}

function examTypeFor(p: OnboardingProfile): string {
  if (p.track === "LGS") return "LGS";
  if (p.focus === "AYT") return "AYT";
  if (p.focus === "YDT") return "YDT";
  return "TYT";
}

/** Smooth weighted round-robin: deterministik ve dengeli ders sırası. */
function makePicker(pool: Weighted[]) {
  const current = pool.map(() => 0);
  const total = pool.reduce((s, w) => s + w.weight, 0);
  return (avoid: Set<string>): string => {
    for (let i = 0; i < pool.length; i++) current[i] += pool[i].weight;
    const order = pool.map((_, i) => i).sort((a, b) => current[b] - current[a] || a - b);
    const idx = order.find((i) => !avoid.has(pool[i].subject)) ?? order[0];
    current[idx] -= total;
    return pool[idx].subject;
  };
}

export function validateProfile(p: OnboardingProfile): string[] {
  const errors: string[] = [];
  if (p.track !== "YKS" && p.track !== "LGS") errors.push("Sınav YKS veya LGS olmalı.");
  if (!Array.isArray(p.availability) || p.availability.length !== 7) errors.push("Haftanın 7 günü için süre gerekli.");
  else if (p.availability.some((m) => !Number.isInteger(m) || m < 0 || m > 720)) errors.push("Günlük süre 0–720 dakika olmalı.");
  else if (p.availability.every((m) => m === 0)) errors.push("En az bir gün çalışma süresi gir.");
  if (p.track === "YKS" && p.field && !["SAY", "EA", "SÖZ", "DİL"].includes(p.field)) errors.push("Geçersiz alan.");
  if (typeof p.goal !== "string" || p.goal.length > 200) errors.push("Hedef en fazla 200 karakter.");
  return errors;
}

export function generateWeekPlan(p: OnboardingProfile, startDate: string): WeekPlan {
  if (!isIsoDate(startDate)) throw new Error("startDate YYYY-MM-DD olmalı");
  const errors = validateProfile(p);
  if (errors.length) throw new Error(errors.join(" "));

  const pick = makePicker(subjectPool(p));
  const weakTopics = [...(p.weakTopics ?? [])];
  const tasks: PlanTask[] = [];
  const restDays: string[] = [];
  const examType = examTypeFor(p);
  const examLen = EXAM_MINUTES[examType];
  const kindToggle = new Map<string, number>();

  // Haftalık deneme: hafta sonunda deneme süresine yeten en uzun gün.
  let examDay = -1;
  if (!p.noExam) {
    const candidates = [5, 6, 4, 3, 2, 1, 0].filter((d) => p.availability[d] >= examLen);
    if (candidates.length) examDay = candidates.sort((a, b) => p.availability[b] - p.availability[a] || b - a)[0];
  }
  let analysisPending = false;

  for (let d = 0; d < 7; d++) {
    const date = addDays(startDate, d);
    let remaining = p.availability[d];
    if (remaining <= 0) {
      restDays.push(date);
      continue;
    }
    const dayTasks: PlanTask[] = [];
    const push = (t: Omit<PlanTask, "key" | "date">) => dayTasks.push({ ...t, key: `${date}-${dayTasks.length}`, date });

    if (d === examDay) {
      push({ subject: null, topic: null, kind: "deneme", title: `${examType} denemesi (süre tutarak)`, minutes: examLen });
      remaining -= examLen;
      analysisPending = true;
      if (remaining >= 30) {
        push({ subject: null, topic: null, kind: "analiz", title: "Deneme yanlış analizi", minutes: Math.min(45, remaining) });
        remaining -= Math.min(45, remaining);
        analysisPending = false;
      }
    } else if (analysisPending && remaining >= 30) {
      push({ subject: null, topic: null, kind: "analiz", title: "Deneme yanlış analizi", minutes: 30 });
      remaining -= 30;
      analysisPending = false;
    }

    // Uzun günlerde gün sonu tekrarı.
    const reserveReview = remaining >= 90 ? 20 : 0;
    remaining -= reserveReview;

    const used = new Set<string>();
    while (remaining >= 20) {
      const block = remaining >= 70 ? 50 : remaining;
      const subject = pick(used);
      used.add(subject);
      const toggle = kindToggle.get(subject) ?? 0;
      kindToggle.set(subject, toggle + 1);
      const kind: TaskKind = toggle % 2 === 0 ? "konu" : "soru";
      const wtIdx = weakTopics.findIndex((w) => w.subject === subject);
      const topic = wtIdx >= 0 ? weakTopics.splice(wtIdx, 1)[0].topic : null;
      const detail = kind === "soru" ? `${Math.max(10, Math.round(block * 0.6))} soru` : KIND_LABEL[kind];
      push({ subject, topic, kind, title: `${subject}${topic ? ` · ${topic}` : ""} — ${detail}`, minutes: block });
      remaining -= block;
    }
    if (remaining > 0 && dayTasks.length) {
      const last = dayTasks[dayTasks.length - 1];
      if (last.kind !== "deneme") last.minutes += remaining;
    }
    if (reserveReview) push({ subject: null, topic: null, kind: "tekrar", title: "Günün tekrarı ve hata notları", minutes: reserveReview });
    tasks.push(...dayTasks);
  }
  return { startDate, tasks, restDays };
}

export function planSummary(plan: WeekPlan) {
  const total = plan.tasks.reduce((s, t) => s + t.minutes, 0);
  const bySubject = new Map<string, number>();
  for (const t of plan.tasks) if (t.subject) bySubject.set(t.subject, (bySubject.get(t.subject) ?? 0) + t.minutes);
  return {
    totalMinutes: total,
    studyDays: 7 - plan.restDays.length,
    bySubject: [...bySubject.entries()].sort((a, b) => b[1] - a[1]),
  };
}

// ---------------------------------------------------------------------------
// Doğal dil düzenleme ("Cumartesi çalışamam", "Pazar 2 saat", "matematiği artır")
// ---------------------------------------------------------------------------

const ASCII: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
export function normalizeTr(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşüâîû]/g, (c) => ASCII[c] ?? c)
    .replace(/\s+/g, " ")
    .trim();
}

const DAY_WORDS: [string, number[]][] = [
  ["hafta sonu", [5, 6]],
  ["haftasonu", [5, 6]],
  ["hafta ici", [0, 1, 2, 3, 4]],
  ["haftaici", [0, 1, 2, 3, 4]],
  ["pazartesi", [0]],
  ["cumartesi", [5]],
  ["carsamba", [2]],
  ["persembe", [3]],
  ["sali", [1]],
  ["cuma", [4]],
  ["pazar", [6]],
];

const NEGATIVE = ["calisamam", "calismayacagim", "calismam", "musait degil", "bos degil", "olmaz", "izinli", "dinlen", "tatil", "istemiyorum", "yok"];
const MORE = ["artir", "daha fazla", "daha cok", "agirlik ver", "fazla olsun", "cok olsun"];
const LESS = ["azalt", "daha az", "az olsun", "cikar"];

export type PlanEdit =
  | { type: "set_day_minutes"; days: number[]; minutes: number }
  | { type: "boost_subject"; subject: string; factor: number }
  | { type: "no_exam" };

export type EditParse = { edits: PlanEdit[]; understood: boolean; reply: string };

function findDays(text: string): { days: number[]; rest: string } {
  let rest = ` ${text} `;
  const days: number[] = [];
  for (const [word, idx] of DAY_WORDS) {
    const re = new RegExp(`(^|[^a-z])${word}([a-z]*)`, "g");
    if (re.test(rest)) {
      days.push(...idx);
      rest = rest.replace(new RegExp(`(^|[^a-z])${word}([a-z]*)`, "g"), " ");
    }
  }
  return { days: [...new Set(days)].sort(), rest };
}

function findMinutes(text: string): number | null {
  if (/yarim saat/.test(text)) return 30;
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(saat|sa\b|dk|dakika)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.round(m[2].startsWith("d") ? n : n * 60);
}

export function parsePlanEdit(input: string, pool: Weighted[]): EditParse {
  const text = normalizeTr(input);
  const edits: PlanEdit[] = [];
  const { days, rest } = findDays(text);
  const minutes = findMinutes(text);
  const negative = NEGATIVE.some((w) => rest.includes(w));

  if (/deneme/.test(text) && negative) edits.push({ type: "no_exam" });
  else if (days.length && negative) edits.push({ type: "set_day_minutes", days, minutes: 0 });
  else if (days.length && minutes !== null) edits.push({ type: "set_day_minutes", days, minutes: Math.min(720, minutes) });

  for (const w of pool) {
    const key = normalizeTr(w.subject.replace(/\s*\(.*\)/, ""));
    const stem = key.slice(0, Math.max(4, Math.min(key.length, 6)));
    if (!text.includes(stem)) continue;
    if (MORE.some((m) => text.includes(m))) edits.push({ type: "boost_subject", subject: w.subject, factor: 1.6 });
    else if (LESS.some((m) => text.includes(m))) edits.push({ type: "boost_subject", subject: w.subject, factor: 0.5 });
  }

  if (!edits.length) {
    return {
      edits,
      understood: false,
      reply: "Bunu tam anlayamadım. Örnek: «Cumartesi çalışamam», «Pazar 2 saat», «Matematiği artır» ya da «Deneme olmasın».",
    };
  }
  const parts = edits.map((e) => {
    if (e.type === "no_exam") return "haftalık denemeyi çıkardım";
    if (e.type === "boost_subject") return `${e.subject} ${e.factor > 1 ? "ağırlığını artırdım" : "ağırlığını azalttım"}`;
    const names = e.days.map((d) => weekdayName(addDays("2024-01-01", d))).join(", ");
    return e.minutes === 0 ? `${names} dinlenme günü oldu` : `${names} ${e.minutes} dakika oldu`;
  });
  return { edits, understood: true, reply: `Tamam: ${parts.join("; ")}.` };
}

export function applyPlanEdits(p: OnboardingProfile, edits: PlanEdit[]): OnboardingProfile {
  const next: OnboardingProfile = { ...p, availability: [...p.availability], boosts: { ...(p.boosts ?? {}) } };
  for (const e of edits) {
    if (e.type === "no_exam") next.noExam = true;
    else if (e.type === "set_day_minutes") for (const d of e.days) next.availability[d] = e.minutes;
    else next.boosts![e.subject] = Math.min(4, Math.max(0.25, (next.boosts![e.subject] ?? 1) * e.factor));
  }
  return next;
}
