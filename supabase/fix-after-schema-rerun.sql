-- ============================================================================
-- DÜZELTME: Mevcut (ana) projede schema.sql yanlışlıkla yeniden çalıştırıldıysa
-- ============================================================================
-- schema.sql veriyi silmez, ama handle_new_user() fonksiyonunu ESKİ hâline
-- döndürür. Sonuç: yeni kayıtlarda koç kodu eşleşmesi, sınav kolu (YKS/LGS) ve
-- yeni koçların davet kodu çalışmaz. Bu dosya, migration 003'teki (004–007
-- değiştirmedi) doğru sürümü geri yükler. Idempotent; tekrar çalıştırılabilir.
-- Çita migration'larını (008–011) İÇERMEZ; ana projeye dokunmaz.
-- ============================================================================

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

-- Bu arada kayıt olan koçlara davet kodu ver.
update public.profiles
set invite_code = public.gen_invite_code()
where role = 'coach' and invite_code is null;

-- schema.sql, 005'te kaldırılan eski "koç yalnızca ekler" politikasını geri koyar.
-- Zararsızdır (005'teki study_plan_coach_all zaten kapsar) ama temizlik için kaldır.
drop policy if exists "study_plan_coach_write" on public.study_plan_items;

-- KONTROL: kazadan sonra koç kodsuz/sınav kolu YKS kalmış olabilecek yeni öğrenciler
-- (son 7 gün). Varsa koçlarına sor; koç kodu sonradan "Koçuma bağlan" ile girilebilir.
select id, email, full_name, track, coach_id, created_at
from public.profiles
where role = 'student' and created_at > now() - interval '7 days'
order by created_at desc;
