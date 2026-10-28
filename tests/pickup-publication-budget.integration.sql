-- All tables and the publisher under test are transaction-local copies.
do $$
declare job uuid:=gen_random_uuid(); legacy uuid:=gen_random_uuid(); rows jsonb; n integer;
begin
 insert into pg_temp.pickup_test_legacy(id,status,worker_id) values(legacy,'RUNNING','pickup-budget-test');
 insert into pg_temp.pickup_test_jobs(id,source_id,report_date,status,phase,worker_id,lease_until,legacy_job_id)
 values(job,'pickup_inventory',current_date,'RUNNING','publishing','pickup-budget-test',now()+interval '10 minutes',legacy);
 insert into pg_temp.pickup_test_rows(tracking_id,area,status,snapshot_id) values('OTHER-AREA','KV2','Assigned','previous');
 select jsonb_agg(jsonb_build_object('tracking_id','BUDGET-TEST-'||i,'shipment_id','BUDGET-TEST-'||i,
 'sls_tracking_number','BUDGET-TEST-'||i,'area','KV1','status','Assigned','ward','Phường kiểm thử',
 'district','Quận kiểm thử','cot_group','COT 1','full_address',repeat('TEST ',60),
 'pickup_point_name',repeat('TEST ',20),'assigned_riders_today','TEST','pickup_point_id','TEST-'||i,
 'pickup_station_id','4232','pickup_station_name','TEST','pickup_point_district','TEST','create_time','', 'zone_name','TEST')) into rows
 from generate_series(1,12000) i;
 begin
  perform pg_temp.pickup_test_publish(job,'wrong-owner','test-filled',now(),rows,array['KV1'],true);
  raise exception 'TEST: wrong worker allowed';
 exception when raise_exception then if sqlerrm like 'TEST:%' then raise; end if; end;
 n:=pg_temp.pickup_test_publish(job,'pickup-budget-test','test-filled',now(),rows,array['KV1'],true);
 if n<>12000 or (select count(*) from pg_temp.pickup_test_rows where snapshot_id='test-filled')<>12000
 then raise exception 'Large pickup snapshot incomplete'; end if;
 if not exists(select 1 from pg_temp.pickup_test_legacy where id=legacy and status='DONE' and row_count=12000)
 then raise exception 'Large pickup snapshot not acknowledged'; end if;
 if pg_temp.pickup_test_publish(job,'pickup-budget-test','test-filled',now(),rows,array['KV1'],true)<>12000
 then raise exception 'Idempotent acknowledgement broken'; end if;
 update pg_temp.pickup_test_legacy set status='RUNNING' where id=legacy;
 begin
  perform pg_temp.pickup_test_publish(job,'pickup-budget-test','test-invalid',now(),'[]',array['KV1'],false);
  raise exception 'TEST: incomplete empty snapshot allowed';
 exception when raise_exception then if sqlerrm like 'TEST:%' then raise; end if; end;
 begin
  perform pg_temp.pickup_test_publish(job,'pickup-budget-test','test-invalid',now(),
    '[{"tracking_id":"BAD","area":"KV1","status":"Pickup Onhold"}]',array['KV1'],true);
  raise exception 'TEST: invalid status allowed';
 exception when raise_exception then if sqlerrm like 'TEST:%' then raise; end if; end;
 if (select count(*) from pg_temp.pickup_test_rows where area='KV1')<>12000 then raise exception 'Validation changed existing snapshot'; end if;
 n:=pg_temp.pickup_test_publish(job,'pickup-budget-test','test-empty',now(),'[]',array['KV1'],true);
 if n<>0 or exists(select 1 from pg_temp.pickup_test_rows where area='KV1')
 or not exists(select 1 from pg_temp.pickup_test_rows where tracking_id='OTHER-AREA') then raise exception 'Scoped replacement broken'; end if;
end $$;
