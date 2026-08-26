/**
 * Sınav kolu (track) yapılandırması.
 *
 * Uygulama iki sınavı birden taşır: YKS ve LGS. Paneller, formlar ve grafikler
 * aynıdır; yalnızca ders kataloğu, deneme türleri, net formülü ve etiketler
 * değişir. Bu dosya o farkların tamamını tek yerde toplar — yeni bir sınav kolu
 * eklemek buraya bir kayıt eklemek demektir.
 */

export type Track = "YKS" | "LGS";

export const TRACKS: Track[] = ["YKS", "LGS"];

export function isTrack(value: unknown): value is Track {
  return value === "YKS" || value === "LGS";
}

/** Bilinmeyen/boş değerleri güvenli varsayılana indirger. */
export function asTrack(value: unknown): Track {
  return isTrack(value) ? value : "YKS";
}

/**
 * Net trendi ve görüşme ajandasındaki iki net alanının tanımı.
 *
 * `examTypes` → hangi deneme türleri bu bölüme dahil.
 * `categories` → null ise denemenin tüm ders sonuçları toplanır; doluysa
 *   yalnızca bu kategorideki dersler sayılır. LGS'de tek bir 90 soruluk deneme
 *   hem sözel hem sayısal netini içerdiği için kategori kırılımı şart.
 */
export type NetSection = {
  /** Görüşme ajandasında karşılık geldiği kolon. */
  key: "tyt_net" | "ayt_net";
  label: string;
  examTypes: string[];
  categories: string[] | null;
};

export type ExamTypeOption = {
  value: string;
  /** Segment kontrolünde görünen kısa etiket. */
  label: string;
  /** Bu türde girilebilecek ders kategorileri; null ise tüm dersler. */
  categories: string[] | null;
};

export type TrackConfig = {
  value: Track;
  label: string;
  longLabel: string;
  /** Kayıt ekranındaki tek satırlık açıklama. */
  hint: string;
  /** Bu kola ait ders kategorileri. */
  categories: string[];
  examTypes: ExamTypeOption[];
  defaultExamType: string;
  /** Yanlışın doğruyu götürme katsayısı (net = doğru − yanlış / katsayı). */
  wrongPenalty: number;
  penaltyHint: string;
  primary: NetSection;
  secondary: NetSection;
  examNamePlaceholder: string;
  targetNetPlaceholder: string;
  plannedExamPlaceholder: string;
};

const BRANCH: ExamTypeOption = {
  value: "Branş",
  label: "Branş denemesi",
  categories: null,
};

export const TRACK_CONFIG: Record<Track, TrackConfig> = {
  YKS: {
    value: "YKS",
    label: "YKS",
    longLabel: "YKS — Yükseköğretim Kurumları Sınavı",
    hint: "Lise / mezun · TYT ve AYT denemeleri",
    categories: ["TYT", "AYT"],
    examTypes: [
      { value: "TYT", label: "TYT", categories: ["TYT"] },
      { value: "AYT", label: "AYT", categories: ["AYT"] },
      BRANCH,
    ],
    defaultExamType: "TYT",
    wrongPenalty: 4,
    penaltyHint: "4 yanlış 1 doğruyu götürür (net = D − Y/4)",
    primary: { key: "tyt_net", label: "TYT net", examTypes: ["TYT"], categories: null },
    secondary: { key: "ayt_net", label: "AYT net", examTypes: ["AYT"], categories: null },
    examNamePlaceholder: "Örn. 3D Yayınları TYT-1",
    targetNetPlaceholder: "Örn. TYT 95–105",
    plannedExamPlaceholder: "Örn. Cumartesi TYT genel deneme",
  },

  LGS: {
    value: "LGS",
    label: "LGS",
    longLabel: "LGS — Liselere Geçiş Sınavı",
    hint: "8. sınıf · sözel ve sayısal bölüm denemeleri",
    categories: ["LGS-Sözel", "LGS-Sayısal"],
    examTypes: [
      { value: "LGS", label: "LGS (tam deneme)", categories: ["LGS-Sözel", "LGS-Sayısal"] },
      { value: "Sayısal", label: "Sayısal", categories: ["LGS-Sayısal"] },
      { value: "Sözel", label: "Sözel", categories: ["LGS-Sözel"] },
      BRANCH,
    ],
    defaultExamType: "LGS",
    wrongPenalty: 3,
    penaltyHint: "3 yanlış 1 doğruyu götürür (net = D − Y/3)",
    primary: {
      key: "tyt_net",
      label: "Sayısal net",
      examTypes: ["LGS", "Sayısal"],
      categories: ["LGS-Sayısal"],
    },
    secondary: {
      key: "ayt_net",
      label: "Sözel net",
      examTypes: ["LGS", "Sözel"],
      categories: ["LGS-Sözel"],
    },
    examNamePlaceholder: "Örn. Bilfen LGS Deneme-1",
    targetNetPlaceholder: "Örn. Sayısal 34–38, Sözel 42–46",
    plannedExamPlaceholder: "Örn. Cumartesi LGS genel deneme",
  },
};

export function trackConfig(track: unknown): TrackConfig {
  return TRACK_CONFIG[asTrack(track)];
}

/** Bir deneme türünde girilebilecek dersleri süzer. */
export function subjectsForExamType<T extends { category: string }>(
  subjects: T[],
  config: TrackConfig,
  examType: string
): T[] {
  const option = config.examTypes.find((t) => t.value === examType);
  const categories = option?.categories ?? null;
  if (!categories) return subjects;
  return subjects.filter((s) => categories.includes(s.category));
}
