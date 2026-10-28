-- Onhold daily orders storage, viewing and exporting
create table if not exists public.onhold_daily_orders (
  report_date date not null references public.onhold_daily_reports(report_date) on delete cascade,
  order_key text not null,
  order_code text not null,
  area text not null,
  district text not null,
  ward text not null,
  reason text not null,
  reason_label text not null,
  status smallint not null,
  hour smallint not null,
  rider_code text not null,
  rider_name text not null,
  created_at timestamptz not null default now(),
  primary key(report_date, order_key)
);

create index if not exists idx_onhold_daily_orders_filter
  on public.onhold_daily_orders(report_date, area, district, ward, reason, status);
create index if not exists idx_onhold_daily_orders_code
  on public.onhold_daily_orders(order_code);

alter table public.onhold_daily_orders enable row level security;
revoke all on public.onhold_daily_orders from public, anon, authenticated;
grant select, insert, update, delete on public.onhold_daily_orders to service_role;

create or replace function public.finalize_onhold_days(p_now timestamptz default now())
returns integer language plpgsql security invoker set search_path=pg_catalog as $$
declare n integer;
begin
  perform pg_advisory_xact_lock(948251,8);
  update public.onhold_daily_reports set finalized_at=p_now
    where collection_mode='cumulative' and finalized_at is null and report_date<(p_now at time zone 'Asia/Ho_Chi_Minh')::date;
  get diagnostics n=row_count;
  delete from public.onhold_daily_seen where report_date<(p_now at time zone 'Asia/Ho_Chi_Minh')::date-6;
  delete from public.onhold_daily_orders where report_date<(p_now at time zone 'Asia/Ho_Chi_Minh')::date-6;
  return n;
end $$;

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
    or not r ?& array['order_key','area','reason','hour','status','district','ward','rider_code','rider_name','reason_label']
    or exists(select 1 from jsonb_object_keys(r) k where k not in ('order_key','order_code','area','reason','hour','status','district','ward','rider_code','rider_name','reason_label'))) then
    raise exception 'OH accepts digest and pivot dimensions only'; end if;
  -- Validate dimensions before any mutation
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
    or r->>'hour' is null or r->>'status' is null
    or (r ? 'order_code' and length(r->>'order_code') > 100)) then raise exception 'Invalid OH dimensions'; end if;
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
  with events as (select * from jsonb_to_recordset(p_events) as e(order_key text,order_code text,area text,reason text,hour smallint,status smallint,district text,ward text,rider_code text,rider_name text,reason_label text)),
  fresh as (insert into public.onhold_daily_seen(report_date,order_key) select current_day,order_key from events on conflict do nothing returning order_key),
  cells as (insert into public.onhold_daily_pivot(report_date,area,reason,hour,status,district,ward,rider_code,rider_name,reason_label,orders)
    select current_day,e.area,e.reason,e.hour,e.status,e.district,e.ward,e.rider_code,e.rider_name,e.reason_label,count(*)::integer
      from events e join fresh f using(order_key) group by e.area,e.reason,e.hour,e.status,e.district,e.ward,e.rider_code,e.rider_name,e.reason_label
    on conflict(report_date,area,reason,hour,status,district,ward,rider_code,rider_name,reason_label)
      do update set orders=onhold_daily_pivot.orders+excluded.orders returning orders),
  orders_ins as (
    insert into public.onhold_daily_orders(report_date, order_key, order_code, area, district, ward, reason, reason_label, status, hour, rider_code, rider_name)
      select current_day, e.order_key, coalesce(nullif(e.order_code,''), e.order_key), e.area, e.district, e.ward, e.reason, e.reason_label, e.status, e.hour, e.rider_code, e.rider_name
      from events e
      on conflict (report_date, order_key) do update
        set order_code = excluded.order_code
        where onhold_daily_orders.order_code = onhold_daily_orders.order_key and excluded.order_code <> excluded.order_key
  )
  select count(*)::integer into added from fresh;
  select coalesce(sum(orders),0)::integer into total from public.onhold_daily_pivot where report_date=current_day;
  update public.onhold_daily_reports set total_orders=total,input_count=total,last_input_count=p_input,fetched_at=now(),
    last_new_count=case when job_id=p_job and scan_count>0 then last_new_count else added end,
    scan_count=scan_count+case when job_id=p_job and scan_count>0 then 0 else 1 end,job_id=p_job where report_date=current_day;
  return jsonb_build_object('new_orders',added,'total_orders',total);
