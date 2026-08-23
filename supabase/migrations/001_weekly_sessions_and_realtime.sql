-- ============================================================================
-- MIGRATION 001 — Haftalık Görüşme Ajandası, rutinler, canlı oturum, realtime
-- ============================================================================
-- Bu dosya, temel şema (schema.sql'in 0–7. bölümleri) ZATEN kurulmuş bir
-- veritabanının üzerine güvenle çalıştırılabilir.
--
-- Tamamen idempotenttir: her nesne "if not exists" / "drop ... if exists"
-- deseniyle oluşturulur, istediğin kadar tekrar çalıştırabilirsin.
--
-- Kullanım: Supabase Dashboard > SQL Editor > bu dosyanın tamamını yapıştır > Run
-- ============================================================================

-- ============================================================================
-- 8) weekly_sessions — Haftalık Görüşme Ajandası
--    "YKS Koçluk Programı / Haftalık Görüşme Ajandası" formunun birebir
--    veri karşılığı. Koç doldurur, paylaşınca (status='shared') öğrenci görür.
-- ============================================================================
create table if not exists public.weekly_sessions (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references public.profiles(id) on delete cascade,
  coach_id            uuid not null references public.profiles(id),
  week_no             int  not null,
  meeting_date        date not null default current_date,
  duration_minutes    int check (duration_minutes >= 0),

  -- 1) Geçen hafta değerlendirmesi
  total_questions     int,
  total_study_minutes int,
  adherence_pct       int check (adherence_pct between 0 and 100),
  adherence_note      text not null default '',

  -- 2) Net ve performans analizi
  tyt_net             numeric,
  ayt_net             numeric,
  net_note            text not null default '',
  weak_topics         text not null default '',   -- ağırlıklı yanlış yapılan konular
  slow_question_types text not null default '',   -- belirli sürede çözülemeyen soru tipleri

  -- 3) Artı / eksi değerlendirmesi
  positives           text not null default '',
  negatives           text not null default '',

  -- 4) Uzun vadeli planlama
  missing_areas       text not null default '',
  recommendations     text not null default '',
  target_net_range    text not null default '',
  roadmap             text not null default '',

  -- 5) Okul ve çalışma ortamı aksiyonları
  school_action       text not null default '',
  conflict_action     text not null default '',
  environment_action  text not null default '',
  other_action        text not null default '',

  -- 6) Genel rutinler
  sleep_status        text check (sleep_status  in ('good','ok','bad')),
  screen_status       text check (screen_status in ('good','ok','bad')),
  nutrition_status    text check (nutrition_status in ('good','ok','bad')),
  break_status        text check (break_status  in ('good','ok','bad')),
  routines_note       text not null default '',

  -- 7) Sonraki hafta planı
  main_focus          text not null default '',
  planned_exams       text not null default '',

  -- 8) Motivasyon ve genel notlar
  mood                text check (mood in ('great','good','neutral','bad','struggling')),
  coach_feedback      text not null default '',
  open_item           text not null default '',

  status              text not null default 'draft' check (status in ('draft','shared')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (student_id, week_no)
);

create index if not exists idx_weekly_sessions_student on public.weekly_sessions(student_id, meeting_date desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists weekly_sessions_touch on public.weekly_sessions;
create trigger weekly_sessions_touch
  before update on public.weekly_sessions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 9) session_actions — görüşmeden çıkan somut aksiyon maddeleri
