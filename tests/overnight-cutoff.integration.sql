do $$
declare fn text; job uuid:=gen_random_uuid(); rows jsonb; result jsonb; n integer;
begin
 -- Fixed clock only inside this rolled-back transaction; public callers cannot supply a clock.
 fn:=pg_get_functiondef('public.publish_overnight_hold(uuid,text,jsonb,timestamptz)'::regprocedure);
 execute replace(fn,'now()','''2099-01-02T23:05:00+07''::timestamptz');
 insert into public.data_source_jobs(id,source_id,report_date,status,worker_id,phase,lease_until)
 values(job,'onhold_daily','2099-01-02','RUNNING','overnight-test','publishing','2099-01-03T00:00:00+07');
 rows:=jsonb_build_array(jsonb_build_object('order_key',repeat('a',64),'order_code','OVERNIGHT-TEST-A','status',1,
 'rider_code','rider-original','rider_name','Test','area','Khu vực 1','district','Test','ward','Test','reason','unknown',
 'reason_label','Test','delivering_at','2099-01-02T08:00:00+07'));
 begin
  perform public.publish_overnight_hold(job,'overnight-test',rows,'2099-01-02T22:59:00+07');
  raise exception 'TEST: early capture accepted';
 exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 begin
  perform public.publish_overnight_hold(job,'overnight-test',jsonb_set(rows,'{0,delivering_at}','"2099-01-01T08:00:00+07"'),'2099-01-02T23:04:00+07');
  raise exception 'TEST: wrong delivering day accepted';
 exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 insert into public.overnight_hold_snapshots(cutoff_date,captured_at,status) values('2099-01-02','2099-01-02T14:00:00+07','invalid');
 insert into public.overnight_hold_orders(cutoff_date,order_key,order_code,area,note,is_cutoff_member)
 values('2099-01-02',repeat('a',64),'OVERNIGHT-TEST-A','Khu vực 1','existing note',false),
 ('2099-01-02',repeat('b',64),'DAYTIME-ONLY','Khu vực 1','audit note',false);
 result:=public.publish_overnight_hold(job,'overnight-test',rows,'2099-01-02T23:04:00+07');
 if (result->>'total_orders')::integer<>1 then raise exception 'Wrong snapshot size'; end if;
 if not exists(select 1 from public.overnight_hold_orders where cutoff_date='2099-01-02' and order_code='OVERNIGHT-TEST-A' and note='existing note' and is_cutoff_member)
 or not exists(select 1 from public.overnight_hold_orders where cutoff_date='2099-01-02' and order_code='DAYTIME-ONLY' and note='audit note' and not is_cutoff_member)
 then raise exception 'Daytime notes lost or invalid membership reused'; end if;
 update public.overnight_hold_orders set note='preserve note' where cutoff_date='2099-01-02';
 result:=public.publish_overnight_hold(job,'overnight-test',rows||jsonb_set(rows,'{0,order_code}','"NEW-ORDER"'),'2099-01-02T23:04:00+07');
 if result->>'already_locked'<>'true' then raise exception 'Snapshot not frozen'; end if;
 select count(*) into n from public.overnight_hold_orders where cutoff_date='2099-01-02' and is_cutoff_member;
 if n<>1 then raise exception 'Recapture added orders'; end if;
 perform public.sync_overnight_hold_status('2099-01-02');
 if not exists(select 1 from public.overnight_hold_orders where cutoff_date='2099-01-02' and current_status='Delivering'
 and rider_code='rider-original' and note='preserve note') then raise exception 'Missing scan inferred delivery, changed rider or lost note'; end if;
 if has_function_privilege('authenticated','public.publish_overnight_hold(uuid,text,jsonb,timestamptz)','EXECUTE')
 or has_function_privilege('anon','public.capture_overnight_hold(date,text)','EXECUTE') then raise exception 'Public capture privileges'; end if;
end $$;
