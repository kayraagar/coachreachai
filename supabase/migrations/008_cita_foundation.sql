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
