\set QUIET on
set client_min_messages = notice;

do $$
declare
  v_lgs uuid; v_lgs2 uuid; v_yks uuid; v_parent uuid; v_parent2 uuid; v_coach uuid; v_admin uuid;
  r jsonb; v_code text; v_intent public.purchase_intents; i int; s jsonb;
begin
  v_lgs     := tests.create_user('p-lgs@test', '{"role":"student","track":"LGS","full_name":"Ece"}');
  v_lgs2    := tests.create_user('p-lgs2@test', '{"role":"student","track":"LGS","full_name":"Can"}');
  v_yks     := tests.create_user('p-yks@test', '{"role":"student","track":"YKS"}');
  v_parent  := tests.create_user('p-parent@test', '{"role":"parent"}');
  v_parent2 := tests.create_user('p-parent2@test', '{"role":"parent"}');
  v_coach   := tests.create_user('p-coach@test', '{"role":"coach"}');
  v_admin   := tests.create_user('p-admin@test', '{"role":"coach"}');
  update public.profiles set is_admin = true where id = v_admin;

  insert into public.study_plan_items (student_id, plan_date, title, planned_minutes, completed)
  values (v_lgs, date '2026-11-09', 'Matematik', 40, true), (v_lgs, date '2026-11-10', 'Fen', 30, false);
  insert into public.study_time_entries (student_id, entry_date, minutes) values (v_lgs, date '2026-11-09', 45);
  insert into public.chat_messages (student_id, role, content) values (v_lgs, 'user', 'özel mesaj');

  -- Kod üretimi: yalnızca LGS öğrencisi
  perform tests.login(v_yks);
  perform tests.throws('select public.cita_create_parent_code()', 'YKS student cannot create parent code', 'lgs_student_only%');
  perform tests.logout();
  perform tests.login(v_lgs);
  r := public.cita_create_parent_code();
  v_code := r->>'code';
  perform tests.eq(length(v_code), 8, 'parent code generated');
  perform tests.logout();

  -- Öğrenci veli kodunu kullanamaz; veli yanlış kodları sınırlı dener
  perform tests.login(v_lgs2);
  perform tests.eq(public.cita_redeem_parent_code(v_code), 'not_parent', 'student cannot redeem parent code');
  perform tests.logout();
  perform tests.login(v_parent2);
  for i in 1..10 loop perform public.cita_redeem_parent_code('WRONG' || i); end loop;
  perform tests.eq(public.cita_redeem_parent_code(v_code), 'rate_limited', 'brute force rate limited');
  perform tests.logout();

  perform tests.login(v_parent);
  perform tests.eq(public.cita_redeem_parent_code(lower(v_code)), 'ok', 'parent links with code');
  perform tests.logout();
  delete from public.parent_code_attempts where parent_id = v_parent2;
  perform tests.login(v_parent2);
  perform tests.eq(public.cita_redeem_parent_code(v_code), 'invalid', 'code is single use');
  perform tests.logout();

  -- Veli: yalnızca özet, ham veri yok
  perform tests.login(v_parent);
  perform tests.eq((select count(*)::int from public.cita_parent_students()), 1, 'parent sees linked student');
  s := public.cita_parent_weekly_summary(v_lgs, date '2026-11-09');
  perform tests.eq((s->>'planned_tasks')::int, 2, 'summary planned tasks');
  perform tests.eq((s->>'completed_tasks')::int, 1, 'summary completed tasks');
  perform tests.eq((s->>'study_minutes')::int, 45, 'summary minutes');
  perform tests.ok(s ? 'exam_trend' and not (s ? 'chat'), 'summary has trend and no chat');
  perform tests.eq((select count(*)::int from public.chat_messages), 0, 'parent cannot read chat');
  perform tests.eq((select count(*)::int from public.study_plan_items), 0, 'parent cannot read raw plan');
  perform tests.eq((select count(*)::int from public.photo_requests), 0, 'parent cannot read photos');
  perform tests.throws(format('select public.cita_parent_weekly_summary(%L, ''2026-11-09'')', v_lgs2), 'parent cannot see unlinked student', 'not_allowed%');
  perform tests.logout();

  -- Satın alma niyeti: veli yalnızca bağlı öğrenci için
  perform tests.login(v_parent);
  v_intent := public.cita_create_purchase_intent(v_lgs, 'plus', 'cita_plus_monthly', 'test');
  perform tests.eq(v_intent.student_id, v_lgs, 'parent intent bound to linked student');
  perform tests.eq(v_intent.payer_id, v_parent, 'payer is parent');
  perform tests.throws(format('select public.cita_create_purchase_intent(%L, ''plus'', ''x'', ''test'')', v_lgs2), 'parent cannot buy for unlinked student', 'not_allowed%');
  perform tests.logout();
  perform tests.login(v_lgs2);
  perform tests.throws(format('select public.cita_create_purchase_intent(%L, ''plus'', ''x'', ''test'')', v_lgs), 'student cannot buy for another student', 'not_allowed%');
  perform tests.logout();

  -- Bağlantı kaldırılınca erişim biter
  perform tests.login(v_lgs);
  perform public.cita_revoke_parent_link(v_parent, v_lgs);
  perform tests.logout();
  perform tests.login(v_parent);
  perform tests.throws(format('select public.cita_parent_weekly_summary(%L, ''2026-11-09'')', v_lgs), 'revoked parent loses access', 'not_allowed%');
  perform tests.logout();

  -- Çift yenileme engeli
  insert into public.subscriptions (student_id, payer_id, tier, status, provider, product_id, original_transaction_id, expires_at)
  values (v_yks, v_yks, 'plus', 'active', 'test', 'cita_plus_monthly', 'p-tx-1', now() + interval '20 days');
  perform tests.throws(format('insert into public.subscriptions (student_id, payer_id, tier, status, provider, product_id, original_transaction_id, expires_at) values (%L,%L,''bire_bir'',''active'',''test'',''b'',''p-tx-2'',now()+interval ''30 days'')', v_yks, v_yks),
    'two renewing subscriptions rejected', '%uq_subscriptions_one_renewing%');

  -- Koç ataması: yalnızca yönetici
  perform tests.login(v_coach);
  perform tests.throws(format('select public.cita_admin_assign_coach(%L, %L)', v_yks, v_coach), 'non-admin cannot assign coach', 'admin_only%');
  perform tests.logout();
  perform tests.login(v_admin);
  perform tests.eq(public.cita_admin_assign_coach(v_yks, v_coach), 'ok', 'admin assigns coach');
  perform tests.ok((select count(*) from public.cita_admin_students()) >= 3, 'admin lists students');
  perform tests.logout();
  perform tests.eq((select coach_id from public.profiles where id = v_yks), v_coach, 'coach_id set');
  perform tests.login(v_coach);
  perform tests.eq((select count(*)::int from public.profiles where id = v_yks), 1, 'assigned coach now sees student (existing dashboard)');
  perform tests.logout();
  perform tests.login(v_lgs);
  perform tests.eq((select count(*)::int from public.cita_admin_students()), 0, 'student gets empty admin list');
  perform tests.logout();
end $$;
