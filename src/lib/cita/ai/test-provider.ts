/**
 * TEST SAĞLAYICISI (CITA_AI_PROVIDER=test, varsayılan).
 *
 * Gerçek model çağırmaz; öğrencinin GERÇEK kayıtlarını kural tabanlı ve
 * deterministik biçimde kullanır. Tüm çıktılar provider="test" olarak saklanır
 * ve mobilde "TEST SAĞLAYICI" etiketiyle gösterilir; gerçek AI analizi gibi
 * sunulmaz. Yerel uçtan uca testler ve CI içindir.
 */
import { normalizeTr, parsePlanEdit } from "@cita/core";
import type { ChatReply, PhotoHint, PhotoSolution, ReviewItems } from "./schemas";
import type { AiProvider, Image, StudentContext, WebResult } from "./types";

const SUBJECT_WORDS: [string, string][] = [
  ["matemat", "Matematik"], ["turkce", "Türkçe"], ["fizik", "Fizik"], ["kimya", "Kimya"], ["biyoloji", "Biyoloji"],
  ["fen", "Fen Bilimleri"], ["tarih", "Tarih"], ["cografya", "Coğrafya"], ["edebiyat", "Edebiyat"], ["ingilizce", "Yabancı Dil"],
  ["inkilap", "T.C. İnkılap Tarihi"], ["paragraf", "Türkçe"], ["geometri", "Matematik"],
];

function subjectIn(text: string): string | null {
  const t = normalizeTr(text);
  return SUBJECT_WORDS.find(([w]) => t.includes(w))?.[1] ?? null;
}

/** Test görselinin "okunabilirliği": çok küçük dosya = okunamaz (deterministik). */
const MIN_READABLE_BYTES = 2048;

export class TestProvider implements AiProvider {
  readonly name = "test" as const;

  async chat(ctx: StudentContext, message: string): Promise<ChatReply> {
    const t = normalizeTr(message);
    const pending = ctx.week.filter((w) => w.date === ctx.today && !w.completed);
    const base: ChatReply = { reply: "", intent: "other", planChange: null, resourceQuery: null, verifyTopicQuestion: null };

    // Gün iptali → o günün kalan görevlerini kaldırma önerisi
    const edit = parsePlanEdit(message, []);
    const dayOff = edit.edits.find((e) => e.type === "set_day_minutes" && e.minutes === 0);
    if (dayOff && dayOff.type === "set_day_minutes") {
      const days = new Set(dayOff.days.map((d) => d + 1));
      const targets = ctx.week.filter((w) => {
        const wd = new Date(`${w.date}T12:00:00Z`).getUTCDay() || 7;
        return days.has(wd) && w.date >= ctx.today && !w.completed;
      });
      if (!targets.length) return { ...base, intent: "plan_change", reply: "O gün için kalan görevin yok, programın zaten uygun." };
      return {
        ...base,
        intent: "plan_change",
        reply: `Anlaşıldı. ${targets.length} görevi o günden çıkarmayı öneriyorum. Onaylarsan programın güncellenir.`,
        planChange: {
          summary: "Çalışamayacağın günün görevlerini kaldır",
          ops: targets.map((w) => ({ op: "remove" as const, id: w.id, date: w.date, title: w.title, minutes: w.minutes })),
        },
      };
    }

    // "30 dakikam var" → bugüne kısa blok önerisi
    const m = t.match(/(\d+)\s*(dk|dakika)/);
    if (m && /var|bos|vaktim/.test(t)) {
      const total = Math.min(240, Math.max(10, Number(m[1])));
      const subject = ctx.weakSubjects[0] ?? "Matematik";
      const main = Math.round((total * 2) / 3);
      return {
        ...base,
        intent: "plan_change",
        reply: `Bugün ${total} dakikan var. ${main} dakika ${subject} problemleri, ${total - main} dakika yanlış analizi. Programa ekleyeyim mi?`,
        planChange: {
          summary: `Bugüne ${total} dakikalık blok`,
          ops: [
            { op: "add", id: null, date: ctx.today, title: `${subject} — problemler`, minutes: main },
            { op: "add", id: null, date: ctx.today, title: "Yanlış analizi", minutes: total - main },
          ],
        },
      };
    }

    if (/kaynak|kitap|video|soru bankasi|ne calisayim|hangi/.test(t)) {
      const subject = subjectIn(message) ?? ctx.weakSubjects[0] ?? "Genel";
      return {
        ...base,
        intent: "resources",
        reply: `${subject} için önce ekibin onayladığı kaynaklara bakıyorum.`,
        resourceQuery: { subject, topic: null, level: ctx.level },
        verifyTopicQuestion: subject !== "Genel" ? `${subject} içinde en çok hangi konuda takılıyorsun?` : null,
      };
    }

    if (pending.length) {
      const first = pending[0];
      return {
        ...base,
        intent: "advice",
        reply: `Bugün ${pending.length} görevin kaldı. İlk iş: ${first.title}${first.minutes ? ` (${first.minutes} dk)` : ""}. Kronometreyi aç, bitince işaretle.`,
      };
    }
    const done = ctx.week.filter((w) => w.date === ctx.today && w.completed).length;
    return {
      ...base,
      intent: "motivation",
      reply: done
        ? `Bugünkü ${done} görevi bitirdin. Yarının ilk görevine 10 dakika göz at, sonra dinlen.`
        : "Bugün için planlı görevin yok. Dinlenme günü de programın parçası.",
    };
  }

