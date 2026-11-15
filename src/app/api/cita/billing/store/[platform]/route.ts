/**
 * Gerçek mağaza bildirimleri (App Store Server Notifications v2 / Google Play RTDN).
 *
 * BİLEREK UYGULANMADI: imza doğrulaması (Apple JWS sertifika zinciri, Google
 * Pub/Sub OIDC belirteci) ve ürün kimlikleri mağaza hesapları açılmadan test
 * edilemez. Doğrulanmamış bildirimle erişim vermek güvenlik açığı olacağı için
 * bu uç nokta 501 döner. Bağlantı noktası: doğrulanmış olay →
 * processBillingEvent({ provider, eventId: notificationUUID / messageId,
 * intentId: appAccountToken / obfuscatedAccountId, action }). Bkz. docs/CITA-STORE-RUNBOOK.md.
 */
import { json } from "@/lib/cita/server";

export async function POST() {
  return json({ error: "Mağaza bildirimi doğrulaması henüz yapılandırılmadı.", code: "not_implemented" }, 501);
}