end $$;

create or replace function public.read_onhold_orders(
  p_day date,
  p_area text default 'all',
  p_status text default 'all',
  p_reason text default 'all',
  p_district text default 'all',
  p_ward text default 'all',
  p_q text default '',
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare
  v_has_snapshot boolean;
  v_total integer;
  v_orders jsonb;
begin
  select exists(select 1 from public.onhold_daily_orders where report_date = p_day) into v_has_snapshot;

  if not v_has_snapshot then
    return jsonb_build_object(
      'has_snapshot', false,
      'total', 0,
      'orders', '[]'::jsonb,
      'limit', p_limit,
      'offset', p_offset
    );
  end if;

  select count(*) into v_total
  from public.onhold_daily_orders o
  where o.report_date = p_day
    and (p_area = 'all' or o.area = p_area)
    and (p_status = 'all' or o.status::text = p_status)
    and (p_reason = 'all' or o.reason = p_reason)
    and (p_district = 'all' or o.district = p_district)
    and (p_ward = 'all' or o.ward = p_ward)
    and (p_q = '' or o.order_code ilike '%' || p_q || '%' or o.rider_name ilike '%' || p_q || '%' or o.rider_code ilike '%' || p_q || '%');

  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_orders
  from (
    select o.order_code, o.area, o.district, o.ward, o.reason, o.reason_label, o.status, o.hour, o.rider_code, o.rider_name, o.created_at
    from public.onhold_daily_orders o
    where o.report_date = p_day
      and (p_area = 'all' or o.area = p_area)
      and (p_status = 'all' or o.status::text = p_status)
      and (p_reason = 'all' or o.reason = p_reason)
      and (p_district = 'all' or o.district = p_district)
      and (p_ward = 'all' or o.ward = p_ward)
      and (p_q = '' or o.order_code ilike '%' || p_q || '%' or o.rider_name ilike '%' || p_q || '%' or o.rider_code ilike '%' || p_q || '%')
    order by o.created_at desc, o.order_code asc
    limit p_limit offset p_offset
  ) r;

  return jsonb_build_object(
    'has_snapshot', true,
    'total', v_total,
    'orders', v_orders,
    'limit', p_limit,
    'offset', p_offset
  );
end $$;

create or replace function public.export_onhold_orders(
  p_day date,
  p_area text default 'all',
  p_status text default 'all',
  p_reason text default 'all',
  p_district text default 'all',
  p_ward text default 'all',
  p_q text default ''
)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare
  v_has_snapshot boolean;
  v_orders jsonb;
begin
  select exists(select 1 from public.onhold_daily_orders where report_date = p_day) into v_has_snapshot;

  if not v_has_snapshot then
    return jsonb_build_object(
      'has_snapshot', false,
      'total', 0,
      'orders', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_orders
  from (
    select o.order_code, o.area, o.district, o.ward, o.reason, o.reason_label, o.status, o.hour, o.rider_code, o.rider_name
    from public.onhold_daily_orders o
    where o.report_date = p_day
      and (p_area = 'all' or o.area = p_area)
      and (p_status = 'all' or o.status::text = p_status)
      and (p_reason = 'all' or o.reason = p_reason)
      and (p_district = 'all' or o.district = p_district)
      and (p_ward = 'all' or o.ward = p_ward)
      and (p_q = '' or o.order_code ilike '%' || p_q || '%' or o.rider_name ilike '%' || p_q || '%' or o.rider_code ilike '%' || p_q || '%')
    order by o.order_code asc
    limit 20000
  ) r;

  return jsonb_build_object(
    'has_snapshot', true,
    'total', jsonb_array_length(v_orders),
    'orders', v_orders
  );
end $$;

revoke all on function public.finalize_onhold_days(timestamptz),public.record_central_onhold(uuid,text,jsonb,integer,integer,timestamptz),public.read_onhold_orders(date,text,text,text,text,text,text,integer,integer),public.export_onhold_orders(date,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.finalize_onhold_days(timestamptz),public.record_central_onhold(uuid,text,jsonb,integer,integer,timestamptz),public.read_onhold_orders(date,text,text,text,text,text,text,integer,integer),public.export_onhold_orders(date,text,text,text,text,text,text) to service_role;
notify pgrst,'reload schema';