--    Öğrenci bunları kendi panelinden "yapıldı" olarak işaretleyebilir.
-- ---------------------------------------------------------------------------
create table if not exists public.session_actions (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.weekly_sessions(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  category    text not null default 'genel'
              check (category in ('genel','okul','ortam','rutin','ders','deneme')),
  done        boolean not null default false,
  done_at     timestamptz,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_session_actions_session on public.session_actions(session_id);
create index if not exists idx_session_actions_student on public.session_actions(student_id, done);

-- ---------------------------------------------------------------------------
-- 10) daily_routines — ajandanın 6. maddesi (uyku / ekran / beslenme / mola)
--     Öğrenci günlük işaretler, koç görüşmede özetini görür.
-- ---------------------------------------------------------------------------
create table if not exists public.daily_routines (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  log_date       date not null default current_date,
  sleep_hours    numeric check (sleep_hours >= 0 and sleep_hours <= 24),
  screen_minutes int check (screen_minutes >= 0),
  nutrition_ok   boolean not null default false,
  breaks_ok      boolean not null default false,
  mood           text check (mood in ('great','good','neutral','bad','struggling')),
  note           text not null default '',
  created_at     timestamptz not null default now(),
  unique (student_id, log_date)
);

create index if not exists idx_daily_routines_student_date on public.daily_routines(student_id, log_date desc);

-- ---------------------------------------------------------------------------
-- RLS — yeni tablolar
-- ---------------------------------------------------------------------------
alter table public.weekly_sessions enable row level security;
alter table public.session_actions enable row level security;
alter table public.daily_routines  enable row level security;

-- weekly_sessions: koç kendi öğrencisinin görüşmesini tam yönetir;
-- öğrenci yalnızca paylaşılmış (shared) görüşmeleri okur.
drop policy if exists "weekly_sessions_coach_all" on public.weekly_sessions;
create policy "weekly_sessions_coach_all"
  on public.weekly_sessions for all
  using (public.is_coach_of(student_id))
  with check (public.is_coach_of(student_id) and coach_id = auth.uid());

drop policy if exists "weekly_sessions_student_select" on public.weekly_sessions;
create policy "weekly_sessions_student_select"
  on public.weekly_sessions for select
  using (student_id = auth.uid() and status = 'shared');

-- session_actions: koç yazar/siler; öğrenci okur ve yalnızca 'done' işaretler
-- (update policy'si satır sahipliğiyle sınırlı).
drop policy if exists "session_actions_coach_all" on public.session_actions;
create policy "session_actions_coach_all"
  on public.session_actions for all
  using (public.is_coach_of(student_id))
  with check (public.is_coach_of(student_id));

drop policy if exists "session_actions_student_select" on public.session_actions;
create policy "session_actions_student_select"
  on public.session_actions for select
  using (student_id = auth.uid());

drop policy if exists "session_actions_student_update" on public.session_actions;
create policy "session_actions_student_update"
  on public.session_actions for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- daily_routines: öğrenci CRUD, koç okur.
drop policy if exists "daily_routines_student_all" on public.daily_routines;
create policy "daily_routines_student_all"
  on public.daily_routines for all
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists "daily_routines_coach_select" on public.daily_routines;
create policy "daily_routines_coach_select"
  on public.daily_routines for select
  using (public.is_coach_of(student_id));

-- ============================================================================
-- 11) study_sessions — canlı çalışma oturumu (kronometre)
--     Öğrenci "başlat" dediğinde satır açılır, "bitir" dediğinde kapanır.
--     Açık satırlar koç panelinde "şu an çalışıyor" olarak canlı görünür.
-- ============================================================================
create table if not exists public.study_sessions (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  subject_id  uuid references public.subjects(id),
  topic_id    uuid references public.topics(id),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  minutes     int check (minutes >= 0),
  note        text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists idx_study_sessions_student on public.study_sessions(student_id, started_at desc);
-- Bir öğrencinin aynı anda yalnızca bir açık oturumu olabilir.
create unique index if not exists uq_study_sessions_open
  on public.study_sessions(student_id) where ended_at is null;

alter table public.study_sessions enable row level security;

drop policy if exists "study_sessions_student_all" on public.study_sessions;
create policy "study_sessions_student_all"
  on public.study_sessions for all
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists "study_sessions_coach_select" on public.study_sessions;
create policy "study_sessions_coach_select"
  on public.study_sessions for select
  using (public.is_coach_of(student_id));

-- ============================================================================
-- 12) REALTIME — tabloları supabase_realtime yayınına ekle
--     postgres_changes olayları RLS'e tabidir: her abone yalnızca kendi
--     görebildiği satırların değişimini alır.
-- ============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'daily_logs',
    'study_plan_items',
    'exams',
    'exam_results',
    'notes',
    'goals',
    'weekly_sessions',
    'session_actions',
    'daily_routines',
    'study_sessions'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- UPDATE/DELETE olaylarında eski satırın da yayınlanması için (filtreleme
-- ve silinen satırın kime ait olduğunun anlaşılması adına).
alter table public.daily_logs       replica identity full;
alter table public.study_plan_items replica identity full;
alter table public.session_actions  replica identity full;
alter table public.study_sessions   replica identity full;
