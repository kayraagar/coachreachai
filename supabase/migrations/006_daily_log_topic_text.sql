-- ============================================================================
-- MIGRATION 006 — Soru girişinde elle yazılan konu
-- ============================================================================
-- Öğrenci, soru girişinde konuyu listeden seçmek yerine serbest metin olarak
-- yazabilsin. Bunun için daily_logs'a boş bırakılabilir tek bir kolon eklenir.
--
-- YALNIZCA EKLEME YAPAR:
--   * Mevcut hiçbir satır, kolon, kısıt veya politika değişmez/silinmez.
--   * Eski kayıtlarda yeni kolon NULL kalır; topic_id ile seçilmiş konular
--     olduğu gibi durur ve göstermeye devam eder.
--   * Satırlar zaten mevcut RLS politikalarıyla korunuyor; yeni kolon onlara
--     tabidir, ek politika gerekmez.
--
-- Çalışma süresi için şema değişikliği gerekmez: saat girişi mevcut
-- duration_minutes kolonuna dakikaya çevrilerek yazılır.
--
-- Idempotenttir, tekrar tekrar çalıştırılabilir.
-- ============================================================================

alter table public.daily_logs
  add column if not exists topic_text text
    check (topic_text is null or char_length(topic_text) <= 120);
