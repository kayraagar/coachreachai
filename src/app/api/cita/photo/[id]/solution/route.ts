/**
 * Tam Çözümü Göster: aynı istek için ek hak DÜŞMEZ (ipucu + çözüm = tek hak).
 * Çözüm bir kez üretilir ve saklanır; tekrar çağrı kayıtlı çözümü döner.
 */
import { aiProvider } from "@/lib/cita/ai";
import { loadStudentContext } from "@/lib/cita/context";
import { errorResponse, HttpError, json, requireStudent, serviceClient } from "@/lib/cita/server";

export async function POST(req: Request, ctx: RouteContext<"/api/cita/photo/[id]/solution">) {
  try {
    const { id } = await ctx.params;
    const { db, user } = await requireStudent(req);
    const { data: r } = await db.from("photo_requests").select("*").eq("id", id).maybeSingle();
    if (!r) throw new HttpError(404, "not_found", "İstek bulunamadı.");
    if (r.status !== "hint") throw new HttpError(409, "no_hint", "Bu fotoğraf için çözüm üretilemez.");
    if (r.solution) return json({ solution: r.solution, provider: r.provider, replayed: true });

    const svc = serviceClient();
    let image = null;
    if (r.image_path) {
      const dl = await svc.storage.from("question-photos").download(r.image_path);
      if (dl.data) {
        const mediaType = (dl.data.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";
        image = { base64: Buffer.from(await dl.data.arrayBuffer()).toString("base64"), mediaType };
      }
    }
    const sctx = await loadStudentContext(db, user.id);
    const ai = aiProvider();
    let solution;
    try {
      solution = await ai.photoSolution({ track: sctx.track, focus: sctx.focus }, image, r.question_text ?? "");
    } catch {
      throw new HttpError(503, "ai_unavailable", "Çözüm şu an hazırlanamadı. Tekrar dene; ek hak düşmez.");
    }
    const { error } = await svc.from("photo_requests").update({ solution }).eq("id", id).is("solution", null);
    if (error) throw new HttpError(500, "db", error.message);
    const { data: saved } = await db.from("photo_requests").select("solution, provider").eq("id", id).single();
    return json({ solution: saved?.solution ?? solution, provider: ai.name, replayed: false });
  } catch (e) {
    return errorResponse(e);
  }
}
