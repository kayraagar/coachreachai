# YKS Koçluk

Öğrenci ve koç için canlı çalışma takibi, deneme net analizi ve **Haftalık Görüşme
Ajandası** yönetimi. Next.js 16 (App Router) + Supabase (Postgres, Auth, Realtime).

## Öne çıkan yetenekler

- **Haftalık Görüşme Ajandası** — basılı formun 8 maddesinin birebir dijital karşılığı.
  Koç doldurur, sayısal alanlar geçen haftanın verisinden otomatik dolar; paylaşınca
  öğrenci görür ve aksiyon maddelerini işaretler.
- **Canlı çalışma kronometresi** — öğrenci "başlat" dediği anda koçun panelinde
  "şu an çalışıyor" rozeti belirir; bitişte süre ve doğru/yanlış/boş tek kayıtta işlenir.
- **Realtime senkronizasyon** — bir cihazda girilen kayıt, diğer cihazda ve koçun
  ekranında sayfa yenilemeden görünür (Supabase `postgres_changes`, RLS'e tabi).
- **Presence** — koç ve öğrencileri ortak bir kanalda; kimin panelde açık olduğu canlı.
- **PWA** — telefona kurulabilir, standalone açılır, çevrimdışı yedek sayfası var.
- Açık/koyu tema, mobil alt sekme çubuğu, `prefers-reduced-motion` desteği.

## Kurulum

```bash
npm install
cp .env.example .env.local   # Supabase bilgilerini gir
npm run dev
```

### Veritabanı

**Sıfırdan kurulum:** `supabase/schema.sql` dosyasının tamamını Supabase SQL
Editor'de çalıştır. Dosya idempotenttir (politikalar `drop policy if exists` ile
yeniden oluşturulur), istediğin kadar tekrar çalıştırabilirsin.

**Mevcut bir veritabanını güncelleme:** temel şema zaten kuruluysa yalnızca
`supabase/migrations/001_weekly_sessions_and_realtime.sql` dosyasını çalıştır.
Görüşme ajandası, rutinler, canlı çalışma oturumu ve realtime yayını bu dosyada.

Realtime'ın çalışması için Supabase Dashboard > Database > Replication bölümünde
`supabase_realtime` yayınının etkin olması gerekir (SQL dosyası tabloları bu
yayına kendisi ekler).

### Roller

- Koç kayıt olurken "Koçum" seçer. Koç kodu = koçun e-posta adresi.
- Öğrenci kayıt olurken koçunun e-postasını girer; `profiles.coach_id` böylece bağlanır.

## Canlıya alma (Vercel)

```bash
npm i -g vercel
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add NEXT_PUBLIC_SITE_URL production
vercel --prod
```

Dağıtım sonrası Supabase Dashboard > Authentication > URL Configuration altında
**Site URL** ve **Redirect URLs** alanlarına canlı adresi ekle.

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Üretim derlemesi |
| `npm start` | Üretim sunucusu |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript kontrolü |

## Mimari notlar

- `src/lib/queries.ts` — okuma sorguları (sunucu tarafı, `date-fns` ile hafta hesapları).
- `src/lib/actions/*` — Server Action'lar; her yazma sonrası `revalidatePath`.
- `src/components/realtime/*` — realtime abonelik, presence ve kronometre.
- `src/components/session/*` — görüşme ajandası formu ve okuma görünümü.
- Güvenlik tamamen **RLS** ile sağlanır: öğrenci yalnızca kendi satırlarını,
  koç yalnızca `coach_id` kendisine eşit öğrencilerin satırlarını görür.
