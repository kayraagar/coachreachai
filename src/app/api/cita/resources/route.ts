import { findResources } from "@/lib/cita/context";
import { errorResponse, HttpError, json, requireStudent } from "@/lib/cita/server";

/** Kaynak önerisi: önce onaylı katalog, yoksa sunucu üzerinden web araması (kaynağı belirtilir). */
export async function GET(req: Request) {
  try {
    const { db, profile } = await requireStudent(req);
    const url = new URL(req.url);
    const subject = (url.searchParams.get("subject") ?? "").trim();
    if (!subject || subject.length > 80) throw new HttpError(400, "subject", "Ders gerekli.");
    const card = await findResources(db, profile.track, {
      subject,
      topic: url.searchParams.get("topic")?.trim() || null,
      level: url.searchParams.get("level")?.trim() || null,
    });
    return json(card);
  } catch (e) {
    return errorResponse(e);
  }
}
