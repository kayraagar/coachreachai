/**
 * Abonelik olay işleyicisi (sunucu, servis rolü).
 *
 * Tüm sağlayıcılar (test, App Store Server Notifications v2, Google RTDN) aynı
 * normalleştirilmiş olayı buraya verir. İşleme (provider, event_id) ile TEK
 * KEZ yapılır; tekrar gelen olay kayıtlı sonucu döndürür.
 *
 * Paket kuralları:
 * - 14 günlük Çita+ denemesi: öğrenci başına bir kez, yalnızca ücretsizken.
 * - Çita+ → Bire Bir: aynı abonelik grubu (Apple) / aynı abonelik, farklı temel
 *   plan (Google). Yükseltmede Çita+ yenilemesi durur (will_renew=false) ve kalan
 *   süre mağaza tarafından mahsup edilir; veritabanında aynı öğrencide birden
 *   fazla yenilenen abonelik olamaz (uq_subscriptions_one_renewing).
 * - Bire Bir satın alınınca öğrenci koç atama kuyruğuna girer.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { HttpError, serviceClient } from "./server";

export const PRODUCTS = {
  cita_plus_monthly: { tier: "plus", periodDays: 30, trialDays: 14, label: "Çita+ (aylık)" },
  cita_birebir_monthly: { tier: "bire_bir", periodDays: 30, trialDays: 0, label: "Çita Bire Bir (aylık)" },
} as const;
export type ProductId = keyof typeof PRODUCTS;

/** Yalnızca TEST sağlayıcısında gösterilir; gerçek fiyatı mağaza ekranı gösterir. */
export const TEST_PRICES: Record<ProductId, string> = {
  cita_plus_monthly: "TEST fiyatı: ₺249,99/ay",
  cita_birebir_monthly: "TEST fiyatı: ₺2.499,00/ay",
};

export function billingProvider(): "test" | "store" {
  return process.env.CITA_BILLING_PROVIDER === "store" ? "store" : "test";
}

export type BillingAction = "start_trial" | "purchase" | "renew" | "cancel" | "billing_issue" | "expire" | "refund";

type Sub = {
  id: string;
  student_id: string;
  tier: "plus" | "bire_bir";
  status: string;
  expires_at: string;
  will_renew: boolean;
  original_transaction_id: string;
  intent_id: string | null;
};

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

