/**
 * Yanlış defteri örüntüleri, Çita+ analiz örneği ve kişisel tekrar planlama.
 *
 * İlke: kişisel bulgu YALNIZCA kayıtlı kanıttan çıkar. Kanıt yetersizse
 * bunu açıkça söyleriz; ders toplamından konu hatası türetmeyiz.
 */
import { addDays, daysBetween } from "./time.ts";
import { subjectWeakness, type StoredExam } from "./exams.ts";

export const ERROR_TYPES = {
  kavram: "Kavram / konu eksiği",
  denklem_kurma: "Denklemi / modeli kurma",
  islem: "İşlem hatası",
  soru_okuma: "Soruyu yanlış okuma",
  dikkat: "Dikkat / acele",
  sure: "Süre yetmedi",
  bilgi: "Ezber bilgi eksiği",
  diger: "Diğer",
} as const;
export type ErrorType = keyof typeof ERROR_TYPES;

export function isErrorType(x: unknown): x is ErrorType {
  return typeof x === "string" && x in ERROR_TYPES;
}

export type MistakeRecord = {
  id: string;
  created_at: string;
  subject: string;
  topic: string | null;
  error_type: ErrorType | null;
  error_type_confirmed: boolean;
};

export type Pattern = {
  subject: string;
  topic: string | null;
  errorType: ErrorType;
  count: number;
  evidenceIds: string[];
  label: string;
};

/** Doğrulanmış hata türü ile en az `min` kayıt → tekrarlayan örüntü. */
export function recurringPatterns(mistakes: MistakeRecord[], min = 3): Pattern[] {
  const groups = new Map<string, MistakeRecord[]>();
  for (const m of mistakes) {
    if (!m.error_type || !m.error_type_confirmed) continue;
    const k = `${m.subject}|${m.topic ?? ""}|${m.error_type}`;
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  // Konu düzeyinde yetmeyen grupları ders + hata türü düzeyinde birleştir.
  const subjectLevel = new Map<string, MistakeRecord[]>();
  for (const [k, ms] of groups) {
    if (ms.length >= min) continue;
    const [subject, , et] = k.split("|");
    const sk = `${subject}||${et}`;
    subjectLevel.set(sk, [...(subjectLevel.get(sk) ?? []), ...ms]);
  }
  const out: Pattern[] = [];
  const emit = (k: string, ms: MistakeRecord[]) => {
    const [subject, topic, et] = k.split("|");
    const errorType = et as ErrorType;
    out.push({
      subject,
      topic: topic || null,
      errorType,
      count: ms.length,
      evidenceIds: ms.map((m) => m.id),
      label: `${subject}${topic ? ` · ${topic}` : ""}: ${ERROR_TYPES[errorType]} (${ms.length} kayıt)`,
    });
  };
  for (const [k, ms] of groups) if (ms.length >= min) emit(k, ms);
  for (const [k, ms] of subjectLevel) if (ms.length >= min) emit(k, ms);
  return out.sort((a, b) => b.count - a.count);
}

export type AnalysisPreview =
  | { kind: "mistake_pattern"; title: string; body: string; evidence: string[] }
  | { kind: "exam_subjects"; title: string; body: string; evidence: string[] }
  | { kind: "study_time"; title: string; body: string; evidence: string[] }
  | { kind: "insufficient"; title: string; body: string; evidence: [] };

/**
 * Çita+ tanıtımındaki "kendi verinden gerçek analiz" örneği.
 * Öncelik: doğrulanmış yanlış örüntüsü → aynı türde ≥2 deneme → çalışma kaydı.
 * Hiçbiri yoksa kişisel bulgu uydurmayız.
 */
export function analysisPreview(input: {
  mistakes: MistakeRecord[];
  exams: StoredExam[];
  studyMinutes: { date: string; minutes: number; subject: string | null }[];
}): AnalysisPreview {
  const p = recurringPatterns(input.mistakes)[0];
  if (p)
    return {
      kind: "mistake_pattern",
      title: "Tekrarlayan hatan",
      body: `${p.label}. Çita+ bu örüntü için eski sorunla birlikte iki benzer soruluk tekrar hazırlar.`,
      evidence: p.evidenceIds,
    };
  for (const type of ["TYT", "AYT", "LGS", "Sayısal", "Sözel", "YDT"]) {
    const w = subjectWeakness(input.exams, type, 2)[0];
    if (w) {
      const ids = input.exams.filter((e) => e.exam_type === type).map((e) => e.id);
      return {
        kind: "exam_subjects",
        title: `${type} denemelerinde en düşük ders`,
        body: `${w.exams} ${type} denemesinde ${w.subject} başarı oranın ortalama %${Math.round(w.successRatio * 100)}. Bu ders toplamıdır; hangi konuda takıldığını yanlış defteri kayıtlarınla netleştiririz.`,
        evidence: ids,
      };
    }
  }
  const withSubject = input.studyMinutes.filter((s) => s.subject && s.minutes > 0);
  const days = new Set(withSubject.map((s) => s.date));
  if (days.size >= 3) {
    const by = new Map<string, number>();
    for (const s of withSubject) by.set(s.subject!, (by.get(s.subject!) ?? 0) + s.minutes);
    const sorted = [...by.entries()].sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [, m]) => s + m, 0);
    const [top, mins] = sorted[0];
    return {
      kind: "study_time",
      title: "Çalışma süren nereye gidiyor",
      body: `Son ${days.size} kayıtlı günde sürenin %${Math.round((mins / total) * 100)}'i ${top} dersinde. Çita+ bunu yanlışlarınla eşleştirip dengeli tekrar önerir.`,
      evidence: [...days].sort(),
    };
  }
  return {
    kind: "insufficient",
    title: "Henüz yeterli veri yok",
    body: "Kişisel analiz için en az 3 doğrulanmış yanlış, aynı türde 2 deneme ya da 3 günlük çalışma kaydı gerekiyor. Veri oluşmadan sana özel bulgu göstermiyoruz.",
    evidence: [],
  };
}

