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
