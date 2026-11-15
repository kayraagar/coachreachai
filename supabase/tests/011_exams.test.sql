\set QUIET on
set client_min_messages = notice;

do $$
declare v_s uuid; v_l uuid; r jsonb; v_id text;
begin
  v_s := tests.create_user('e-yks@test', '{"role":"student","track":"YKS"}');
  v_l := tests.create_user('e-lgs@test', '{"role":"student","track":"LGS"}');

  perform tests.login(v_s);
  r := public.cita_save_exam('aaaaaaaa-0000-0000-0000-000000000001', 'TYT', 'D1', public.cita_today(),
        '[{"subject":"Matematik","correct":30,"wrong":8,"blank":2,"questions":40},{"subject":"Türkçe","correct":35,"wrong":4,"blank":1,"questions":40}]');
  perform tests.eq(r->>'status', 'created', 'exam created');
  v_id := r->>'exam_id';
  r := public.cita_save_exam('aaaaaaaa-0000-0000-0000-000000000001', 'TYT', 'D1', public.cita_today(), '[]');
  perform tests.eq(r->>'status', 'existing', 'retry with same client id is idempotent');
  perform tests.eq((select count(*)::int from public.exams where student_id = v_s), 1, 'single exam row');
  perform tests.eq((select sum(net) from public.exam_results where exam_id = v_id::uuid), 62::numeric, 'YKS net uses /4 (28 + 34)');
  perform tests.eq((select count(*)::int from public.student_badges where student_id = v_s and badge_key = 'first_exam'), 1, 'first_exam badge awarded on save');
  perform tests.throws($q$select public.cita_save_exam(gen_random_uuid(), 'LGS', 'x', public.cita_today(), '[{"subject":"Matematik","correct":1,"wrong":0,"blank":19,"questions":20}]')$q$,
    'YKS student cannot save LGS exam type', 'invalid_exam_type%');
  perform tests.throws($q$select public.cita_save_exam(gen_random_uuid(), 'TYT', 'x', public.cita_today(), '[{"subject":"Matematik","correct":30,"wrong":8,"blank":5,"questions":40}]')$q$,
    'counts must add up to question count', 'invalid_counts%');
  perform tests.throws($q$select public.cita_save_exam(gen_random_uuid(), 'TYT', 'x', public.cita_today(), '[{"subject":"Fen Bilimleri","correct":1,"wrong":0,"blank":0,"questions":1}]')$q$,
    'subject must belong to track', 'invalid_subject%');
  perform tests.eq((select count(*)::int from public.exams where student_id = v_s), 1, 'failed saves wrote nothing (atomic)');
  perform tests.logout();

  perform tests.login(v_l);
  r := public.cita_save_exam(gen_random_uuid(), 'Sayısal', 'L1', public.cita_today(), '[{"subject":"Matematik","correct":15,"wrong":3,"blank":2,"questions":20}]');
  perform tests.eq((select net from public.exam_results where exam_id = (r->>'exam_id')::uuid), 14::numeric, 'LGS net uses /3');
  perform tests.eq((select count(*)::int from public.exams where student_id = v_s), 0, 'cannot see other student exams');
  perform tests.logout();
end $$;
