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
