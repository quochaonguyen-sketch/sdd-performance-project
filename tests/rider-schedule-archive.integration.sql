do $$
declare
  m date := '2099-12-01';
  first_version text := repeat('a',32);
  second_version text := repeat('b',32);
  first_payload jsonb := '[{"rider_code":"R01","work_date":"2099-12-10"},{"rider_code":"R02","work_date":"2099-12-11"}]';
  snapshot jsonb;
begin
  snapshot := public.rider_schedule_archive_snapshot(date_trunc('month',current_date)::date,true);
  if jsonb_array_length(snapshot->'rows') <> (snapshot->>'row_count')::integer then
    raise exception 'Source version and rows must come from the same snapshot';
  end if;
  perform public.publish_rider_schedule_archive(m,first_version,'2099-12-01T00:02Z',2,first_payload);
  perform public.publish_rider_schedule_archive(m,second_version,'2099-12-01T00:01Z',0,'[]');
  if public.read_archived_rider_schedule(m,first_version,null) is distinct from first_payload then
    raise exception 'An older copy cannot replace the newer archive';
  end if;
  if public.read_archived_rider_schedule(m,second_version,null) is not null then
    raise exception 'A mismatched version must fall back to the source';
  end if;
  if public.read_archived_rider_schedule(m,first_version,'R01') is distinct from jsonb_build_array(first_payload->0) then
    raise exception 'Detail must only return the selected rider';
  end if;
  if has_table_privilege('authenticated','public.rider_schedule_archive','select') or
     has_function_privilege('anon','public.read_archived_rider_schedule(date,text,text)','execute') then
    raise exception 'The archive must stay server-only';
  end if;
end $$;
