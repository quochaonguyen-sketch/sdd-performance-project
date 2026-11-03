-- Capture from the existing atomic worker publication; no browser or cron dependency.
create table if not exists public.pickup_cot_oh_snapshots (
  report_date date not null,
  cot text not null check (cot in ('COT1','COT2')),
  cutoff_at timestamptz not null,
  source_started_at timestamptz not null,
  snapshot_at timestamptz not null,
  snapshot_id text not null,
  riders jsonb not null check (jsonb_typeof(riders)='array' and jsonb_array_length(riders)>0),
  primary key(report_date,cot)
);
alter table public.pickup_cot_oh_snapshots enable row level security;
revoke all on public.pickup_cot_oh_snapshots from public,anon,authenticated,service_role;
grant select,insert on public.pickup_cot_oh_snapshots to service_role;

create or replace function public.pickup_cot_capture_window(p_day date,p_started timestamptz,p_snapshot timestamptz,p_now timestamptz)
returns table(cot text,cutoff_at timestamptz)
language sql immutable set search_path='' as $fn$
  select c.cot, (p_day+c.at_time) at time zone 'Asia/Ho_Chi_Minh'
  from (values ('COT1',time '13:00'),('COT2',time '17:00')) c(cot,at_time)
  where p_day=(p_snapshot at time zone 'Asia/Ho_Chi_Minh')::date
    and p_snapshot between p_now-interval '20 minutes' and p_now+interval '1 minute'
    and p_started between ((p_day+c.at_time) at time zone 'Asia/Ho_Chi_Minh')
      and ((p_day+c.at_time) at time zone 'Asia/Ho_Chi_Minh')+interval '15 minutes'
    and p_snapshot between p_started and ((p_day+c.at_time) at time zone 'Asia/Ho_Chi_Minh')+interval '15 minutes'
$fn$;
revoke all on function public.pickup_cot_capture_window(date,timestamptz,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.pickup_cot_capture_window(date,timestamptz,timestamptz,timestamptz) to service_role;

create or replace function public.capture_pickup_cot_oh()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
  -- Invalid/incomplete quantities must never turn into a partial or zero OH capture.
  if exists(select 1 from jsonb_array_elements(new.riders) r
    where coalesce(r->>'onhold_orders','') !~ '^[0-9]{1,12}$')
    or exists(select 1 from jsonb_array_elements(new.riders) r group by r->>'driver_id' having count(*)>1)
  then return new; end if;
  insert into public.pickup_cot_oh_snapshots(report_date,cot,cutoff_at,source_started_at,snapshot_at,snapshot_id,riders)
  select new.source_date,w.cot,w.cutoff_at,new.inventory_snapshot_at,new.snapshot_at,new.snapshot_id,
    jsonb_agg(jsonb_build_object('id',r->>'driver_id','name',coalesce(nullif(p.full_name,''),p.name,r->>'driver_name',r->>'driver_id'),
      'area',p.kv,'onhold',(r->>'onhold_orders')::bigint) order by r->>'driver_id')
  from public.pickup_cot_capture_window(new.source_date,new.inventory_snapshot_at,new.snapshot_at,statement_timestamp()) w
  cross join jsonb_array_elements(new.riders) r
  join public.riders p on p.rider_code=r->>'driver_id'
    and upper(regexp_replace(p.cot,'\s','','g'))=w.cot and p.kv in ('KV1','KV2','KV3','KV4','KV5')
  where r->>'onhold_orders' ~ '^[0-9]+$'
  group by w.cot,w.cutoff_at
  on conflict(report_date,cot) do nothing;
  return new;
end
$fn$;
revoke all on function public.capture_pickup_cot_oh() from public,anon,authenticated;
grant execute on function public.capture_pickup_cot_oh() to service_role;
drop trigger if exists pickup_cot_oh_capture on public.pickup_realtime_current;
create trigger pickup_cot_oh_capture after insert or update on public.pickup_realtime_current
for each row execute function public.capture_pickup_cot_oh();
