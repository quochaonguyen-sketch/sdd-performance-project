do $$
declare job uuid:=gen_random_uuid(); day date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date; rows jsonb; bad jsonb;
begin
 insert into public.data_source_workers(id,hostname,version,concurrency) values('wh-test','test','1.5-pick13-lh-unseal-wh1',1)
 on conflict(id) do update set version=excluded.version,last_seen_at=now();
 insert into public.data_source_jobs(id,source_id,report_date,status,phase,worker_id,lease_until)
 values(job,'wh_tracking',day,'RUNNING','publishing','wh-test',now()+interval '5 minutes');
 rows:=jsonb_build_array(jsonb_build_object('shipment_id','WH_TEST_001','raw_status','Delivered','area','KV4','attempt',0,'created_at',now()-interval '2 hours','delivered_at',now()));
 begin
  perform public.publish_wh_tracking(job,'wrong-worker','4232',rows,now());raise exception 'TEST: wrong ownership accepted';
 exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 foreach bad in array array[rows||rows,jsonb_set(rows,'{0,area}','"KV6"'),jsonb_set(rows,'{0,delivered_at}',to_jsonb(now()-interval '2 days')),jsonb_set(rows,'{0,buyer_address}','"forbidden"'),jsonb_set(rows,'{0,created_at}','"bad"')] loop
  begin
   perform public.publish_wh_tracking(job,'wh-test','4232',bad,now());raise exception 'TEST: invalid snapshot accepted';
  exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 end loop;
 update public.data_source_workers set version='old-worker' where id='wh-test';
 begin
  perform public.publish_wh_tracking(job,'wh-test','4232',rows,now());raise exception 'TEST: old worker published';
 exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 update public.data_source_workers set version='1.5-wh1' where id='wh-test';
 if public.publish_wh_tracking(job,'wh-test','4232',rows,now())<>1 then raise exception 'Wrong row count'; end if;
 if public.publish_wh_tracking(job,'wh-test','4232','[]',now())<>0 then raise exception 'Empty complete snapshot rejected'; end if;
 if has_table_privilege('anon','public.wh_tracking_snapshots','SELECT') or has_table_privilege('authenticated','public.wh_tracking_snapshots','SELECT')
 or has_function_privilege('authenticated','public.publish_wh_tracking(uuid,text,text,jsonb,timestamptz)','EXECUTE') then raise exception 'WH publicly accessible'; end if;
 if position('wh1' in pg_get_functiondef('public.claim_data_source_job(text)'::regprocedure))=0 then raise exception 'Missing WH claim guard'; end if;
end $$;
