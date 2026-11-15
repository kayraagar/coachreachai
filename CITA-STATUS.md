# Çita — Uygulama Durumu (devam dosyası)

Son güncelleme: 2026-11-15 · Dal: `cita/mvp` · **Çalışma kopyası: `/Users/kayra/Developer/cita`**

## ÖNEMLİ: çalışma kopyası taşındı
İlk kopya `/Users/kayra/Documents/Codex/2026-11-12/new-chat-2/work/cita` iCloud Documents içindeydi.
Disk dolu olduğu için iCloud dosyaları sürekli bulut-yalnız (dataless) yaptı, sonra indirmeyi tamamen durdurdu
(`.git` dahil); `git`, `tsc`, `psql` dakikalarca asılı kaldı. Kullanıcı onayıyla (2026-11-15) iş
`/Users/kayra/Developer/cita`'ya taşındı:
- Orijinal projeden (`/Users/kayra/Downloads/yks-kocluk`, aynı `0fb77bb`) klonlandı, `origin` GitHub adresine ayarlandı, dal `cita/mvp`.
- Yerel okunabilen dosyalar kopyalandı; iCloud'da kalan Çita dosyaları bu oturumdaki birebir içerikten yeniden yazıldı ve
  aşağıdaki testlerle yeniden doğrulandı. **iCloud kopyasına dokunulmadı**; oradaki eski `e20466d` commit'i bu dalda yok
  (içeriği `513ebf3`'e dahil). İki kopya arasında fark arıyorsan bu dalı esas al.
- `node_modules` artık normal klasör (iCloud dışı, `.nosync` hilesi gerekmiyor).

## Commit'ler (`cita/mvp`, push yok)
| Commit | İçerik |
|---|---|
| `513ebf3` | `packages/cita-core`, migration 008–011, `supabase/tests` |
| `5bd437e` | Web: `/api/cita/*`, AI sağlayıcıları, ödeme olay işleyici, `/admin`, `/koc/onaylar`, `scripts/e2e-cita.mjs` |
| `ad8dfc2` | Mobil Expo uygulaması (tüm ekranlar, maskot, simge) |
| `34ad9d8` | Mobil README + `.env.example` |
| `40e4868` | Dokümanlar: bu dosya, `CITA-PRODUCT.md`, `docs/CITA-STORE-RUNBOOK.md`, kök README notu |
| `ee2adc4` | Migration 012 (hesap silme), silme testi, e2e temizlik kontrolü, `supabase/dev-setup.sql`, `supabase/fix-after-schema-rerun.sql` |

## Gerçek Supabase (dev) ile uçtan uca — 2026-11-16
- Dev projesi: `xdiuhwvwjsgiaiiuexae` ("cita db"), `supabase/dev-setup.sql` ile kuruldu, sonra 012 uygulandı.
  Anahtarlar `.env.local` / `mobile/.env` (git'e girmez), yeni biçim `sb_publishable` / `sb_secret` anahtarlar sorunsuz çalıştı.
- `node scripts/e2e-cita.mjs` (Next dev sunucusu + gerçek Supabase Auth/PostgREST/Storage, test sağlayıcıları):
  **29/29 geçti + 6/6 test kullanıcısı silindi.**
- İlk koşu bir hata buldu: Çita'nın denetim bağlantıları (ödeyen veli, onaylayan koç, atayan yönetici) ve plan revizyon
  tetikleyicisi hesap silmeyi engelliyordu → migration 012 ile düzeltildi; yerel `012_account_deletion.test.sql` 12/12.
- Canlı CoachReachAI projesine Çita migration'ı UYGULANMADI. Kullanıcı `schema.sql`'i yanlışlıkla canlıda çalıştırdı:
  veri silinmez ama `handle_new_user` eski sürüme döner (yeni koçlara davet kodu yok, koç kodu/LGS eşleşmesi yok) →
  `supabase/fix-after-schema-rerun.sql` hazırlandı ve kopya veritabanında doğrulandı; canlıda çalıştırması kullanıcıya bırakıldı.

## Aşamalar
| # | Aşama | Durum |
|---|---|---|
| 1 | Altyapı: Expo uygulaması, web↔mobil bağlantısı (Bearer API), hesap akışları, migration'lar, yerel test düzeni | YAPILDI · yerelde doğrulandı |
| 2 | Ücretsiz öğrenci akışı: tanışma, 7 günlük önizleme + düzenleme, kaydet/başla, sohbet, öneri onayı, deneme, süre, hedef/seri/rozet | YAPILDI · DB+çekirdek doğrulandı, HTTP/ekran uçtan uca koşulmadı |
| 3 | AI ve Çita+: katalog→web arama, foto ipucu/tam çözüm, günlük limit, defter, tekrar, analiz örneği | YAPILDI · kota/RLS doğrulandı; gerçek Claude çağrısı koşulmadı (anahtar yok) |
| 4 | Koç ve veli: satın alma/paket, koç atama + onay kuyruğu, görüşmeler, veli bağlantısı ve özeti | YAPILDI · DB doğrulandı; gerçek mağaza entegrasyonu bilerek açık (501) |
| 5 | Doğrulama + runbook | KISMEN · gerçek Supabase'e karşı HTTP uçtan uca 29/29 geçti; native derleme, canlı Claude ve mağaza açık |

## Çalıştırılan komutlar ve sonuçlar (2026-11-15, `/Users/kayra/Developer/cita`)
| Komut | Sonuç |
|---|---|
| `npm run test:core` | 13/13 geçti (sınav kuralları/net, plan üretici + Türkçe düzenleme, seri, rozet, paket durum makinesi, öneri ops, yanlış örüntüsü, tekrar) |
| `npm run test:db` | şema + 001–012 kuruldu ve ikinci kez sorunsuz çalıştı; 008: 52, 009: 27, 010: 27, 011: 11, 012: 12 doğrulama PASS |
| `supabase/tests/009_quota.concurrency.sh` | 18 eşzamanlı istek → tam 3 hak; aynı anahtarla 8 eşzamanlı istek → 1 reserved + 7 existing, 1 hak, 1 satır |
| `tsc --noEmit` (web, `next typegen` sonrası) | temiz |
| `eslint src` | temiz |
| `next build` (yer tutucu Supabase env ile) | başarılı; mevcut tüm CoachReachAI rotaları + yeni rotalar derlendi |
| `cd mobile && tsc --noEmit` | temiz |
| `cd mobile && npx expo install --check` | "Dependencies are up to date" (SDK 58) |
| `npx expo export --platform ios` / `android` | ikisi de Hermes paketi üretti (~3.5 MB); `@cita/core` pakete dahil |

### DB testlerinin kapsadığı kabul kuralları
Eski koç kodu eşleşmesi korunur; B2C kayıtta koç kodu gerekmez; rol/yönetici/sınav yükseltmesi engelli; onboarding aktarımı
idempotent ve tek plan; ücretsiz onay atomik, eski sürüme dayanan öneri hiçbir şey yazmaz ("stale"); Bire Bir onayı koç
kuyruğuna gider, eski plan korunur, başka koç göremez/karar veremez, koç düzenleyip uygular, öğrenci uygulanan hâli görür;
kronometre durdurma tekrarı çift süre yazmaz; sohbet/foto/ham plan veli ve koça kapalı (defter yalnız bağlı koça açık);
foto kotası 3/15, aynı anahtar ikinci hak düşürmez, okunamayan foto bir kez iade, İstanbul günü; süresi dolan Çita+ defter
yazamaz; katalog yalnız yönetici; özel depolama yalnız sahibi; veli kodu yalnız LGS, tek kullanımlık, kaba kuvvet sınırı,
özet yalnız toplamlar, bağlantı kaldırılınca erişim biter; satın alma yalnız öğrenci ya da bağlı veli adına; aynı öğrencide
iki yenilenen abonelik engellenir; koç atama yalnız yönetici; atanan koç mevcut panelde öğrenciyi görür; deneme kaydı
idempotent + atomik, YKS /4 ve LGS /3 net, yanlış ders/toplam reddedilir.

## Doğrulanmayanlar (dürüst liste)
1. **iOS/Android native derleme ve simülatör/cihaz testi yok:** Xcode yok (yalnızca CommandLineTools), JDK 17 yok (Java 8).
   Yalnızca Metro/Hermes JS paketleri doğrulandı.
2. ~~HTTP uçtan uca koşulmadı~~ → **2026-11-16'da gerçek dev Supabase'e karşı koşuldu: 29/29 + temizlik geçti.**
   Mobil uygulamanın EKRANLARI ise henüz telefonda (Expo Go) elle denenmedi.
3. **Gerçek Claude çağrısı yok:** `ANTHROPIC_API_KEY` verilmedi; tüm AI akışları test sağlayıcısıyla tasarlandı. Claude
   adaptörü typecheck'ten geçti (SDK 1.8.0, `beta.messages.parse` + `fallbacks: "default"`), ama canlı yanıt kalitesi ölçülmedi.
4. **Gerçek mağaza satın alması yok:** native IAP modülü ve App Store/Play bildirim doğrulaması bilerek yazılmadı (501).
   Test mağazası olay işleyicisi gerçek bildirimlerle aynı yoldan geçer. Bkz. runbook.
5. Mobil ESLint (`expo lint`) kurulmadı/koşulmadı.
6. Bire Bir paketinin mağaza sınıflandırması (dijital + canlı hizmet) App Review / Play'e sorulmalı (runbook §1).

## Senin nasıl test edeceğin
```bash
cd /Users/kayra/Developer/cita
npm run test:core && npm run test:db          # yerel, hiçbir dış servise dokunmaz
npx tsc --noEmit && npx eslint src && npx next build
cd mobile && npx tsc --noEmit && npm run export:ios && npm run export:android
```
Uygulamayı denemek için bir Supabase **geliştirme** projesine 008–011'i uygula, `.env.local` (kök) ve `mobile/.env` doldur
(`CITA_AI_PROVIDER` ve `CITA_BILLING_PROVIDER` boş/test kalsın), `npm run dev` + `cd mobile && npx expo start` (Expo Go).
Uçtan uca senaryo: `CITA_E2E_SUPABASE_URL=… CITA_E2E_ANON_KEY=… CITA_E2E_SERVICE_KEY=… CITA_E2E_API=http://localhost:3000 node scripts/e2e-cita.mjs`
(test kullanıcıları oluşturur ve sonunda siler; canlı projede koşma).

## Sıradaki somut adımlar
1. Xcode + JDK 17 kur → `npx expo run:ios` / `run:android`, simülatörde tanışma → kayıt → sohbet → foto akışlarını dene.
2. Supabase geliştirme projesinde `scripts/e2e-cita.mjs`'i koş; çıkan hataları düzelt.
3. `CITA_AI_PROVIDER=anthropic` ile birkaç gerçek sohbet/foto/tekrar akışını gözden geçir (TEST etiketi kaybolmalı).
4. Mağaza hesapları açılınca runbook §2–3: ürünler, native IAP, bildirim doğrulama, sandbox testleri.
5. KVKK/aydınlatma metinleri ve 18 yaş altı/veli rızası akışı için hukuk onayı.
