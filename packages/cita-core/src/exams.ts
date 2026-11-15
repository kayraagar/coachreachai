/**
 * Sınav kuralları: hangi deneme türünde hangi ders, kaç soru, net katsayısı.
 *
 * Ders adları veritabanındaki `subjects.name` değerleriyle birebir aynıdır
 * (YKS: schema.sql + 008, LGS: 003). Soru sayıları ÖSYM/MEB'in güncel
 * oturum yapısına göredir; değişirse yalnızca bu tablo güncellenir.
 */

export type Track = "YKS" | "LGS";
export type ExamType = "TYT" | "AYT" | "YDT" | "LGS" | "Sayısal" | "Sözel" | "Branş";

export type SubjectRule = { subject: string; questions: number };

export type ExamRule = {
  type: ExamType;
  track: Track;
  label: string;
  /** Yanlışın doğruyu götürme katsayısı: net = D − Y / penalty */
  penalty: number;
  subjects: SubjectRule[];
};

const TYT: SubjectRule[] = [
  { subject: "Türkçe", questions: 40 },
  { subject: "Matematik", questions: 40 },
  { subject: "Fizik", questions: 7 },
  { subject: "Kimya", questions: 7 },
  { subject: "Biyoloji", questions: 6 },
  { subject: "Tarih", questions: 5 },
  { subject: "Coğrafya", questions: 5 },
  { subject: "Felsefe", questions: 5 },
  { subject: "Din Kültürü", questions: 5 },
];

// AYT: Tarih = Tarih-1 (10) + Tarih-2 (11); Coğrafya = Coğrafya-1 (6) + Coğrafya-2 (11).
const AYT: SubjectRule[] = [
  { subject: "Matematik (AYT)", questions: 40 },
  { subject: "Fizik (AYT)", questions: 14 },
  { subject: "Kimya (AYT)", questions: 13 },
  { subject: "Biyoloji (AYT)", questions: 13 },
  { subject: "Edebiyat", questions: 24 },
  { subject: "Tarih (AYT)", questions: 21 },
  { subject: "Coğrafya (AYT)", questions: 17 },
  { subject: "Felsefe Grubu (AYT)", questions: 12 },
  { subject: "Din Kültürü (AYT)", questions: 6 },
];

const YDT: SubjectRule[] = [{ subject: "Yabancı Dil (YDT)", questions: 80 }];

const LGS_SAYISAL: SubjectRule[] = [
  { subject: "Matematik", questions: 20 },
  { subject: "Fen Bilimleri", questions: 20 },
];
const LGS_SOZEL: SubjectRule[] = [
  { subject: "Türkçe", questions: 20 },
  { subject: "T.C. İnkılap Tarihi", questions: 10 },
  { subject: "Din Kültürü", questions: 10 },
  { subject: "Yabancı Dil", questions: 10 },
];

export const EXAM_RULES: Record<Track, ExamRule[]> = {
  YKS: [
    { type: "TYT", track: "YKS", label: "TYT", penalty: 4, subjects: TYT },
    { type: "AYT", track: "YKS", label: "AYT", penalty: 4, subjects: AYT },
    { type: "YDT", track: "YKS", label: "YDT", penalty: 4, subjects: YDT },
    { type: "Branş", track: "YKS", label: "Branş denemesi", penalty: 4, subjects: [...TYT, ...AYT, ...YDT] },
  ],
  LGS: [
    { type: "LGS", track: "LGS", label: "LGS (tam deneme)", penalty: 3, subjects: [...LGS_SOZEL, ...LGS_SAYISAL] },
    { type: "Sayısal", track: "LGS", label: "Sayısal bölüm", penalty: 3, subjects: LGS_SAYISAL },
    { type: "Sözel", track: "LGS", label: "Sözel bölüm", penalty: 3, subjects: LGS_SOZEL },
    { type: "Branş", track: "LGS", label: "Branş denemesi", penalty: 3, subjects: [...LGS_SOZEL, ...LGS_SAYISAL] },
  ],
};

/** Branş denemesinde tek dersin en fazla soru sayısı (yayınevi denemeleri değişken). */
export const BRANCH_MAX_QUESTIONS = 80;

export function examRule(track: Track, type: string): ExamRule | null {
  return EXAM_RULES[track].find((r) => r.type === type) ?? null;
}

export type ExamEntry = { subject: string; correct: number; wrong: number; blank?: number | null };
export type ValidatedRow = { subject: string; correct: number; wrong: number; blank: number; questions: number; net: number };

export type ExamValidation =
  | { ok: true; rule: ExamRule; rows: ValidatedRow[]; totalNet: number }
  | { ok: false; errors: string[] };

export function computeNet(correct: number, wrong: number, penalty: number): number {
  return Math.round((correct - wrong / penalty) * 100) / 100;
}

