/**
 * TEST MAĞAZASI — yalnızca CITA_BILLING_PROVIDER=test iken çalışır.
 * Gerçek mağaza bildirimlerinin üreteceği olayları taklit eder ve AYNI
 * processBillingEvent yolundan geçirir. Gerçek para hareketi yoktur.
 * Olaylar yalnızca niyetin ödeyeni (öğrenci ya da veli) tarafından tetiklenebilir.
 */
import { billingProvider, processBillingEvent, type BillingAction } from "@/lib/cita/billing";
import { errorResponse, HttpError, json, readJson, requireUser } from "@/lib/cita/server";

const ACTIONS: BillingAction[] = ["start_trial", "purchase", "renew", "cancel", "billing_issue", "expire", "refund"];

export async function POST(req: Request) {
  try {
    if (billingProvider() !== "test") throw new HttpError(404, "not_found", "Test mağazası kapalı.");
    const { db } = await requireUser(req);
    const b = await readJson<{ intentId?: string; action?: string; eventId?: string }>(req);
    if (!ACTIONS.includes(b.action as BillingAction)) throw new HttpError(400, "action", "Geçersiz işlem.");
    if (!b.eventId || !/^[A-Za-z0-9_-]{8,100}$/.test(b.eventId)) throw new HttpError(400, "event_id", "eventId gerekli.");
    // RLS: niyeti yalnızca ödeyen/öğrenci görebilir.
    const { data: intent } = await db.from("purchase_intents").select("id").eq("id", b.intentId ?? "").maybeSingle();
    if (!intent) throw new HttpError(404, "intent_not_found", "Satın alma niyeti bulunamadı.");
    const result = await processBillingEvent({ provider: "test", eventId: b.eventId, intentId: intent.id, action: b.action as BillingAction });
    return json({ result, provider: "test" });
  } catch (e) {
    return errorResponse(e);
  }
}
