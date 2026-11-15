-- Çita GELİŞTİRME projesi kurulumu: schema.sql + migrations 001–012 (sırayla). YALNIZCA boş dev projede çalıştır.

-- ===================== schema.sql =====================
-- ============================================================================
-- CoachReachAI — Veritabanı Şeması (Supabase / Postgres)
-- ============================================================================
-- Bu dosyayı Supabase projendeki SQL Editor'e yapıştırıp çalıştır.
-- Sıra önemlidir: extension -> tablolar -> fonksiyonlar/trigger -> RLS.
--
-- IDEMPOTENT: dosyanın tamamı istediğin kadar tekrar çalıştırılabilir; mevcut
-- veri korunur, politikalar yeniden oluşturulur.
--
-- Şema zaten kuruluysa ve yalnızca yeni bölümleri (8-12) eklemek istiyorsan
-- supabase/migrations/001_weekly_sessions_and_realtime.sql dosyasını çalıştır.
--
-- ÖNEMLİ — çalıştırma sırası:
--   1) bu dosya (schema.sql)                     → YKS tabanı
--   2) migrations/002_coach_invite_codes.sql     → koç davet kodu
--   3) migrations/003_lgs_track.sql              → LGS sınav kolu
--
-- Bu dosya yalnızca YKS (TYT/AYT) kataloğunu kurar. LGS desteği — profiles.track,
-- LGS ders kataloğu, LGS deneme türleri ve 3 yanlış = 1 doğru net formülü —
-- 003 numaralı migration ile gelir; sıfırdan kurulumda o dosya da çalıştırılmalı.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Uzantılar
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1) profiles — her auth.users satırına karşılık gelen rol bilgisi
--    role: 'coach' | 'student'
--    Bir öğrenci tek bir koça bağlanır (coach_id).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('coach', 'student')),
  full_name   text not null default '',
  email       text not null,
  coach_id    uuid references public.profiles(id) on delete set null,
  target_exam_date date, -- öğrencinin hedeflediği YKS tarihi (opsiyonel)
  created_at  timestamptz not null default now()
);

create index if not exists idx_profiles_coach_id on public.profiles(coach_id);

-- Yeni kullanıcı auth.users'a düştüğünde otomatik profile satırı aç.
-- Varsayılan rol 'student'; koç hesapları signup sırasında metadata ile
-- role='coach' gönderilerek ayırt edilir (bkz. app/(auth)/signup).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2) subjects / topics — ders ve konu kataloğu (TYT/AYT)
-- ---------------------------------------------------------------------------
create table if not exists public.subjects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null check (category in ('TYT', 'AYT')),
  sort_order  int not null default 0
);

create table if not exists public.topics (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.subjects(id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0
);

create index if not exists idx_topics_subject_id on public.topics(subject_id);

-- ---------------------------------------------------------------------------
-- 3) daily_logs — günlük soru çözüm kayıtları (ders/konu bazlı)
-- ---------------------------------------------------------------------------
create table if not exists public.daily_logs (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.profiles(id) on delete cascade,
  log_date        date not null,
  subject_id      uuid not null references public.subjects(id),
  topic_id        uuid references public.topics(id),
  correct_count   int not null default 0 check (correct_count >= 0),
  wrong_count     int not null default 0 check (wrong_count >= 0),
  blank_count     int not null default 0 check (blank_count >= 0),
  duration_minutes int check (duration_minutes >= 0),
  created_at      timestamptz not null default now()
);

create index if not exists idx_daily_logs_student_date on public.daily_logs(student_id, log_date);

-- ---------------------------------------------------------------------------
-- 4) exams / exam_results — deneme sınavları ve ders bazlı netleri
-- ---------------------------------------------------------------------------
create table if not exists public.exams (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  exam_date   date not null,
  name        text not null,
  exam_type   text not null check (exam_type in ('TYT', 'AYT', 'Branş')),
  created_at  timestamptz not null default now()
);

create table if not exists public.exam_results (
  id              uuid primary key default gen_random_uuid(),
  exam_id         uuid not null references public.exams(id) on delete cascade,
  subject_id      uuid not null references public.subjects(id),
  correct_count   int not null default 0 check (correct_count >= 0),
  wrong_count     int not null default 0 check (wrong_count >= 0),
  blank_count     int not null default 0 check (blank_count >= 0),
  net             numeric generated always as (correct_count - wrong_count / 4.0) stored
);

create index if not exists idx_exam_results_exam_id on public.exam_results(exam_id);

-- ---------------------------------------------------------------------------
-- 5) goals — koçun öğrenciye tanımladığı hedefler
--    goal_type: 'daily_questions' | 'weekly_questions' | 'exam_net' | 'subject_net'
--    period:    'daily' | 'weekly' | 'monthly'
-- ---------------------------------------------------------------------------
create table if not exists public.goals (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles(id) on delete cascade,
  created_by    uuid not null references public.profiles(id),
  goal_type     text not null check (goal_type in ('daily_questions', 'weekly_questions', 'exam_net', 'subject_net')),
  subject_id    uuid references public.subjects(id),
  target_value  numeric not null,
  period        text not null check (period in ('daily', 'weekly', 'monthly')),
  start_date    date not null default current_date,
  end_date      date,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists idx_goals_student_id on public.goals(student_id);

-- ---------------------------------------------------------------------------
-- 6) study_plan_items — planlanan vs gerçekleşen çalışma programı
-- ---------------------------------------------------------------------------
create table if not exists public.study_plan_items (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.profiles(id) on delete cascade,
  plan_date         date not null,
  subject_id        uuid references public.subjects(id),
  topic_id          uuid references public.topics(id),
  title             text not null,
  planned_minutes   int check (planned_minutes >= 0),
  completed         boolean not null default false,
  actual_minutes    int check (actual_minutes >= 0),
  created_at        timestamptz not null default now()
);

create index if not exists idx_study_plan_student_date on public.study_plan_items(student_id, plan_date);

-- ---------------------------------------------------------------------------
-- 7) notes — motivasyon/durum notları (öğrenci veya koç yazabilir)
-- ---------------------------------------------------------------------------
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  author_id   uuid not null references public.profiles(id),
  note_date   date not null default current_date,
  mood        text check (mood in ('great', 'good', 'neutral', 'bad', 'struggling')),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_notes_student_date on public.notes(student_id, note_date);

-- ============================================================================
-- ROW LEVEL SECURITY
-- Kural: bir öğrenci sadece kendi verisini okur/yazar.
--        bir koç, coach_id kendisine eşit olan öğrencilerin verisini okur;
--        yazma işlemlerini genelde öğrenci yapar, koç sadece goals/notes'a
--        yazabilir (hedef atama, not düşme).
-- ============================================================================

alter table public.profiles         enable row level security;
alter table public.subjects         enable row level security;
alter table public.topics           enable row level security;
alter table public.daily_logs       enable row level security;
alter table public.exams            enable row level security;
alter table public.exam_results     enable row level security;
alter table public.goals            enable row level security;
alter table public.study_plan_items enable row level security;
alter table public.notes            enable row level security;

-- Yardımcı: mevcut kullanıcının koç olup olmadığını ve bir öğrencinin
-- kendisine bağlı olup olmadığını kontrol eden fonksiyon.
create or replace function public.is_coach_of(target_student uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = target_student
      and p.coach_id = auth.uid()
  );
$$;

-- profiles: herkes kendi profilini görür/günceller; koç kendine bağlı
-- öğrencilerin profillerini de görebilir.
drop policy if exists "profiles_select_own_or_coached" on public.profiles;
create policy "profiles_select_own_or_coached"
  on public.profiles for select
  using (id = auth.uid() or coach_id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid());

-- subjects/topics: herkese açık okuma (katalog verisi), yazma yok (seed ile dolar).
drop policy if exists "subjects_select_all" on public.subjects;
create policy "subjects_select_all" on public.subjects for select using (true);
drop policy if exists "topics_select_all" on public.topics;
create policy "topics_select_all"   on public.topics   for select using (true);

-- daily_logs: öğrenci kendi kaydını CRUD yapar; koç sadece okur.
drop policy if exists "daily_logs_student_all" on public.daily_logs;
create policy "daily_logs_student_all"
  on public.daily_logs for all
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists "daily_logs_coach_select" on public.daily_logs;
create policy "daily_logs_coach_select"
  on public.daily_logs for select
  using (public.is_coach_of(student_id));

-- exams / exam_results: aynı desen.
drop policy if exists "exams_student_all" on public.exams;
create policy "exams_student_all"
  on public.exams for all
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists "exams_coach_select" on public.exams;
create policy "exams_coach_select"
  on public.exams for select
  using (public.is_coach_of(student_id));

drop policy if exists "exam_results_student_all" on public.exam_results;
create policy "exam_results_student_all"
  on public.exam_results for all
  using (exists (select 1 from public.exams e where e.id = exam_id and e.student_id = auth.uid()))
  with check (exists (select 1 from public.exams e where e.id = exam_id and e.student_id = auth.uid()));

drop policy if exists "exam_results_coach_select" on public.exam_results;
create policy "exam_results_coach_select"
  on public.exam_results for select
  using (exists (select 1 from public.exams e where e.id = exam_id and public.is_coach_of(e.student_id)));

-- goals: öğrenci kendi hedeflerini görür; koç hem görür hem oluşturur/günceller
-- (öğrenciye hedef atamak koçun işi).
drop policy if exists "goals_student_select" on public.goals;
create policy "goals_student_select"
  on public.goals for select
  using (student_id = auth.uid());

drop policy if exists "goals_coach_all" on public.goals;
create policy "goals_coach_all"
  on public.goals for all
  using (public.is_coach_of(student_id) or created_by = auth.uid())
  with check (public.is_coach_of(student_id) or student_id = auth.uid());

-- study_plan_items: öğrenci kendi programını CRUD yapar; koç okuyabilir ve
-- öğrenciye program atayabilir (insert/update).
drop policy if exists "study_plan_student_all" on public.study_plan_items;
create policy "study_plan_student_all"
  on public.study_plan_items for all
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists "study_plan_coach_select" on public.study_plan_items;
create policy "study_plan_coach_select"
  on public.study_plan_items for select
  using (public.is_coach_of(student_id));

drop policy if exists "study_plan_coach_write" on public.study_plan_items;
create policy "study_plan_coach_write"
  on public.study_plan_items for insert
  with check (public.is_coach_of(student_id));

-- notes: hem öğrenci hem koç kendi yazdığını ekleyebilir; ilgili öğrencinin
-- notlarını her iki taraf da görebilir.
drop policy if exists "notes_select_own_or_coached" on public.notes;
create policy "notes_select_own_or_coached"
  on public.notes for select
  using (student_id = auth.uid() or public.is_coach_of(student_id));

drop policy if exists "notes_insert_own_or_coach" on public.notes;
create policy "notes_insert_own_or_coach"
  on public.notes for insert
  with check (
    author_id = auth.uid()
    and (student_id = auth.uid() or public.is_coach_of(student_id))
  );

-- ============================================================================
-- SEED — temel TYT/AYT ders kataloğu (idempotent)
-- ============================================================================
insert into public.subjects (name, category, sort_order)
select * from (values
  ('Türkçe', 'TYT', 1),
  ('Matematik', 'TYT', 2),
  ('Fizik', 'TYT', 3),
  ('Kimya', 'TYT', 4),
  ('Biyoloji', 'TYT', 5),
  ('Tarih', 'TYT', 6),
  ('Coğrafya', 'TYT', 7),
  ('Felsefe', 'TYT', 8),
  ('Din Kültürü', 'TYT', 9),
  ('Matematik (AYT)', 'AYT', 10),
  ('Fizik (AYT)', 'AYT', 11),
  ('Kimya (AYT)', 'AYT', 12),
  ('Biyoloji (AYT)', 'AYT', 13),
  ('Edebiyat', 'AYT', 14),
  ('Tarih (AYT)', 'AYT', 15),
  ('Coğrafya (AYT)', 'AYT', 16)
) as v(name, category, sort_order)
where not exists (select 1 from public.subjects s where s.name = v.name);

