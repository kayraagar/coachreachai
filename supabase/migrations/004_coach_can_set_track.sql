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
