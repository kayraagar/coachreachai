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