-- Örnek konu kataloğu (birkaç ana ders için) — koç/öğrenci ihtiyaç duydukça
-- bu tabloya kendi konularını ekleyebilir, aşağıdaki liste sadece başlangıç.
insert into public.topics (subject_id, name, sort_order)
select s.id, t.name, t.sort_order
from (values
  ('Matematik', 'Temel Kavramlar', 1),
  ('Matematik', 'Sayılar', 2),
  ('Matematik', 'Bölme-Bölünebilme', 3),
  ('Matematik', 'Rasyonel Sayılar', 4),
  ('Matematik', 'Problemler', 5),
  ('Matematik', 'Kümeler', 6),
  ('Matematik', 'Fonksiyonlar', 7),
  ('Matematik', 'Permütasyon-Kombinasyon-Olasılık', 8),
  ('Türkçe', 'Sözcükte Anlam', 1),
  ('Türkçe', 'Cümlede Anlam', 2),
  ('Türkçe', 'Paragraf', 3),
  ('Türkçe', 'Dil Bilgisi', 4),
  ('Fizik', 'Fizik Bilimine Giriş', 1),
  ('Fizik', 'Madde ve Özellikleri', 2),
  ('Fizik', 'Kuvvet ve Hareket', 3),
  ('Fizik', 'Enerji', 4),
  ('Kimya', 'Kimya Bilimi', 1),
  ('Kimya', 'Atom ve Periyodik Sistem', 2),
  ('Kimya', 'Kimyasal Türler Arası Etkileşim', 3),
  ('Biyoloji', 'Canlıların Ortak Özellikleri', 1),
  ('Biyoloji', 'Hücre', 2),
  ('Biyoloji', 'Canlılar Dünyası', 3)
) as t(subject_name, name, sort_order)
join public.subjects s on s.name = t.subject_name
where not exists (
  select 1 from public.topics tp where tp.subject_id = s.id and tp.name = t.name
);

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

-- ===================== migrations/001_weekly_sessions_and_realtime.sql =====================
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

-- ===================== migrations/002_coach_invite_codes.sql =====================
-- ============================================================================
-- MIGRATION 002 — Koç davet kodu ve güvenilir koç–öğrenci eşleşmesi
-- ============================================================================
-- SORUN:
--   Kayıt sırasında koç araması anonim kullanıcı olarak yapılıyordu. profiles
--   tablosundaki RLS "id = auth.uid() or coach_id = auth.uid()" olduğundan
--   auth.uid() NULL iken sorgu daima 0 satır döndürüyor, doğru e-posta girilse
--   bile "koç bulunamadı" hatası alınıyordu. Ayrıca coach_id, signUp'tan sonra
--   ayrı bir update ile yazılıyordu; e-posta doğrulaması açıkken oturum
--   olmadığı için bu adım da sessizce başarısız oluyordu.
--
-- ÇÖZÜM:
--   1) Her koça kısa, okunaklı bir davet kodu (invite_code) verilir.
--   2) resolve_coach() — anon çağırabilen SECURITY DEFINER fonksiyon; kodu
--      veya e-postayı koç id'sine çevirir, tabloyu dışarı açmaz.
--   3) handle_new_user() — kayıt metadata'sındaki coach_code'u okuyup coach_id'yi
--      profil satırı oluşurken atomik olarak yazar.
--   4) join_coach() — sonradan koçuna bağlanmak isteyen öğrenci için.
--   5) Öğrenci kendi role/coach_id alanını doğrudan değiştiremez.
--
-- Idempotenttir, tekrar tekrar çalıştırılabilir.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) invite_code kolonu
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists invite_code text;

create unique index if not exists uq_profiles_invite_code
  on public.profiles(invite_code) where invite_code is not null;

-- Karıştırılabilir karakterler (0/O, 1/I/L) alfabeden çıkarıldı.
create or replace function public.gen_invite_code()
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles p where p.invite_code = candidate);
  end loop;
  return candidate;
end;
$$;

-- Mevcut koçlara kod ata.
update public.profiles
set invite_code = public.gen_invite_code()
where role = 'coach' and invite_code is null;

-- ---------------------------------------------------------------------------
-- 2) resolve_coach — kod veya e-postadan koç id'si (anon çağırabilir)
-- ---------------------------------------------------------------------------
create or replace function public.resolve_coach(code text)
returns uuid
language sql
security definer set search_path = public
stable
as $$
  select p.id
  from public.profiles p
  where p.role = 'coach'
    and (
      upper(trim(coalesce(code, ''))) = upper(coalesce(p.invite_code, '~yok~'))
      or lower(trim(coalesce(code, ''))) = lower(p.email)
    )
  limit 1;
$$;

revoke all on function public.resolve_coach(text) from public;
grant execute on function public.resolve_coach(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) handle_new_user — koç bağlantısını profil doğarken kur
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_role  text := coalesce(new.raw_user_meta_data->>'role', 'student');
  v_code  text := nullif(trim(coalesce(new.raw_user_meta_data->>'coach_code', '')), '');
  v_coach uuid;
begin
  if v_role = 'student' and v_code is not null then
    v_coach := public.resolve_coach(v_code);
  end if;

  insert into public.profiles (id, role, full_name, email, coach_id, invite_code)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    v_coach,
    case when v_role = 'coach' then public.gen_invite_code() else null end
  )
  on conflict (id) do update
    set coach_id    = coalesce(profiles.coach_id, excluded.coach_id),
        full_name   = case when profiles.full_name = '' then excluded.full_name
                           else profiles.full_name end,
        invite_code = coalesce(profiles.invite_code, excluded.invite_code);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 4) join_coach — kayıtlı öğrenci sonradan koçuna bağlanır
--    Dönüş: 'ok' | 'not_found' | 'already_linked' | 'not_student'
-- ---------------------------------------------------------------------------
create or replace function public.join_coach(code text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_role  text;
  v_current uuid;
  v_coach uuid;
begin
  if v_uid is null then
    return 'not_student';
  end if;

  select p.role, p.coach_id into v_role, v_current
  from public.profiles p where p.id = v_uid;

  if v_role is distinct from 'student' then
    return 'not_student';
  end if;
  if v_current is not null then
    return 'already_linked';
  end if;

  v_coach := public.resolve_coach(code);
  if v_coach is null or v_coach = v_uid then
    return 'not_found';
  end if;

  -- Koruma trigger'ını bu işlem için bilinçli olarak devre dışı bırak.
  perform set_config('app.link_coach', 'on', true);
  update public.profiles set coach_id = v_coach where id = v_uid;

  return 'ok';
end;
$$;

revoke all on function public.join_coach(text) from public;
grant execute on function public.join_coach(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Kendi rolünü / koçunu doğrudan değiştirmeyi engelle
--    (profiles_update_own politikası ad-soyad güncellemesi için açık kalıyor.)
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null
     and auth.uid() = old.id
     and coalesce(current_setting('app.link_coach', true), '') <> 'on'
  then
    new.role        := old.role;
    new.coach_id    := old.coach_id;
    new.invite_code := old.invite_code;
    new.email       := old.email;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ===================== migrations/003_lgs_track.sql =====================
-- ============================================================================
-- MIGRATION 003 — LGS desteği (çift sınav kolu: YKS / LGS)
-- ============================================================================
-- Uygulama artık iki sınav kolunu birden taşıyor:
--
--   YKS  → TYT / AYT ders kataloğu, net formülü: doğru − yanlış/4
--   LGS  → Sözel / Sayısal bölüm kataloğu, net formülü: doğru − yanlış/3
--
-- YKS tarafının davranışı hiç değişmiyor; mevcut satırların tamamı
-- track='YKS' ve wrong_penalty=4 ile geriye dönük uyumlu kalır.
--
-- Idempotenttir, tekrar tekrar çalıştırılabilir.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) profiles.track — öğrencinin hangi sınava hazırlandığı
--    Koç hesaplarında anlamsızdır (bir koçun hem YKS hem LGS öğrencisi olabilir);
--    paneller daima ilgili ÖĞRENCİNİN track'ine bakar.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists track text not null default 'YKS';

alter table public.profiles drop constraint if exists profiles_track_check;
alter table public.profiles add constraint profiles_track_check
  check (track in ('YKS', 'LGS'));

-- ---------------------------------------------------------------------------
-- 2) subjects.track — ders kataloğunun kola göre ayrılması
--    Ders adları kollar arasında çakışabilir ("Matematik", "Türkçe"), bu yüzden
--    benzersizlik (name, track) çifti üzerinden düşünülür.
-- ---------------------------------------------------------------------------
alter table public.subjects add column if not exists track text not null default 'YKS';

update public.subjects set track = 'YKS' where category in ('TYT', 'AYT');

alter table public.subjects drop constraint if exists subjects_track_check;
alter table public.subjects add constraint subjects_track_check
  check (track in ('YKS', 'LGS'));

-- category artık LGS bölümlerini de kabul ediyor.
alter table public.subjects drop constraint if exists subjects_category_check;
alter table public.subjects add constraint subjects_category_check
  check (category in ('TYT', 'AYT', 'LGS-Sözel', 'LGS-Sayısal'));

-- Kol ile kategori birbiriyle tutarlı olmalı.
alter table public.subjects drop constraint if exists subjects_track_category_check;
alter table public.subjects add constraint subjects_track_category_check
  check (
    (track = 'YKS' and category in ('TYT', 'AYT'))
    or (track = 'LGS' and category in ('LGS-Sözel', 'LGS-Sayısal'))
  );

create index if not exists idx_subjects_track on public.subjects(track, sort_order);

-- ---------------------------------------------------------------------------
-- 3) exams.exam_type — LGS sınav türleri
--    'LGS'     → 90 soruluk tam deneme (iki bölüm birden)
--    'Sözel'   → yalnız sözel bölüm denemesi
--    'Sayısal' → yalnız sayısal bölüm denemesi
--    'Branş'   → her iki kolda da geçerli, tek ders denemesi
-- ---------------------------------------------------------------------------
alter table public.exams drop constraint if exists exams_exam_type_check;
alter table public.exams add constraint exams_exam_type_check
  check (exam_type in ('TYT', 'AYT', 'Branş', 'LGS', 'Sözel', 'Sayısal'));

-- ---------------------------------------------------------------------------
-- 4) exam_results.net — kola göre değişen yanlış katsayısı
--    YKS'de 4 yanlış, LGS'de 3 yanlış 1 doğruyu götürür. Katsayı satıra
--    yazılır ki üretilmiş (generated) net kolonu aynı formülle her iki kolu
--    da doğru hesaplasın.
-- ---------------------------------------------------------------------------
alter table public.exam_results
  add column if not exists wrong_penalty numeric not null default 4;

alter table public.exam_results drop constraint if exists exam_results_wrong_penalty_check;
alter table public.exam_results add constraint exam_results_wrong_penalty_check
  check (wrong_penalty > 0);

-- Generated kolon yerinde değiştirilemez; düşürüp yeniden kurulur. Değerler
-- saklanan veriden yeniden hesaplandığı için veri kaybı olmaz.
alter table public.exam_results drop column if exists net;
alter table public.exam_results
  add column net numeric generated always as (correct_count - wrong_count / wrong_penalty) stored;

-- ---------------------------------------------------------------------------
-- 5) handle_new_user — kayıt metadata'sındaki track'i profile yaz
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_role  text := coalesce(new.raw_user_meta_data->>'role', 'student');
  v_code  text := nullif(trim(coalesce(new.raw_user_meta_data->>'coach_code', '')), '');
  v_track text := upper(coalesce(new.raw_user_meta_data->>'track', 'YKS'));
  v_coach uuid;
begin
  if v_track not in ('YKS', 'LGS') then
    v_track := 'YKS';
  end if;

  if v_role = 'student' and v_code is not null then
    v_coach := public.resolve_coach(v_code);
  end if;

  insert into public.profiles (id, role, full_name, email, coach_id, invite_code, track)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    v_coach,
    case when v_role = 'coach' then public.gen_invite_code() else null end,
    v_track
  )
  on conflict (id) do update
    set coach_id    = coalesce(profiles.coach_id, excluded.coach_id),
        full_name   = case when profiles.full_name = '' then excluded.full_name
                           else profiles.full_name end,
        invite_code = coalesce(profiles.invite_code, excluded.invite_code),
        track       = excluded.track;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 6) Öğrenci kendi track'ini de doğrudan değiştiremesin
--    (rol/koç koruması ile aynı gerekçe: veri tutarlılığı)
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null
     and auth.uid() = old.id
     and coalesce(current_setting('app.link_coach', true), '') <> 'on'
  then
    new.role        := old.role;
    new.coach_id    := old.coach_id;
    new.invite_code := old.invite_code;
    new.email       := old.email;
    new.track       := old.track;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ============================================================================
-- SEED — LGS ders kataloğu (idempotent)
--
--   Sayısal bölüm : Matematik 20, Fen Bilimleri 20        →  40 soru
--   Sözel bölüm   : Türkçe 20, İnkılap 10, Din 10, İng 10 →  50 soru
--                                                            ---------
--                                                             90 soru
-- ============================================================================
insert into public.subjects (name, category, track, sort_order)
select * from (values
  ('Türkçe',                  'LGS-Sözel',   'LGS', 101),
  ('T.C. İnkılap Tarihi',     'LGS-Sözel',   'LGS', 102),
  ('Din Kültürü',             'LGS-Sözel',   'LGS', 103),
  ('Yabancı Dil',             'LGS-Sözel',   'LGS', 104),
  ('Matematik',               'LGS-Sayısal', 'LGS', 105),
  ('Fen Bilimleri',           'LGS-Sayısal', 'LGS', 106)
) as v(name, category, track, sort_order)
where not exists (
  select 1 from public.subjects s where s.name = v.name and s.track = v.track
);

