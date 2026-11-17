do $$
declare
  code text := 'TEST-OFF-SUPABASE2';
  first_day date := '2099-11-17';
  second_day date := first_day + 1;
  request uuid := gen_random_uuid();
  rider uuid := gen_random_uuid();
  manager uuid := gen_random_uuid();
  submission jsonb;
  result jsonb;
begin
  submission := jsonb_build_object('request_id',request,'rider_code',code,'rider_name','Test Rider','area','KV1',
    'cot','COT1','type','OFF có phép','shift','Cả ngày','email','test@example.invalid','reason','Test');
  if public.submit_rider_off(submission,array[first_day,second_day]) <> 'saved'
    or public.submit_rider_off(submission,array[first_day,second_day]) <> 'saved'
    or public.submit_rider_off(jsonb_set(submission,'{request_id}',to_jsonb(gen_random_uuid())),array[first_day]) <> 'duplicate' then
    raise exception 'OFF request retry or duplicate invariant failed';
  end if;
  result := public.decide_rider_off(request,code,first_day,'Đã duyệt','Test',manager,rider);
  if result->>'success' is distinct from 'true' then raise exception 'Approval failed: %', result; end if;
  result := public.decide_rider_off(request,code,first_day,'Từ chối','Test',manager,null);
  if result->>'conflict' is distinct from 'request' then raise exception 'Existing approval was changed'; end if;
  if (select count(*) from public.attendance_sheet_sync_outbox where rider_code=code) <> 1
    or not exists(select 1 from public.attendance_logs where rider_code=code and work_date=first_day and status='OFF_APPROVED') then
    raise exception 'Calendar update and outbox were not written atomically';
  end if;
  result := public.import_google_rider_schedule(jsonb_build_array(jsonb_build_object('rider_id',rider,'rider_code',code,'work_date',first_day,'status','ON')),
    '[]',first_day,first_day,'test',true);
  if result->>'pending' is distinct from '1' then raise exception 'Webhook ignored pending outbox'; end if;
  result := public.decide_rider_off(request,code,second_day,'Từ chối','Test',manager,null);
  if result->>'success' is distinct from 'true' or exists(select 1 from public.attendance_logs where rider_code=code and work_date=second_day) then
    raise exception 'Rejection must leave calendar untouched';
  end if;
  result := public.save_rider_schedule(jsonb_build_array(jsonb_build_object('rider_id',rider,'rider_code',code,'work_date',first_day,'status','ON')));
  if jsonb_array_length(result->'cleared')<>1
    or (select count(*) from public.attendance_sheet_sync_outbox where rider_code=code and operation='CLEAR')<>1 then
    raise exception 'Clear must queue exactly one Sheet change';
  end if;
  if has_function_privilege('authenticated','public.decide_rider_off(uuid,text,date,text,text,uuid,uuid)','execute')
    or has_table_privilege('anon','public.rider_off_requests','select') then
    raise exception 'OFF requests and decisions must be private';
  end if;
end $$;
