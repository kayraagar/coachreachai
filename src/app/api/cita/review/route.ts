/**
 * Kişisel tekrar oturumu (Çita+): eski yanlış soru + aynı beceriyi ölçen iki
 * yeni soru. Yeni sorular yapısal olarak doğrulanır VE ikinci, bağımsız bir
 * çözümle cevapları kontrol edilir; tutmayan soru atılır (bir kez yeniden
 * üretilir). Doğrulanmış benzer soru çıkmazsa güvenli yedek: yalnızca eski soru.
 * Cevaplar istemciye oturum bitene kadar gönderilmez.
 */
import { validateReviewItem, type ReviewItem } from "@cita/core";
import { aiProvider } from "@/lib/cita/ai";
import { errorResponse, HttpError, idempotencyKey, json, readJson, requireStudent, serviceClient } from "@/lib/cita/server";

function publicItems(items: ReviewItem[]) {
  return items.map((i) => ({ kind: i.kind, prompt: i.prompt, choices: i.choices, skill: i.skill }));
}

export async function POST(req: Request) {
  try {
    const { db, user, profile } = await requireStudent(req);
    const key = idempotencyKey(req);
    const { data: tier } = await db.rpc("cita_my_tier");
    if (tier !== "plus" && tier !== "bire_bir") throw new HttpError(402, "plus_required", "Kişisel tekrar Çita+ ile açılır.");
    const { mistakeId } = await readJson<{ mistakeId?: string }>(req);

    const prev = await db.from("review_sessions").select("id, items, status, provider").eq("student_id", user.id).eq("idempotency_key", key).maybeSingle();
    if (prev.data) return json({ session: { ...prev.data, items: publicItems(prev.data.items as ReviewItem[]) }, replayed: true });

    const { data: m } = await db.from("mistakes").select("*").eq("id", mistakeId ?? "").maybeSingle();
    if (!m) throw new HttpError(404, "not_found", "Yanlış kaydı bulunamadı.");

    let original: ReviewItem | null = null;
    if (m.photo_request_id) {
      const { data: pr } = await db.from("photo_requests").select("question_text, solution").eq("id", m.photo_request_id).maybeSingle();
      const sol = pr?.solution as { steps?: string[]; finalAnswer?: string; keyIdea?: string } | null;
      if (pr?.question_text && sol?.finalAnswer && (sol.steps?.length ?? 0) >= 2) {
        original = { kind: "original", prompt: pr.question_text, choices: null, answer: sol.finalAnswer, solutionSteps: sol.steps!, skill: sol.keyIdea ?? m.topic ?? m.subject };
      }
    }
    if (!original) {
      if (!m.question_text) throw new HttpError(409, "no_question", "Bu kayıtta tekrar edilecek soru metni yok.");
      original = { kind: "original", prompt: m.question_text, choices: null, answer: "", solutionSteps: [], skill: m.topic ?? m.subject };
    }

    const ai = aiProvider();
    const verified: ReviewItem[] = [];
    for (let attempt = 0; attempt < 2 && verified.length < 2; attempt++) {
      try {
        const gen = await ai.similarItems({ track: profile.track, subject: m.subject, topic: m.topic, questionText: original.prompt, skill: original.skill, errorType: m.error_type });
        const candidates: ReviewItem[] = gen.items
          .map((i) => ({ kind: "similar" as const, prompt: i.prompt, choices: i.choices, answer: i.answer, solutionSteps: i.solutionSteps, skill: i.skill }))
          .filter((i) => validateReviewItem(i).length === 0);
        if (!candidates.length) continue;
        const answers = await ai.solveIndependently(candidates.map((c) => ({ prompt: c.prompt, choices: c.choices ?? [] })));
        candidates.forEach((c, idx) => {
          if (verified.length < 2 && answers[idx]?.trim() === c.answer.trim()) verified.push(c);
        });
      } catch {
        /* bir sonraki deneme ya da güvenli yedek */
      }
    }

    const items = [original, ...verified];
    const svc = serviceClient();
    const ins = await svc
      .from("review_sessions")
      .insert({ student_id: user.id, mistake_id: m.id, idempotency_key: key, items, provider: ai.name })
      .select("id, items, status, provider")
      .single();
    if (ins.error) {
      if (ins.error.code === "23505") {
        const again = await db.from("review_sessions").select("id, items, status, provider").eq("student_id", user.id).eq("idempotency_key", key).single();
        return json({ session: { ...again.data, items: publicItems(again.data!.items as ReviewItem[]) }, replayed: true });
      }
      throw new HttpError(500, "db", ins.error.message);
    }
    return json({
      session: { ...ins.data, items: publicItems(items) },
      notice: verified.length < 2 ? "Benzer soruları doğrulayamadım; bu tekrar yalnızca doğrulanmış sorularla yapılıyor." : null,
      replayed: false,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
