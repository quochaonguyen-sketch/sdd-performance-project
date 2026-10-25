-- Current-day dedup keys survive worker restarts. Only aggregate history survives day close.
alter table public.onhold_daily_reports add column if not exists collection_mode text not null default 'snapshot' check(collection_mode in ('snapshot','cumulative'));
alter table public.onhold_daily_reports add column if not exists collection_started_at timestamptz;
alter table public.onhold_daily_reports add column if not exists finalized_at timestamptz;
alter table public.onhold_daily_reports add column if not exists scan_count integer not null default 0;
alter table public.onhold_daily_reports add column if not exists last_input_count integer not null default 0;
alter table public.onhold_daily_reports add column if not exists last_new_count integer not null default 0;
alter table public.onhold_daily_pivot add column if not exists district text not null default 'Chưa rõ quận';
alter table public.onhold_daily_pivot add column if not exists ward text not null default 'Chưa rõ phường';
alter table public.onhold_daily_pivot add column if not exists rider_code text not null default 'unknown';
alter table public.onhold_daily_pivot add column if not exists rider_name text not null default 'Chưa rõ rider';
alter table public.onhold_daily_pivot add column if not exists reason_label text not null default '';
alter table public.onhold_daily_pivot drop constraint if exists onhold_daily_pivot_pkey;
alter table public.onhold_daily_pivot add primary key(report_date,area,reason,hour,status,district,ward,rider_code,rider_name,reason_label);

create table if not exists public.onhold_daily_seen (
  report_date date not null references public.onhold_daily_reports(report_date),
  order_key text not null check(order_key ~ '^[a-f0-9]{64}$'),
  primary key(report_date,order_key)
);
create table if not exists public.onhold_snapshot_archive (
  report_date date primary key, fetched_at timestamptz not null, total_orders integer not null, cells jsonb not null
);
alter table public.onhold_daily_seen enable row level security;
alter table public.onhold_snapshot_archive enable row level security;
revoke all on public.onhold_daily_seen,public.onhold_snapshot_archive from public,anon,authenticated;
grant select,insert,delete on public.onhold_daily_seen to service_role;
grant select,insert on public.onhold_snapshot_archive to service_role;
insert into public.onhold_snapshot_archive
  select r.report_date,r.fetched_at,r.total_orders,coalesce((select jsonb_agg(c) from public.onhold_daily_pivot c where c.report_date=r.report_date),'[]'::jsonb)
  from public.onhold_daily_reports r where collection_mode='snapshot' on conflict do nothing;

create or replace function public.finalize_onhold_days(p_now timestamptz default now())
returns integer language plpgsql security invoker set search_path=pg_catalog as $$
declare n integer;
begin
  perform pg_advisory_xact_lock(948251,8);
  update public.onhold_daily_reports set finalized_at=p_now
    where collection_mode='cumulative' and finalized_at is null and report_date<(p_now at time zone 'Asia/Ho_Chi_Minh')::date;
  get diagnostics n=row_count;
  delete from public.onhold_daily_seen where report_date<(p_now at time zone 'Asia/Ho_Chi_Minh')::date;
  return n;
end $$;

-- Retire replacement snapshots: an old worker must never erase cumulative counts.
create or replace function public.publish_central_onhold(p_job uuid,p_worker text,p_cells jsonb,p_input integer,p_excluded integer,p_complete boolean)
returns integer language plpgsql security invoker set search_path=pg_catalog as $$
begin raise exception 'OH snapshot publication retired; update worker to cumulative collection'; end $$;

