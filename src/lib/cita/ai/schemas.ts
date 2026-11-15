/**
 * Yapılandırılmış AI çıktıları. Model serbest metinle ajanda yazamaz; yalnızca
 * bu şemalara uyan öneriler üretir ve sunucu hepsini yeniden doğrular.
 */
import { z } from "zod";

export const ERROR_TYPE_KEYS = ["kavram", "denklem_kurma", "islem", "soru_okuma", "dikkat", "sure", "bilgi", "diger"] as const;

export const ChatPlanOp = z.object({
  op: z.enum(["add", "update", "remove"]),
  /** update/remove için mevcut görev kimliği (yalnızca verilen listeden); add için null. */
  id: z.string().nullable(),
  date: z.string().describe("YYYY-MM-DD"),
  title: z.string(),
  minutes: z.number().int().nullable(),
});

export const ChatReply = z.object({
  reply: z.string().describe("Öğrenciye kısa, Türkçe, tatlı sert cevap (en fazla 4 cümle)."),
  intent: z.enum(["advice", "plan_change", "resources", "motivation", "question", "other"]),
  planChange: z
    .object({ summary: z.string(), ops: z.array(ChatPlanOp) })
    .nullable()
    .describe("Öğrenci program değişikliği isterse ya da açıkça gerekiyorsa; aksi hâlde null."),
  resourceQuery: z
    .object({ subject: z.string(), topic: z.string().nullable(), level: z.string().nullable() })
    .nullable()
    .describe("Kaynak önerisi gerekiyorsa aranacak ders/konu; aksi hâlde null."),
  verifyTopicQuestion: z
    .string()
    .nullable()
    .describe("Konu bazlı öneri için veri yetersizse öğrenciye sorulacak tek kısa doğrulama sorusu."),
});
export type ChatReply = z.infer<typeof ChatReply>;

export const PhotoHint = z.object({
  readable: z.boolean(),
  unreadableReason: z.string().nullable(),
  subject: z.string().nullable(),
  topic: z.string().nullable(),
  questionText: z.string().nullable().describe("Sorunun okunabilen metni (şıklar dahil)."),
  hint: z.string().nullable().describe("Cevabı vermeden, ilk adımı açan tek işe yarar ipucu."),
});
export type PhotoHint = z.infer<typeof PhotoHint>;

export const PhotoSolution = z.object({
  steps: z.array(z.string()).describe("Adım adım çözüm."),
  finalAnswer: z.string(),
  keyIdea: z.string().describe("Sorunun ölçtüğü beceri / ana fikir."),
  likelyErrorTypes: z.array(z.enum(ERROR_TYPE_KEYS)).describe("Bu soruda öğrencilerin tipik hata türleri, olasılık sırasıyla."),
  clarifyingQuestion: z.string().describe("Öğrencinin hata türünü doğrulamak için kısa soru, örn. «Denklemi kurarken mi, işlemi yaparken mi takıldın?»"),
});
export type PhotoSolution = z.infer<typeof PhotoSolution>;

export const ReviewItemSchema = z.object({
  prompt: z.string(),
  choices: z.array(z.string()).describe("4 ya da 5 şık, metin olarak."),
  answer: z.string().describe("Doğru şıkkın metni, choices içindeki değerle birebir aynı."),
  solutionSteps: z.array(z.string()),
  skill: z.string(),
});
export const ReviewItems = z.object({ items: z.array(ReviewItemSchema) });
export type ReviewItems = z.infer<typeof ReviewItems>;

export const IndependentAnswers = z.object({ answers: z.array(z.string()) });
