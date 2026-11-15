/**
 * Claude sağlayıcısı (CITA_AI_PROVIDER=anthropic, ANTHROPIC_API_KEY sunucuda).
 * - Model: claude-opus-5-5, yapılandırılmış çıktı (beta.messages.parse + Zod)
 * - Sunucu tarafı ret yedeği: fallbacks "default" (server-side-fallback-2026-07-01)
 * - Ret (refusal) ya da şema dışı çıktıda güvenli hata fırlatılır; çağıran
 *   kullanıcıya uydurma içerik göstermez.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { ChatReply, IndependentAnswers, PhotoHint, PhotoSolution, ReviewItems } from "./schemas";
import type { AiProvider, Image, StudentContext, WebResult } from "./types";

const MODEL = "claude-opus-5-5";
const BETAS = ["server-side-fallback-2026-07-01"];

export class AiUnavailableError extends Error {}

const PERSONA = `Sen Çita'sın: YKS ve LGS öğrencileri için sportif, sıcak ama doğrudan bir çalışma koçu maskotu.
Türkçe yaz. Kısa, tatlı sert ve hedef odaklı ol; örnek ton: «Bugün 30 dakikan var. 20 dakika problemler, 10 dakika yanlış analizi. Programa ekleyeyim mi?»
Kurallar:
- Önerilerini yalnızca verilen öğrenci verisine (sınav, seviye, süre, mevcut program, gerçek kayıtlar) dayandır. Veri yoksa uydurma; gerekirse tek kısa soru sor.
- Ders toplamından konu hatası çıkarma. Konu önerisi için öğrenciye kısa doğrulama sorusu sor.
- Programı ASLA kendin değiştirdiğini söyleme. Değişiklik gerekiyorsa planChange alanında öner; öğrenci onaylamadan hiçbir şey değişmez.
- Popülerlik/güncellik iddiası ya da kaynak adı uydurma; kaynak gerekiyorsa resourceQuery doldur.
- Tıbbi/psikolojik kriz belirtisi görürsen nazikçe bir yetişkine ya da uzmana yönlendir.`;

function contextBlock(ctx: StudentContext): string {
  return JSON.stringify({
    ad: ctx.name,
    sinav: ctx.track,
    alan: ctx.field,
    odak: ctx.focus,
    hedef: ctx.goal,
    seviye: ctx.level,
    zorlanilan_dersler: ctx.weakSubjects,
    gunluk_musaitlik_pzt_paz_dk: ctx.availability,
    bugun: `${ctx.today} (${ctx.todayName})`,
    bu_haftanin_programi: ctx.week,
    son_7_gun_calisma_dk: ctx.minutesLast7,
    haftalik_hedef_dk: ctx.weeklyTarget,
    denemeler: ctx.exams,
  });
}

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic" as const;
  private client: Anthropic;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) throw new AiUnavailableError("ANTHROPIC_API_KEY tanımlı değil");
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 90_000 });
  }

  private async parse<S extends z.ZodType>(
    schema: S,
    system: string,
    content: Anthropic.Beta.Messages.BetaContentBlockParam[] | string,
    history: { role: "user" | "assistant"; content: string }[] = [],
    effort: "low" | "medium" | "high" = "medium"
  ): Promise<z.infer<S>> {
    const response = await this.client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: BETAS,
      fallbacks: "default",
      system,
      output_config: { effort, format: betaZodOutputFormat(schema) },
      messages: [...history.map((h) => ({ role: h.role, content: h.content })), { role: "user", content }],
    });
    if (response.stop_reason === "refusal") throw new AiUnavailableError("Model bu isteği yanıtlamadı.");
    if (response.stop_reason === "max_tokens") throw new AiUnavailableError("Yanıt yarıda kesildi.");
    if (!response.parsed_output) throw new AiUnavailableError("Yapılandırılmış çıktı alınamadı.");
    return response.parsed_output as z.infer<S>;
  }

  async chat(ctx: StudentContext, message: string) {
    return this.parse(
      ChatReply,
      `${PERSONA}\n\nÖğrenci verisi (JSON):\n${contextBlock(ctx)}\n\nplanChange.ops içinde update/remove için yalnızca bu_haftanin_programi listesindeki id'leri kullan; tarih bu hafta ya da gelecek 7 gün içinde olsun; dakika 5–240.`,
      message,
      ctx.history.slice(-12),
      "low"
    );
  }

  private imageBlock(image: Image): Anthropic.Beta.Messages.BetaContentBlockParam {
    return { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } };
  }

  async photoHint(ctx: Pick<StudentContext, "track" | "focus">, image: Image) {
    return this.parse(
      PhotoHint,
      `${PERSONA}\nÖğrenci ${ctx.track}${ctx.focus ? ` (${ctx.focus})` : ""} hazırlanıyor ve takıldığı sorunun fotoğrafını gönderdi.
Soru net okunmuyorsa readable=false ver ve nedenini kısaca yaz; tahminle soru uydurma.
Okunuyorsa soruyu metne dök ve CEVABI VERMEDEN tek, işe yarar bir ipucu yaz (ilk adımı açsın).`,
      [this.imageBlock(image), { type: "text", text: "Bu soruda ipucu ver." }],
      [],
      "medium"
    );
  }

  async photoSolution(ctx: Pick<StudentContext, "track" | "focus">, image: Image | null, questionText: string) {
    const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
    if (image) content.push(this.imageBlock(image));
    content.push({ type: "text", text: `Soru metni:\n${questionText}\n\nAdım adım çöz ve sonucu kontrol et.` });
    return this.parse(
      PhotoSolution,
      `${PERSONA}\n${ctx.track} sorusunu öğrencinin anlayacağı adımlarla çöz. Her adım kısa olsun. Son cevabı ayrıca yaz.`,
      content,
      [],
      "high"
    );
  }

  async similarItems(input: { track: string; subject: string; topic: string | null; questionText: string; skill: string; errorType: string | null }) {
    return this.parse(
      ReviewItems,
      `${PERSONA}\nKişisel tekrar için, verilen soruyla AYNI beceriyi ölçen 2 yeni çoktan seçmeli soru üret (${input.track} düzeyinde).
Sayıları/bağlamı değiştir ama beceriyi koru. Her sorunun tek doğru cevabı olsun; answer, choices içindeki metinle birebir aynı olsun. Çözüm adımlarını yaz ve cevabı kendin doğrula.`,
      JSON.stringify(input),
      [],
      "high"
    );
  }

  async solveIndependently(items: { prompt: string; choices: string[] }[]) {
    const out = await this.parse(
      IndependentAnswers,
      "Her soruyu bağımsız olarak çöz ve yalnızca doğru şıkkın metnini, choices içindeki değerle birebir aynı biçimde, sırayla döndür.",
      JSON.stringify(items),
      [],
      "high"
    );
    return out.answers;
  }

  async webSearch(query: string): Promise<WebResult[]> {
    const response = await this.client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: BETAS,
      fallbacks: "default",
      output_config: { effort: "low" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3, user_location: { type: "approximate", country: "TR" } }],
      messages: [{ role: "user", content: `Türkçe ücretsiz çalışma kaynağı ara: ${query}. Resmî (MEB/ÖSYM/EBA) ve eğitim sitelerini tercih et.` }],
    });
    // Yalnızca aracın gerçekten döndürdüğü sonuçları kullan (uydurma bağlantı yok).
    const results: WebResult[] = [];
    for (const block of response.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) {
          if (r.type === "web_search_result" && /^https?:\/\//.test(r.url)) results.push({ title: r.title, url: r.url });
        }
      }
    }
    const seen = new Set<string>();
    return results.filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true))).slice(0, 5);
  }
}
