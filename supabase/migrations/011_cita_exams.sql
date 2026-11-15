-- ============================================================================
-- MIGRATION 011 — Deneme kaydı: atomik + idempotent
-- ============================================================================
-- Sunucu (/api/cita/exams) sınav kurallarını (ders listesi, soru sayıları,
-- yanlış katsayısı) @cita/core ile doğrular; bu RPC deneme + ders sonuçlarını
-- tek transaction'da ve client_id ile tekrar denemeye dayanıklı yazar. Doğrudan
-- çağrılara karşı temel tutarlılık burada da denetlenir.
-- ============================================================================
create or replace function public.cita_save_exam(
  p_client_id uuid, p_exam_type text, p_name text, p_date date, p_rows jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_track text;
  v_exam uuid;
  v_penalty numeric;
  v_row jsonb;
  v_subject uuid;
  v_q int; v_c int; v_w int; v_b int;
begin
  select track into v_track from public.profiles where id = v_uid and role = 'student';
  if v_track is null then raise exception 'student_only' using errcode = '42501'; end if;

  select id into v_exam from public.exams where student_id = v_uid and client_id = p_client_id;
  if found then return jsonb_build_object('exam_id', v_exam, 'status', 'existing'); end if;

  if (v_track = 'YKS' and p_exam_type not in ('TYT','AYT','YDT','Branş'))
     or (v_track = 'LGS' and p_exam_type not in ('LGS','Sayısal','Sözel','Branş')) then
    raise exception 'invalid_exam_type';
  end if;
  if p_date is null or p_date > public.cita_today() + 1 or p_date < public.cita_today() - 400 then raise exception 'invalid_date'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 12 then raise exception 'invalid_rows'; end if;
  v_penalty := case when v_track = 'LGS' then 3 else 4 end;

  insert into public.exams (student_id, exam_date, name, exam_type, client_id)
  values (v_uid, p_date, left(coalesce(nullif(trim(p_name), ''), p_exam_type || ' denemesi'), 120), p_exam_type, p_client_id)
  returning id into v_exam;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    select id into v_subject from public.subjects where name = v_row->>'subject' and track = v_track;
    if v_subject is null then raise exception 'invalid_subject: %', v_row->>'subject'; end if;
    v_q := (v_row->>'questions')::int; v_c := (v_row->>'correct')::int; v_w := (v_row->>'wrong')::int; v_b := (v_row->>'blank')::int;
    if v_q is null or v_q < 1 or v_q > 80 or v_c < 0 or v_w < 0 or v_b < 0 or v_c + v_w + v_b <> v_q then
      raise exception 'invalid_counts: %', v_row->>'subject';
    end if;
    insert into public.exam_results (exam_id, subject_id, correct_count, wrong_count, blank_count, wrong_penalty, question_count)
    values (v_exam, v_subject, v_c, v_w, v_b, v_penalty, v_q);
  end loop;

  perform public.cita_refresh_badges(v_uid);
  return jsonb_build_object('exam_id', v_exam, 'status', 'created');
end;
$$;
revoke all on function public.cita_save_exam(uuid, text, text, date, jsonb) from public, anon;
grant execute on function public.cita_save_exam(uuid, text, text, date, jsonb) to authenticated;
