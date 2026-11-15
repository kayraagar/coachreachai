-- 012: Çita ilişkileri olan kullanıcılar (öğrenci, veli, koç, yönetici) silinebilmeli;
-- denetim kayıtları kalır, kişi alanı NULL olur.
\set QUIET on
set client_min_messages = notice;

do $$
declare
  v_s uuid; v_par uuid; v_coach uuid; v_admin uuid; v_item uuid;
  v_p public.plan_proposals; v_i public.purchase_intents; v_code text;
begin
  v_coach := tests.create_user('d-coach@test', '{"role":"coach"}');
  v_admin := tests.create_user('d-admin@test', '{"role":"coach"}');
  update public.profiles set is_admin = true where id = v_admin;
  v_s     := tests.create_user('d-s@test', '{"role":"student","track":"LGS"}');
  v_par   := tests.create_user('d-par@test', '{"role":"parent"}');

  -- Veli bağlantısı + velinin ödediği abonelik + olay
  perform tests.login(v_s);
  v_code := public.cita_create_parent_code()->>'code';
  perform tests.logout();
  perform tests.login(v_par);
  perform public.cita_redeem_parent_code(v_code);
  v_i := public.cita_create_purchase_intent(v_s, 'bire_bir', 'cita_birebir_monthly', 'test');
  perform tests.logout();
  insert into public.subscriptions (student_id, payer_id, tier, status, provider, product_id, original_transaction_id, expires_at, intent_id)
  values (v_s, v_par, 'bire_bir', 'active', 'test', 'cita_birebir_monthly', 'd-tx', now() + interval '30 days', v_i.id);
  insert into public.billing_events (provider, event_id, intent_id, student_id, type) values ('test', 'd-evt', v_i.id, v_s, 'purchase');

  -- Yönetici koç atar, koç öneriyi onaylar, yönetici kaynak ekler
  perform tests.login(v_admin);
  perform public.cita_admin_assign_coach(v_s, v_coach);
  insert into public.resources (exam, subject, level, type, title, created_by) values ('LGS', 'Matematik', 'orta', 'kitap', 'Silme testi kaynağı', v_admin);
  perform tests.logout();
  insert into public.study_plan_items (student_id, plan_date, title, planned_minutes) values (v_s, public.cita_today(), 'Mat', 30) returning id into v_item;
  perform tests.login(v_s);
  v_p := public.cita_create_proposal('del-key-0001', 'chat', 'kısalt', jsonb_build_array(jsonb_build_object('op','update','id',v_item,
    'before', jsonb_build_object('date',public.cita_today(),'title','Mat','minutes',30),
    'after',  jsonb_build_object('date',public.cita_today(),'title','Mat','minutes',20))));
  v_p := public.cita_student_decide(v_p.id, true);
  perform tests.logout();
  perform tests.eq(v_p.status, 'pending_coach', 'setup: proposal in coach queue');
  perform tests.login(v_coach);
  v_p := public.cita_coach_decide(v_p.id, 'approve');
  perform tests.logout();
  perform tests.eq(v_p.status, 'applied', 'setup: coach approved');

  -- Silmeler (Supabase'de auth.users silmek profili CASCADE ile siler)
  delete from auth.users where id = v_par;
  perform tests.ok(not exists (select 1 from public.profiles where id = v_par), 'paying parent can be deleted');
  perform tests.ok((select payer_id is null and student_id = v_s from public.subscriptions where original_transaction_id = 'd-tx'), 'subscription kept for student, payer nulled');

  delete from auth.users where id = v_coach;
  perform tests.ok(not exists (select 1 from public.profiles where id = v_coach), 'coach who decided proposals can be deleted');
  perform tests.ok((select decided_by is null and coach_id is null and status = 'applied' from public.plan_proposals where id = v_p.id), 'proposal history kept');

  delete from auth.users where id = v_admin;
  perform tests.ok(not exists (select 1 from public.profiles where id = v_admin), 'admin can be deleted');
  perform tests.ok(exists (select 1 from public.coach_assignment_log where student_id = v_s and admin_id is null), 'assignment log kept');
  perform tests.ok(exists (select 1 from public.resources where title = 'Silme testi kaynağı' and created_by is null), 'catalog item kept');

  delete from auth.users where id = v_s;
  perform tests.ok(not exists (select 1 from public.profiles where id = v_s), 'student can be deleted');
  perform tests.eq((select count(*)::int from public.subscriptions where original_transaction_id = 'd-tx'), 0, 'student data removed with student');
  perform tests.ok((select student_id is null and intent_id is null from public.billing_events where event_id = 'd-evt'), 'billing event kept as anonymous record');
end $$;