-- 8. sınıf konu kataloğu — koç/öğrenci ihtiyaç duydukça genişletebilir.
insert into public.topics (subject_id, name, sort_order)
select s.id, t.name, t.sort_order
from (values
  ('Türkçe', 'Sözcükte Anlam', 1),
  ('Türkçe', 'Cümlede Anlam', 2),
  ('Türkçe', 'Paragraf', 3),
  ('Türkçe', 'Söz Sanatları', 4),
  ('Türkçe', 'Fiilimsiler', 5),
  ('Türkçe', 'Cümlenin Ögeleri', 6),
  ('Türkçe', 'Fiilde Çatı', 7),
  ('Türkçe', 'Cümle Türleri', 8),
  ('Türkçe', 'Anlatım Bozuklukları', 9),
  ('Türkçe', 'Yazım Kuralları ve Noktalama', 10),
  ('Matematik', 'Çarpanlar ve Katlar', 1),
  ('Matematik', 'Üslü İfadeler', 2),
  ('Matematik', 'Kareköklü İfadeler', 3),
  ('Matematik', 'Veri Analizi', 4),
  ('Matematik', 'Basit Olayların Olma Olasılığı', 5),
  ('Matematik', 'Cebirsel İfadeler ve Özdeşlikler', 6),
  ('Matematik', 'Doğrusal Denklemler', 7),
  ('Matematik', 'Eşitsizlikler', 8),
  ('Matematik', 'Üçgenler', 9),
  ('Matematik', 'Eşlik ve Benzerlik', 10),
  ('Matematik', 'Dönüşüm Geometrisi', 11),
  ('Matematik', 'Geometrik Cisimler', 12),
  ('Fen Bilimleri', 'Mevsimler ve İklim', 1),
  ('Fen Bilimleri', 'DNA ve Genetik Kod', 2),
  ('Fen Bilimleri', 'Basınç', 3),
  ('Fen Bilimleri', 'Madde ve Endüstri', 4),
  ('Fen Bilimleri', 'Basit Makineler', 5),
  ('Fen Bilimleri', 'Enerji Dönüşümleri ve Çevre Bilimi', 6),
  ('Fen Bilimleri', 'Elektrik Yükleri ve Elektrik Enerjisi', 7),
  ('T.C. İnkılap Tarihi', 'Bir Kahraman Doğuyor', 1),
  ('T.C. İnkılap Tarihi', 'Millî Uyanış: Bağımsızlık Yolunda Atılan Adımlar', 2),
  ('T.C. İnkılap Tarihi', 'Millî Bir Destan: Ya İstiklal Ya Ölüm', 3),
  ('T.C. İnkılap Tarihi', 'Atatürkçülük ve Çağdaşlaşan Türkiye', 4),
  ('T.C. İnkılap Tarihi', 'Demokratikleşme Çabaları', 5),
  ('T.C. İnkılap Tarihi', 'Atatürk Dönemi Türk Dış Politikası', 6),
  ('Din Kültürü', 'Kader ve Kaza', 1),
  ('Din Kültürü', 'Zekât ve Sadaka', 2),
  ('Din Kültürü', 'Din ve Hayat', 3),
  ('Din Kültürü', 'Hz. Muhammed''in Örnekliği', 4),
  ('Din Kültürü', 'Kur''an-ı Kerim ve Özellikleri', 5),
  ('Yabancı Dil', 'Friendship', 1),
  ('Yabancı Dil', 'Teen Life', 2),
  ('Yabancı Dil', 'In the Kitchen', 3),
  ('Yabancı Dil', 'On the Phone', 4),
  ('Yabancı Dil', 'The Internet', 5),
  ('Yabancı Dil', 'Adventures', 6),
  ('Yabancı Dil', 'Tourism', 7),
  ('Yabancı Dil', 'Chores', 8),
  ('Yabancı Dil', 'Science', 9),
  ('Yabancı Dil', 'Natural Forces', 10)
) as t(subject_name, name, sort_order)
join public.subjects s on s.name = t.subject_name and s.track = 'LGS'
where not exists (
  select 1 from public.topics tp where tp.subject_id = s.id and tp.name = t.name
);

-- ===================== migrations/004_coach_can_set_track.sql =====================
-- ============================================================================
-- MIGRATION 004 — Koç, öğrencinin sınav kolunu (track) değiştirebilsin
-- ============================================================================
-- SORUN:
--   003 ile gelen track alanı yalnızca kayıt anında yazılıyordu. Kayıttan
--   sonra değiştirmenin hiçbir yolu yoktu:
--     * öğrenci kendi track'ini protect_profile_fields ile bloke ediliyor,
--     * koç için profiles üzerinde hiç UPDATE politikası yok.
--   Sonuç: 003'ten önce açılmış hesaplar (veya sınavı değişen bir öğrenci)
--   kalıcı olarak yanlış kolda kalıyor ve yanlış ders kataloğunu görüyordu.
--
-- ÇÖZÜM:
--   1) Koça, kendi öğrencilerinin profil satırı için UPDATE izni verilir.
--   2) protect_profile_fields sertleştirilir: koç bu satırda YALNIZCA track
--      alanını değiştirebilir; rol, koç bağlantısı, e-posta, davet kodu ve
--      ad-soyad koçun elinden korunur. Yani yeni yetki dar kapsamlıdır.
--
-- Idempotenttir, tekrar tekrar çalıştırılabilir.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Koç, kendi öğrencisinin profilini güncelleyebilir
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_update_coached" on public.profiles;
create policy "profiles_update_coached"
  on public.profiles for update
  using (public.is_coach_of(id))
  with check (public.is_coach_of(id));

-- ---------------------------------------------------------------------------
-- 2) Alan bazlı koruma
--
--    Kendi satırı        → yalnızca ad-soyad serbest (mevcut davranış).
--    Koçun öğrenci satırı → yalnızca track serbest.
--
--    join_coach() kendi satırında coach_id yazabilmek için app.link_coach
--    bayrağını kullanmaya devam eder.
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Oturumsuz bağlam (trigger'lar, servis anahtarı, migration): dokunma.
  if auth.uid() is null then
    return new;
  end if;

  if auth.uid() = old.id then
    -- Kullanıcının kendi profili.
    if coalesce(current_setting('app.link_coach', true), '') <> 'on' then
      new.role        := old.role;
      new.coach_id    := old.coach_id;
      new.invite_code := old.invite_code;
      new.email       := old.email;
      new.track       := old.track;
    end if;
  else
    -- Başkasının profili; RLS gereği buraya yalnızca öğrencinin koçu gelebilir.
    -- Sadece track değişebilir, diğer her şey eski değerine sabitlenir.
    new.id               := old.id;
    new.role             := old.role;
    new.coach_id         := old.coach_id;
    new.invite_code      := old.invite_code;
    new.email            := old.email;
    new.full_name        := old.full_name;
    new.target_exam_date := old.target_exam_date;
    new.created_at       := old.created_at;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ===================== migrations/005_weekly_agenda.sql =====================
-- ============================================================================
-- MIGRATION 005 — Haftalık ajanda (gün sütunlu program tablosu)
-- ============================================================================
-- Eski "program öğesi" formu yerini haftalık ajandaya bırakıyor: 7 gün sütunu,
-- her günün altında serbest görev satırları. Veri yine study_plan_items'ta
-- durur — böylece "programa uyum" ve gün gün çalışma takibi hesapları
-- olduğu gibi çalışmaya devam eder.
--
-- Gereken iki şey:
--   1) Gün içindeki satır sırası (sort_order).
--   2) Koçun, görüşme formunun 7. maddesinden öğrencinin haftasını
--      düzenleyebilmesi — bugüne kadar koçun yalnızca INSERT izni vardı,
--      UPDATE/DELETE yoktu; dolayısıyla bir satırı düzeltemez/silemezdi.
--
-- Idempotenttir, tekrar tekrar çalıştırılabilir.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Gün içi sıralama
-- ---------------------------------------------------------------------------
alter table public.study_plan_items
  add column if not exists sort_order int not null default 0;

create index if not exists idx_study_plan_student_week
  on public.study_plan_items(student_id, plan_date, sort_order);

-- ---------------------------------------------------------------------------
-- 2) Koç, kendi öğrencisinin programını tam yönetebilir
--    (öğrencinin kendi CRUD politikası "study_plan_student_all" ile duruyor)
-- ---------------------------------------------------------------------------
drop policy if exists "study_plan_coach_write" on public.study_plan_items;

drop policy if exists "study_plan_coach_all" on public.study_plan_items;
create policy "study_plan_coach_all"
  on public.study_plan_items for all
  using (public.is_coach_of(student_id))
  with check (public.is_coach_of(student_id));

-- ===================== migrations/006_daily_log_topic_text.sql =====================
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

-- ===================== migrations/007_study_time_entries.sql =====================
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

-- ===================== migrations/008_cita_foundation.sql =====================
-- ============================================================================
-- MIGRATION 008 — Çita temeli
-- ============================================================================
-- Mevcut CoachReachAI verisini ve akışlarını KORUR (yalnızca ekleme + genişletme):
--   * Eski koç kodu / join_coach / handle_new_user koç eşleşmesi aynen çalışır.
--   * Koç kodu B2C (mobil) kayıtta isteğe bağlıdır (trigger zaten null kabul eder).
--
-- Eklenenler:
--   1) Roller: 'parent' rolü, ekip yöneticisi bayrağı (is_admin), Çita profil alanları
--   2) YKS: YDT ve eksik AYT dersleri, YDT deneme türü, deneme idempotency anahtarı
--   3) Program revizyonu (plan_state) ve görev meta alanları
--   4) Onboarding önizlemesini hesaba idempotent aktarma (cita_import_onboarding)
--   5) Haftalık hedef, rozetler (sunucuda hesaplanır)
--   6) Paket/abonelik kaydı ve cita_effective_tier (erişim sunucuda doğrulanır)
--   7) Program değişikliği önerileri + atomik onay RPC'leri (öğrenci / koç)
--   8) Çalışma dakikası görünümü ve kronometre-görev bağlantısı
--
-- Idempotenttir. Supabase'de SQL Editor'den ya da `supabase db push` ile çalışır.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Roller ve profil alanları
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('coach', 'student', 'parent'));

alter table public.profiles add column if not exists is_admin   boolean not null default false;
alter table public.profiles add column if not exists yks_field  text check (yks_field in ('SAY','EA','SÖZ','DİL'));
alter table public.profiles add column if not exists yks_focus  text check (yks_focus in ('TYT','AYT','TYT+AYT','YDT'));
alter table public.profiles add column if not exists goal_text  text not null default '' check (char_length(goal_text) <= 200);
alter table public.profiles add column if not exists level      text check (level in ('başlangıç','orta','iyi'));
alter table public.profiles add column if not exists weak_subjects text[] not null default '{}';
alter table public.profiles add column if not exists availability int[]; -- Pzt..Paz dakika
alter table public.profiles add column if not exists onboarded_at timestamptz;

create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- handle_new_user: 003'teki davranış + 'parent' rolü. is_admin ASLA metadata'dan gelmez.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_role  text := coalesce(new.raw_user_meta_data->>'role', 'student');
  v_code  text := nullif(trim(coalesce(new.raw_user_meta_data->>'coach_code', '')), '');
  v_track text := upper(coalesce(new.raw_user_meta_data->>'track', 'YKS'));
  v_coach uuid;
begin
  if v_role not in ('coach', 'student', 'parent') then
    v_role := 'student';
  end if;
  if v_track not in ('YKS', 'LGS') then
    v_track := 'YKS';
  end if;
  if v_role = 'student' and v_code is not null then
    v_coach := public.resolve_coach(v_code);
  end if;

  insert into public.profiles (id, role, full_name, email, coach_id, invite_code, track)
  values (
    new.id, v_role,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email, v_coach,
    case when v_role = 'coach' then public.gen_invite_code() else null end,
    v_track
  )
  on conflict (id) do update
    set coach_id    = coalesce(profiles.coach_id, excluded.coach_id),
        full_name   = case when profiles.full_name = '' then excluded.full_name else profiles.full_name end,
        invite_code = coalesce(profiles.invite_code, excluded.invite_code),
        track       = excluded.track;
  return new;
end;
$$;

