-- Latest complete Return publication per Vietnam calendar day; aggregates only.
create table if not exists public.return_daily_history (
  report_date date primary key,
  snapshot_id text not null,
  captured_at timestamptz not null,
  station_id integer not null check (station_id > 0),
  total_orders integer not null check (total_orders >= 0),
  unknown_area_orders integer not null check (unknown_area_orders between 0 and total_orders),
  capture_count integer not null default 1 check (capture_count > 0)
);
create table if not exists public.return_daily_history_groups (
  report_date date not null references public.return_daily_history(report_date) on delete cascade,
  area text not null check (area in ('KV1','KV2','KV3','KV4','KV5','unknown')),
  district text not null,
  ward text not null,
  total integer not null check (total >= 0),
  waiting integer not null check (waiting >= 0),
  returning_count integer not null check (returning_count >= 0),
  over5_days integer not null check (over5_days between 0 and total),
  returning_over48h integer not null check (returning_over48h between 0 and returning_count),
  unknown_hub_age integer not null check (unknown_hub_age between 0 and total),
  unknown_returning_start integer not null check (unknown_returning_start between 0 and returning_count),
  primary key (report_date,area,district,ward),
  check (waiting + returning_count = total)
);
alter table public.return_daily_history enable row level security;
alter table public.return_daily_history_groups enable row level security;
revoke all on public.return_daily_history,public.return_daily_history_groups from public,anon,authenticated;
grant select,insert,update,delete on public.return_daily_history,public.return_daily_history_groups to service_role;

create or replace function public.capture_return_daily_history(p_snapshot text,p_at timestamptz,p_station integer,p_expected integer)
returns boolean language plpgsql security invoker set search_path=pg_catalog set statement_timeout='30s' as $$
declare day date; existing public.return_daily_history; n integer; unknown_count integer;
begin
  perform pg_advisory_xact_lock(948251,7);
  if nullif(p_snapshot,'') is null or p_at is null or p_at>now()+interval '5 minutes' or p_station is null or p_station<=0 or p_expected is null or p_expected<0 then
    raise exception 'Invalid Return history publication';
  end if;
  day:=(p_at at time zone 'Asia/Ho_Chi_Minh')::date;
  select * into existing from public.return_daily_history where report_date=day for update;
  if found and (existing.captured_at>p_at or (existing.captured_at=p_at and existing.snapshot_id=p_snapshot)) then return false; end if;
  select count(*) into n from public.return_order_snapshots;
  if n<>p_expected or exists(select 1 from public.return_order_snapshots
    where snapshot_id<>p_snapshot or snapshot_at<>p_at or current_station_id<>p_station or order_status not in (10,67,72)) then
    raise exception 'Return history requires the complete published snapshot';
  end if;
  select count(*) into unknown_count from public.return_order_snapshots
    where seller_area not in ('Khu vực 1','Khu vực 2','Khu vực 3','Khu vực 4','Khu vực 5');
  insert into public.return_daily_history(report_date,snapshot_id,captured_at,station_id,total_orders,unknown_area_orders)
    values(day,p_snapshot,p_at,p_station,n,unknown_count)
    on conflict(report_date) do update set snapshot_id=excluded.snapshot_id,captured_at=excluded.captured_at,station_id=excluded.station_id,
      total_orders=excluded.total_orders,unknown_area_orders=excluded.unknown_area_orders,
      capture_count=return_daily_history.capture_count+case when return_daily_history.snapshot_id<>excluded.snapshot_id then 1 else 0 end;
  delete from public.return_daily_history_groups where report_date=day;
  insert into public.return_daily_history_groups
    (report_date,area,district,ward,total,waiting,returning_count,over5_days,returning_over48h,unknown_hub_age,unknown_returning_start)
  select day,case seller_area when 'Khu vực 1' then 'KV1' when 'Khu vực 2' then 'KV2' when 'Khu vực 3' then 'KV3'
      when 'Khu vực 4' then 'KV4' when 'Khu vực 5' then 'KV5' else 'unknown' end,
    coalesce(nullif(btrim(seller_district),''),'Chưa rõ quận'),
    coalesce(nullif(btrim(seller_new_ward),''),nullif(btrim(seller_ward),''),'Chưa rõ phường'),
    count(*),count(*) filter(where order_status in (10,67)),count(*) filter(where order_status=72),
    count(*) filter(where p_at-coalesce(current_station_received_time,receive_time)>interval '5 days'),
    count(*) filter(where order_status=72 and p_at-delivering_time>interval '48 hours'),
    count(*) filter(where coalesce(current_station_received_time,receive_time) is null),
    count(*) filter(where order_status=72 and delivering_time is null)
  from public.return_order_snapshots group by 2,3,4;
  return true;
end $$;
revoke all on function public.capture_return_daily_history(text,timestamptz,integer,integer) from public,anon,authenticated;
grant execute on function public.capture_return_daily_history(text,timestamptz,integer,integer) to service_role;

create or replace function public.read_return_daily_history(p_from date,p_to date)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog set statement_timeout='15s' as $$
begin
  if p_from is null or p_to is null or p_from>p_to or p_to>(now() at time zone 'Asia/Ho_Chi_Minh')::date or p_to-p_from>92 then
    raise exception 'Invalid Return history range';
  end if;
  return jsonb_build_object(
    'days',coalesce((select jsonb_agg(to_jsonb(d) order by report_date) from public.return_daily_history d where report_date between p_from and p_to),'[]'::jsonb),
    'groups',coalesce((select jsonb_agg(to_jsonb(g) order by report_date,area,district,ward) from public.return_daily_history_groups g where report_date between p_from and p_to),'[]'::jsonb));
end $$;
revoke all on function public.read_return_daily_history(date,date) from public,anon,authenticated;
grant execute on function public.read_return_daily_history(date,date) to service_role;
