do $$
declare
  rider record;
  day date := '2099-11-15';
  batch jsonb;
  outcome jsonb;
  ids uuid[];
  first_owner uuid := gen_random_uuid();
  second_owner uuid := gen_random_uuid();
begin
  select id,rider_code into strict rider from public.riders where kv in ('KV1','KV2','KV3','KV4','KV5') limit 1;
  if exists(select 1 from public.attendance_logs where rider_code=rider.rider_code and work_date=day) then
    raise exception 'Approved OFF fixture day is occupied';
  end if;
  batch := jsonb_build_array(jsonb_build_object(
    'rider_id',rider.id,'rider_code',rider.rider_code,'work_date',day,
    'status','OFF_APPROVED','request_id','123e4567-e89b-12d3-a456-426614174000'));
  if public.import_approved_rider_off(batch) <> 1 then raise exception 'Expected a new approved OFF row'; end if;
  if public.import_approved_rider_off(jsonb_set(batch,'{0,status}','"OFF_WEEKLY"')) <> 0 then
    raise exception 'An existing rider-day was overwritten';
  end if;
  if not exists(select 1 from public.attendance_logs where rider_code=rider.rider_code and work_date=day and status='OFF_APPROVED') then
    raise exception 'Expected the original approved status';
  end if;
  if (select count(*) from public.attendance_sheet_sync_outbox where rider_code=rider.rider_code and work_date=day and attendance_status='OFF_APPROVED') <> 1 then
    raise exception 'Expected exactly one queued OFF update';
  end if;
  if has_function_privilege('authenticated','public.import_approved_rider_off(jsonb)','execute') then
    raise exception 'Unprivileged accounts can import approved OFF';
  end if;
  outcome := public.save_rider_schedule(jsonb_set(batch,'{0,status}','"OFF_WEEKLY"'));
  if outcome #>> '{logs,0,status}' <> 'OFF_WEEKLY' then raise exception 'Web change was not saved'; end if;
  outcome := public.import_google_rider_schedule(batch,
    jsonb_build_array(rider.rider_code || '|' || day::text), day, day, 'test-off-sheet');
  if outcome ->> 'imported' <> '0' or outcome ->> 'pending' <> '1' then raise exception 'Sheet import overwrote a queued change'; end if;
  select array_agg(id) into ids from public.attendance_sheet_sync_outbox where rider_code=rider.rider_code and work_date=day;
  if (select count(*) from public.read_attendance_sheet_queue_values(ids) where status='OFF_WEEKLY') <> 1 then
    raise exception 'Sheet must receive the latest attendance status, once per rider-day';
  end if;
  outcome := public.save_rider_schedule(jsonb_set(batch,'{0,status}','"ON"'));
  if jsonb_array_length(outcome->'cleared') <> 1 then raise exception 'Expected a cleared rider-day'; end if;
  select array_agg(id) into ids from public.attendance_sheet_sync_outbox where rider_code=rider.rider_code and work_date=day;
  if (select count(*) from public.read_attendance_sheet_queue_values(ids) where status='ON') <> 1 then
    raise exception 'Sheet must clear a removed OFF entry';
  end if;
  if not public.acquire_attendance_sheet_writer(first_owner) or public.acquire_attendance_sheet_writer(second_owner) then
    raise exception 'Expected exactly one active Google Sheet writer';
  end if;
  delete from public.attendance_sheet_writer_lease where owner=first_owner;
  if not public.acquire_attendance_sheet_writer(second_owner) then raise exception 'Expected lease release'; end if;
end $$;
