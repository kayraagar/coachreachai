# Çita mobil (iOS + Android, Expo SDK 58)

Öğrenci ve veli uygulaması. Koçlar ve ekip mevcut Next.js web panelini kullanır
(`/koc`, `/koc/onaylar`, `/admin`).

## Kurulum

```bash
cd mobile
cp .env.example .env      # Supabase URL/anon anahtarı ve Next API adresi
npm install
npx expo start            # Expo Go / geliştirme derlemesi
```

> Bu klasör iCloud Documents içindeyse: `npm install` sonrası
> `mv node_modules node_modules.nosync && ln -s node_modules.nosync node_modules`
> (iCloud'un binlerce dosyayı eşitlemesini önler; `tsconfig` `preserveSymlinks` kullanır).

## Komutlar

| Komut | Açıklama |
|---|---|
| `npx tsc --noEmit` | Tip kontrolü |
| `npm run export:ios` / `npm run export:android` | Metro ile üretim JS paketini derler (native derleme değildir) |
| `npx expo run:ios` | Xcode gerekir |
| `npx expo run:android` | Android SDK + JDK 17 gerekir |

## Akışlar

- **Hesapsız tanışma** (`/tanisma`) → **7 günlük önizleme** (`/onizleme`, «Cumartesi çalışamam» gibi düzenlemeler)
  → **Programı Kaydet ve Başla** (`/kayit`, koç kodu isteğe bağlı) ya da mevcut hesapla **Giriş** → taslak
  tek `requestId` ile hesaba aktarılır (tekrar deneme çift kayıt üretmez).
- Sekmeler: **Koç** (sohbet, öneri kartları, fotoğraftan soru + kalan hak), **Program** (ajanda, kronometre),
  **Gelişim** (deneme, net trendi, hedef, seri, rozet, Çita+ defter/tekrar), **Bire Bir** (paket, koç ataması,
  görüşmeler, LGS veli kodu).
- **Veli**: `/veli-kayit` ile ayrı hesap, `/veli` ile kodla bağlanma, haftalık özet ve öğrenci adına satın alma.

## Test sağlayıcıları

Sunucu `CITA_AI_PROVIDER` ve `CITA_BILLING_PROVIDER` tanımlı değilse **test** sağlayıcıları çalışır;
uygulamada mor «TEST SAĞLAYICI» / «TEST MAĞAZASI — GERÇEK ÖDEME YOK» etiketiyle görünür.
Gerçek mağaza entegrasyonu için `../docs/CITA-STORE-RUNBOOK.md`.
