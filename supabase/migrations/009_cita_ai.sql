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