-- Alan koruması: 004 davranışı + is_admin. Onboarding aktarımı (app.cita_onboarding)
-- öğrencinin kendi track'ini bir kez yazabilmesi için bilinçli olarak açılır.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  new.is_admin := old.is_admin; -- yalnızca servis rolü / SQL ile değişir

  if auth.uid() = old.id then
    if coalesce(current_setting('app.link_coach', true), '') <> 'on' then
      new.coach_id := old.coach_id;
    end if;
    new.role        := old.role;
    new.invite_code := old.invite_code;
    new.email       := old.email;
    if coalesce(current_setting('app.cita_onboarding', true), '') <> 'on' then
      new.track := old.track;
    end if;
  elsif coalesce(current_setting('app.cita_admin', true), '') = 'on' then
    -- Yönetici koç ataması (cita_admin_assign_coach): yalnızca coach_id değişir.
    new.id := old.id; new.role := old.role; new.email := old.email;
    new.invite_code := old.invite_code; new.full_name := old.full_name; new.track := old.track;
  else
    -- Koç, öğrencisinin yalnızca track'ini değiştirebilir (004).
    new.id               := old.id;
    new.role             := old.role;
    new.coach_id         := old.coach_id;
    new.invite_code      := old.invite_code;
    new.email            := old.email;
    new.full_name        := old.full_name;
    new.target_exam_date := old.target_exam_date;
    new.created_at       := old.created_at;
    new.yks_field := old.yks_field; new.yks_focus := old.yks_focus; new.goal_text := old.goal_text;
    new.level := old.level; new.weak_subjects := old.weak_subjects; new.availability := old.availability;
    new.onboarded_at := old.onboarded_at;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Yöneticiler tüm profilleri görebilir (koç atama ekranı).
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2) YKS kataloğu: YDT + eksik AYT dersleri, YDT deneme türü
-- ---------------------------------------------------------------------------
alter table public.subjects drop constraint if exists subjects_category_check;
alter table public.subjects add constraint subjects_category_check
  check (category in ('TYT', 'AYT', 'YDT', 'LGS-Sözel', 'LGS-Sayısal'));
alter table public.subjects drop constraint if exists subjects_track_category_check;
alter table public.subjects add constraint subjects_track_category_check
  check ((track = 'YKS' and category in ('TYT', 'AYT', 'YDT'))
      or (track = 'LGS' and category in ('LGS-Sözel', 'LGS-Sayısal')));

insert into public.subjects (name, category, track, sort_order)
select * from (values
  ('Felsefe Grubu (AYT)', 'AYT', 'YKS', 17),
  ('Din Kültürü (AYT)',   'AYT', 'YKS', 18),
  ('Yabancı Dil (YDT)',   'YDT', 'YKS', 19)
) as v(name, category, track, sort_order)
where not exists (select 1 from public.subjects s where s.name = v.name and s.track = v.track);

alter table public.exams drop constraint if exists exams_exam_type_check;
alter table public.exams add constraint exams_exam_type_check
  check (exam_type in ('TYT', 'AYT', 'YDT', 'Branş', 'LGS', 'Sözel', 'Sayısal'));

-- Mobil tekrar denemeleri çift deneme üretmesin.
alter table public.exams add column if not exists client_id uuid;
create unique index if not exists uq_exams_client on public.exams(student_id, client_id) where client_id is not null;
alter table public.exam_results add column if not exists question_count int check (question_count > 0);

-- ---------------------------------------------------------------------------
-- 3) Program revizyonu ve görev meta alanları
-- ---------------------------------------------------------------------------
alter table public.study_plan_items add column if not exists kind text
  check (kind in ('konu','soru','tekrar','deneme','analiz'));
alter table public.study_plan_items add column if not exists source text not null default 'manual'
  check (source in ('manual','onboarding','proposal','coach'));
alter table public.study_plan_items add column if not exists completed_at timestamptz;

create table if not exists public.plan_state (
  student_id      uuid primary key references public.profiles(id) on delete cascade,
  revision        bigint not null default 0,
  first_plan_date date,
  updated_at      timestamptz not null default now()
);
alter table public.plan_state enable row level security;
drop policy if exists "plan_state_select" on public.plan_state;
create policy "plan_state_select" on public.plan_state for select
  using (student_id = auth.uid() or public.is_coach_of(student_id));

-- Yapısal değişiklikte (tarih/başlık/süre/ekleme/silme) revizyon artar;
-- yalnızca "tamamlandı" işareti revizyonu değiştirmez.
create or replace function public.bump_plan_revision()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_student uuid := coalesce(new.student_id, old.student_id);
begin
  if tg_op = 'UPDATE'
     and new.plan_date = old.plan_date and new.title = old.title
     and new.planned_minutes is not distinct from old.planned_minutes
     and new.student_id = old.student_id then
    return null;
  end if;
  insert into public.plan_state (student_id, revision) values (v_student, 1)
  on conflict (student_id) do update set revision = plan_state.revision + 1, updated_at = now();
  return null;
end;
$$;

drop trigger if exists study_plan_revision on public.study_plan_items;
create trigger study_plan_revision
  after insert or update or delete on public.study_plan_items
  for each row execute function public.bump_plan_revision();

-- Tamamlanma zamanı (seri hesabı İstanbul gününe göre görev tarihini kullanır).
create or replace function public.touch_plan_completed()
returns trigger language plpgsql as $$
begin
  if new.completed and not coalesce(old.completed, false) then new.completed_at := now();
  elsif not new.completed then new.completed_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists study_plan_completed on public.study_plan_items;
create trigger study_plan_completed before insert or update on public.study_plan_items
  for each row execute function public.touch_plan_completed();

-- ---------------------------------------------------------------------------
-- 4) Haftalık hedef ve rozetler
-- ---------------------------------------------------------------------------
create table if not exists public.weekly_targets (
  student_id     uuid not null references public.profiles(id) on delete cascade,
  week_start     date not null check (extract(isodow from week_start) = 1),
  target_minutes int  not null check (target_minutes between 30 and 6000),
  created_at     timestamptz not null default now(),
  primary key (student_id, week_start)
);
alter table public.weekly_targets enable row level security;
drop policy if exists "weekly_targets_student_all" on public.weekly_targets;
create policy "weekly_targets_student_all" on public.weekly_targets for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());
drop policy if exists "weekly_targets_coach_all" on public.weekly_targets;
create policy "weekly_targets_coach_all" on public.weekly_targets for all
  using (public.is_coach_of(student_id)) with check (public.is_coach_of(student_id));

create table if not exists public.student_badges (
  student_id uuid not null references public.profiles(id) on delete cascade,
  badge_key  text not null check (badge_key in ('first_exam','first_week','three_weekly_goals')),
  awarded_at timestamptz not null default now(),
  evidence   jsonb not null default '{}'::jsonb,
  primary key (student_id, badge_key)
);
alter table public.student_badges enable row level security;
drop policy if exists "student_badges_select" on public.student_badges;
create policy "student_badges_select" on public.student_badges for select
  using (student_id = auth.uid() or public.is_coach_of(student_id));
-- Yazma politikası yok: rozetler yalnızca cita_refresh_badges ile verilir.

-- Gerçek çalışma dakikaları: mevcut koç grafiğiyle aynı kaynaklar.
create or replace view public.cita_study_minutes with (security_invoker = true) as
  select student_id, entry_date as day, minutes from public.study_time_entries
  union all
  select student_id, log_date as day, duration_minutes as minutes from public.daily_logs
  where duration_minutes is not null and duration_minutes > 0;

create or replace function public.cita_today()
returns date language sql stable as $$ select (now() at time zone 'Europe/Istanbul')::date $$;

create or replace function public.cita_refresh_badges(p_student uuid default null)
returns setof public.student_badges
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := coalesce(p_student, auth.uid());
  v_today date := public.cita_today();
  v_first date;
  v_planned int; v_done int;
  v_exam record;
  v_weeks date[];
begin
  if v_student is null or not (v_student = auth.uid() or public.is_coach_of(v_student) or auth.role() = 'service_role') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select e.id, e.exam_date into v_exam from public.exams e
   where e.student_id = v_student order by e.exam_date, e.created_at limit 1;
  if found then
    insert into public.student_badges (student_id, badge_key, evidence)
    values (v_student, 'first_exam', jsonb_build_object('exam_id', v_exam.id, 'exam_date', v_exam.exam_date))
    on conflict do nothing;
  end if;

  select first_plan_date into v_first from public.plan_state where student_id = v_student;
  if v_first is not null and v_today > v_first + 6 then
    select count(*), count(*) filter (where completed) into v_planned, v_done
      from public.study_plan_items where student_id = v_student and plan_date between v_first and v_first + 6;
    if v_planned > 0 and v_done::numeric / v_planned >= 0.7 then
      insert into public.student_badges (student_id, badge_key, evidence)
      values (v_student, 'first_week', jsonb_build_object('from', v_first, 'to', v_first + 6, 'completed', v_done, 'planned', v_planned))
      on conflict do nothing;
    end if;
  end if;

  select array_agg(t.week_start order by t.week_start) into v_weeks
  from public.weekly_targets t
  where t.student_id = v_student and t.week_start <= v_today
    and t.target_minutes <= coalesce((
      select sum(m.minutes) from public.cita_study_minutes m
      where m.student_id = v_student and m.day between t.week_start and t.week_start + 6), 0);
  if coalesce(array_length(v_weeks, 1), 0) >= 3 then
    insert into public.student_badges (student_id, badge_key, evidence)
    values (v_student, 'three_weekly_goals', jsonb_build_object('weeks', to_jsonb(v_weeks[1:3])))
    on conflict do nothing;
  end if;

  return query select * from public.student_badges where student_id = v_student;
