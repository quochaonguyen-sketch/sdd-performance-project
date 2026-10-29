-- Requires realtime-delivery-riders.sql and data-source-worker.sql.
alter table public.data_source_settings drop constraint if exists data_source_settings_source_id_check;
alter table public.data_source_settings add constraint data_source_settings_source_id_check
  check(source_id in ('pickup_inventory','delivery_inventory','pickup_realtime','delivery_realtime','pickup_volume','delivery_volume','performance','return_inventory','onhold_daily'));
insert into public.data_source_settings(source_id,interval_seconds) values ('delivery_realtime',600) on conflict do nothing;

create or replace function public.claim_delivery_realtime_once(p_day date)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare j public.data_source_jobs; owner text:='delivery-once-'||gen_random_uuid()::text;
begin
  perform pg_advisory_xact_lock(948251,1);
  if p_day is distinct from (now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'Delivery must use today'; end if;
  if exists(select 1 from public.data_source_jobs where source_id='delivery_realtime' and status in ('QUEUED','RUNNING','CANCEL_REQUESTED')) then return null; end if;
  insert into public.data_source_jobs(source_id,report_date,status,phase,worker_id,started_at,lease_until)
    values('delivery_realtime',p_day,'RUNNING','fetching',owner,now(),now()+interval '2 minutes') returning * into j;
  return to_jsonb(j);
end $$;
revoke all on function public.claim_delivery_realtime_once(date) from public,anon,authenticated;
grant execute on function public.claim_delivery_realtime_once(date) to service_role;

create or replace function public.publish_central_delivery_realtime(p_job uuid,p_worker text,p_rows jsonb,p_at timestamptz)
returns integer language plpgsql security invoker set search_path=pg_catalog set statement_timeout='60s' as $$
declare j public.data_source_jobs; n integer; day date;
begin
  perform pg_advisory_xact_lock(948251,9);
  select * into j from public.data_source_jobs where id=p_job and source_id='delivery_realtime' and worker_id=p_worker
    and status in ('RUNNING','CANCEL_REQUESTED') and phase='publishing' and lease_until>now() for update;
  if not found then raise exception 'Invalid delivery realtime ownership'; end if;
  day:=(p_at at time zone 'Asia/Ho_Chi_Minh')::date;
  if p_at is null or day is distinct from j.report_date or p_at<now()-interval '30 minutes' or p_at>now()+interval '1 minute'
    or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid delivery snapshot'; end if;
  n:=jsonb_array_length(p_rows);
  if n=0 then raise exception 'Empty delivery snapshot'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r where nullif(btrim(r->>'driver_id'),'') is null
    or coalesce((r->>'total_assigned')::integer,0)<=0
    or coalesce((r->>'delivered')::integer,-1)<0 or coalesce((r->>'delivering')::integer,-1)<0
    or coalesce((r->>'failed')::integer,-1)<0 or coalesce((r->>'idle_delivery_seconds')::integer,-1)<0)
    or (select count(distinct r->>'driver_id') from jsonb_array_elements(p_rows) r)<>n then raise exception 'Invalid delivery rider'; end if;
  if exists(select 1 from public.realtime_delivery_riders where snapshot_at>p_at) then
    update public.data_source_jobs set message='Đã có snapshot mới hơn; giữ nguyên dữ liệu hiện tại',
      events=events||jsonb_build_array(jsonb_build_object('at',now(),'message','Đã có snapshot mới hơn; giữ nguyên dữ liệu hiện tại','source_at',p_at))
      where id=p_job;
    return 0;
  end if;
  insert into public.realtime_delivery_riders(work_date,driver_id,driver_name,total_assigned,delivered,delivering,failed,zone_id,first_delivery_at,idle_delivery_seconds,snapshot_id,snapshot_at,raw_data)
  select day,r.driver_id,r.driver_name,r.total_assigned,r.delivered,r.delivering,r.failed,r.zone_id,r.first_delivery_at,r.idle_delivery_seconds,p_job,p_at,null
    from jsonb_populate_recordset(null::public.realtime_delivery_riders,p_rows) r
  on conflict(work_date,driver_id) do update set
    driver_name=excluded.driver_name,total_assigned=excluded.total_assigned,delivered=excluded.delivered,
    delivering=excluded.delivering,failed=excluded.failed,zone_id=excluded.zone_id,first_delivery_at=excluded.first_delivery_at,
    idle_delivery_seconds=excluded.idle_delivery_seconds,snapshot_id=excluded.snapshot_id,snapshot_at=excluded.snapshot_at,raw_data=null;
  delete from public.realtime_delivery_riders where (work_date=day and snapshot_id<>p_job) or work_date<day-1;
  return n;
end $$;
revoke all on function public.publish_central_delivery_realtime(uuid,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.publish_central_delivery_realtime(uuid,text,jsonb,timestamptz) to service_role;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='realtime_delivery_riders') then
    alter publication supabase_realtime add table public.realtime_delivery_riders;
  end if;
end $$;
notify pgrst,'reload schema';
