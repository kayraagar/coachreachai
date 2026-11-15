/**
 * GET  /api/cita/billing?studentId=  → paket durumu (öğrenci ya da bağlı veli)
 * POST /api/cita/billing             → satın alma niyeti + gösterilecek koşullar
 *   { studentId?, product, platform, trial? }
 * Niyet kimliği mağazaya appAccountToken (iOS) / obfuscatedAccountId (Android)
 * olarak verilir; doğrulanan mağaza olayı bu kimlikle doğru öğrenciye bağlanır.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { trialEligible, type Subscription } from "@cita/core";
import { billingProvider, PRODUCTS, purchaseTerms, TEST_PRICES, type ProductId } from "@/lib/cita/billing";
import { errorResponse, HttpError, json, readJson, requireUser } from "@/lib/cita/server";

async function status(db: SupabaseClient, studentId: string) {
  const [subs, trial, tier, coach] = await Promise.all([
    db.from("subscriptions").select("id, tier, status, expires_at, will_renew, is_trial, provider, payer_id").eq("student_id", studentId),
    db.from("trial_usage").select("student_id").eq("student_id", studentId).maybeSingle(),
    db.rpc("cita_effective_tier", { p_student: studentId }),
    db.from("coach_assignment_requests").select("status, assigned_at").eq("student_id", studentId).maybeSingle(),
  ]);
  const list = (subs.data ?? []).map((s) => ({ tier: s.tier, status: s.status, expiresAt: s.expires_at, willRenew: s.will_renew })) as Subscription[];
  return {
    tier: tier.data ?? "free",
    subscriptions: subs.data ?? [],
    trialEligible: trialEligible({ trialUsed: Boolean(trial.data), subs: list, now: new Date() }),
    coachRequest: coach.data ?? null,
    provider: billingProvider(),
  };
}

export async function GET(req: Request) {
  try {
    const { db, user } = await requireUser(req);
    const studentId = new URL(req.url).searchParams.get("studentId") || user.id;
    if (studentId !== user.id) {
      const { data: ok } = await db.rpc("cita_parent_students");
      if (!(ok ?? []).some((s: { student_id: string }) => s.student_id === studentId)) throw new HttpError(403, "not_allowed", "Bu öğrenciye erişimin yok.");
    }
    return json(await status(db, studentId));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const { db, user } = await requireUser(req);
    const b = await readJson<{ studentId?: string; product?: string; platform?: string; trial?: boolean }>(req);
    const product = b.product as ProductId;
    if (!(product in PRODUCTS)) throw new HttpError(400, "product", "Geçersiz ürün.");
    const provider = billingProvider();
    const platform = provider === "test" ? "test" : b.platform === "ios" || b.platform === "android" ? b.platform : null;
    if (!platform) throw new HttpError(400, "platform", "Platform ios ya da android olmalı.");
    const studentId = b.studentId || user.id;
    const st = await status(db, studentId);
    if (b.trial && (!st.trialEligible || product !== "cita_plus_monthly")) throw new HttpError(409, "trial_not_eligible", "Deneme süresi bu hesap için kullanılamaz.");
    const { data: intent, error } = await db.rpc("cita_create_purchase_intent", {
      p_student: studentId, p_tier: PRODUCTS[product].tier, p_product: product, p_platform: platform,
    });
    if (error) throw new HttpError(403, "not_allowed", "Bu öğrenci için satın alma başlatamazsın.");
    const upgradeFrom = st.tier === "plus" && PRODUCTS[product].tier === "bire_bir" ? "Çita+" : null;
    return json({
      intentId: intent.id,
      provider,
      product,
      displayPrice: provider === "test" ? TEST_PRICES[product] : null,
      terms: purchaseTerms(product, { trial: Boolean(b.trial), upgradeFrom }),
      manageUrl: { ios: "https://apps.apple.com/account/subscriptions", android: "https://play.google.com/store/account/subscriptions" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
