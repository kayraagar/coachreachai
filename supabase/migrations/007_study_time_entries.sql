-- ============================================================================
-- MIGRATION 007 — Sorulardan bağımsız çalışma süresi
-- ============================================================================
-- Öğrenci, soru girmek zorunda kalmadan yalnızca "bugün şu kadar çalıştım"
-- diyebilsin. Panelindeki "Günlük çalışma süresi" grafiği bu kayıtlardan
-- (ve eski soru girişlerindeki sürelerden) beslenir.
--
-- YALNIZCA EKLEME YAPAR:
--   * Yeni bir tablo ve onun RLS politikaları oluşturulur.
--   * Mevcut hiçbir tablo, satır, kolon, kısıt veya politika değişmez/silinmez.
--
-- İzinler daily_logs ile aynı desen: öğrenci kendi kaydını yönetir, koç okur.
--
-- Idempotenttir, tekrar tekrar çalıştırılabilir.
-- ============================================================================

create table if not exists public.study_time_entries (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  entry_date  date not null default current_date,
  minutes     int not null check (minutes > 0 and minutes <= 1440),
  subject_id  uuid references public.subjects(id),
  note        text not null default '' check (char_length(note) <= 200),
  created_at  timestamptz not null default now()
);

create index if not exists idx_study_time_entries_student_date
  on public.study_time_entries(student_id, entry_date);

alter table public.study_time_entries enable row level security;

drop policy if exists "study_time_entries_student_all" on public.study_time_entries;
create policy "study_time_entries_student_all"
  on public.study_time_entries for all
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists "study_time_entries_coach_select" on public.study_time_entries;
create policy "study_time_entries_coach_select"
  on public.study_time_entries for select
  using (public.is_coach_of(student_id));
