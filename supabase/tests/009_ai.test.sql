-- 009: sohbet gizliliği, foto kotası (limit/idempotency/iade), defter paket kontrolü, katalog yetkisi
\set QUIET on
set client_min_messages = notice;

do $$
declare
  v_s uuid; v_plus uuid; v_coach uuid; v_parent uuid; v_admin uuid; v_code text;
  r jsonb; v_req uuid; i int; v_pr public.photo_requests;
begin
  v_coach  := tests.create_user('a-coach@test', '{"role":"coach"}');
  select invite_code into v_code from public.profiles where id = v_coach;
  v_s      := tests.create_user('a-free@test', '{"role":"student","track":"YKS"}');
  v_plus   := tests.create_user('a-plus@test', jsonb_build_object('role','student','coach_code',v_code));
  v_parent := tests.create_user('a-parent@test', '{"role":"parent"}');
  v_admin  := tests.create_user('a-admin@test', '{"role":"coach"}');
  update public.profiles set is_admin = true where id = v_admin;
  insert into public.subscriptions (student_id, payer_id, tier, status, provider, product_id, original_transaction_id, expires_at)
  values (v_plus, v_plus, 'plus', 'trialing', 'test', 'cita_plus_monthly', 'a-tx-plus', now() + interval '14 days');

  -- Sohbet: öğrenci yalnızca 'user' yazar; asistan mesajı taklit edemez; başkası göremez
  perform tests.login(v_s);
  insert into public.chat_messages (student_id, role, content, client_id) values (v_s, 'user', 'Merhaba', 'client-0001');
  perform tests.throws(format('insert into public.chat_messages (student_id, role, content) values (%L, ''assistant'', ''sahte'')', v_s),
    'student cannot forge assistant message', '%row-level security%');
  perform tests.throws(format('insert into public.chat_messages (student_id, role, content, client_id) values (%L, ''user'', ''x'', ''client-0001'')', v_s),
    'duplicate client id rejected (idempotency)', '%duplicate key%');
  perform tests.logout();
  perform tests.login(v_parent);
  perform tests.eq((select count(*)::int from public.chat_messages), 0, 'parent cannot read chats');
  perform tests.logout();
  perform tests.login(v_coach);
  perform tests.eq((select count(*)::int from public.chat_messages), 0, 'coach cannot read private chats');
  perform tests.logout();

  -- Foto kotası: ücretsiz 3/gün
  perform tests.login(v_s);
  perform tests.eq((public.cita_photo_quota()->>'limit')::int, 3, 'free limit 3');
  for i in 1..3 loop
    r := public.cita_reserve_photo('photo-key-' || i);
    perform tests.eq(r->>'outcome', 'reserved', 'reserve #' || i);
  end loop;
  r := public.cita_reserve_photo('photo-key-1');
  perform tests.eq(r->>'outcome', 'existing', 'retry same key does not charge');
  r := public.cita_reserve_photo('photo-key-4');
  perform tests.eq(r->>'outcome', 'limit', '4th photo blocked');
  perform tests.eq((public.cita_photo_quota()->>'used')::int, 3, 'used = 3');
  select id into v_req from public.photo_requests where student_id = v_s and idempotency_key = 'photo-key-2';
  perform tests.throws(format('select public.cita_finish_photo(%L, ''unreadable'')', v_req), 'student cannot finalize photo', '%permission denied%');
  perform tests.logout();

  -- Okunamayan fotoğraf hakkı bir kez iade eder
  perform tests.login_service();
  v_pr := public.cita_finish_photo(v_req, 'unreadable');
  v_pr := public.cita_finish_photo(v_req, 'unreadable');
  perform tests.logout();
  perform tests.login(v_s);
  perform tests.eq((public.cita_photo_quota()->>'used')::int, 2, 'unreadable refunded exactly once');
  r := public.cita_reserve_photo('photo-key-5');
  perform tests.eq(r->>'outcome', 'reserved', 'refunded slot usable');
  perform tests.logout();

  -- Gün değişimi: dünün kullanımı bugünü etkilemez
  update public.photo_usage set day = day - 1 where student_id = v_s;
  perform tests.login(v_s);
  perform tests.eq((public.cita_photo_quota()->>'used')::int, 0, 'new Istanbul day resets usage');
  perform tests.eq(public.cita_today(), (now() at time zone 'Europe/Istanbul')::date, 'quota day is Europe/Istanbul');
  perform tests.logout();

  -- Çita+: 15 hak, defter yazabilir; ücretsiz yazamaz
  perform tests.login(v_plus);
  perform tests.eq((public.cita_photo_quota()->>'limit')::int, 15, 'plus limit 15');
  insert into public.mistakes (student_id, subject, topic, error_type, error_type_confirmed) values (v_plus, 'Matematik', 'Problemler', 'islem', true);
  perform tests.logout();
  perform tests.login(v_coach);
  perform tests.eq((select count(*)::int from public.mistakes where student_id = v_plus), 1, 'linked coach can read notebook');
  perform tests.logout();
  perform tests.login(v_s);
  perform tests.throws(format('insert into public.mistakes (student_id, subject) values (%L, ''Fizik'')', v_s), 'free student cannot use notebook', '%row-level security%');
  perform tests.throws('insert into public.resources (exam, subject, level, type, title) values (''YKS'',''Fizik'',''orta'',''kitap'',''X kitap'')',
    'student cannot edit catalog', '%row-level security%');
  perform tests.ok((select count(*) from public.resources) >= 1, 'student reads approved catalog');
  perform tests.logout();

  -- Abonelik bitince erişim düşer
  update public.subscriptions set expires_at = now() - interval '1 minute' where student_id = v_plus;
  perform tests.login(v_plus);
  perform tests.eq(public.cita_my_tier(), 'free', 'expired trial falls back to free');
  perform tests.throws(format('insert into public.mistakes (student_id, subject) values (%L, ''Fizik'')', v_plus), 'expired plus cannot add mistakes', '%row-level security%');
  perform tests.eq((select count(*)::int from public.mistakes), 1, 'old notebook still readable');
  perform tests.logout();

  -- Yönetici kataloğu düzenler
  perform tests.login(v_admin);
  insert into public.resources (exam, subject, level, type, title) values ('YKS', 'Fizik', 'orta', 'kitap', 'Admin kaynağı');
  perform tests.ok(exists (select 1 from public.resources where title = 'Admin kaynağı'), 'admin creates resource');
  perform tests.logout();

  -- Depolama: yalnızca sahibi
  insert into storage.objects (bucket_id, name) values ('question-photos', v_s::text || '/a.jpg');
  perform tests.login(v_s);
  perform tests.eq((select count(*)::int from storage.objects where bucket_id = 'question-photos'), 1, 'owner sees own photo');
  perform tests.logout();
  perform tests.login(v_parent);
  perform tests.eq((select count(*)::int from storage.objects where bucket_id = 'question-photos'), 0, 'parent cannot see photos');
  perform tests.logout();
end $$;
