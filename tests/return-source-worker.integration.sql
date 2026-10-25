-- Run through the SQL runner with --test; every fixture/write rolls back.
do $$
declare job uuid:=gen_random_uuid(); fixture jsonb; before_count integer; total integer;
begin
  if exists(select 1 from public.data_source_jobs where source_id='return_inventory' and status in ('QUEUED','RUNNING','CANCEL_REQUESTED')) then raise exception 'Return source must be idle for integration test'; end if;
  if has_function_privilege('authenticated','public.publish_central_returns(uuid,text,jsonb,boolean,integer)','execute') or has_function_privilege('anon','public.publish_central_returns(uuid,text,jsonb,boolean,integer)','execute') then raise exception 'Return publisher exposed'; end if;
  insert into public.data_source_jobs(id,source_id,report_date,status,phase,worker_id,lease_until)
    values(job,'return_inventory',current_date,'RUNNING','publishing','integration-return',now()+interval '2 minutes');
  select count(*) into before_count from public.return_order_snapshots;
  select jsonb_object_agg(column_name,case when data_type in ('integer','bigint') then '0'::jsonb when data_type like 'timestamp%' then 'null'::jsonb else '""'::jsonb end)
    into fixture from information_schema.columns where table_schema='public' and table_name='return_order_snapshots';
  fixture:=fixture||jsonb_build_object('shipment_id','RETURN-INTEGRATION-ONLY','order_status',67,'current_station_id',4232,'seller_area','Khu vực 1');
  begin
    perform public.publish_central_returns(job,'wrong-worker',jsonb_build_array(fixture),true,4232);
    raise exception 'Wrong owner accepted';
  exception when raise_exception then if SQLERRM='Wrong owner accepted' then raise; end if; end;
  begin
    perform public.publish_central_returns(job,'integration-return',jsonb_build_array(fixture||'{"order_status":4}'::jsonb),true,4232);
    raise exception 'Wrong status accepted';
  exception when raise_exception then if SQLERRM='Wrong status accepted' then raise; end if; end;
  begin
    perform public.publish_central_returns(job,'integration-return',jsonb_build_array(fixture),false,4232);
    raise exception 'Incomplete source accepted';
  exception when raise_exception then if SQLERRM='Incomplete source accepted' then raise; end if; end;
  begin
    perform public.publish_central_returns(job,'integration-return',jsonb_build_array(fixture,fixture),true,4232);
    raise exception 'Duplicate source accepted';
  exception when raise_exception then if SQLERRM='Duplicate source accepted' then raise; end if; end;
  if (select count(*) from public.return_order_snapshots)<>before_count then raise exception 'Validation failure changed snapshots'; end if;
  total:=public.publish_central_returns(job,'integration-return',jsonb_build_array(fixture),true,4232);
  if total<>1 or (select count(*) from public.return_order_snapshots)<>1 or not exists(select 1 from public.return_order_snapshots where return_order_key=job::text||':RETURN-INTEGRATION-ONLY') then raise exception 'Complete replacement failed'; end if;
  begin
    -- A row constraint failure after delete/insert work must roll back to the prior complete snapshot.
    perform public.publish_central_returns(job,'integration-return',jsonb_build_array(fixture||'{"shipment_id":"SECOND","status_label":null}'::jsonb),true,4232);
    raise exception 'Invalid null inserted';
  exception when not_null_violation then null; end;
  if (select count(*) from public.return_order_snapshots)<>1 then raise exception 'Failed insert corrupted last snapshot'; end if;
  update public.data_source_jobs set status='SUCCEEDED' where id=job;
  job:=gen_random_uuid();
  insert into public.data_source_jobs(id,source_id,report_date,status,phase,worker_id,lease_until)
    values(job,'return_inventory',current_date,'RUNNING','publishing','integration-return',now()+interval '2 minutes');
  total:=public.publish_central_returns(job,'integration-return','[]'::jsonb,true,4232);
  if total<>0 or exists(select 1 from public.return_order_snapshots) then raise exception 'Verified empty snapshot failed'; end if;
end $$;
