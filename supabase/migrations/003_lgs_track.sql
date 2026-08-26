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