create or replace function public.record_central_onhold(p_job uuid,p_worker text,p_events jsonb,p_input integer,p_excluded integer,p_started timestamptz)
returns jsonb language plpgsql security invoker set search_path=pg_catalog set statement_timeout='60s' as $$
declare j public.data_source_jobs; current_day date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date; added integer; total integer;
begin
  perform pg_advisory_xact_lock(948251,8);
  select * into j from public.data_source_jobs where id=p_job and source_id='onhold_daily' and worker_id=p_worker
    and status in ('RUNNING','CANCEL_REQUESTED') and phase='publishing' and lease_until>now() for update;
  if not found or j.report_date<>current_day then raise exception 'Invalid OH ownership or closed report date'; end if;
  if p_started is null or p_started>now() or (p_started at time zone 'Asia/Ho_Chi_Minh')::date<>current_day
    or jsonb_typeof(p_events) is distinct from 'array' or p_input is null or p_excluded is null
    or p_excluded<0 or p_input<>jsonb_array_length(p_events)+p_excluded then raise exception 'Incomplete OH scan'; end if;
  if exists(select 1 from jsonb_array_elements(p_events) r where jsonb_typeof(r)<>'object'
    or (select count(*) from jsonb_object_keys(r))<>10
    or not r ?& array['order_key','area','reason','hour','status','district','ward','rider_code','rider_name','reason_label']) then
    raise exception 'OH accepts digest and pivot dimensions only'; end if;
  -- Validate dimensions before any mutation; never persist original SPX payloads.
  if exists(select 1 from jsonb_array_elements(p_events) r where
    coalesce(r->>'order_key','') !~ '^[a-f0-9]{64}$'
    or coalesce(r->>'area','') not in ('Khu vực 1','Khu vực 2','Khu vực 3','Khu vực 4','Khu vực 5','Chưa rõ KV')
    or coalesce(r->>'reason','') !~ '^([0-9]{1,6}|unknown)$'
    or (r->>'hour')::integer not between -1 and 23 or (r->>'status')::integer not in (1,5)
    or nullif(r->>'district','') is null or length(r->>'district')>150
    or nullif(r->>'ward','') is null or length(r->>'ward')>150
    or nullif(r->>'rider_code','') is null or length(r->>'rider_code')>100
    or nullif(r->>'rider_name','') is null or length(r->>'rider_name')>150
    or nullif(r->>'reason_label','') is null or length(r->>'reason_label')>200
    or r->>'hour' is null or r->>'status' is null) then raise exception 'Invalid OH dimensions'; end if;
  if (select count(distinct r->>'order_key') from jsonb_array_elements(p_events) r)<>jsonb_array_length(p_events) then raise exception 'Duplicate OH keys in scan'; end if;
  perform public.finalize_onhold_days();
  if exists(select 1 from public.onhold_daily_reports where report_date=current_day and finalized_at is not null) then raise exception 'OH day already finalized'; end if;
  -- A legacy snapshot has no dedup keys and cannot be added to cumulative figures.
  delete from public.onhold_daily_pivot where report_date=current_day and exists
    (select 1 from public.onhold_daily_reports where report_date=current_day and collection_mode='snapshot');
  insert into public.onhold_daily_reports(report_date,job_id,input_count,excluded_count,total_orders,collection_mode,collection_started_at)
    values(current_day,p_job,0,0,0,'cumulative',p_started)
    on conflict(report_date) do update set total_orders=case when onhold_daily_reports.collection_mode='snapshot' then 0 else onhold_daily_reports.total_orders end,
      input_count=case when onhold_daily_reports.collection_mode='snapshot' then 0 else onhold_daily_reports.input_count end,
      excluded_count=0,collection_mode='cumulative',collection_started_at=coalesce(onhold_daily_reports.collection_started_at,p_started);
  with events as (select * from jsonb_to_recordset(p_events) as e(order_key text,area text,reason text,hour smallint,status smallint,district text,ward text,rider_code text,rider_name text,reason_label text)),
  fresh as (insert into public.onhold_daily_seen(report_date,order_key) select current_day,order_key from events on conflict do nothing returning order_key),
  cells as (insert into public.onhold_daily_pivot(report_date,area,reason,hour,status,district,ward,rider_code,rider_name,reason_label,orders)
    select current_day,e.area,e.reason,e.hour,e.status,e.district,e.ward,e.rider_code,e.rider_name,e.reason_label,count(*)::integer
      from events e join fresh f using(order_key) group by e.area,e.reason,e.hour,e.status,e.district,e.ward,e.rider_code,e.rider_name,e.reason_label
    on conflict(report_date,area,reason,hour,status,district,ward,rider_code,rider_name,reason_label)
      do update set orders=onhold_daily_pivot.orders+excluded.orders returning orders)
  select count(*)::integer into added from fresh;
  select coalesce(sum(orders),0)::integer into total from public.onhold_daily_pivot where report_date=current_day;
  update public.onhold_daily_reports set total_orders=total,input_count=total,last_input_count=p_input,fetched_at=now(),
    last_new_count=case when job_id=p_job and scan_count>0 then last_new_count else added end,
    scan_count=scan_count+case when job_id=p_job and scan_count>0 then 0 else 1 end,job_id=p_job where report_date=current_day;
  return jsonb_build_object('new_orders',added,'total_orders',total);
end $$;

create or replace function public.read_onhold_pivot(p_from date,p_to date)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
  select jsonb_build_object('reports',coalesce((select jsonb_agg(r order by r.report_date) from
    (select report_date,fetched_at,input_count,excluded_count,total_orders,collection_mode,collection_started_at,finalized_at,scan_count,last_input_count,last_new_count
      from public.onhold_daily_reports where report_date between p_from and p_to and p_to-p_from between 0 and 92) r),'[]'::jsonb),
    'cells',coalesce((select jsonb_agg(c order by c.report_date,c.area,c.reason,c.hour,c.status) from
    (select * from public.onhold_daily_pivot where report_date between p_from and p_to and p_to-p_from between 0 and 92) c),'[]'::jsonb));
$$;
revoke all on function public.finalize_onhold_days(timestamptz),public.record_central_onhold(uuid,text,jsonb,integer,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.finalize_onhold_days(timestamptz),public.record_central_onhold(uuid,text,jsonb,integer,integer,timestamptz) to service_role;
notify pgrst,'reload schema';
