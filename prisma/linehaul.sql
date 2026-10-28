alter table public.data_source_settings drop constraint if exists data_source_settings_source_id_check;
alter table public.data_source_settings add constraint data_source_settings_source_id_check
check(source_id in ('pickup_inventory','delivery_inventory','pickup_realtime','delivery_realtime','pickup_volume','delivery_volume','performance','return_inventory','onhold_daily','linehaul'));
insert into public.data_source_settings(source_id,interval_seconds) values('linehaul',300) on conflict do nothing;
-- Extend the installed control function without replacing unrelated scheduler behavior.
do $$
declare source text; replacement text;
begin
 source:=pg_get_functiondef('public.control_data_source(text,text,date,uuid,boolean,integer)'::regprocedure);
 if position('''linehaul''' in source)=0 then
  replacement:=replace(source,'''return_inventory'',''onhold_daily''','''return_inventory'',''onhold_daily'',''linehaul''');
  if replacement=source then raise exception 'Source allowlist differs from expected definition'; end if;
  execute replacement;
 end if;
end $$;

-- Mixed worker versions share this queue. Old machines must not claim the new LH contract.
do $$
declare source text; replacement text;
begin
 source:=pg_get_functiondef('public.claim_data_source_job(text)'::regprocedure);
 if position('lh-unseal' in source)=0 then
  source:=replace(replace(source,'lh-history','lh-unseal'),'lh-dashboard','lh-unseal');
  if position('lh-unseal' in source)>0 then execute source; return; end if;
  replacement:=replace(source,'where status=''QUEUED'' order by',
   'where status=''QUEUED'' and (source_id<>''linehaul'' or exists(select 1 from public.data_source_workers w where w.id=p_worker and w.version like ''%lh-unseal%'')) order by');
  if replacement=source then raise exception 'Claim function differs from expected definition'; end if;
  execute replacement;
 end if;
end $$;

create table if not exists public.linehaul_snapshots (
 station_id text not null, report_date date not null, snapshot_at timestamptz not null,
 job_id uuid not null, trips jsonb not null check(jsonb_typeof(trips)='array'),
 primary key(station_id,report_date)
);
alter table public.linehaul_snapshots enable row level security;
revoke all on public.linehaul_snapshots from public,anon,authenticated;
grant select,insert,update on public.linehaul_snapshots to service_role;

create or replace function public.publish_linehaul(p_job uuid,p_worker text,p_station text,p_rows jsonb,p_at timestamptz)
returns integer language plpgsql security invoker set search_path=pg_catalog as $$
declare j public.data_source_jobs; day date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
 perform pg_advisory_xact_lock(948251,19);
 select * into j from public.data_source_jobs where id=p_job and source_id='linehaul' and report_date=day
 and worker_id=p_worker and status in ('RUNNING','CANCEL_REQUESTED') and phase='publishing' and lease_until>now() for update;
 if not found then raise exception 'Invalid LH job ownership'; end if;
 if not exists(select 1 from public.data_source_workers where id=p_worker and version like '%lh-unseal%' and last_seen_at>now()-interval '45 seconds')
 then raise exception 'LH worker upgrade required'; end if;
 if p_station<>'4232' or p_station is null or p_at is null or p_at>now()+interval '1 minute'
 or (p_at at time zone 'Asia/Ho_Chi_Minh')::date<>day or p_at<now()-interval '10 minutes'
 or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid LH snapshot'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where coalesce(r->>'trip_id','')!~'^([0-9]+|LT[A-Za-z0-9]+)$'
 or (r->>'trip_day')::date is distinct from day or nullif(r->>'lt_code','') is null
 or nullif(trim(r->>'driver_name'),'') is null
 or coalesce(r->>'direction','') not in ('inbound','outbound','stopover')
 or coalesce(r->>'phase','') not in ('waiting','en_route','at_hub','unloading','departed','unloaded')
 or (r->>'lat')::numeric not between -90 and 90 or (r->>'lng')::numeric not between -180 and 180
 or (r->>'orders')::numeric<0 or (r->>'bags')::numeric<0 or (r->>'loose')::numeric<0)
 or (select count(distinct r->>'trip_id') from jsonb_array_elements(p_rows) r)<>jsonb_array_length(p_rows)
 then raise exception 'Invalid or duplicate LH trip'; end if;
 insert into public.linehaul_snapshots(station_id,report_date,snapshot_at,job_id,trips) values(p_station,day,p_at,p_job,p_rows)
 on conflict(station_id,report_date) do update set snapshot_at=excluded.snapshot_at,job_id=excluded.job_id,trips=excluded.trips
 where linehaul_snapshots.snapshot_at<=excluded.snapshot_at;
 return jsonb_array_length(p_rows);
end $$;
revoke all on function public.publish_linehaul(uuid,text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.publish_linehaul(uuid,text,text,jsonb,timestamptz) to service_role;
notify pgrst,'reload schema';
