/**
 * Soru fotoğrafı → ipucu.
 * - Idempotency-Key başlığı zorunlu; aynı anahtarla tekrar deneme hak düşürmez, önceki sonucu döner.
 * - Hak sunucuda, Europe/Istanbul gününe göre, kilitli RPC ile düşer (cita_reserve_photo).
 * - Okunamayan fotoğraf ya da AI hatası hakkı iade eder (cita_finish_photo).
 * - Fotoğraf özel depoda: question-photos/<öğrenci>/<istek>.<uzantı>
 */
import { aiProvider } from "@/lib/cita/ai";
import { loadStudentContext } from "@/lib/cita/context";
import { errorResponse, HttpError, idempotencyKey, json, requireStudent, serviceClient } from "@/lib/cita/server";

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
const MAX_BYTES = 6 * 1024 * 1024;

type Row = Record<string, unknown> & { id: string; status: string };

function publicView(r: Row) {
  return {
    id: r.id,
    status: r.status,
    subject: r.subject ?? null,
    topic: r.topic ?? null,
    questionText: r.question_text ?? null,
    hint: r.hint ?? null,
    hasSolution: !!r.solution,
    provider: r.provider ?? null,
  };
}

export async function POST(req: Request) {
  try {
    const { db, user } = await requireStudent(req);
    const key = idempotencyKey(req);

    const form = await req.formData().catch(() => null);
    const file = form?.get("image");
    if (!(file instanceof File)) throw new HttpError(400, "image_required", "Fotoğraf gerekli.");
    const type = file.type as keyof typeof TYPES;
    if (!(type in TYPES)) throw new HttpError(415, "image_type", "JPEG, PNG ya da WEBP gönder.");
    if (file.size > MAX_BYTES) throw new HttpError(413, "image_size", "Fotoğraf en fazla 6 MB olabilir.");

    const { data: reserve, error } = await db.rpc("cita_reserve_photo", { p_key: key });
    if (error) throw new HttpError(500, "reserve", error.message);
    const quota = await db.rpc("cita_photo_quota");

    if (reserve.outcome === "limit") {
      return json({ error: "Bugünkü soru fotoğrafı hakkın doldu. Haklar İstanbul saatiyle gece yarısı yenilenir.", code: "limit", quota: quota.data }, 429);
    }
    const existing = reserve.request as Row;
    if (reserve.outcome === "existing") {
      if (existing.status === "processing") throw new HttpError(409, "processing", "Bu fotoğraf hâlâ işleniyor, birazdan tekrar dene.");
      return json({ request: publicView(existing), quota: quota.data, replayed: true });
    }

    const svc = serviceClient();
    const requestId = existing.id;
    const bytes = Buffer.from(await file.arrayBuffer());
    const path = `${user.id}/${requestId}.${TYPES[type]}`;
    const ai = aiProvider();

    let finished: Row;
    try {
      const up = await svc.storage.from("question-photos").upload(path, bytes, { contentType: type, upsert: true });
      if (up.error) throw new Error(up.error.message);
      const ctx = await loadStudentContext(db, user.id);
      const hint = await ai.photoHint({ track: ctx.track, focus: ctx.focus }, { base64: bytes.toString("base64"), mediaType: type });
      const { data, error: finErr } = await svc.rpc("cita_finish_photo", {
        p_request: requestId,
        p_status: hint.readable && hint.hint ? "hint" : "unreadable",
        p_fields: {
          image_path: path,
          subject: hint.subject,
          topic: hint.topic,
          question_text: hint.questionText,
          hint: hint.readable ? hint.hint : hint.unreadableReason,
          provider: ai.name,
        },
      });
      if (finErr) throw new Error(finErr.message);
      finished = data as Row;
    } catch (e) {
      await svc.rpc("cita_finish_photo", { p_request: requestId, p_status: "failed", p_fields: { provider: ai.name } });
      console.error("[cita-photo]", e);
      throw new HttpError(503, "ai_unavailable", "Fotoğraf şu an işlenemedi; hakkın iade edildi. Biraz sonra tekrar dene.");
    }
    const after = await db.rpc("cita_photo_quota");
    return json({ request: publicView(finished), quota: after.data, replayed: false });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET(req: Request) {
  try {
    const { db } = await requireStudent(req);
    const quota = await db.rpc("cita_photo_quota");
    return json({ quota: quota.data });
  } catch (e) {
    return errorResponse(e);
  }
}
