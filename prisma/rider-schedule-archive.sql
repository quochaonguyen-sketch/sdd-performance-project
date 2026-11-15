-- Apply to the second Supabase project only.
create table if not exists public.rider_schedule_archive (
  schedule_month date primary key check(schedule_month=date_trunc('month',schedule_month)::date),
  version text not null check(version ~ '^[a-f0-9]{32}$'),
  captured_at timestamptz not null,
  row_count integer not null check(row_count >= 0),
  payload jsonb not null check(jsonb_typeof(payload)='array' and jsonb_array_length(payload)=row_count)
);
alter table public.rider_schedule_archive enable row level security;
revoke all on public.rider_schedule_archive from public,anon,authenticated;
grant select,insert,update on public.rider_schedule_archive to service_role;

create or replace function public.publish_rider_schedule_archive(
  p_month date,p_version text,p_captured_at timestamptz,p_count integer,p_rows jsonb
)
returns void language sql security invoker set search_path=pg_catalog as $$
  insert into public.rider_schedule_archive(schedule_month,version,captured_at,row_count,payload)
  values(p_month,p_version,p_captured_at,p_count,p_rows)
  on conflict(schedule_month) do update set version=excluded.version,captured_at=excluded.captured_at,
    row_count=excluded.row_count,payload=excluded.payload
  where rider_schedule_archive.captured_at<=excluded.captured_at;
$$;

create or replace function public.read_archived_rider_schedule(
  p_month date,p_version text,p_code text default null
)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
  select case when p_code is null then a.payload else (
    select coalesce(jsonb_agg(item order by item->>'work_date'),'[]'::jsonb)
    from jsonb_array_elements(a.payload) as item where item->>'rider_code'=p_code
  ) end
  from public.rider_schedule_archive a where a.schedule_month=p_month and a.version=p_version;
$$;

revoke all on function public.publish_rider_schedule_archive(date,text,timestamptz,integer,jsonb),
  public.read_archived_rider_schedule(date,text,text) from public,anon,authenticated;
grant execute on function public.publish_rider_schedule_archive(date,text,timestamptz,integer,jsonb),
  public.read_archived_rider_schedule(date,text,text) to service_role;
notify pgrst, 'reload schema';
