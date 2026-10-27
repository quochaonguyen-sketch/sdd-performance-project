do $$
declare job uuid:=gen_random_uuid(); day date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date; rows jsonb;
begin
 insert into public.data_source_workers(id,hostname,version,concurrency) values('lh-test','test','1.2-lh-dashboard',1)
 on conflict(id) do update set version=excluded.version,last_seen_at=now();
 insert into public.data_source_jobs(id,source_id,report_date,status,phase,worker_id,lease_until)
 values(job,'linehaul',day,'RUNNING','publishing','lh-test',now()+interval '5 minutes');
 rows:=jsonb_build_array(jsonb_build_object('trip_id','999999991','trip_day',day,'lt_code','LT-TEST','driver_name','Test driver','direction','inbound','phase','en_route','orders',807,'bags',10,'loose',237,'lat',10,'lng',106));
 begin
  perform public.publish_linehaul(job,'wrong-worker','4232',rows,now());raise exception 'TEST: invalid ownership accepted';
 exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 begin
  perform public.publish_linehaul(job,'lh-test','4232',jsonb_set(rows,'{0,trip_day}',to_jsonb(day-1)),now());raise exception 'TEST: past day accepted';
 exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 begin
  perform public.publish_linehaul(job,'lh-test','4232',jsonb_set(rows,'{0,driver_name}','""'),now());raise exception 'TEST: unassigned driver accepted';
 exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 update public.data_source_workers set version='1.0' where id='lh-test';
 begin
  perform public.publish_linehaul(job,'lh-test','4232',rows,now());raise exception 'TEST: old worker published LH snapshot';
 exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
 update public.data_source_workers set version='1.2-lh-dashboard' where id='lh-test';
 if public.publish_linehaul(job,'lh-test','4232',rows,now())<>1 then raise exception 'Wrong row count'; end if;
 perform public.publish_linehaul(job,'lh-test','4232',jsonb_set(rows,'{0,phase}','"unloaded"'),now());
 perform public.publish_linehaul(job,'lh-test','4232',jsonb_set(rows,'{0,trip_id}','"LTTEST001"'),now());
 if not exists(select 1 from public.linehaul_snapshots where station_id='4232' and report_date=day and trips->0->>'lt_code'='LT-TEST') then raise exception 'Snapshot not published'; end if;
 if has_table_privilege('anon','public.linehaul_snapshots','SELECT') or has_table_privilege('authenticated','public.linehaul_snapshots','SELECT')
 or has_function_privilege('anon','public.publish_linehaul(uuid,text,text,jsonb,timestamptz)','EXECUTE') then raise exception 'LH location data publicly accessible'; end if;
end $$;
