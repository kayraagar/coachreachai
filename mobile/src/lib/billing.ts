/**
 * Satın alma akışı. Sunucu önce bir niyet (intent) oluşturur ve onaydan ÖNCE
 * gösterilecek koşulları döner. TEST sağlayıcısında mağaza olayı test
 * uç noktasıyla taklit edilir (gerçek ödeme yok, ekranda "TEST" yazar).
 * Gerçek mağaza: niyet kimliği appAccountToken / obfuscatedAccountId olarak
 * StoreKit / Play Billing'e verilir (bkz. docs/CITA-STORE-RUNBOOK.md).
 */
import { Linking, Platform } from "react-native";
import { randomUUID } from "expo-crypto";
import { api } from "./api";

export type ProductId = "cita_plus_monthly" | "cita_birebir_monthly";
export type Intent = {
  intentId: string;
  provider: "test" | "store";
  product: ProductId;
  displayPrice: string | null;
  terms: string[];
  manageUrl: { ios: string; android: string };
};
export type BillingStatus = {
  tier: "free" | "plus" | "bire_bir";
  subscriptions: { id: string; tier: string; status: string; expires_at: string; will_renew: boolean; is_trial: boolean; provider: string }[];
  trialEligible: boolean;
  coachRequest: { status: string; assigned_at: string | null } | null;
  provider: "test" | "store";
};

export const billingStatus = (studentId?: string) =>
  api<BillingStatus>(`/api/cita/billing${studentId ? `?studentId=${encodeURIComponent(studentId)}` : ""}`);

export const createIntent = (product: ProductId, opts: { trial?: boolean; studentId?: string } = {}) =>
  api<Intent>("/api/cita/billing", { body: { product, trial: Boolean(opts.trial), studentId: opts.studentId, platform: Platform.OS } });

export class StoreNotConfigured extends Error {}

/** Onaydan sonra satın alma. Test sağlayıcısında olay idempotent bir eventId ile işlenir. */
export async function confirmPurchase(intent: Intent, trial: boolean) {
  if (intent.provider !== "test") {
    throw new StoreNotConfigured("Mağaza satın alması bu sürümde etkin değil (store hesapları bekleniyor).");
  }
  const eventId = `evt-${randomUUID()}`;
  return api<{ result: { ok: boolean; code?: string } }>("/api/cita/billing/test", {
    body: { intentId: intent.intentId, action: trial ? "start_trial" : "purchase", eventId },
  });
}

export function openManageSubscriptions(intent?: Pick<Intent, "manageUrl"> | null) {
  const url = intent?.manageUrl[Platform.OS === "ios" ? "ios" : "android"] ??
    (Platform.OS === "ios" ? "https://apps.apple.com/account/subscriptions" : "https://play.google.com/store/account/subscriptions");
  return Linking.openURL(url);
}