  async photoHint(_ctx: Pick<StudentContext, "track" | "focus">, image: Image): Promise<PhotoHint> {
    const bytes = Math.floor((image.base64.length * 3) / 4);
    if (bytes < MIN_READABLE_BYTES)
      return { readable: false, unreadableReason: "Fotoğraf çok küçük ya da bulanık (test kuralı).", subject: null, topic: null, questionText: null, hint: null };
    return {
      readable: true,
      unreadableReason: null,
      subject: "Matematik",
      topic: "Denklemler",
      questionText: "TEST: 2x + 3 = 11 ise x kaçtır? A) 2 B) 3 C) 4 D) 5",
      hint: "Önce bilinmeyeni yalnız bırak: her iki taraftan 3 çıkar.",
    };
  }

  async photoSolution(): Promise<PhotoSolution> {
    return {
      steps: ["Her iki taraftan 3 çıkar: 2x = 8", "Her iki tarafı 2'ye böl: x = 4", "Kontrol: 2·4 + 3 = 11 ✓"],
      finalAnswer: "C) 4",
      keyIdea: "Birinci dereceden bir bilinmeyenli denklem",
      likelyErrorTypes: ["islem", "denklem_kurma"],
      clarifyingQuestion: "Denklemi kurarken mi, işlemi yaparken mi takıldın?",
    };
  }

  async similarItems(input: { subject: string; skill: string }): Promise<ReviewItems> {
    const mk = (a: number, b: number, c: number) => {
      const x = (c - b) / a;
      const choices = [x - 1, x, x + 1, x + 2].map(String);
      return {
        prompt: `TEST (${input.subject}): ${a}x + ${b} = ${c} ise x kaçtır?`,
        choices,
        answer: String(x),
        solutionSteps: [`Her iki taraftan ${b} çıkar: ${a}x = ${c - b}`, `${a}'e böl: x = ${x}`],
        skill: input.skill || "Birinci dereceden denklem",
      };
    };
    return { items: [mk(3, 5, 20), mk(4, 7, 27)] };
  }

  async solveIndependently(items: { prompt: string; choices: string[] }[]): Promise<string[]> {
    return items.map((i) => {
      const m = i.prompt.match(/(\d+)x \+ (\d+) = (\d+)/);
      return m ? String((Number(m[3]) - Number(m[2])) / Number(m[1])) : "";
    });
  }

  async webSearch(query: string): Promise<WebResult[]> {
    return [{ title: `TEST arama sonucu: ${query}`, url: `https://example.com/test-arama?q=${encodeURIComponent(query)}` }];
  }
}
