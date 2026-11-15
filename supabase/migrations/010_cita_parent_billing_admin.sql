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
