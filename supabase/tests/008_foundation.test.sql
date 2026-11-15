-- Çita temel migration testleri: roller, legacy koç eşleşmesi, onboarding aktarımı,
-- öneri onay akışları (ücretsiz/bire bir), RLS ve idempotency.
\set QUIET on
set client_min_messages = notice;

do $$
declare
  v_coach uuid; v_coach2 uuid; v_a uuid; v_b uuid; v_parent uuid; v_evil uuid;
  v_code text; r jsonb; v_item uuid; v_p public.plan_proposals; v_p2 public.plan_proposals;
  v_title text; v_session uuid;
begin
  -- Kullanıcılar ------------------------------------------------------------
  v_coach  := tests.create_user('f-coach@test', '{"role":"coach","full_name":"Koç"}');
  v_coach2 := tests.create_user('f-coach2@test', '{"role":"coach","full_name":"Koç 2"}');
  select invite_code into v_code from public.profiles where id = v_coach;
  v_a      := tests.create_user('f-a@test', jsonb_build_object('role','student','coach_code',v_code,'track','YKS'));
  v_b      := tests.create_user('f-b@test', '{"role":"student","track":"LGS"}');
  v_parent := tests.create_user('f-parent@test', '{"role":"parent"}');
  v_evil   := tests.create_user('f-evil@test', '{"role":"admin"}');

  perform tests.eq((select coach_id from public.profiles where id = v_a), v_coach, 'legacy coach code links student');
  perform tests.eq((select coach_id from public.profiles where id = v_b), null::uuid, 'B2C signup without coach code');
  perform tests.eq((select role from public.profiles where id = v_parent), 'parent', 'parent role from metadata');
  perform tests.eq((select role from public.profiles where id = v_evil), 'student', 'unknown role metadata falls back to student');
  perform tests.eq((select is_admin from public.profiles where id = v_evil), false, 'admin never from metadata');

  -- Kendini yükseltme engeli
  perform tests.login(v_b);
  update public.profiles set is_admin = true, role = 'coach', track = 'YKS', coach_id = v_coach where id = v_b;
  perform tests.logout();
  perform tests.ok((select not is_admin and role = 'student' and track = 'LGS' and coach_id is null from public.profiles where id = v_b),
    'student cannot change is_admin/role/track/coach directly');

  -- Legacy join_coach hâlâ çalışıyor
  perform tests.login(v_b);
  perform tests.eq(public.join_coach('YANLIS'), 'not_found', 'join_coach unknown code');
  perform tests.logout();

  -- Onboarding aktarımı -----------------------------------------------------
  perform tests.login(v_b);
  r := public.cita_import_onboarding(
    '11111111-1111-1111-1111-111111111111', public.cita_today(),
    '{"track":"LGS","goal":"Fen lisesi","level":"orta","weakSubjects":["Matematik"],"availability":[60,60,60,60,60,0,0]}',
    jsonb_build_array(
      jsonb_build_object('date', public.cita_today(), 'subject','Matematik','kind','konu','title','Matematik — konu','minutes',40),
      jsonb_build_object('date', public.cita_today(), 'subject','Türkçe','kind','soru','title','Türkçe — 20 soru','minutes',20),
      jsonb_build_object('date', public.cita_today() + 1, 'subject','Fen Bilimleri','kind','konu','title','Fen — konu','minutes',60)),
    240);
  perform tests.eq(r->>'status', 'imported', 'onboarding import');
  perform tests.eq((r->>'task_count')::int, 3, 'imported task count');
  r := public.cita_import_onboarding('11111111-1111-1111-1111-111111111111', public.cita_today(), '{"track":"LGS","availability":[60,60,60,60,60,0,0]}', '[{"date":"2000-01-01"}]', 240);
  perform tests.eq(r->>'status', 'already_imported', 'retry with same request id is idempotent');
  r := public.cita_import_onboarding('22222222-2222-2222-2222-222222222222', public.cita_today(), '{"track":"LGS","availability":[60,60,60,60,60,0,0]}', '[{"date":"2000-01-01"}]', 240);
  perform tests.eq(r->>'status', 'plan_exists', 'second onboarding does not duplicate plan');
  perform tests.eq((select count(*)::int from public.study_plan_items where student_id = v_b), 3, 'no duplicate plan rows');
  perform tests.eq((select subject_id is not null from public.study_plan_items where student_id = v_b and title like 'Matematik%'), true, 'subject resolved by track');
  perform tests.eq((select goal_text from public.profiles where id = v_b), 'Fen lisesi', 'profile fields saved');
  perform tests.eq((select count(*)::int from public.weekly_targets where student_id = v_b), 1, 'weekly target created');
  perform tests.logout();

  perform tests.login(v_a);
  perform tests.throws($q$select public.cita_import_onboarding('33333333-3333-3333-3333-333333333333', public.cita_today(), '{"track":"YKS","availability":[60,60,60,60,60,0,0]}', jsonb_build_array(jsonb_build_object('date', public.cita_today() + 30, 'kind','konu','title','x','minutes',10)), 240)$q$,
    'task outside the 7-day window rejected', 'invalid_task%');
  perform tests.logout();

  perform tests.login(v_parent);
  perform tests.throws($q$select public.cita_import_onboarding(gen_random_uuid(), public.cita_today(), '{}', '[]', 240)$q$, 'parent cannot import plan', 'student_only%');
  perform tests.logout();

  -- Ücretsiz öğrenci: öneri onayı atomik uygulanır --------------------------
  perform tests.login(v_b);
  select id into v_item from public.study_plan_items where student_id = v_b and title like 'Matematik%';
  v_p := public.cita_create_proposal('chat-key-0001', 'chat', 'Matematiği kısalt, analiz ekle',
    jsonb_build_array(
      jsonb_build_object('op','update','id',v_item,'before',jsonb_build_object('date',public.cita_today(),'title','Matematik — konu','minutes',40),
                         'after', jsonb_build_object('date',public.cita_today(),'title','Matematik — konu','minutes',25)),
      jsonb_build_object('op','add','after',jsonb_build_object('date',public.cita_today(),'title','Yanlış analizi','minutes',15))));
  perform tests.eq(v_p.status, 'pending_student', 'proposal starts pending');
  v_p2 := public.cita_create_proposal('chat-key-0001', 'chat', 'tekrar', '[{"op":"add"}]');
  perform tests.eq(v_p2.id, v_p.id, 'create proposal idempotent by key');
  perform tests.eq((select planned_minutes from public.study_plan_items where id = v_item), 40, 'plan unchanged before approval');
  v_p := public.cita_student_decide(v_p.id, true);
  perform tests.eq(v_p.status, 'applied', 'free student approval applies');
  perform tests.eq((select planned_minutes from public.study_plan_items where id = v_item), 25, 'update applied');
  perform tests.eq((select count(*)::int from public.study_plan_items where student_id = v_b), 4, 'add applied');
  v_p := public.cita_student_decide(v_p.id, true);
  perform tests.eq((select count(*)::int from public.study_plan_items where student_id = v_b), 4, 'approval retry does not re-apply');

  -- Eski sürüme dayanan öneri: hiçbir şey yazılmaz, 'stale'
  v_p := public.cita_create_proposal('chat-key-0002', 'chat', 'eski',
    jsonb_build_array(
      jsonb_build_object('op','add','after',jsonb_build_object('date',public.cita_today(),'title','Bu eklenmemeli','minutes',10)),
      jsonb_build_object('op','update','id',v_item,'before',jsonb_build_object('date',public.cita_today(),'title','Matematik — konu','minutes',40),
                         'after', jsonb_build_object('date',public.cita_today(),'title','Matematik — konu','minutes',60))));
  v_p := public.cita_student_decide(v_p.id, true);
  perform tests.eq(v_p.status, 'stale', 'stale proposal detected');
  perform tests.eq((select count(*)::int from public.study_plan_items where student_id = v_b and title = 'Bu eklenmemeli'), 0, 'stale proposal wrote nothing (atomic)');
  perform tests.eq((select planned_minutes from public.study_plan_items where id = v_item), 25, 'current plan preserved');

  perform tests.throws('select public.cita_apply_plan_ops(auth.uid(), ''[]''::jsonb, ''manual'')', 'internal apply not callable by users', '%permission denied%');
  perform tests.throws(format('insert into public.subscriptions (student_id,payer_id,tier,status,provider,product_id,original_transaction_id,expires_at) values (%L,%L,''plus'',''active'',''test'',''x'',''t1'',now()+interval ''30 days'')', v_b, v_b),
    'student cannot grant itself a subscription', '%row-level security%');
  perform tests.throws(format('insert into public.student_badges (student_id, badge_key) values (%L, ''first_exam'')', v_b), 'student cannot award badges directly', '%row-level security%');
  perform tests.eq(public.cita_my_tier(), 'free', 'B is free tier');
  perform tests.logout();

  -- Bire Bir: öğrenci onayı koç kuyruğuna gider ------------------------------
  insert into public.subscriptions (student_id, payer_id, tier, status, provider, product_id, original_transaction_id, expires_at)
  values (v_a, v_a, 'bire_bir', 'active', 'test', 'cita_birebir_monthly', 'f-tx-a', now() + interval '30 days');
  insert into public.study_plan_items (student_id, plan_date, title, planned_minutes) values (v_a, public.cita_today(), 'Fizik — soru', 50) returning id into v_item;

  perform tests.login(v_a);
  perform tests.eq(public.cita_my_tier(), 'bire_bir', 'A is bire bir');
  v_p := public.cita_create_proposal('chat-key-a001', 'chat', 'Fizik kısalsın',
    jsonb_build_array(jsonb_build_object('op','update','id',v_item,
      'before',jsonb_build_object('date',public.cita_today(),'title','Fizik — soru','minutes',50),
      'after', jsonb_build_object('date',public.cita_today(),'title','Fizik — soru','minutes',30))));
  v_p := public.cita_student_decide(v_p.id, true);
  perform tests.eq(v_p.status, 'pending_coach', 'bire bir approval goes to coach queue');
  perform tests.eq((select planned_minutes from public.study_plan_items where id = v_item), 50, 'old plan kept while waiting for coach');
  perform tests.throws(format('select public.cita_coach_decide(%L, ''approve'')', v_p.id), 'student cannot coach-approve', 'not_found%');
  perform tests.logout();

  perform tests.login(v_coach2);
  perform tests.throws(format('select public.cita_coach_decide(%L, ''approve'')', v_p.id), 'other coach cannot decide', 'not_found%');
  perform tests.eq((select count(*)::int from public.plan_proposals where id = v_p.id), 0, 'other coach cannot see proposal');
  perform tests.logout();

  perform tests.login(v_coach);
  perform tests.eq((select count(*)::int from public.plan_proposals where coach_id = v_coach and status = 'pending_coach'), 1, 'coach sees queue');
  v_p := public.cita_coach_decide(v_p.id, 'edit', jsonb_build_array(jsonb_build_object('op','update','id',v_item,
      'before',jsonb_build_object('date',public.cita_today(),'title','Fizik — soru','minutes',50),
      'after', jsonb_build_object('date',public.cita_today(),'title','Fizik — 25 soru','minutes',40))), 'Biraz kısalttım');
  perform tests.eq(v_p.status, 'applied', 'coach edit applies');
  v_p := public.cita_coach_decide(v_p.id, 'decline');
  perform tests.eq(v_p.status, 'applied', 'coach retry after apply is no-op');
  perform tests.logout();

  perform tests.login(v_a);
  select title into v_title from public.study_plan_items where id = v_item;
  perform tests.eq(v_title, 'Fizik — 25 soru', 'student sees coach-edited final plan');
  perform tests.eq((select applied_ops->0->'after'->>'minutes' from public.plan_proposals where id = v_p.id), '40', 'student sees actual applied changes');
  perform tests.eq((select count(*)::int from public.study_plan_items where student_id = v_b), 0, 'A cannot see B plan (RLS)');
  perform tests.logout();

  perform tests.login(v_parent);
  perform tests.eq((select count(*)::int from public.study_plan_items), 0, 'parent sees no raw plan rows');
  perform tests.eq((select count(*)::int from public.plan_proposals), 0, 'parent sees no proposals');
  perform tests.logout();

  perform tests.login_anon();
  perform tests.throws(format('select public.cita_refresh_badges(%L)', v_b), 'anon cannot refresh badges', '%permission denied%');
  perform tests.logout();

  -- Rozet ve kronometre ------------------------------------------------------
  perform tests.login(v_b);
  insert into public.exams (student_id, exam_date, name, exam_type) values (v_b, public.cita_today(), 'D1', 'LGS');
  perform public.cita_refresh_badges();
  perform tests.eq((select count(*)::int from public.student_badges where student_id = v_b and badge_key = 'first_exam'), 1, 'first_exam badge from real exam');
  perform tests.eq((select count(*)::int from public.student_badges where student_id = v_b and badge_key = 'first_week'), 0, 'first_week not before week ends');

  insert into public.study_sessions (student_id, started_at, plan_item_id)
  values (v_b, now() - interval '30 minutes', (select id from public.study_plan_items where student_id = v_b order by sort_order limit 1))
  returning id into v_session;
  r := public.cita_stop_study_session(v_session, true);
  r := public.cita_stop_study_session(v_session, true);
  perform tests.eq((select count(*)::int from public.study_time_entries where study_session_id = v_session), 1, 'timer stop retry records minutes once');
  perform tests.eq((select minutes from public.study_time_entries where study_session_id = v_session), 30, 'timer minutes');
  perform tests.ok((select completed and actual_minutes = 30 from public.study_plan_items where id = (select plan_item_id from public.study_sessions where id = v_session)), 'task completed with actual minutes');
  perform tests.logout();

  perform tests.login(v_coach);
  perform tests.eq((select count(*)::int from public.profiles where id = v_b), 0, 'coach cannot see unlinked B2C student');
  perform tests.logout();
end $$;
