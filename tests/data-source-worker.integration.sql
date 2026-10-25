-- Executed in a rollback transaction by scripts/admin-audit-db.cjs --test.
do $$
declare a jsonb; b jsonb; j jsonb; job_a uuid; job_b uuid; n integer;
begin
  update public.data_source_settings set auto_enabled=false;
  if exists(select 1 from public.data_source_jobs where status in ('QUEUED','RUNNING','CANCEL_REQUESTED')) then raise exception 'Run integration test with idle central queue'; end if;
  if has_table_privilege('authenticated','public.data_source_jobs','select') or has_function_privilege('anon','public.claim_data_source_job(text)','execute') then raise exception 'Private control plane exposed'; end if;
  if not exists(select 1 from pg_proc where oid='public.publish_central_pickup'::regproc and 'statement_timeout=60s'=any(proconfig)) then raise exception 'Missing bounded publication timeout'; end if;
  perform public.pulse_data_source_worker('test-worker','test-host','test',2);
  a:=public.control_data_source('pickup_inventory','run',current_date,null);
  b:=public.control_data_source('pickup_inventory','run',current_date,null);
  if a->>'jobId'<>b->>'jobId' or (b->>'deduplicated')::boolean is distinct from true then raise exception 'Dedup failed'; end if;
  job_a:=(a->>'jobId')::uuid;
  b:=public.control_data_source('delivery_inventory','run',current_date,null); job_b:=(b->>'jobId')::uuid;
  j:=public.claim_data_source_job('test-worker');
  if j->>'status'<>'RUNNING' then raise exception 'Claim failed'; end if;
  j:=public.claim_data_source_job('test-worker');
  if j->>'status'<>'RUNNING' then raise exception 'Parallel claim failed'; end if;
  perform public.control_data_source('performance','run',current_date,null);
  if public.claim_data_source_job('test-worker') is not null then raise exception 'Concurrency limit failed'; end if;
  perform public.control_data_source('pickup_inventory','stop',current_date,null);
  if public.begin_data_source_publish(job_a,'test-worker') then raise exception 'Cancelled job can publish'; end if;
  if public.begin_data_source_publish(job_b,'wrong-worker') then raise exception 'Wrong owner can publish'; end if;
  if not public.begin_data_source_publish(job_b,'test-worker') then raise exception 'Valid publish refused'; end if;
  perform public.control_data_source('delivery_inventory','stop',current_date,null);
  if (select phase from public.data_source_jobs where id=job_b)<>'publishing' then raise exception 'Stop interrupted publish'; end if;
  if not public.finish_data_source_job(job_b,'test-worker','SUCCEEDED') then raise exception 'Safe boundary finish failed'; end if;
  perform public.finish_data_source_job(job_a,'test-worker','CANCELLED');
  perform public.control_data_source('performance','stop',current_date,null);
  if exists(select 1 from public.data_source_jobs where source_id='performance' and status='QUEUED') then raise exception 'Queued cancel failed'; end if;
  a:=public.control_data_source('pickup_inventory','run',current_date,null);
  job_a:=(a->>'jobId')::uuid;
  perform public.claim_data_source_job('test-worker');
  a:=public.begin_data_source_inventory(job_a,'test-worker');
  if a is null then raise exception 'Inventory reservation failed'; end if;
  perform public.begin_data_source_publish(job_a,'test-worker');
  -- Reject Onhold, and verify that the previous snapshot has not been deleted.
  select count(*) into n from public.pickup_48h_no_api2;
  begin
    perform public.publish_central_pickup(job_a,'test-worker','test',now(),'[{"tracking_id":"TEST","area":"KV1","status":"Pickup Onhold"}]',array['KV1'],true);
    raise exception 'Invalid pickup accepted';
  exception when raise_exception then
    if SQLERRM='Invalid pickup accepted' then raise; end if;
  end;
  if (select count(*) from public.pickup_48h_no_api2)<>n then raise exception 'Failed validation changed stock'; end if;
  n:=public.publish_central_pickup(job_a,'test-worker','test-filled',now(),'[{"tracking_id":"CENTRAL-INTEGRATION-ONLY","shipment_id":"TEST","sls_tracking_number":"TEST","pickup_station_id":"","pickup_station_name":"","pickup_point_id":"","pickup_point_name":"","pickup_point_district":"","full_address":"","create_time":"","cot_group":"","zone_name":"","assigned_riders_today":"","ward":"","area":"KV1","status":"Assigned"}]',array['KV1'],true);
  if n<>1 or not exists(select 1 from public.pickup_48h_no_api2 where tracking_id='CENTRAL-INTEGRATION-ONLY' and snapshot_id='test-filled') then raise exception 'Non-empty snapshot not published'; end if;
  -- New publication uses upsert and removes old scope rows only after the full insert succeeds.
  update public.lmhub_fetch_jobs set status='RUNNING' where id=(select legacy_job_id from public.data_source_jobs where id=job_a);
  -- A complete empty snapshot is allowed and remains within its area; outer transaction rolls back.
  n:=public.publish_central_pickup(job_a,'test-worker','test',now(),'[]',array['KV1'],true);
  if n<>0 then raise exception 'Empty snapshot incorrect'; end if;
  if exists(select 1 from public.pickup_48h_no_api2 where area='KV1') then raise exception 'Stale pickup remains'; end if;
  if not public.finish_data_source_job(job_a,'test-worker','SUCCEEDED') then raise exception 'Inventory ack failed'; end if;
  insert into public.lmhub_fetch_jobs(status,message,params) values('PENDING','integration combined','{"kind":"all"}');
  perform public.bridge_combined_inventory();
  if exists(select 1 from public.lmhub_fetch_jobs where message='integration combined' and status='PENDING') then raise exception 'Combined legacy button not bridged'; end if;
  if not exists(select 1 from public.activity_logs where entity_type='data_sources' and raw_data->>'source'='pickup_inventory') then raise exception 'Missing control audit'; end if;
end $$;
