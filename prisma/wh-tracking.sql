-- Add WH without replacing installed scheduling, queue or inventory functions.
alter table public.data_source_settings drop constraint if exists data_source_settings_source_id_check;
alter table public.data_source_settings add constraint data_source_settings_source_id_check
check(source_id in ('pickup_inventory','delivery_inventory','pickup_realtime','delivery_realtime','pickup_volume','delivery_volume','performance','return_inventory','onhold_daily','linehaul','wh_tracking'));
insert into public.data_source_settings(source_id,interval_seconds) values('wh_tracking',300) on conflict do nothing;
do $$
declare source text; replacement text;
begin
 source:=pg_get_functiondef('public.control_data_source(text,text,date,uuid,boolean,integer)'::regprocedure);
 if position('''wh_tracking''' in source)=0 then
  replacement:=replace(source,'''linehaul'')','''linehaul'',''wh_tracking'')');
  if replacement=source then raise exception 'Control allowlist differs from expected definition'; end if;
  execute replacement;
 end if;
 source:=pg_get_functiondef('public.claim_data_source_job(text)'::regprocedure);
 if position('wh1' in source)=0 then
  replacement:=replace(source,'where status=''QUEUED'' and',
   'where status=''QUEUED'' and (source_id<>''wh_tracking'' or exists(select 1 from public.data_source_workers w where w.id=p_worker and w.version like ''%wh1%'')) and');
  if replacement=source then raise exception 'Claim function differs from expected definition'; end if;
  execute replacement;
 end if;
end $$;

create table if not exists public.wh_tracking_snapshots(
 station_id text not null,report_date date not null,snapshot_at timestamptz not null,
 job_id uuid not null,orders jsonb not null check(jsonb_typeof(orders)='array'),
 primary key(station_id,report_date)
);
alter table public.wh_tracking_snapshots enable row level security;
revoke all on public.wh_tracking_snapshots from public,anon,authenticated;
grant select,insert,update on public.wh_tracking_snapshots to service_role;

create or replace function public.publish_wh_tracking(p_job uuid,p_worker text,p_station text,p_rows jsonb,p_at timestamptz)
returns integer language plpgsql security invoker set search_path=pg_catalog as $$
declare j public.data_source_jobs; day date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
 perform pg_advisory_xact_lock(948251,21);
 select * into j from public.data_source_jobs where id=p_job and source_id='wh_tracking' and report_date=day
 and worker_id=p_worker and status in ('RUNNING','CANCEL_REQUESTED') and phase='publishing' and lease_until>now() for update;
 if not found then raise exception 'Invalid WH job ownership'; end if;
 if not exists(select 1 from public.data_source_workers where id=p_worker and version like '%wh1%' and last_seen_at>now()-interval '45 seconds')
 then raise exception 'WH worker upgrade required'; end if;
 if p_station is distinct from '4232' or p_at is null or p_at>now()+interval '1 minute' or p_at<now()-interval '10 minutes'
 or (p_at at time zone 'Asia/Ho_Chi_Minh')::date<>day or jsonb_typeof(p_rows) is distinct from 'array'
 then raise exception 'Invalid WH snapshot'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where jsonb_typeof(r)<>'object') then raise exception 'Invalid WH row'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where
  coalesce(r->>'shipment_id','')!~'^[A-Z0-9_-]{1,100}$'
  or coalesce(r->>'raw_status','') not in ('Created','LMhub_received','Delivering','Delivered','Onhold','SOC_pendingReceive')
  or coalesce(r->>'area','') not in ('KV1','KV2','KV3','KV4','KV5','UNRESOLVED')
  or (r->>'attempt' is not null and r->>'attempt'!~'^[0-9]{1,6}$')
  or (r->>'delivered_at' is not null and ((r->>'delivered_at')::timestamptz at time zone 'Asia/Ho_Chi_Minh')::date<>day)
  or (r->>'raw_status'='Delivered' and r->>'delivered_at' is null)
  or exists(select 1 from jsonb_object_keys(r) k where k not in ('shipment_id','tracking_number','raw_status','area','district','ward','zone','driver_id','driver_name','attempt','onhold_reason','created_at','received_at','delivering_at','delivered_at','onhold_at','soc_pending_at')))
 or (select count(distinct r->>'shipment_id') from jsonb_array_elements(p_rows) r)<>jsonb_array_length(p_rows)
 then raise exception 'Invalid or duplicate WH order'; end if;
 -- Reject invalid timestamp strings before they reach the dashboard, including optional fields.
 perform (r->>k)::timestamptz from jsonb_array_elements(p_rows) r
 cross join unnest(array['created_at','received_at','delivering_at','delivered_at','onhold_at','soc_pending_at']) k
 where r->>k is not null;
 insert into public.wh_tracking_snapshots(station_id,report_date,snapshot_at,job_id,orders) values(p_station,day,p_at,p_job,p_rows)
 on conflict(station_id,report_date) do update set snapshot_at=excluded.snapshot_at,job_id=excluded.job_id,orders=excluded.orders
 where wh_tracking_snapshots.snapshot_at<=excluded.snapshot_at;
 return jsonb_array_length(p_rows);
end $$;
revoke all on function public.publish_wh_tracking(uuid,text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.publish_wh_tracking(uuid,text,text,jsonb,timestamptz) to service_role;
notify pgrst,'reload schema';