end;
$$;
revoke all on function public.cita_refresh_badges(uuid) from public, anon;
grant execute on function public.cita_refresh_badges(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Paket / abonelik (erişim kararı burada)
-- ---------------------------------------------------------------------------
create table if not exists public.cita_settings (
  key   text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.cita_settings enable row level security;
drop policy if exists "cita_settings_read" on public.cita_settings;
create policy "cita_settings_read" on public.cita_settings for select using (auth.uid() is not null);
drop policy if exists "cita_settings_admin" on public.cita_settings;
create policy "cita_settings_admin" on public.cita_settings for all using (public.is_admin()) with check (public.is_admin());

insert into public.cita_settings (key, value) values
  ('photo_limits', '{"free": 3, "plus": 15, "bire_bir": 15}'),
  ('trial_days', '14')
on conflict (key) do nothing;

create table if not exists public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references public.profiles(id) on delete cascade,
  payer_id           uuid not null references public.profiles(id),  -- öğrenci veya bağlı veli
  tier               text not null check (tier in ('plus','bire_bir')),
  status             text not null check (status in ('trialing','active','grace','billing_retry','canceled','expired','refunded','revoked')),
  provider           text not null check (provider in ('test','app_store','play_store','admin')),
  product_id         text not null,
  original_transaction_id text not null,
  expires_at         timestamptz not null,
  grace_expires_at   timestamptz,
  will_renew         boolean not null default true,
  is_trial           boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (provider, original_transaction_id)
);
create index if not exists idx_subscriptions_student on public.subscriptions(student_id);
alter table public.subscriptions enable row level security;
drop policy if exists "subscriptions_select" on public.subscriptions;
create policy "subscriptions_select" on public.subscriptions for select
  using (student_id = auth.uid() or payer_id = auth.uid() or public.is_admin());
-- Yazma yok: yalnızca sunucu (servis rolü) doğrulanmış mağaza olaylarıyla yazar.

create table if not exists public.trial_usage (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  used_at    timestamptz not null default now()
);
alter table public.trial_usage enable row level security;
drop policy if exists "trial_usage_select" on public.trial_usage;
create policy "trial_usage_select" on public.trial_usage for select using (student_id = auth.uid() or public.is_admin());

create or replace function public.cita_effective_tier(p_student uuid)
returns text language sql security definer set search_path = public stable as $$
  select coalesce((
    select s.tier from public.subscriptions s
    where s.student_id = p_student
      and (
        (s.status in ('trialing','active','canceled') and s.expires_at > now())
        or (s.status = 'grace' and coalesce(s.grace_expires_at, s.expires_at) > now())
      )
    order by case s.tier when 'bire_bir' then 2 else 1 end desc
    limit 1), 'free');
$$;
revoke all on function public.cita_effective_tier(uuid) from public, anon;
grant execute on function public.cita_effective_tier(uuid) to authenticated, service_role;

create or replace function public.cita_my_tier()
returns text language sql security definer set search_path = public stable as $$
  select public.cita_effective_tier(auth.uid());
$$;
grant execute on function public.cita_my_tier() to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Onboarding önizlemesini hesaba aktarma (idempotent)
-- ---------------------------------------------------------------------------
create table if not exists public.plan_imports (
  student_id  uuid not null references public.profiles(id) on delete cascade,
  request_id  uuid not null,
  task_count  int not null,
  start_date  date not null,
  created_at  timestamptz not null default now(),
  primary key (student_id, request_id)
);
alter table public.plan_imports enable row level security;
drop policy if exists "plan_imports_select" on public.plan_imports;
create policy "plan_imports_select" on public.plan_imports for select using (student_id = auth.uid());

/*
  p_profile: {track, field, focus, goal, level, weakSubjects[], availability[7]}
  p_tasks:   [{date, subject, kind, title, minutes}]  (mobil önizlemeyle birebir)
  Dönüş: {status: 'imported'|'already_imported'|'plan_exists', task_count}
*/
create or replace function public.cita_import_onboarding(
  p_request_id uuid, p_start date, p_profile jsonb, p_tasks jsonb, p_target_minutes int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_track text := upper(coalesce(p_profile->>'track', ''));
  v_existing public.plan_imports;
  v_count int;
  v_task jsonb;
  v_avail int[];
begin
  if v_uid is null then raise exception 'auth_required' using errcode = '42501'; end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'student' then raise exception 'student_only' using errcode = '42501'; end if;

  -- Aynı kullanıcı için eşzamanlı çağrıları sırala.
  perform pg_advisory_xact_lock(hashtextextended('cita_import:' || v_uid::text, 0));

  select * into v_existing from public.plan_imports where student_id = v_uid and request_id = p_request_id;
  if found then
    return jsonb_build_object('status', 'already_imported', 'task_count', v_existing.task_count);
  end if;
  if exists (select 1 from public.plan_imports where student_id = v_uid) then
    return jsonb_build_object('status', 'plan_exists', 'task_count', 0);
  end if;

  -- Doğrulama
  if v_track not in ('YKS', 'LGS') then raise exception 'invalid_track'; end if;
  if p_start is null or p_start < public.cita_today() - 7 or p_start > public.cita_today() + 14 then
    raise exception 'invalid_start';
  end if;
  if jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) = 0 or jsonb_array_length(p_tasks) > 120 then
    raise exception 'invalid_tasks';
  end if;
  select array_agg(x::int) into v_avail from jsonb_array_elements_text(p_profile->'availability') x;
  if coalesce(array_length(v_avail, 1), 0) <> 7 or exists (select 1 from unnest(v_avail) a where a < 0 or a > 720) then
    raise exception 'invalid_availability';
  end if;
  if p_target_minutes is null or p_target_minutes < 30 or p_target_minutes > 6000 then
    raise exception 'invalid_target';
  end if;

  for v_task in select * from jsonb_array_elements(p_tasks) loop
    if (v_task->>'date')::date not between p_start and p_start + 6
       or coalesce(length(trim(v_task->>'title')), 0) = 0 or length(v_task->>'title') > 300
       or coalesce((v_task->>'minutes')::int, -1) not between 1 and 720
       or coalesce(v_task->>'kind', '') not in ('konu','soru','tekrar','deneme','analiz') then
      raise exception 'invalid_task: %', v_task;
    end if;
  end loop;

  perform set_config('app.cita_onboarding', 'on', true);
  update public.profiles set
    track = v_track,
    yks_field = case when v_track = 'YKS' then nullif(p_profile->>'field', '') end,
    yks_focus = case when v_track = 'YKS' then nullif(p_profile->>'focus', '') end,
    goal_text = left(coalesce(p_profile->>'goal', ''), 200),
    level = nullif(p_profile->>'level', ''),
    weak_subjects = coalesce(array(select jsonb_array_elements_text(p_profile->'weakSubjects')), '{}'),
    availability = v_avail,
    onboarded_at = coalesce(onboarded_at, now())
  where id = v_uid;
  perform set_config('app.cita_onboarding', 'off', true);

  insert into public.study_plan_items (student_id, plan_date, subject_id, title, planned_minutes, kind, source, sort_order)
  select v_uid, (t->>'date')::date,
         (select s.id from public.subjects s where s.name = t->>'subject' and s.track = v_track limit 1),
         left(trim(t->>'title'), 300), (t->>'minutes')::int, t->>'kind', 'onboarding', (ord - 1)::int
  from jsonb_array_elements(p_tasks) with ordinality as x(t, ord);
  get diagnostics v_count = row_count;

  insert into public.plan_state (student_id, revision, first_plan_date) values (v_uid, 1, p_start)
  on conflict (student_id) do update set first_plan_date = coalesce(plan_state.first_plan_date, excluded.first_plan_date);

  insert into public.weekly_targets (student_id, week_start, target_minutes)
  values (v_uid, p_start - (extract(isodow from p_start)::int - 1), p_target_minutes)
  on conflict do nothing;

  insert into public.plan_imports (student_id, request_id, task_count, start_date) values (v_uid, p_request_id, v_count, p_start);
  return jsonb_build_object('status', 'imported', 'task_count', v_count);
end;
$$;
revoke all on function public.cita_import_onboarding(uuid, date, jsonb, jsonb, int) from public, anon;
grant execute on function public.cita_import_onboarding(uuid, date, jsonb, jsonb, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Program değişikliği önerileri
-- ---------------------------------------------------------------------------
create table if not exists public.plan_proposals (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.profiles(id) on delete cascade,
  created_by       uuid not null references public.profiles(id),
  source           text not null check (source in ('chat','review','coach','system')),
  summary          text not null check (char_length(summary) between 1 and 500),
  ops              jsonb not null,
  base_revision    bigint not null,
  status           text not null default 'pending_student'
                   check (status in ('pending_student','pending_coach','applied','declined','stale','cancelled')),
  idempotency_key  text not null,
  student_decided_at timestamptz,
  coach_id         uuid references public.profiles(id),
  coach_note       text not null default '',
  decided_by       uuid references public.profiles(id),
  decided_at       timestamptz,
  applied_ops      jsonb,
  applied_revision bigint,
  conflict         text,
  created_at       timestamptz not null default now(),
  unique (student_id, idempotency_key)
);
create index if not exists idx_plan_proposals_student on public.plan_proposals(student_id, created_at desc);
create index if not exists idx_plan_proposals_coach_queue on public.plan_proposals(coach_id, status);
alter table public.plan_proposals enable row level security;
drop policy if exists "plan_proposals_select" on public.plan_proposals;
create policy "plan_proposals_select" on public.plan_proposals for select
  using (student_id = auth.uid() or public.is_coach_of(student_id));
-- Yazma yalnızca RPC'lerle.

-- Ops'u tek transaction içinde uygular; herhangi bir `before` uyuşmazsa 'stale'
-- istisnası atar (çağıran alt-transaction'ı geri alır). Doğrudan çağrılamaz.
create or replace function public.cita_apply_plan_ops(p_student uuid, p_ops jsonb, p_source text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_op jsonb;
  v_row public.study_plan_items;
  v_applied jsonb := '[]'::jsonb;
  v_new_id uuid;
  v_kind text;
begin
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) = 0 or jsonb_array_length(p_ops) > 30 then
    raise exception 'invalid_ops';
  end if;
  insert into public.plan_state (student_id) values (p_student) on conflict do nothing;
  perform 1 from public.plan_state where student_id = p_student for update;

  for v_op in select * from jsonb_array_elements(p_ops) loop
    v_kind := v_op->>'op';
    if v_kind in ('update', 'remove') then
      select * into v_row from public.study_plan_items
       where id = (v_op->>'id')::uuid and student_id = p_student for update;
      if not found
         or v_row.plan_date <> (v_op->'before'->>'date')::date
         or v_row.title <> v_op->'before'->>'title'
         or v_row.planned_minutes is distinct from (v_op->'before'->>'minutes')::int then
        raise exception 'stale: %', coalesce(v_op->'before'->>'title', '?') using errcode = 'P0001';
      end if;
    end if;
    if v_kind = 'add' or v_kind = 'update' then
      if (v_op->'after'->>'date') is null or coalesce(length(trim(v_op->'after'->>'title')), 0) = 0
         or length(v_op->'after'->>'title') > 300
         or ((v_op->'after'->>'minutes') is not null and (v_op->'after'->>'minutes')::int not between 0 and 720) then
        raise exception 'invalid_ops';
      end if;
    end if;
    if v_kind = 'add' then
      insert into public.study_plan_items (student_id, plan_date, title, planned_minutes, source, sort_order)
      values (p_student, (v_op->'after'->>'date')::date, trim(v_op->'after'->>'title'),
              (v_op->'after'->>'minutes')::int, p_source,
              coalesce((select max(sort_order) + 1 from public.study_plan_items
                        where student_id = p_student and plan_date = (v_op->'after'->>'date')::date), 0))
      returning id into v_new_id;
      v_applied := v_applied || jsonb_build_array(v_op || jsonb_build_object('id', v_new_id));
    elsif v_kind = 'update' then
      update public.study_plan_items set
        plan_date = (v_op->'after'->>'date')::date,
        title = trim(v_op->'after'->>'title'),
        planned_minutes = (v_op->'after'->>'minutes')::int
      where id = v_row.id;
      v_applied := v_applied || jsonb_build_array(v_op);
    elsif v_kind = 'remove' then
      delete from public.study_plan_items where id = v_row.id;
      v_applied := v_applied || jsonb_build_array(v_op);
    else
      raise exception 'invalid_ops';
    end if;
  end loop;
  return v_applied;
end;
$$;
revoke all on function public.cita_apply_plan_ops(uuid, jsonb, text) from public, anon, authenticated;

-- Öneri oluştur (sohbet/tekrar sunucusu öğrencinin oturumuyla çağırır). Idempotent.
create or replace function public.cita_create_proposal(p_idempotency_key text, p_source text, p_summary text, p_ops jsonb)
returns public.plan_proposals language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_rev bigint;
  v_p public.plan_proposals;
begin
  if v_uid is null then raise exception 'auth_required' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'student') then
    raise exception 'student_only' using errcode = '42501';
  end if;
  if p_source not in ('chat','review','system') then raise exception 'invalid_source'; end if;
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) = 0 or jsonb_array_length(p_ops) > 30 then
    raise exception 'invalid_ops';
  end if;
  if coalesce(length(p_idempotency_key), 0) not between 8 and 100 then raise exception 'invalid_key'; end if;

  select * into v_p from public.plan_proposals where student_id = v_uid and idempotency_key = p_idempotency_key;
  if found then return v_p; end if;

  select coalesce((select revision from public.plan_state where student_id = v_uid), 0) into v_rev;
  insert into public.plan_proposals (student_id, created_by, source, summary, ops, base_revision, idempotency_key)
  values (v_uid, v_uid, p_source, left(p_summary, 500), p_ops, v_rev, p_idempotency_key)
  on conflict (student_id, idempotency_key) do nothing
  returning * into v_p;
  if v_p.id is null then
    select * into v_p from public.plan_proposals where student_id = v_uid and idempotency_key = p_idempotency_key;
  end if;
  return v_p;
end;
$$;
revoke all on function public.cita_create_proposal(text, text, text, jsonb) from public, anon;
grant execute on function public.cita_create_proposal(text, text, text, jsonb) to authenticated;

-- Öğrenci kararı. Ücretsiz/Çita+: onayda atomik uygulanır.
-- Bire Bir (ve atanmış koç varsa): koç kuyruğuna gider; plan değişmez.
create or replace function public.cita_student_decide(p_proposal uuid, p_approve boolean)
returns public.plan_proposals language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_p public.plan_proposals;
  v_coach uuid;
  v_applied jsonb;
  v_rev bigint;
begin
  select * into v_p from public.plan_proposals where id = p_proposal for update;
  if not found or v_p.student_id <> v_uid then raise exception 'not_found' using errcode = '42501'; end if;
  if v_p.status <> 'pending_student' then return v_p; end if; -- tekrar deneme: mevcut durum

  if not p_approve then
    update public.plan_proposals set status = 'declined', student_decided_at = now(), decided_by = v_uid, decided_at = now()
    where id = p_proposal returning * into v_p;
    return v_p;
  end if;

  select coach_id into v_coach from public.profiles where id = v_uid;
  if public.cita_effective_tier(v_uid) = 'bire_bir' and v_coach is not null then
    update public.plan_proposals set status = 'pending_coach', student_decided_at = now(), coach_id = v_coach
    where id = p_proposal returning * into v_p;
    return v_p;
  end if;

  begin
    v_applied := public.cita_apply_plan_ops(v_uid, v_p.ops, 'proposal');
    select revision into v_rev from public.plan_state where student_id = v_uid;
    update public.plan_proposals set status = 'applied', student_decided_at = now(), decided_by = v_uid,
      decided_at = now(), applied_ops = v_applied, applied_revision = v_rev
    where id = p_proposal returning * into v_p;
  exception when others then
    if sqlerrm like 'stale%' then
      update public.plan_proposals set status = 'stale', student_decided_at = now(), conflict = sqlerrm
      where id = p_proposal returning * into v_p;
    else
      raise;
    end if;
  end;
  return v_p;
end;
$$;
revoke all on function public.cita_student_decide(uuid, boolean) from public, anon;
grant execute on function public.cita_student_decide(uuid, boolean) to authenticated;

-- Koç kararı: onayla / düzenleyip uygula / reddet.
create or replace function public.cita_coach_decide(p_proposal uuid, p_decision text, p_ops jsonb default null, p_note text default '')
returns public.plan_proposals language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_p public.plan_proposals;
  v_ops jsonb;
  v_applied jsonb;
  v_rev bigint;
begin
  select * into v_p from public.plan_proposals where id = p_proposal for update;
  if not found or not public.is_coach_of(v_p.student_id) then raise exception 'not_found' using errcode = '42501'; end if;
  if v_p.status <> 'pending_coach' then return v_p; end if;
  if p_decision not in ('approve','edit','decline') then raise exception 'invalid_decision'; end if;

  if p_decision = 'decline' then
    update public.plan_proposals set status = 'declined', decided_by = v_uid, decided_at = now(), coach_note = left(coalesce(p_note, ''), 500)
    where id = p_proposal returning * into v_p;
    return v_p;
  end if;

  v_ops := case when p_decision = 'edit' then p_ops else v_p.ops end;
  begin
    v_applied := public.cita_apply_plan_ops(v_p.student_id, v_ops, 'coach');
    select revision into v_rev from public.plan_state where student_id = v_p.student_id;
    update public.plan_proposals set status = 'applied', decided_by = v_uid, decided_at = now(),
      applied_ops = v_applied, applied_revision = v_rev, coach_note = left(coalesce(p_note, ''), 500)
    where id = p_proposal returning * into v_p;
  exception when others then
    if sqlerrm like 'stale%' then
      update public.plan_proposals set status = 'stale', decided_by = v_uid, decided_at = now(), conflict = sqlerrm
      where id = p_proposal returning * into v_p;
    else
      raise;
    end if;
  end;
  return v_p;
end;
$$;
revoke all on function public.cita_coach_decide(uuid, text, jsonb, text) from public, anon;
grant execute on function public.cita_coach_decide(uuid, text, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Kronometre ↔ görev
-- ---------------------------------------------------------------------------
alter table public.study_sessions add column if not exists plan_item_id uuid references public.study_plan_items(id) on delete set null;
alter table public.study_time_entries add column if not exists source text not null default 'manual' check (source in ('manual','timer'));
alter table public.study_time_entries add column if not exists study_session_id uuid references public.study_sessions(id) on delete set null;
create unique index if not exists uq_study_time_entries_session on public.study_time_entries(study_session_id) where study_session_id is not null;

-- Kronometreyi bitir: oturumu kapatır, süreyi tek kez kaydeder (tekrar denemede çift kayıt yok).
create or replace function public.cita_stop_study_session(p_session uuid, p_complete_task boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_s public.study_sessions;
  v_minutes int;
begin
  select * into v_s from public.study_sessions where id = p_session and student_id = v_uid for update;
  if not found then raise exception 'not_found' using errcode = '42501'; end if;
  if v_s.ended_at is null then
    v_minutes := greatest(0, round(extract(epoch from (now() - v_s.started_at)) / 60)::int);
    update public.study_sessions set ended_at = now(), minutes = v_minutes where id = v_s.id returning * into v_s;
  end if;
  if v_s.minutes > 0 then
    insert into public.study_time_entries (student_id, entry_date, minutes, subject_id, note, source, study_session_id)
    values (v_uid, (v_s.started_at at time zone 'Europe/Istanbul')::date, least(v_s.minutes, 1440), v_s.subject_id, '', 'timer', v_s.id)
    on conflict do nothing;
  end if;
  if v_s.plan_item_id is not null then
    update public.study_plan_items set
      actual_minutes = coalesce((select sum(minutes) from public.study_sessions where plan_item_id = v_s.plan_item_id and ended_at is not null), 0),
      completed = completed or p_complete_task
    where id = v_s.plan_item_id and student_id = v_uid;
  end if;
  return jsonb_build_object('session_id', v_s.id, 'minutes', v_s.minutes);
end;
$$;
revoke all on function public.cita_stop_study_session(uuid, boolean) from public, anon;
grant execute on function public.cita_stop_study_session(uuid, boolean) to authenticated;

-- Realtime: yeni tablolar
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['plan_proposals', 'student_badges', 'weekly_targets', 'subscriptions'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

-- ===================== migrations/009_cita_ai.sql =====================
-- ============================================================================
-- MIGRATION 009 — Çita AI: sohbet, kaynak kataloğu, soru fotoğrafı kotası,
-- yanlış defteri (Çita+), kişisel tekrar oturumları
-- ============================================================================
-- İlkeler:
--   * Sohbet ve soru fotoğrafları ÖZELDİR: yalnızca öğrenci görür (veli/koç görmez).
--   * Foto hakkı sunucuda, Europe/Istanbul gününe göre, satır kilidiyle düşer;
--     aynı Idempotency-Key ile tekrar deneme ikinci hak düşürmez; okunamayan
--     fotoğraf ve AI hatası hakkı iade eder.
--   * Paket gerektiren yazmalar RLS'te cita_effective_tier ile doğrulanır.
-- Idempotenttir.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Sohbet
-- ---------------------------------------------------------------------------
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null check (char_length(content) <= 6000),
  card        jsonb,
  provider    text,
  client_id   text,
  reply_to    uuid references public.chat_messages(id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists uq_chat_client on public.chat_messages(student_id, client_id) where client_id is not null;
create unique index if not exists uq_chat_reply on public.chat_messages(reply_to) where reply_to is not null;
create index if not exists idx_chat_student on public.chat_messages(student_id, created_at desc);
alter table public.chat_messages enable row level security;

drop policy if exists "chat_select_own" on public.chat_messages;
create policy "chat_select_own" on public.chat_messages for select using (student_id = auth.uid());
-- Öğrenci yalnızca kendi 'user' mesajını yazar; asistan cevabını sunucu (servis rolü) yazar.
drop policy if exists "chat_insert_own_user" on public.chat_messages;
create policy "chat_insert_own_user" on public.chat_messages for insert
  with check (student_id = auth.uid() and role = 'user' and card is null and provider is null);

-- ---------------------------------------------------------------------------
-- 2) Onaylı kaynak kataloğu (yönetim panelinden CRUD)
-- ---------------------------------------------------------------------------
create table if not exists public.resources (
  id           uuid primary key default gen_random_uuid(),
  exam         text not null check (exam in ('YKS', 'LGS')),
  exam_part    text check (exam_part in ('TYT', 'AYT', 'YDT', 'LGS')),
  subject      text not null,
  topic        text,
  level        text not null check (level in ('başlangıç', 'orta', 'ileri', 'tümü')),
  type         text not null check (type in ('kitap', 'soru bankası', 'video', 'deneme', 'site', 'uygulama', 'diğer')),
  title        text not null check (char_length(title) between 2 and 200),
  url          text check (url is null or url ~ '^https?://'),
  source_name  text not null default '',
  notes        text not null default '',
  approved     boolean not null default true,
  last_checked date not null default current_date,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_resources_lookup on public.resources(exam, subject, approved);
alter table public.resources enable row level security;
drop policy if exists "resources_read_approved" on public.resources;
create policy "resources_read_approved" on public.resources for select using (auth.uid() is not null and (approved or public.is_admin()));
drop policy if exists "resources_admin_all" on public.resources;
create policy "resources_admin_all" on public.resources for all using (public.is_admin()) with check (public.is_admin());
drop trigger if exists resources_touch on public.resources;
create trigger resources_touch before update on public.resources for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3) Soru fotoğrafı: istek kaydı + günlük kullanım
-- ---------------------------------------------------------------------------
create table if not exists public.photo_requests (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.profiles(id) on delete cascade,
  idempotency_key  text not null,
  quota_day        date not null,
  status           text not null default 'processing'
                   check (status in ('processing', 'hint', 'unreadable', 'failed', 'limit')),
  charged          boolean not null default false,
  image_path       text,
  subject          text,
  topic            text,
  question_text    text,
  hint             text,
  solution         jsonb,
  provider         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (student_id, idempotency_key)
);
create index if not exists idx_photo_requests_student on public.photo_requests(student_id, created_at desc);
alter table public.photo_requests enable row level security;
drop policy if exists "photo_requests_select_own" on public.photo_requests;
create policy "photo_requests_select_own" on public.photo_requests for select using (student_id = auth.uid());
drop trigger if exists photo_requests_touch on public.photo_requests;
create trigger photo_requests_touch before update on public.photo_requests for each row execute function public.touch_updated_at();

create table if not exists public.photo_usage (
  student_id uuid not null references public.profiles(id) on delete cascade,
  day        date not null,
  used       int  not null default 0 check (used >= 0),
  primary key (student_id, day)
);
alter table public.photo_usage enable row level security;
drop policy if exists "photo_usage_select_own" on public.photo_usage;
create policy "photo_usage_select_own" on public.photo_usage for select using (student_id = auth.uid());

create or replace function public.cita_photo_limit(p_student uuid)
returns int language sql security definer set search_path = public stable as $$
  select coalesce((select (value ->> public.cita_effective_tier(p_student))::int
                   from public.cita_settings where key = 'photo_limits'), 3);
$$;
revoke all on function public.cita_photo_limit(uuid) from public, anon;
grant execute on function public.cita_photo_limit(uuid) to authenticated, service_role;

create or replace function public.cita_photo_quota()
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'day', public.cita_today(),
    'limit', public.cita_photo_limit(auth.uid()),
    'used', coalesce((select used from public.photo_usage where student_id = auth.uid() and day = public.cita_today()), 0),
    'tier', public.cita_effective_tier(auth.uid()));
$$;
revoke all on function public.cita_photo_quota() from public, anon;
grant execute on function public.cita_photo_quota() to authenticated;

/*
  Hak ayır. Dönüş: {request: photo_requests satırı, outcome}
    outcome = 'reserved'  → yeni istek, 1 hak düştü (işlem başlasın)
            = 'existing'  → aynı anahtarla önceki istek (hak düşmez; sonucu döndür)
            = 'limit'     → günlük hak doldu (hak düşmez)
*/
create or replace function public.cita_reserve_photo(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := public.cita_today();
  v_limit int;
  v_used int;
  v_req public.photo_requests;
begin
  if v_uid is null then raise exception 'auth_required' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'student') then
    raise exception 'student_only' using errcode = '42501';
  end if;
  if coalesce(length(p_key), 0) not between 8 and 100 then raise exception 'invalid_key'; end if;

  select * into v_req from public.photo_requests where student_id = v_uid and idempotency_key = p_key;
  if found then
    return jsonb_build_object('outcome', 'existing', 'request', to_jsonb(v_req));
  end if;

  insert into public.photo_usage (student_id, day) values (v_uid, v_day) on conflict do nothing;
  select used into v_used from public.photo_usage where student_id = v_uid and day = v_day for update;

  -- Kilidi aldıktan sonra aynı anahtarlı eşzamanlı isteği tekrar kontrol et.
  select * into v_req from public.photo_requests where student_id = v_uid and idempotency_key = p_key;
  if found then
    return jsonb_build_object('outcome', 'existing', 'request', to_jsonb(v_req));
  end if;

  v_limit := public.cita_photo_limit(v_uid);
  if v_used >= v_limit then
    return jsonb_build_object('outcome', 'limit', 'used', v_used, 'limit', v_limit);
  end if;

  update public.photo_usage set used = used + 1 where student_id = v_uid and day = v_day;
  insert into public.photo_requests (student_id, idempotency_key, quota_day, charged)
  values (v_uid, p_key, v_day, true) returning * into v_req;
  return jsonb_build_object('outcome', 'reserved', 'request', to_jsonb(v_req), 'used', v_used + 1, 'limit', v_limit);
end;
$$;
revoke all on function public.cita_reserve_photo(text) from public, anon;
grant execute on function public.cita_reserve_photo(text) to authenticated;

/*
  Sonucu işle (yalnızca sunucu / servis rolü). 'unreadable' ve 'failed' hakkı
  bir kez iade eder (charged=false'a çekilir; tekrar çağrı ikinci iade yapmaz).
*/
create or replace function public.cita_finish_photo(
  p_request uuid, p_status text, p_fields jsonb default '{}'::jsonb
) returns public.photo_requests language plpgsql security definer set search_path = public as $$
declare v_req public.photo_requests;
begin
  if auth.role() <> 'service_role' then raise exception 'service_only' using errcode = '42501'; end if;
  if p_status not in ('hint', 'unreadable', 'failed') then raise exception 'invalid_status'; end if;
  select * into v_req from public.photo_requests where id = p_request for update;
  if not found then raise exception 'not_found'; end if;

  if p_status in ('unreadable', 'failed') and v_req.charged then
    update public.photo_usage set used = greatest(0, used - 1)
    where student_id = v_req.student_id and day = v_req.quota_day;
    v_req.charged := false;
  end if;

  update public.photo_requests set
    status = p_status,
    charged = v_req.charged,
    image_path = coalesce(p_fields->>'image_path', image_path),
    subject = coalesce(p_fields->>'subject', subject),
    topic = coalesce(p_fields->>'topic', topic),
    question_text = coalesce(p_fields->>'question_text', question_text),
    hint = coalesce(p_fields->>'hint', hint),
    solution = coalesce(p_fields->'solution', solution),
    provider = coalesce(p_fields->>'provider', provider)
  where id = p_request returning * into v_req;
  return v_req;
end;
$$;
revoke all on function public.cita_finish_photo(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.cita_finish_photo(uuid, text, jsonb) to service_role;

-- Özel depolama: yalnızca sahibi okur; yükleme sunucudan (servis rolü).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-photos', 'question-photos', false, 6291456, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = false;

drop policy if exists "question_photos_owner_read" on storage.objects;
create policy "question_photos_owner_read" on storage.objects for select
  using (bucket_id = 'question-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 4) Yanlış defteri (Çita+ ve Bire Bir)
-- ---------------------------------------------------------------------------
create table if not exists public.mistakes (
  id                    uuid primary key default gen_random_uuid(),
  student_id            uuid not null references public.profiles(id) on delete cascade,
  photo_request_id      uuid references public.photo_requests(id) on delete set null,
  subject               text not null,
  topic                 text,
  question_text         text not null default '' check (char_length(question_text) <= 4000),
  error_type            text check (error_type in ('kavram','denklem_kurma','islem','soru_okuma','dikkat','sure','bilgi','diger')),
  error_type_suggested  text,
  error_type_confirmed  boolean not null default false,
  learning_note         text not null default '' check (char_length(learning_note) <= 1000),
  last_reviewed_at      timestamptz,
  next_review_date      date,
  created_at            timestamptz not null default now(),
  unique (student_id, photo_request_id)
);
create index if not exists idx_mistakes_student on public.mistakes(student_id, created_at desc);
alter table public.mistakes enable row level security;

drop policy if exists "mistakes_select" on public.mistakes;
create policy "mistakes_select" on public.mistakes for select
  using (student_id = auth.uid() or public.is_coach_of(student_id));
drop policy if exists "mistakes_insert_plus" on public.mistakes;
create policy "mistakes_insert_plus" on public.mistakes for insert
  with check (student_id = auth.uid() and public.cita_effective_tier(auth.uid()) in ('plus', 'bire_bir'));
drop policy if exists "mistakes_update_plus" on public.mistakes;
create policy "mistakes_update_plus" on public.mistakes for update
  using (student_id = auth.uid() and public.cita_effective_tier(auth.uid()) in ('plus', 'bire_bir'))
  with check (student_id = auth.uid());
drop policy if exists "mistakes_delete_own" on public.mistakes;
create policy "mistakes_delete_own" on public.mistakes for delete using (student_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5) Kişisel tekrar oturumları (sunucu üretir ve doğrular)
-- ---------------------------------------------------------------------------
create table if not exists public.review_sessions (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.profiles(id) on delete cascade,
  mistake_id       uuid not null references public.mistakes(id) on delete cascade,
  idempotency_key  text not null,
  items            jsonb not null,
  status           text not null default 'active' check (status in ('active', 'completed')),
  results          jsonb,
  summary          text,
  next_review_date date,
  proposal_id      uuid references public.plan_proposals(id) on delete set null,
  provider         text not null,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz,
  unique (student_id, idempotency_key)
);
alter table public.review_sessions enable row level security;
drop policy if exists "review_sessions_select" on public.review_sessions;
create policy "review_sessions_select" on public.review_sessions for select
  using (student_id = auth.uid() or public.is_coach_of(student_id));
-- Yazma yok: oturumlar sunucuda üretilir/doğrulanır (servis rolü).

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['chat_messages', 'photo_requests'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

-- Başlangıç kataloğu: YALNIZCA resmi/kurumsal kaynaklar (ekip panelden genişletir).
insert into public.resources (exam, exam_part, subject, topic, level, type, title, url, source_name, notes, last_checked)
select * from (values
  ('YKS', null::text, 'Genel', null::text, 'tümü', 'site', 'ÖSYM YKS sayfası (kılavuz, takvim, çıkmış sorular)', 'https://www.osym.gov.tr', 'ÖSYM', 'Resmî kaynak', date '2026-11-14'),
  ('LGS', 'LGS', 'Genel', null::text, 'tümü', 'site', 'MEB LGS örnek sorular ve kılavuz', 'https://www.meb.gov.tr', 'MEB', 'Resmî kaynak', date '2026-11-14'),
  ('YKS', null::text, 'Genel', null::text, 'tümü', 'video', 'MEB EBA ders videoları', 'https://www.eba.gov.tr', 'MEB EBA', 'Resmî kaynak', date '2026-11-14'),
  ('LGS', 'LGS', 'Genel', null::text, 'tümü', 'video', 'MEB EBA 8. sınıf içerikleri', 'https://www.eba.gov.tr', 'MEB EBA', 'Resmî kaynak', date '2026-11-14')
) as v(exam, exam_part, subject, topic, level, type, title, url, source_name, notes, last_checked)
where not exists (select 1 from public.resources r where r.title = v.title);

-- ===================== migrations/010_cita_parent_billing_admin.sql =====================
-- ============================================================================
-- MIGRATION 010 — Veli erişimi, satın alma niyeti/olayları, koç atama
-- ============================================================================
-- * Veli, öğrencinin ürettiği tek kullanımlık, 24 saat geçerli kodla bağlanır.
--   Deneme sayısı sınırlıdır. Veli ham tablolara erişemez; yalnızca
--   cita_parent_weekly_summary toplamlarını görür (sohbet/foto ASLA).
-- * Satın alma önce "niyet" ile başlar: ödeyen (öğrenci ya da bağlı veli) ve
--   lehine satın alınan öğrenci sunucuda doğrulanır. Niyet kimliği mağazaya
--   appAccountToken / obfuscatedAccountId olarak gider; doğrulanan mağaza
--   olayı bu kimlikle DOĞRU öğrenciye bağlanır.
-- * Mağaza olayları (billing_events) event_id ile tek kez işlenir.
-- * Bire Bir satın alınınca öğrenci koç atama kuyruğuna girer; yönetici atar.
-- Idempotenttir.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Veli bağlantısı
-- ---------------------------------------------------------------------------
create table if not exists public.parent_link_codes (
  code        text primary key,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_by     uuid references public.profiles(id),
  used_at     timestamptz
);
alter table public.parent_link_codes enable row level security;
drop policy if exists "parent_codes_student_select" on public.parent_link_codes;
create policy "parent_codes_student_select" on public.parent_link_codes for select using (student_id = auth.uid());

create table if not exists public.parent_links (
  parent_id   uuid not null references public.profiles(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'active' check (status in ('active', 'revoked')),
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  primary key (parent_id, student_id)
);
alter table public.parent_links enable row level security;
drop policy if exists "parent_links_select" on public.parent_links;
create policy "parent_links_select" on public.parent_links for select
  using (parent_id = auth.uid() or student_id = auth.uid() or public.is_admin());

create table if not exists public.parent_code_attempts (
  id         bigserial primary key,
  parent_id  uuid not null references public.profiles(id) on delete cascade,
  ok         boolean not null,
  created_at timestamptz not null default now()
);
alter table public.parent_code_attempts enable row level security;

create or replace function public.is_parent_of(p_student uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.parent_links l
                 where l.parent_id = auth.uid() and l.student_id = p_student and l.status = 'active');
$$;

-- Öğrenci (yalnızca LGS) veli kodu üretir; önceki kullanılmamış kodlar geçersizleşir.
create or replace function public.cita_create_parent_code()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i int;
begin
  if not exists (select 1 from public.profiles where id = v_uid and role = 'student' and track = 'LGS') then
    raise exception 'lgs_student_only' using errcode = '42501';
  end if;
  delete from public.parent_link_codes where student_id = v_uid and used_at is null;
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.parent_link_codes where code = v_code);
  end loop;
  insert into public.parent_link_codes (code, student_id, expires_at) values (v_code, v_uid, now() + interval '24 hours');
  return jsonb_build_object('code', v_code, 'expires_at', now() + interval '24 hours');
end;
$$;
revoke all on function public.cita_create_parent_code() from public, anon;
grant execute on function public.cita_create_parent_code() to authenticated;

-- Veli kodu kullanır. Saatte en fazla 10 başarısız deneme.
create or replace function public.cita_redeem_parent_code(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.parent_link_codes;
begin
  if not exists (select 1 from public.profiles where id = v_uid and role = 'parent') then
    return 'not_parent';
  end if;
  if (select count(*) from public.parent_code_attempts
      where parent_id = v_uid and not ok and created_at > now() - interval '1 hour') >= 10 then
    return 'rate_limited';
  end if;
  select * into v_row from public.parent_link_codes
   where code = upper(trim(coalesce(p_code, ''))) for update;
  if not found or v_row.used_at is not null or v_row.expires_at < now() then
    insert into public.parent_code_attempts (parent_id, ok) values (v_uid, false);
    return 'invalid';
  end if;
  update public.parent_link_codes set used_by = v_uid, used_at = now() where code = v_row.code;
  insert into public.parent_links (parent_id, student_id) values (v_uid, v_row.student_id)
  on conflict (parent_id, student_id) do update set status = 'active', revoked_at = null;
  insert into public.parent_code_attempts (parent_id, ok) values (v_uid, true);
  return 'ok';
end;
$$;
revoke all on function public.cita_redeem_parent_code(text) from public, anon;
grant execute on function public.cita_redeem_parent_code(text) to authenticated;

-- Öğrenci ya da veli bağlantıyı kaldırır.
create or replace function public.cita_revoke_parent_link(p_parent uuid, p_student uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is distinct from p_parent and auth.uid() is distinct from p_student then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.parent_links set status = 'revoked', revoked_at = now()
  where parent_id = p_parent and student_id = p_student;
end;
$$;
revoke all on function public.cita_revoke_parent_link(uuid, uuid) from public, anon;
grant execute on function public.cita_revoke_parent_link(uuid, uuid) to authenticated;

create or replace function public.cita_parent_students()
returns table (student_id uuid, full_name text, track text, tier text)
language sql security definer set search_path = public stable as $$
  select p.id, p.full_name, p.track, public.cita_effective_tier(p.id)
  from public.parent_links l join public.profiles p on p.id = l.student_id
  where l.parent_id = auth.uid() and l.status = 'active';
$$;
revoke all on function public.cita_parent_students() from public, anon;
grant execute on function public.cita_parent_students() to authenticated;

-- Haftalık özet: yalnızca toplamlar. Sohbet, foto, yanlış defteri, not içeriği YOK.
create or replace function public.cita_parent_weekly_summary(p_student uuid, p_week_start date)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare
  v_end date := p_week_start + 6;
begin
  if not public.is_parent_of(p_student) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if extract(isodow from p_week_start) <> 1 then raise exception 'week_start_must_be_monday'; end if;
  return jsonb_build_object(
    'week_start', p_week_start,
    'planned_tasks', (select count(*) from public.study_plan_items where student_id = p_student and plan_date between p_week_start and v_end),
    'completed_tasks', (select count(*) from public.study_plan_items where student_id = p_student and plan_date between p_week_start and v_end and completed),
    'planned_minutes', (select coalesce(sum(planned_minutes), 0) from public.study_plan_items where student_id = p_student and plan_date between p_week_start and v_end),
    'study_minutes', (select coalesce(sum(minutes), 0) from public.cita_study_minutes where student_id = p_student and day between p_week_start and v_end),
    'days', (select coalesce(jsonb_agg(d order by d->>'date'), '[]'::jsonb) from (
        select jsonb_build_object('date', g::date,
          'planned', (select count(*) from public.study_plan_items where student_id = p_student and plan_date = g::date),
          'completed', (select count(*) from public.study_plan_items where student_id = p_student and plan_date = g::date and completed),
          'minutes', (select coalesce(sum(minutes), 0) from public.cita_study_minutes where student_id = p_student and day = g::date)) as d
        from generate_series(p_week_start, v_end, interval '1 day') g) x),
    'exam_trend', (select coalesce(jsonb_agg(t order by t->>'date'), '[]'::jsonb) from (
        select jsonb_build_object('type', e.exam_type, 'date', e.exam_date,
               'net', round((select coalesce(sum(r.net), 0) from public.exam_results r where r.exam_id = e.id), 2)) as t
        from public.exams e where e.student_id = p_student
        order by e.exam_date desc limit 8) y),
    'tier', public.cita_effective_tier(p_student)
  );
end;
$$;
revoke all on function public.cita_parent_weekly_summary(uuid, date) from public, anon;
grant execute on function public.cita_parent_weekly_summary(uuid, date) to authenticated;

-- Veli, bağlı öğrencinin aboneliğini görebilir (ödeme durumu için).
drop policy if exists "subscriptions_select" on public.subscriptions;
create policy "subscriptions_select" on public.subscriptions for select
  using (student_id = auth.uid() or payer_id = auth.uid() or public.is_parent_of(student_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- 2) Satın alma niyeti ve mağaza olayları
-- ---------------------------------------------------------------------------
create table if not exists public.purchase_intents (
  id          uuid primary key default gen_random_uuid(),
  payer_id    uuid not null references public.profiles(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  tier        text not null check (tier in ('plus', 'bire_bir')),
  product_id  text not null,
  platform    text not null check (platform in ('ios', 'android', 'test')),
  status      text not null default 'pending' check (status in ('pending', 'completed', 'abandoned')),
  created_at  timestamptz not null default now()
);
alter table public.purchase_intents enable row level security;
drop policy if exists "purchase_intents_select" on public.purchase_intents;
create policy "purchase_intents_select" on public.purchase_intents for select
  using (payer_id = auth.uid() or student_id = auth.uid() or public.is_admin());

create or replace function public.cita_create_purchase_intent(p_student uuid, p_tier text, p_product text, p_platform text)
returns public.purchase_intents language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_i public.purchase_intents;
begin
  if v_uid is null then raise exception 'auth_required' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = p_student and role = 'student') then
    raise exception 'student_not_found' using errcode = '42501';
  end if;
  -- Ödeyen ya öğrencinin kendisi ya da aktif bağlı velisi olmalı.
  if not (v_uid = p_student or public.is_parent_of(p_student)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_tier not in ('plus', 'bire_bir') or p_platform not in ('ios', 'android', 'test') then
    raise exception 'invalid_input';
  end if;
  insert into public.purchase_intents (payer_id, student_id, tier, product_id, platform)
  values (v_uid, p_student, p_tier, p_product, p_platform) returning * into v_i;
  return v_i;
end;
$$;
revoke all on function public.cita_create_purchase_intent(uuid, text, text, text) from public, anon;
grant execute on function public.cita_create_purchase_intent(uuid, text, text, text) to authenticated;

create table if not exists public.billing_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null check (provider in ('test', 'app_store', 'play_store')),
  event_id     text not null,
  intent_id    uuid references public.purchase_intents(id),
  student_id   uuid references public.profiles(id) on delete set null,
  type         text not null,
  payload      jsonb not null default '{}'::jsonb,
  result       jsonb,
  created_at   timestamptz not null default now(),
  unique (provider, event_id)
);
alter table public.billing_events enable row level security;
drop policy if exists "billing_events_admin" on public.billing_events;
create policy "billing_events_admin" on public.billing_events for select using (public.is_admin());

alter table public.subscriptions add column if not exists intent_id uuid references public.purchase_intents(id);
alter table public.subscriptions add column if not exists replaced_by uuid references public.subscriptions(id);

-- Aynı öğrencide aynı anda en fazla bir otomatik yenilenen abonelik (çift ücretlendirme yok).
create unique index if not exists uq_subscriptions_one_renewing
  on public.subscriptions(student_id)
  where will_renew and status in ('trialing', 'active', 'grace', 'billing_retry');

-- ---------------------------------------------------------------------------
-- 3) Koç atama kuyruğu (Bire Bir)
-- ---------------------------------------------------------------------------
create table if not exists public.coach_assignment_requests (
  student_id     uuid primary key references public.profiles(id) on delete cascade,
  status         text not null default 'waiting' check (status in ('waiting', 'assigned', 'cancelled')),
  requested_at   timestamptz not null default now(),
  assigned_coach uuid references public.profiles(id),
  assigned_by    uuid references public.profiles(id),
  assigned_at    timestamptz,
  note           text not null default ''
);
alter table public.coach_assignment_requests enable row level security;
drop policy if exists "coach_requests_select" on public.coach_assignment_requests;
create policy "coach_requests_select" on public.coach_assignment_requests for select
  using (student_id = auth.uid() or public.is_admin() or assigned_coach = auth.uid());

create table if not exists public.coach_assignment_log (
  id          bigserial primary key,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  old_coach   uuid,
  new_coach   uuid,
  admin_id    uuid not null references public.profiles(id),
  created_at  timestamptz not null default now()
);
alter table public.coach_assignment_log enable row level security;
drop policy if exists "coach_log_admin" on public.coach_assignment_log;
create policy "coach_log_admin" on public.coach_assignment_log for select using (public.is_admin());

create or replace function public.cita_admin_assign_coach(p_student uuid, p_coach uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_old uuid;
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = p_student and role = 'student') then return 'student_not_found'; end if;
  if p_coach is not null and not exists (select 1 from public.profiles where id = p_coach and role = 'coach') then return 'coach_not_found'; end if;
  select coach_id into v_old from public.profiles where id = p_student;
  perform set_config('app.cita_admin', 'on', true);
  update public.profiles set coach_id = p_coach where id = p_student;
  perform set_config('app.cita_admin', 'off', true);
  insert into public.coach_assignment_log (student_id, old_coach, new_coach, admin_id) values (p_student, v_old, p_coach, auth.uid());
  insert into public.coach_assignment_requests (student_id, status, assigned_coach, assigned_by, assigned_at)
  values (p_student, case when p_coach is null then 'waiting' else 'assigned' end, p_coach, auth.uid(), now())
  on conflict (student_id) do update set
    status = excluded.status, assigned_coach = excluded.assigned_coach, assigned_by = excluded.assigned_by, assigned_at = excluded.assigned_at;
  return 'ok';
end;
$$;
revoke all on function public.cita_admin_assign_coach(uuid, uuid) from public, anon;
grant execute on function public.cita_admin_assign_coach(uuid, uuid) to authenticated;

-- Yönetici listesi: Bire Bir öğrencileri ve atama durumu
create or replace function public.cita_admin_students()
returns table (student_id uuid, full_name text, email text, track text, tier text, coach_id uuid, coach_name text, request_status text, requested_at timestamptz)
language sql security definer set search_path = public stable as $$
  select p.id, p.full_name, p.email, p.track, public.cita_effective_tier(p.id), p.coach_id, c.full_name, r.status, r.requested_at
  from public.profiles p
  left join public.profiles c on c.id = p.coach_id
  left join public.coach_assignment_requests r on r.student_id = p.id
  where p.role = 'student' and public.is_admin()
  order by (r.status = 'waiting') desc nulls last, r.requested_at nulls last, p.created_at desc;
$$;
revoke all on function public.cita_admin_students() from public, anon;
grant execute on function public.cita_admin_students() to authenticated;

-- ===================== migrations/011_cita_exams.sql =====================
-- ============================================================================
-- MIGRATION 011 — Deneme kaydı: atomik + idempotent
-- ============================================================================
-- Sunucu (/api/cita/exams) sınav kurallarını (ders listesi, soru sayıları,
-- yanlış katsayısı) @cita/core ile doğrular; bu RPC deneme + ders sonuçlarını
-- tek transaction'da ve client_id ile tekrar denemeye dayanıklı yazar. Doğrudan
-- çağrılara karşı temel tutarlılık burada da denetlenir.
-- ============================================================================
create or replace function public.cita_save_exam(
  p_client_id uuid, p_exam_type text, p_name text, p_date date, p_rows jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_track text;
  v_exam uuid;
  v_penalty numeric;
  v_row jsonb;
  v_subject uuid;
  v_q int; v_c int; v_w int; v_b int;
begin
  select track into v_track from public.profiles where id = v_uid and role = 'student';
  if v_track is null then raise exception 'student_only' using errcode = '42501'; end if;

  select id into v_exam from public.exams where student_id = v_uid and client_id = p_client_id;
  if found then return jsonb_build_object('exam_id', v_exam, 'status', 'existing'); end if;

  if (v_track = 'YKS' and p_exam_type not in ('TYT','AYT','YDT','Branş'))
     or (v_track = 'LGS' and p_exam_type not in ('LGS','Sayısal','Sözel','Branş')) then
    raise exception 'invalid_exam_type';
  end if;
  if p_date is null or p_date > public.cita_today() + 1 or p_date < public.cita_today() - 400 then raise exception 'invalid_date'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 12 then raise exception 'invalid_rows'; end if;
  v_penalty := case when v_track = 'LGS' then 3 else 4 end;

  insert into public.exams (student_id, exam_date, name, exam_type, client_id)
  values (v_uid, p_date, left(coalesce(nullif(trim(p_name), ''), p_exam_type || ' denemesi'), 120), p_exam_type, p_client_id)
  returning id into v_exam;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    select id into v_subject from public.subjects where name = v_row->>'subject' and track = v_track;
    if v_subject is null then raise exception 'invalid_subject: %', v_row->>'subject'; end if;
    v_q := (v_row->>'questions')::int; v_c := (v_row->>'correct')::int; v_w := (v_row->>'wrong')::int; v_b := (v_row->>'blank')::int;
    if v_q is null or v_q < 1 or v_q > 80 or v_c < 0 or v_w < 0 or v_b < 0 or v_c + v_w + v_b <> v_q then
      raise exception 'invalid_counts: %', v_row->>'subject';
    end if;
    insert into public.exam_results (exam_id, subject_id, correct_count, wrong_count, blank_count, wrong_penalty, question_count)
    values (v_exam, v_subject, v_c, v_w, v_b, v_penalty, v_q);
  end loop;

  perform public.cita_refresh_badges(v_uid);
  return jsonb_build_object('exam_id', v_exam, 'status', 'created');
end;
$$;
revoke all on function public.cita_save_exam(uuid, text, text, date, jsonb) from public, anon;
grant execute on function public.cita_save_exam(uuid, text, text, date, jsonb) to authenticated;

-- ===================== migrations/012_cita_account_deletion.sql =====================
-- ============================================================================
-- MIGRATION 012 — Hesap silme Çita tablolarında takılmasın
-- ============================================================================
-- Uçtan uca test, kullanıcı silmenin (auth.users → profiles) Çita'nın "kim
-- onayladı / kim ödedi / kim atadı" gibi denetim bağlantılarına takıldığını
-- gösterdi. Bu bağlantılar artık kişi silinince NULL olur (kayıt korunur,
-- kişi bilgisi düşer); öğrencinin kendi verisi zaten CASCADE ile silinir.
-- Mevcut CoachReachAI tablolarına (goals, notes, weekly_sessions) dokunulmaz.
-- Ayrıca: öğrenci silinirken görevleri CASCADE ile silinir; revizyon tetikleyicisi
-- silinmekte olan öğrenci için plan_state yazmaya çalışıp silmeyi bozuyordu.
-- Idempotenttir.
-- ============================================================================

create or replace function public.bump_plan_revision()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_student uuid := coalesce(new.student_id, old.student_id);
begin
  if tg_op = 'UPDATE'
     and new.plan_date = old.plan_date and new.title = old.title
     and new.planned_minutes is not distinct from old.planned_minutes
     and new.student_id = old.student_id then
    return null;
  end if;
  -- Öğrencinin kendisi siliniyorsa (CASCADE) revizyon tutmaya gerek yok.
  if tg_op = 'DELETE' and not exists (select 1 from public.profiles where id = v_student) then
    return null;
  end if;
  insert into public.plan_state (student_id, revision) values (v_student, 1)
  on conflict (student_id) do update set revision = plan_state.revision + 1, updated_at = now();
  return null;
end;
$$;

do $$
declare
  r record;
begin
  for r in select * from (values
    ('subscriptions',             'payer_id',       'profiles',         true),
    ('subscriptions',             'intent_id',      'purchase_intents', false),
    ('subscriptions',             'replaced_by',    'subscriptions',    false),
    ('plan_proposals',            'created_by',     'profiles',         true),
    ('plan_proposals',            'coach_id',       'profiles',         false),
    ('plan_proposals',            'decided_by',     'profiles',         false),
    ('resources',                 'created_by',     'profiles',         false),
    ('parent_link_codes',         'used_by',        'profiles',         false),
    ('billing_events',            'intent_id',      'purchase_intents', false),
    ('coach_assignment_requests', 'assigned_by',    'profiles',         false),
    ('coach_assignment_requests', 'assigned_coach', 'profiles',         false),
    ('coach_assignment_log',      'admin_id',       'profiles',         true)
  ) as t(tbl, col, ref, drop_not_null)
  loop
    if r.drop_not_null then
      execute format('alter table public.%I alter column %I drop not null', r.tbl, r.col);
    end if;
    execute format('alter table public.%I drop constraint if exists %I', r.tbl, r.tbl || '_' || r.col || '_fkey');
    execute format('alter table public.%I add constraint %I foreign key (%I) references public.%I(id) on delete set null',
                   r.tbl, r.tbl || '_' || r.col || '_fkey', r.col, r.ref);
  end loop;
end;
$$;