export type ReviewItem = {
  kind: "original" | "similar";
  prompt: string;
  choices: string[] | null;
  answer: string;
  solutionSteps: string[];
  skill: string;
};

/** Üretilen benzer soruların yapısal doğrulaması (cevap şıklarda, çözüm adımlı). */
export function validateReviewItem(i: ReviewItem): string[] {
  const e: string[] = [];
  if (!i.prompt || i.prompt.trim().length < 10) e.push("soru metni kısa");
  if (!i.answer || !i.answer.trim()) e.push("cevap yok");
  if (i.choices) {
    if (i.choices.length < 2 || i.choices.length > 5) e.push("şık sayısı 2–5 olmalı");
    if (new Set(i.choices).size !== i.choices.length) e.push("şıklar tekrar ediyor");
    if (!i.choices.includes(i.answer)) e.push("cevap şıklarda değil");
  }
  if (!Array.isArray(i.solutionSteps) || i.solutionSteps.length < 2) e.push("çözüm en az 2 adım olmalı");
  if (!i.skill) e.push("ölçülen beceri yok");
  return e;
}

export type ReviewResult = { itemIndex: number; correct: boolean; usedHint: boolean; independentSteps: number };

/** Bir sonraki tekrar: aralıklı tekrar mantığı, bağımsız başarıya göre. */
export function nextReviewDate(today: string, results: ReviewResult[], previousIntervalDays = 0): { date: string; intervalDays: number; summary: string } {
  const independent = results.filter((r) => r.correct && !r.usedHint).length;
  const total = results.length;
  let interval: number;
  if (total > 0 && independent === total) interval = Math.max(7, previousIntervalDays * 2);
  else if (independent >= Math.ceil(total / 2)) interval = 3;
  else interval = 1;
  interval = Math.min(interval, 30);
  return {
    date: addDays(today, interval),
    intervalDays: interval,
    summary: `${total} sorunun ${independent}'ini ipucusuz doğru çözdün. Sonraki tekrar ${interval} gün sonra.`,
  };
}

export function isDue(nextDate: string | null, today: string): boolean {
  return !!nextDate && daysBetween(nextDate, today) >= 0;
}