export async function processBillingEvent(input: {
  provider: "test" | "app_store" | "play_store";
  eventId: string;
  intentId: string;
  action: BillingAction;
  payload?: Record<string, unknown>;
  now?: Date;
}): Promise<Record<string, unknown>> {
  const svc = serviceClient();
  const now = (input.now ?? new Date()).getTime();

  const { data: intent } = await svc.from("purchase_intents").select("*").eq("id", input.intentId).maybeSingle();
  if (!intent) throw new HttpError(404, "intent_not_found", "Satın alma niyeti bulunamadı.");

  // Idempotency: olay daha önce işlendiyse sonucu aynen döndür.
  const ev = await svc
    .from("billing_events")
    .insert({ provider: input.provider, event_id: input.eventId, intent_id: intent.id, student_id: intent.student_id, type: input.action, payload: input.payload ?? {} })
    .select("id")
    .single();
  if (ev.error) {
    if (ev.error.code === "23505") {
      const prev = await svc.from("billing_events").select("result").eq("provider", input.provider).eq("event_id", input.eventId).single();
      return { ...(prev.data?.result ?? {}), replayed: true };
    }
    throw new HttpError(500, "db", ev.error.message);
  }

  const product = PRODUCTS[intent.product_id as ProductId];
  if (!product || product.tier !== intent.tier) throw new HttpError(400, "product", "Ürün niyetle eşleşmiyor.");
  const studentId: string = intent.student_id;
  const originalTx = `${input.provider}-${intent.id}`;

  const { data: subsData } = await svc.from("subscriptions").select("*").eq("student_id", studentId);
  const subs = (subsData ?? []) as Sub[];
  const active = (s: Sub) => ["trialing", "active", "grace", "billing_retry", "canceled"].includes(s.status) && Date.parse(s.expires_at) > now;
  const mine = subs.find((s) => s.original_transaction_id === originalTx);
  let result: Record<string, unknown>;

  switch (input.action) {
    case "start_trial": {
      const { data: used } = await svc.from("trial_usage").select("student_id").eq("student_id", studentId).maybeSingle();
      if (used || subs.some(active) || product.tier !== "plus") {
        result = { ok: false, code: "trial_not_eligible" };
        break;
      }
      await svc.from("trial_usage").insert({ student_id: studentId });
      const ins = await svc.from("subscriptions").insert({
        student_id: studentId, payer_id: intent.payer_id, tier: "plus", status: "trialing", provider: input.provider,
        product_id: intent.product_id, original_transaction_id: originalTx, expires_at: iso(now + product.trialDays * DAY),
        will_renew: true, is_trial: true, intent_id: intent.id,
      }).select("id, expires_at").single();
      if (ins.error) throw new HttpError(409, "subscription", ins.error.message);
      result = { ok: true, subscriptionId: ins.data.id, trialEndsAt: ins.data.expires_at, renewsTo: "paid" };
      break;
    }
    case "purchase": {
      const sameTier = subs.find((s) => active(s) && s.tier === product.tier && s.will_renew);
      if (sameTier) {
        result = { ok: false, code: "already_active" };
        break;
      }
      // Yükseltme: mevcut yenilenen Çita+ durur, kalan süre mahsup (mağaza) — çift yenileme yok.
      const replacing = subs.filter((s) => active(s) && s.will_renew);
      const newId = randomUUID();
      for (const s of replacing) {
        await svc.from("subscriptions").update({ will_renew: false, status: "canceled", expires_at: iso(now), replaced_by: null }).eq("id", s.id);
      }
      const ins = await svc.from("subscriptions").insert({
        id: newId, student_id: studentId, payer_id: intent.payer_id, tier: product.tier, status: "active", provider: input.provider,
        product_id: intent.product_id, original_transaction_id: originalTx, expires_at: iso(now + product.periodDays * DAY),
        will_renew: true, intent_id: intent.id,
      }).select("id, expires_at").single();
      if (ins.error) throw new HttpError(409, "subscription", ins.error.message);
      for (const s of replacing) await svc.from("subscriptions").update({ replaced_by: newId }).eq("id", s.id);
      if (product.tier === "bire_bir") {
        await svc.from("coach_assignment_requests").upsert({ student_id: studentId, status: "waiting" }, { onConflict: "student_id", ignoreDuplicates: true });
      }
      await svc.from("purchase_intents").update({ status: "completed" }).eq("id", intent.id);
      result = { ok: true, subscriptionId: ins.data.id, expiresAt: ins.data.expires_at, replaced: replacing.map((s) => s.id) };
      break;
    }
    case "renew": {
      if (!mine) { result = { ok: false, code: "no_subscription" }; break; }
      const base = Math.max(Date.parse(mine.expires_at), now);
      await svc.from("subscriptions").update({ status: "active", is_trial: false, will_renew: true, expires_at: iso(base + product.periodDays * DAY), grace_expires_at: null }).eq("id", mine.id);
      result = { ok: true, expiresAt: iso(base + product.periodDays * DAY) };
      break;
    }
    case "cancel":
      if (!mine) { result = { ok: false, code: "no_subscription" }; break; }
      await svc.from("subscriptions").update({ will_renew: false, status: "canceled" }).eq("id", mine.id);
      result = { ok: true, accessUntil: mine.expires_at };
      break;
    case "billing_issue":
      if (!mine) { result = { ok: false, code: "no_subscription" }; break; }
      await svc.from("subscriptions").update({ status: "grace", grace_expires_at: iso(now + 16 * DAY) }).eq("id", mine.id);
      result = { ok: true, graceUntil: iso(now + 16 * DAY) };
      break;
    case "expire":
      if (!mine) { result = { ok: false, code: "no_subscription" }; break; }
      await svc.from("subscriptions").update({ status: "expired", will_renew: false }).eq("id", mine.id);
      result = { ok: true };
      break;
    case "refund":
      if (!mine) { result = { ok: false, code: "no_subscription" }; break; }
      await svc.from("subscriptions").update({ status: "refunded", will_renew: false }).eq("id", mine.id);
      result = { ok: true };
      break;
  }
  await svc.from("billing_events").update({ result }).eq("id", ev.data.id);
  return result;
}

export function purchaseTerms(product: ProductId, opts: { trial: boolean; upgradeFrom?: string | null }): string[] {
  const p = PRODUCTS[product];
  const terms = [
    opts.trial
      ? `${p.trialDays} gün ücretsiz deneme. Deneme bitmeden iptal etmezsen abonelik otomatik olarak ücretli aylık döneme geçer.`
      : "Aylık abonelik; her dönem sonunda otomatik yenilenir.",
    "Ücret ve yenileme tarihi onaydan önce mağaza (App Store / Google Play) ekranında gösterilir; ödemeyi mağaza alır.",
    "Aboneliği istediğin zaman mağaza hesabının abonelik ayarlarından iptal edebilirsin; erişim dönem sonuna kadar sürer.",
    "İade talepleri mağazanın iade süreciyle yapılır. Ücretsiz Çita özellikleri her durumda açık kalır.",
  ];
  if (opts.upgradeFrom) terms.unshift(`${opts.upgradeFrom} aboneliğin durdurulur; kalan süre yeni pakete orantılı mahsup edilir. İki abonelik aynı anda yenilenmez.`);
  if (p.tier === "bire_bir") terms.push("Koçun satın alma sonrası ekip tarafından atanır; haftada bir canlı görüşme yapılır.");
  return terms;
}
