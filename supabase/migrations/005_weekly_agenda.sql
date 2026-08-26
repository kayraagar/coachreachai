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