function isCount(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

/**
 * Deneme girişini sınav kuralına göre doğrular.
 * - Ders o deneme türünde olmalı, aynı ders iki kez girilemez.
 * - D + Y + B soru sayısını aşamaz; boş girilmemişse kalan soru boş sayılır.
 * - Branş denemesi tek ders içerir; soru sayısı `branchQuestions` ile verilir.
 */
export function validateExam(
  track: Track,
  type: string,
  entries: ExamEntry[],
  branchQuestions?: number
): ExamValidation {
  const rule = examRule(track, type);
  if (!rule) return { ok: false, errors: [`${track} için geçersiz deneme türü: ${type}`] };
  const errors: string[] = [];
  if (!Array.isArray(entries) || entries.length === 0) errors.push("En az bir ders girmelisin.");
  if (rule.type === "Branş") {
    if (entries.length !== 1) errors.push("Branş denemesi tek ders içerir.");
    if (!isCount(branchQuestions) || branchQuestions < 1 || branchQuestions > BRANCH_MAX_QUESTIONS)
      errors.push(`Branş denemesi soru sayısı 1–${BRANCH_MAX_QUESTIONS} arası olmalı.`);
  }
  const seen = new Set<string>();
  const rows: ValidatedRow[] = [];
  for (const e of entries ?? []) {
    const sr = rule.subjects.find((s) => s.subject === e.subject);
    if (!sr) {
      errors.push(`${e.subject} bu deneme türünde yok.`);
      continue;
    }
    if (seen.has(e.subject)) {
      errors.push(`${e.subject} iki kez girilmiş.`);
      continue;
    }
    seen.add(e.subject);
    const questions = rule.type === "Branş" ? Number(branchQuestions) : sr.questions;
    const blankGiven = e.blank !== undefined && e.blank !== null;
    if (!isCount(e.correct) || !isCount(e.wrong) || (blankGiven && !isCount(e.blank))) {
      errors.push(`${e.subject}: doğru/yanlış/boş sıfır veya pozitif tam sayı olmalı.`);
      continue;
    }
    const answered = e.correct + e.wrong;
    const blank = blankGiven ? (e.blank as number) : questions - answered;
    if (answered + blank > questions || blank < 0) {
      errors.push(`${e.subject}: toplam ${questions} soruyu aşıyor (D ${e.correct} + Y ${e.wrong} + B ${blank}).`);
      continue;
    }
    if (blankGiven && answered + blank !== questions) {
      errors.push(`${e.subject}: D + Y + B = ${questions} olmalı (şu an ${answered + blank}).`);
      continue;
    }
    rows.push({ subject: e.subject, correct: e.correct, wrong: e.wrong, blank, questions, net: computeNet(e.correct, e.wrong, rule.penalty) });
  }
  if (errors.length) return { ok: false, errors };
  const totalNet = Math.round(rows.reduce((s, r) => s + r.net, 0) * 100) / 100;
  return { ok: true, rule, rows, totalNet };
}

export type StoredExam = {
  id: string;
  exam_type: string;
  exam_date: string;
  name: string;
  results: { subject: string; correct: number; wrong: number; blank: number; net: number }[];
};

/**
 * Aynı türdeki denemeleri karşılaştırır. Branş denemeleri yalnızca aynı ders
 * içinde karşılaştırılır. Farklı türler (TYT vs AYT) asla aynı seride olmaz.
 */
export function compareKey(exam: StoredExam): string {
  if (exam.exam_type === "Branş") return `Branş:${exam.results[0]?.subject ?? "?"}`;
  return exam.exam_type;
}

export type NetSeries = { key: string; points: { date: string; examId: string; net: number }[]; delta: number | null };

export function netSeries(exams: StoredExam[]): NetSeries[] {
  const groups = new Map<string, NetSeries>();
  const sorted = [...exams].sort((a, b) => a.exam_date.localeCompare(b.exam_date));
  for (const e of sorted) {
    const key = compareKey(e);
    const net = Math.round(e.results.reduce((s, r) => s + Number(r.net), 0) * 100) / 100;
    const g = groups.get(key) ?? { key, points: [], delta: null };
    g.points.push({ date: e.exam_date, examId: e.id, net });
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    const n = g.points.length;
    g.delta = n >= 2 ? Math.round((g.points[n - 1].net - g.points[n - 2].net) * 100) / 100 : null;
  }
  return [...groups.values()];
}

/**
 * Ders düzeyinde zayıflık: aynı deneme türünde en az `minExams` denemede
 * görülen derslerin ortalama başarı oranı. Bu bir DERS toplamıdır; konu hatası
 * olarak sunulmaz (konu için öğrenciye doğrulama sorusu sorulur).
 */
export function subjectWeakness(exams: StoredExam[], examType: string, minExams = 2) {
  const same = exams.filter((e) => e.exam_type === examType);
  const agg = new Map<string, { n: number; ratio: number }>();
  for (const e of same) {
    for (const r of e.results) {
      const q = r.correct + r.wrong + r.blank;
      if (q <= 0) continue;
      const a = agg.get(r.subject) ?? { n: 0, ratio: 0 };
      a.n += 1;
      a.ratio += Math.max(0, r.net) / q;
      agg.set(r.subject, a);
    }
  }
  return [...agg.entries()]
    .filter(([, a]) => a.n >= minExams)
    .map(([subject, a]) => ({ subject, exams: a.n, successRatio: Math.round((a.ratio / a.n) * 100) / 100, level: "subject" as const }))
    .sort((x, y) => x.successRatio - y.successRatio);
}
