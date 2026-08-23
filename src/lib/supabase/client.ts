import { createBrowserClient } from "@supabase/ssr";

// Not: Database generic'i kasıtlı olarak kullanılmıyor — elle yazılmış tip
// tanımları (database.types.ts) Supabase'in join/ilişki sorgularıyla birlikte
// aşırı katı bir çıkarım yarattığı için burada domain tiplerini
// (Profile, DailyLog, ...) sorgu sonuçlarına elle uyguluyoruz.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
