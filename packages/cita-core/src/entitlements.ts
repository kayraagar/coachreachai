/**
 * Paketler, özellik erişimi ve abonelik durum makinesi.
 *
 * Erişim kararı daima SUNUCUDA verilir (bkz. supabase/migrations/008 →
 * cita_effective_tier). Bu modül aynı kuralın istemci/sunucu ortak tanımıdır;
 * istemci yalnızca gösterim için kullanır.
 */

export type Tier = "free" | "plus" | "bire_bir";
export const TIER_RANK: Record<Tier, number> = { free: 0, plus: 1, bire_bir: 2 };
export const TIER_LABEL: Record<Tier, string> = { free: "Çita Ücretsiz", plus: "Çita+", bire_bir: "Çita Bire Bir" };

export type Feature =
  | "chat"
  | "plan"
  | "progress"
  | "resources"
  | "photo"
  | "notebook"
  | "error_analysis"
  | "review"
  | "data_plan_suggestions"
  | "coach"
  | "weekly_meetings";

const FEATURES: Record<Tier, Feature[]> = {
  free: ["chat", "plan", "progress", "resources", "photo"],
  plus: ["chat", "plan", "progress", "resources", "photo", "notebook", "error_analysis", "review", "data_plan_suggestions"],
  bire_bir: [
    "chat", "plan", "progress", "resources", "photo", "notebook", "error_analysis", "review", "data_plan_suggestions",
    "coach", "weekly_meetings",
  ],
};

export const DEFAULT_PHOTO_LIMITS: Record<Tier, number> = { free: 3, plus: 15, bire_bir: 15 };

export function hasFeature(tier: Tier, feature: Feature): boolean {
  return FEATURES[tier].includes(feature);
}

export type SubStatus = "trialing" | "active" | "grace" | "billing_retry" | "canceled" | "expired" | "refunded" | "revoked";

export type Subscription = {
  tier: Exclude<Tier, "free">;
  status: SubStatus;
  /** Bu dönemin bitişi (ISO zaman). */
  expiresAt: string;
  willRenew: boolean;
  /** Grace period bitişi (mağaza ödeme sorunu yaşanırken erişim sürer). */
  graceExpiresAt?: string | null;
};

/** Erişim veren durumlar: deneme, aktif, ödeme ek süresi, iptal edilmiş ama dönemi bitmemiş. */
export function grantsAccess(s: Subscription, now: Date): boolean {
  const t = now.getTime();
  switch (s.status) {
    case "trialing":
    case "active":
    case "canceled":
      return new Date(s.expiresAt).getTime() > t;
    case "grace":
      return new Date(s.graceExpiresAt ?? s.expiresAt).getTime() > t;
    default:
      return false;
  }
}

export function effectiveTier(subs: Subscription[], now: Date): Tier {
  let tier: Tier = "free";
  for (const s of subs) if (grantsAccess(s, now) && TIER_RANK[s.tier] > TIER_RANK[tier]) tier = s.tier;
  return tier;
}

/** Aynı anda en fazla bir otomatik yenilenen abonelik olabilir. */
export function renewingCount(subs: Subscription[], now: Date): number {
  return subs.filter((s) => s.willRenew && grantsAccess(s, now)).length;
}

export const TRIAL_DAYS = 14;

export function trialEligible(input: { trialUsed: boolean; subs: Subscription[]; now: Date }): boolean {
  if (input.trialUsed) return false;
  return effectiveTier(input.subs, input.now) === "free";
}

export type UpgradePlan =
  | { kind: "not_needed"; message: string }
  | { kind: "new_purchase"; target: Tier; message: string }
  | { kind: "store_upgrade"; from: Tier; target: Tier; message: string; terms: string[] };

/**
 * Çita+ → Bire Bir geçişi. İki ürün mağazada AYNI abonelik grubunda
 * (Apple) / aynı abonelikte farklı temel planlar olarak (Google, replacement
 * mode = CHARGE_PRORATED_PRICE) tanımlanır: mağaza Çita+ yenilemesini durdurur,
 * kalan süreyi orantılı mahsup eder. Böylece iki yenileme aynı anda sürmez.
 */
export function planUpgrade(subs: Subscription[], target: Tier, now: Date): UpgradePlan {
  const current = effectiveTier(subs, now);
  if (TIER_RANK[current] >= TIER_RANK[target]) return { kind: "not_needed", message: `${TIER_LABEL[current]} zaten aktif.` };
  if (current === "free") return { kind: "new_purchase", target, message: `${TIER_LABEL[target]} satın alma.` };
  return {
    kind: "store_upgrade",
    from: current,
    target,
    message: `${TIER_LABEL[current]} aboneliğin ${TIER_LABEL[target]} ile değiştirilecek.`,
    terms: [
      `${TIER_LABEL[current]} otomatik yenilemesi durur; iki abonelik aynı anda yenilenmez.`,
      "Mevcut dönemden kalan tutar mağaza tarafından yeni pakete orantılı olarak mahsup edilir.",
      `${TIER_LABEL[target]} ücreti ve yenileme tarihi onaydan önce mağaza ekranında gösterilir.`,
      "Koçun, satın alma sonrası ekip tarafından atanır; atama tamamlanana kadar Çita+ özelliklerin açıktır.",
    ],
  };
}

/** Mağaza/test sağlayıcısı olaylarından abonelik durumu üretir (idempotent). */
export type BillingEvent =
  | { type: "trial_started"; tier: "plus"; at: string; days: number }
  | { type: "purchased"; tier: "plus" | "bire_bir"; at: string; periodDays: number }
  | { type: "renewed"; at: string; periodDays: number }
  | { type: "cancel_auto_renew"; at: string }
  | { type: "billing_issue"; at: string; graceDays: number }
  | { type: "expired"; at: string }
  | { type: "refunded"; at: string };

function plusDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}

export function applyBillingEvent(s: Subscription | null, e: BillingEvent): Subscription | null {
  switch (e.type) {
    case "trial_started":
      return { tier: "plus", status: "trialing", expiresAt: plusDays(e.at, e.days), willRenew: true };
    case "purchased":
      return { tier: e.tier, status: "active", expiresAt: plusDays(e.at, e.periodDays), willRenew: true };
    case "renewed":
      if (!s) return null;
      return { ...s, status: "active", expiresAt: plusDays(s.expiresAt > e.at ? s.expiresAt : e.at, e.periodDays), willRenew: true, graceExpiresAt: null };
    case "cancel_auto_renew":
      return s ? { ...s, status: "canceled", willRenew: false } : null;
    case "billing_issue":
      return s ? { ...s, status: "grace", graceExpiresAt: plusDays(e.at, e.graceDays) } : null;
    case "expired":
      return s ? { ...s, status: "expired", willRenew: false } : null;
    case "refunded":
      return s ? { ...s, status: "refunded", willRenew: false } : null;
  }
}
