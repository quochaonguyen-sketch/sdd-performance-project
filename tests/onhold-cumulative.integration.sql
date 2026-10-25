do $$
declare j uuid:=gen_random_uuid(); j2 uuid:=gen_random_uuid(); today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
  events jsonb; result jsonb; baseline integer; n integer; yesterday date:=today-1;
begin
  if exists(select 1 from public.data_source_jobs where source_id='onhold_daily' and status in ('QUEUED','RUNNING','CANCEL_REQUESTED')) then raise exception 'Wait for real OH source job before test'; end if;
  if has_table_privilege('anon','public.onhold_daily_seen','SELECT') or has_table_privilege('authenticated','public.onhold_daily_seen','SELECT') or has_function_privilege('anon','public.finalize_onhold_days(timestamptz)','EXECUTE') then raise exception 'Dedup keys exposed'; end if;
  if not (select relrowsecurity from pg_class where oid='public.onhold_daily_seen'::regclass) then raise exception 'Missing RLS'; end if;
  events:=jsonb_build_array(jsonb_build_object('order_key',repeat('a',64),'area','Khu vực 5','reason','169','hour',10,'status',5,'district','Quận 12','ward','Phường A','rider_code','QA-R1','rider_name','QA Rider','reason_label','Recipient unavailable for parcel'));
  insert into public.data_source_jobs(id,source_id,report_date,status,phase,worker_id,lease_until)
    values(j,'onhold_daily',today,'RUNNING','publishing','qa-cumulative',now()+interval '5 minutes');
  result:=public.record_central_onhold(j,'qa-cumulative',events,1,0,now());
  if (result->>'new_orders')::int<>1 then raise exception 'First observation not inserted'; end if;
  baseline:=(result->>'total_orders')::int;
  result:=public.record_central_onhold(j,'qa-cumulative',events,1,0,now());
  if (result->>'new_orders')::int<>0 or (result->>'total_orders')::int<>baseline then raise exception 'Retry duplicates counted'; end if;
  select scan_count into n from public.onhold_daily_reports where report_date=today;
  -- New process/job sees an empty SPX scan after the order loses OH; count must survive.
  update public.data_source_jobs set status='SUCCEEDED',phase='finished' where id=j;
  insert into public.data_source_jobs(id,source_id,report_date,status,phase,worker_id,lease_until)
    values(j2,'onhold_daily',today,'RUNNING','publishing','qa-restarted',now()+interval '5 minutes');
  result:=public.record_central_onhold(j2,'qa-restarted','[]',0,0,now());
  if (result->>'total_orders')::int<>baseline then raise exception 'Vanished OH order was lost'; end if;
  if (select scan_count from public.onhold_daily_reports where report_date=today)<>n+1 then raise exception 'Scan metadata'; end if;
  -- Same ID with changed rider/reason/status must remain attributed to its first observation.
  events:=jsonb_set(jsonb_set(events,'{0,rider_code}','"QA-R2"'),'{0,status}','1');
  result:=public.record_central_onhold(j2,'qa-restarted',events,1,0,now());
  if (result->>'new_orders')::int<>0 or exists(select 1 from public.onhold_daily_pivot where report_date=today and rider_code='QA-R2') then raise exception 'First attribution changed'; end if;
  begin
    perform public.record_central_onhold(j2,'qa-restarted',jsonb_set(events,'{0,shipment_id}','"raw-id"'),1,0,now());
    raise exception 'Raw key accepted';
  exception when others then if sqlerrm='Raw key accepted' then raise; end if; end;
  -- A second day can count the same identifier under a distinct day-scoped digest.
  insert into public.onhold_daily_reports(report_date,job_id,input_count,excluded_count,total_orders,collection_mode,collection_started_at)
    values(yesterday,j,1,0,1,'cumulative',now()-interval '1 day') on conflict(report_date) do nothing;
  insert into public.onhold_daily_seen values(yesterday,repeat('b',64)) on conflict do nothing;
  perform public.finalize_onhold_days();
  if exists(select 1 from public.onhold_daily_seen where report_date<today) or not exists(select 1 from public.onhold_daily_seen where report_date=today and order_key=repeat('a',64)) then raise exception 'Midnight cleanup wrong scope'; end if;
  if (select finalized_at from public.onhold_daily_reports where report_date=yesterday) is null then raise exception 'Previous day not finalized'; end if;
  perform public.finalize_onhold_days(((today+1)::timestamp at time zone 'Asia/Ho_Chi_Minh'));
  if exists(select 1 from public.onhold_daily_seen where report_date=today) or (select total_orders from public.onhold_daily_reports where report_date=today)<>baseline then raise exception 'Close did not retain pivot only'; end if;
  begin
    perform public.record_central_onhold(j2,'qa-restarted',events,1,0,now());
    raise exception 'Closed day reopened';
  exception when others then if sqlerrm='Closed day reopened' then raise; end if; end;
end $$;
