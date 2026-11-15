# Çita — Mağaza yayını ve dış gereksinimler (runbook)

Bu belge, yerelde doğrulanan kodun gerçek ortama ve App Store / Google Play'e
çıkması için **senin (insan) yapman gereken** adımları listeler. Yerel testlerin
geçmesi mağaza testinin geçtiği anlamına gelmez.

## 1. Ödeme modeli kararı (resmî kaynaklardan, 2026-11-15'te okundu)

| Kural | Kaynak | Çita'ya etkisi |
|---|---|---|
| Uygulama içi özellik/abonelik kilidi açmak için In-App Purchase zorunlu (3.1.1) | [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) | Çita+ (AI defter, analiz, tekrar, 15 foto) **IAP** olmalı |
| Gerçek zamanlı **bire bir** insan hizmeti (ör. özel ders) IAP dışı yöntemle ödenebilir; bire-çok IAP zorunlu (3.1.3(d)) | aynı | Yalnızca canlı koçluk IAP dışı olabilirdi |
| Yükseltme/düşürme sorunsuz olmalı; kullanıcı aynı şeyin birden çok varyasyonuna yanlışlıkla abone olmamalı (3.1.2(b)) | aynı | Çita+ ve Bire Bir **aynı abonelik grubunda** |
| Deneme süresi App Store Connect'te tanımlanır; abonelikten önce ne alınacağı açıkça anlatılır (3.1.2(a),(c)) | aynı | `purchaseTerms` + mağaza ekranı |
| Play'de uygulama içi dijital içerik/abonelik Google Play Billing ile; istisnalar fiziksel mal/hizmet, P2P, bağış… Canlı online özel ders açıkça istisna sayılmıyor | [Play Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738) | Bire Bir Android'de **Play Billing** |

**Belirsizlik:** Hiçbir kural, dijital AI erişimi + canlı bire bir koçluğu
**birlikte** satan paketi açıkça düzenlemiyor. Bire Bir, Çita+'yı (dijital)
içerdiği için en güvenli yol: **her iki mağazada da Bire Bir'i IAP / Play Billing
aboneliği olarak satmak.** Yayından önce App Review'a ve Play Console desteğine
paket tanımını yazılı sor. Koçluğu ayrı ve IAP dışı satmak istersen ürünü ikiye
bölmek gerekir (dijital kısım IAP, canlı kısım ayrı) — bu kod şu an tek paket varsayar.

## 2. Mağaza ürünleri

| Ürün kimliği | Apple | Google |
|---|---|---|
| `cita_plus_monthly` | Otomatik yenilenen, 1 ay, **14 gün ücretsiz tanıtım teklifi**, grup "Çita" seviye 2 | Abonelik `cita` → temel plan `plus-monthly` + 14 gün ücretsiz teklif |
| `cita_birebir_monthly` | Aynı grup "Çita", seviye 1 (üst) → yükseltme anında, orantılı iade Apple'da | Abonelik `cita` → temel plan `birebir-monthly`; yükseltmede `replacementMode = CHARGE_PRORATED_PRICE` |

Fiyatları mağaza belirler ve onaydan önce mağaza ekranı gösterir. Koddaki
`TEST_PRICES` yalnızca test mağazası içindir.

## 3. Gerçek satın alma entegrasyonu (kodda bilerek açık bırakılanlar)

- Mobil: StoreKit 2 / Play Billing kütüphanesi (ör. `react-native-iap`) native modül
  ister → Expo **development build** (`expo prebuild` / EAS) gerekir.
  `mobile/src/lib/billing.ts` → `confirmPurchase` içindeki `StoreNotConfigured`
  dalı: niyet kimliğini (`intentId`) **appAccountToken** (iOS) /
  **obfuscatedAccountId** (Android) olarak geç.
- Sunucu: `src/app/api/cita/billing/store/[platform]/route.ts` şu an **501**.
  Yapılacak: Apple App Store Server Notifications v2 JWS imza zinciri doğrulaması,
  Google RTDN (Pub/Sub push, OIDC belirteci) + Play Developer API ile abonelik
  doğrulaması → `processBillingEvent({ provider, eventId, intentId, action })`.
  Doğrulanmamış bildirimle erişim verilmez.
- "Satın alımı geri yükle": iOS `AppStore.sync()` / Android `queryPurchasesAsync`
  → sunucuda doğrulayıp aynı olay yolundan işle.
- Mağazada test: Apple Sandbox test kullanıcıları (hızlandırılmış yenileme),
  Play lisans test kullanıcıları ve iç test kanalı. **Bunlar yapılmadı** (hesap yok).

## 4. Ortam değişkenleri (Vercel / sunucu)

| Değişken | Not |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | mevcut |
| `SUPABASE_SERVICE_ROLE_KEY` | **yalnızca sunucu**; foto yükleme, AI cevabı yazma, abonelik olayları |
| `CITA_AI_PROVIDER` | `anthropic` (gerçek, `claude-opus-5-5`) / boş → test sağlayıcısı (TEST etiketli) |
| `ANTHROPIC_API_KEY` | yalnızca sunucu |
| `CITA_BILLING_PROVIDER` | `test` (varsayılan) / `store` |

Mobil (`mobile/.env`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`.

## 5. Veritabanı (canlıya sen uygularsın)

Sırayla: `supabase/migrations/008_cita_foundation.sql`, `009_cita_ai.sql`,
`010_cita_parent_billing_admin.sql`, `011_cita_exams.sql` (hepsi idempotent).
Ardından en az bir ekip üyesini yönetici yap:
`update public.profiles set is_admin = true where email = '...';`
Storage: `question-photos` bucket'ı migration oluşturur (özel). Realtime yayını
yeni tabloları içerir.

## 6. Derleme ve mağaza gönderimi

- iOS: Xcode (bu makinede **yok**), Apple Developer hesabı, `eas build -p ios`
  ya da `npx expo run:ios`; App Privacy formu (kamera, fotoğraf, eğitim verisi,
  çocuk kullanıcı: LGS 13–14 yaş → yaş derecelendirmesi ve ebeveyn rızası metni).
- Android: JDK 17 (bu makinede **yok**, Java 8 var), `eas build -p android` ya da
  `npx expo run:android`; Play Data safety formu; 18 yaş altı kullanıcılar için
  Families politikalarını değerlendir.
- KVKK: aydınlatma metni, açık rıza (fotoğraf/AI işleme), yurt dışına aktarım
  (AI sağlayıcısı) bilgisi, veli bağlantısı için rıza akışı — hukuk onayı gerekli.

## 7. Bilinen açık noktalar

1. Bire Bir paketinin mağaza sınıflandırması (yukarıda) — App Review / Play onayı.
2. Gerçek mağaza bildirim doğrulaması ve native satın alma modülü.
3. iOS/Android native derleme ve cihaz/simülatör testleri (araç zinciri yok).
4. Gerçek Supabase projesinde migration ve RLS'in tekrar koşulması; HTTP uçtan uca
   senaryo (`scripts/e2e-cita.mjs`) yalnızca bir Supabase geliştirme projesiyle koşulabilir.
5. Claude ile canlı AI kalitesi (bu ortamda yalnızca test sağlayıcısı koşuldu).
