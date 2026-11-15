import { errorResponse, json, requireUser } from "@/lib/cita/server";

/** Mobil uygulamanın bağlantı ve kimlik kontrolü: profil + sunucuda hesaplanan paket. */
export async function GET(req: Request) {
  try {
    const { db, user } = await requireUser(req);
    const [{ data: profile }, { data: tier }] = await Promise.all([
      db.from("profiles").select("id, role, full_name, track, coach_id, onboarded_at").eq("id", user.id).maybeSingle(),
      db.rpc("cita_my_tier"),
    ]);
    return json({ profile, tier: tier ?? "free", aiProvider: process.env.CITA_AI_PROVIDER ?? "test" });
  } catch (e) {
    return errorResponse(e);
  }
}
