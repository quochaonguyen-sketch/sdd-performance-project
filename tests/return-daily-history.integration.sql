-- Combine with the migration and run using scripts/admin-audit-db.cjs --test.
do $$
declare job uuid:=gen_random_uuid(); fixture jsonb; result integer; day date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
  captured timestamptz; older timestamptz:=now()-interval '1 day'; before_count integer; saved_id text;
begin
  perform pg_advisory_xact_lock(948251,7);
  if has_table_privilege('authenticated','public.return_daily_history','select') or has_table_privilege('anon','public.return_daily_history_groups','select')
    or has_function_privilege('authenticated','public.capture_return_daily_history(text,timestamptz,integer,integer)','execute')
    or has_function_privilege('anon','public.read_return_daily_history(date,date)','execute') then raise exception 'Return history exposed'; end if;
  if exists(select 1 from pg_class where oid in ('public.return_daily_history'::regclass,'public.return_daily_history_groups'::regclass) and not relrowsecurity) then raise exception 'History RLS missing'; end if;
  select jsonb_object_agg(column_name,case when data_type in ('integer','bigint') then '0'::jsonb when data_type like 'timestamp%' then 'null'::jsonb else '""'::jsonb end)
    into fixture from information_schema.columns where table_schema='public' and table_name='return_order_snapshots';
  fixture:=fixture||jsonb_build_object('shipment_id','RETURN-HISTORY-TEST','order_status',67,'current_station_id',4232,'seller_area','Khu vực 1',
    'seller_district','Quận test','seller_ward','Phường cũ','seller_new_ward','Phường mới','current_station_received_time',now()-interval '6 days');
  insert into public.data_source_jobs(id,source_id,report_date,status,phase,worker_id,lease_until)
    values(job,'return_inventory',day,'RUNNING','publishing','integration-history',now()+interval '2 minutes');
  result:=public.publish_central_returns(job,'integration-history',jsonb_build_array(fixture,
    fixture||jsonb_build_object('shipment_id','RETURN-HISTORY-TEST-2','seller_area','Khu vực 3','order_status',72,'delivering_time',now()-interval '49 hours'),
    fixture||jsonb_build_object('shipment_id','RETURN-HISTORY-TEST-3','seller_area','Chưa rõ KV','current_station_received_time',null)),true,4232);
  if result<>3 then raise exception 'Publication count wrong'; end if;
  select captured_at,snapshot_id into captured,saved_id from public.return_daily_history where report_date=day;
  if not exists(select 1 from public.return_daily_history where report_date=day and total_orders=3 and unknown_area_orders=1 and snapshot_id=job::text) then raise exception 'Publication did not capture history'; end if;
  if not exists(select 1 from public.return_daily_history_groups where report_date=day and area='KV3' and total=1 and returning_count=1 and over5_days=1 and returning_over48h=1 and ward='Phường mới') then raise exception 'History age/status/geography incorrect'; end if;
  if public.capture_return_daily_history(saved_id,captured,4232,3) then raise exception 'Same snapshot captured twice'; end if;
  begin
    perform public.publish_central_returns(job,'integration-history',jsonb_build_array(fixture),false,4232);
    raise exception 'Partial publication accepted';
  exception when raise_exception then if SQLERRM='Partial publication accepted' then raise; end if; end;
  if not exists(select 1 from public.return_daily_history where report_date=day and total_orders=3 and snapshot_id=saved_id) then raise exception 'Failed publication corrupted history'; end if;
  -- Retain a true older snapshot in its own day; ages are evaluated at capture, not the current clock.
  update public.return_order_snapshots set snapshot_id='history-test-prior',snapshot_at=older;
  perform public.capture_return_daily_history('history-test-prior',older,4232,3);
  if not exists(select 1 from public.return_daily_history where report_date=(older at time zone 'Asia/Ho_Chi_Minh')::date and total_orders=3) then raise exception 'Prior history not retained'; end if;
  update public.data_source_jobs set status='SUCCEEDED' where id=job;
  job:=gen_random_uuid();
  insert into public.data_source_jobs(id,source_id,report_date,status,phase,worker_id,lease_until)
    values(job,'return_inventory',day,'RUNNING','publishing','integration-history',now()+interval '2 minutes');
  result:=public.publish_central_returns(job,'integration-history',jsonb_build_array(fixture),true,4232);
  if (select count(*) from public.return_daily_history_groups where report_date=day)<>1 then raise exception 'Removed groups survived replacement'; end if;
  update public.data_source_jobs set status='SUCCEEDED' where id=job;
  job:=gen_random_uuid();
  insert into public.data_source_jobs(id,source_id,report_date,status,phase,worker_id,lease_until)
    values(job,'return_inventory',day,'RUNNING','publishing','integration-history',now()+interval '2 minutes');
  perform public.publish_central_returns(job,'integration-history','[]'::jsonb,true,4232);
  if not exists(select 1 from public.return_daily_history where report_date=day and total_orders=0 and unknown_area_orders=0)
    or exists(select 1 from public.return_daily_history_groups where report_date=day) then raise exception 'Verified empty snapshot not recorded as zero'; end if;
  if not exists(select 1 from public.return_daily_history where report_date=(older at time zone 'Asia/Ho_Chi_Minh')::date and total_orders=3) then raise exception 'New publication erased older day'; end if;
  begin
    perform public.read_return_daily_history(day-100,day);
    raise exception 'Unbounded range accepted';
  exception when raise_exception then if SQLERRM='Unbounded range accepted' then raise; end if; end;
end $$;
