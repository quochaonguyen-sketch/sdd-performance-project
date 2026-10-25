-- Daily OH snapshots: aggregate cells only. No identifiers, names, addresses or raw JSON.
create table if not exists public.onhold_daily_reports (
  report_date date primary key, fetched_at timestamptz not null default now(),
  job_id uuid not null, input_count integer not null check(input_count>=0),
  excluded_count integer not null check(excluded_count>=0), total_orders integer not null check(total_orders>=0)
);
create table if not exists public.onhold_daily_pivot (
  report_date date not null references public.onhold_daily_reports(report_date) on delete cascade,
  area text not null check(area in ('Khu vực 1','Khu vực 2','Khu vực 3','Khu vực 4','Khu vực 5','Chưa rõ KV')),
  reason text not null check(reason='unknown' or reason ~ '^[0-9]{1,6}$'),
  hour smallint not null check(hour between -1 and 23),
  status smallint not null check(status in (1,5)), orders integer not null check(orders>0),
  primary key(report_date,area,reason,hour,status)
);
alter table public.onhold_daily_reports enable row level security;
alter table public.onhold_daily_pivot enable row level security;
revoke all on public.onhold_daily_reports,public.onhold_daily_pivot from public,anon,authenticated;
grant all on public.onhold_daily_reports,public.onhold_daily_pivot to service_role;

create or replace function public.publish_central_onhold(p_job uuid,p_worker text,p_cells jsonb,p_input integer,p_excluded integer,p_complete boolean)
returns integer language plpgsql security invoker set search_path=pg_catalog as $$
declare j public.data_source_jobs; total integer;
begin
  perform pg_advisory_xact_lock(948251,8);
  select * into j from public.data_source_jobs where id=p_job and source_id='onhold_daily' and worker_id=p_worker
    and status in ('RUNNING','CANCEL_REQUESTED') and phase='publishing' and lease_until>now() for update;
  if not found then raise exception 'Invalid OH ownership'; end if;
  if p_complete is distinct from true or jsonb_typeof(p_cells) is distinct from 'array'
    or p_input is null or p_input<0 or p_excluded is null or p_excluded<0 then raise exception 'Incomplete OH pivot'; end if;
  -- Strict allowlist prevents accidental raw fields from entering a publication payload.
  if exists(select 1 from jsonb_array_elements(p_cells) r where jsonb_typeof(r)<>'object'
    or (select count(*) from jsonb_object_keys(r))<>5
    or not r ?& array['area','reason','hour','status','orders']) then raise exception 'OH accepts aggregate cells only'; end if;
  select coalesce(sum((r->>'orders')::integer),0) into total from jsonb_array_elements(p_cells) r;
  if total+p_excluded<>p_input then raise exception 'OH source total mismatch'; end if;
  insert into public.onhold_daily_reports(report_date,job_id,input_count,excluded_count,total_orders)
    values(j.report_date,p_job,p_input,p_excluded,total)
    on conflict(report_date) do update set fetched_at=now(),job_id=excluded.job_id,input_count=excluded.input_count,
      excluded_count=excluded.excluded_count,total_orders=excluded.total_orders;
  delete from public.onhold_daily_pivot where report_date=j.report_date;
  insert into public.onhold_daily_pivot(report_date,area,reason,hour,status,orders)
    select j.report_date,r.area,r.reason,r.hour,r.status,r.orders
    from jsonb_to_recordset(p_cells) as r(area text,reason text,hour smallint,status smallint,orders integer);
  return total;
end $$;
revoke all on function public.publish_central_onhold(uuid,text,jsonb,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.publish_central_onhold(uuid,text,jsonb,integer,integer,boolean) to service_role;

-- One consistent MVCC read; a missing day is distinct from a completed empty day.
create or replace function public.read_onhold_pivot(p_from date,p_to date)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
  select jsonb_build_object('reports',coalesce((select jsonb_agg(r order by r.report_date) from
    (select report_date,fetched_at,input_count,excluded_count,total_orders from public.onhold_daily_reports
      where report_date between p_from and p_to and p_to-p_from between 0 and 92) r),'[]'::jsonb),
    'cells',coalesce((select jsonb_agg(c order by c.report_date,c.area,c.reason,c.hour,c.status) from
    (select * from public.onhold_daily_pivot where report_date between p_from and p_to and p_to-p_from between 0 and 92) c),'[]'::jsonb));
$$;
revoke all on function public.read_onhold_pivot(date,date) from public,anon,authenticated;
grant execute on function public.read_onhold_pivot(date,date) to service_role;
notify pgrst,'reload schema';
