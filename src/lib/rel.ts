/**
 * Supabase, gömülü ilişkileri tip düzeyinde her zaman dizi olarak çıkarır;
 * çoktan-teke ilişkilerde çalışma anında tekil nesne döner. Bu yardımcı,
 * iki durumu da tek bir nesneye indirger.
 */
export function rel<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}
