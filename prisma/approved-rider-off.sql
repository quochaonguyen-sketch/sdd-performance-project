create or replace function public.import_approved_rider_off(p_rows jsonb)
returns integer
language plpgsql security invoker set search_path = pg_catalog
as $$
declare imported integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1000 then
    raise exception 'Invalid approved OFF batch';
  end if;
  perform pg_advisory_xact_lock(72532, 1);
  with inserted as (
    insert into public.attendance_logs (rider_id, rider_code, work_date, status, raw_data)
    select rider.id, rider.rider_code, entry.work_date, entry.status,
           jsonb_build_object('source', 'off_registration_approved', 'request_id', entry.request_id)
    from jsonb_to_recordset(p_rows) as entry(rider_id uuid, rider_code text, work_date date, status text, request_id uuid)
    join public.riders rider on rider.id = entry.rider_id and rider.rider_code = entry.rider_code
    where rider.kv in ('KV1','KV2','KV3','KV4','KV5')
      and entry.status in ('OFF_WEEKLY','OFF_APPROVED','OFF_UNEXPECTED') and entry.request_id is not null
    on conflict (rider_code, work_date) do nothing
    returning rider_code, work_date, status
  ), queued as (
    insert into public.attendance_sheet_sync_outbox (rider_code, work_date, attendance_status, operation)
    select rider_code, work_date, status, 'UPSERT'
    from inserted
    where not exists (
      select 1 from pg_trigger
      where tgrelid = 'public.attendance_logs'::regclass
        and tgname = 'attendance_sheet_sync_outbox_trigger' and tgenabled in ('O','A')
    )
    returning id
  )
  select count(*)::integer into imported from inserted;
  return imported;
end;
$$;
revoke all on function public.import_approved_rider_off(jsonb) from public, anon, authenticated;
grant execute on function public.import_approved_rider_off(jsonb) to service_role;

create or replace function public.save_rider_schedule(p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare result jsonb;
begin
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) not between 1 and 1000 then
    raise exception 'Dữ liệu lịch rider không hợp lệ';
  end if;
  perform pg_advisory_xact_lock(72532, 1);
  if exists (
    select 1 from jsonb_to_recordset(p_changes) as c(rider_id uuid, work_date date, status text)
    left join public.riders r on r.id=c.rider_id and r.kv in ('KV1','KV2','KV3','KV4','KV5')
    where r.id is null or c.work_date is null or c.status is null
      or c.status not in ('ON','OFF_WEEKLY','OFF_APPROVED','OFF_UNEXPECTED','WORKING_REST_DAY','NO_PICKUP','NO_DELIVERY')
  ) then
    raise exception 'Có rider hoặc trạng thái không hợp lệ';
  end if;
  with changes as materialized (
    select c.*, r.rider_code from jsonb_to_recordset(p_changes) as c(rider_id uuid, work_date date, status text, shift text, note text)
    join public.riders r on r.id=c.rider_id
  ), cleared as (
    delete from public.attendance_logs l using changes c
    where c.status='ON' and l.rider_code=c.rider_code and l.work_date=c.work_date
    returning l.rider_code,l.work_date,l.status,l.raw_data->>'source' as source
  ), saved as (
    insert into public.attendance_logs(rider_id, rider_code, work_date, status, shift, note, raw_data)
    select rider_id, rider_code, work_date, status, shift, note, jsonb_build_object('source','schedule_ui','status',status)
    from changes where status<>'ON'
    on conflict (rider_code, work_date) do update
      set rider_id=excluded.rider_id, status=excluded.status, shift=excluded.shift, note=excluded.note, raw_data=excluded.raw_data
    returning *
  ), queued as (
    insert into public.attendance_sheet_sync_outbox(rider_code, work_date, attendance_status, operation)
    select c.rider_code, c.work_date, c.status, case when c.status='ON' then 'CLEAR' else 'UPSERT' end
    from changes c left join cleared d using (rider_code,work_date)
    where not exists (
      select 1 from pg_trigger where tgrelid='public.attendance_logs'::regclass
        and tgname='attendance_sheet_sync_outbox_trigger' and tgenabled in ('O','A')
    ) or (
      c.status='ON' and (d.source in ('google_sheet_off','google_sheet_webhook') or d.status is null
        or d.status not in ('OFF_WEEKLY','OFF_APPROVED','OFF_UNEXPECTED','WORKING_REST_DAY','NO_PICKUP','NO_DELIVERY'))
    )
    returning id
  )
  select jsonb_build_object(
    'logs',coalesce((select jsonb_agg(to_jsonb(saved)) from saved),'[]'::jsonb),
    'cleared',coalesce((select jsonb_agg(jsonb_build_object('rider_id',rider_id,'work_date',work_date)) from changes where status='ON'),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.save_rider_schedule(jsonb) from public, anon, authenticated;
grant execute on function public.save_rider_schedule(jsonb) to service_role;

create or replace function public.import_google_rider_schedule(
  p_rows jsonb, p_seen jsonb, p_from date, p_to date, p_spreadsheet text
)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare result jsonb;
begin
  if p_from is null or p_to is null or p_to-p_from not between 0 and 30
    or p_spreadsheet is null or jsonb_typeof(p_rows) is distinct from 'array'
    or jsonb_typeof(p_seen) is distinct from 'array' then
    raise exception 'Invalid Google OFF range';
  end if;
  perform pg_advisory_xact_lock(72532, 1);
  with pending as materialized (
    select distinct rider_code, work_date from public.attendance_sheet_sync_outbox
    where work_date between p_from and p_to and state in ('PENDING','PROCESSING','FAILED')
  ), incoming as materialized (
    select r.id as rider_id, r.rider_code, c.work_date, c.status
    from jsonb_to_recordset(p_rows) as c(rider_id uuid, rider_code text, work_date date, status text)
    join public.riders r on r.id=c.rider_id and r.rider_code=c.rider_code and r.kv in ('KV1','KV2','KV3','KV4','KV5')
    where c.work_date between p_from and p_to and c.status in ('OFF_WEEKLY','OFF_APPROVED','OFF_UNEXPECTED','WORKING_REST_DAY','NO_PICKUP','NO_DELIVERY')
  ), saved as (
    insert into public.attendance_logs(rider_id,rider_code,work_date,status,raw_data)
    select c.rider_id,c.rider_code,c.work_date,c.status,jsonb_build_object('source','google_sheet_off','spreadsheet_id',p_spreadsheet)
    from incoming c where not exists(select 1 from pending p where p.rider_code=c.rider_code and p.work_date=c.work_date)
    on conflict (rider_code,work_date) do update set rider_id=excluded.rider_id, status=excluded.status, raw_data=excluded.raw_data
    where attendance_logs.status is distinct from excluded.status
    returning 1
  ), cleared as (
    delete from public.attendance_logs l
    where l.work_date between p_from and p_to
      and l.raw_data @> jsonb_build_object('source','google_sheet_off','spreadsheet_id',p_spreadsheet)
      and not p_seen ? (l.rider_code || '|' || l.work_date::text)
      and not exists(select 1 from pending p where p.rider_code=l.rider_code and p.work_date=l.work_date)
    returning 1
  )
  select jsonb_build_object('imported',(select count(*) from saved),'removed',(select count(*) from cleared),
    'pending',(select count(*) from incoming c join pending p using(rider_code,work_date))) into result;
  return result;
end;
$$;
revoke all on function public.import_google_rider_schedule(jsonb,jsonb,date,date,text) from public, anon, authenticated;
grant execute on function public.import_google_rider_schedule(jsonb,jsonb,date,date,text) to service_role;

create table if not exists public.attendance_sheet_writer_lease (
  singleton boolean primary key default true check (singleton),
  owner uuid not null,
  expires_at timestamptz not null
);
alter table public.attendance_sheet_writer_lease enable row level security;
revoke all on public.attendance_sheet_writer_lease from public, anon, authenticated;
grant select,insert,update,delete on public.attendance_sheet_writer_lease to service_role;

create or replace function public.acquire_attendance_sheet_writer(p_owner uuid)
returns boolean language sql security invoker set search_path=pg_catalog as $$
  with claimed as (
    insert into public.attendance_sheet_writer_lease(singleton, owner, expires_at)
    values (true, p_owner, now() + interval '90 seconds')
    on conflict(singleton) do update set owner=excluded.owner, expires_at=excluded.expires_at
      where attendance_sheet_writer_lease.expires_at <= now()
    returning 1
  ) select exists(select 1 from claimed);
$$;

create or replace function public.read_attendance_sheet_queue_values(p_ids uuid[])
returns table(rider_code text, rider_name text, work_date date, status text)
language sql stable security invoker set search_path=pg_catalog as $$
  select distinct q.rider_code, coalesce(r.full_name::text,''), q.work_date, coalesce(l.status::text,'ON')
  from public.attendance_sheet_sync_outbox q
  join public.riders r on r.rider_code=q.rider_code and r.kv in ('KV1','KV2','KV3','KV4','KV5')
  left join public.attendance_logs l on l.rider_code=q.rider_code and l.work_date=q.work_date
  where q.id=any(p_ids);
$$;
revoke all on function public.acquire_attendance_sheet_writer(uuid), public.read_attendance_sheet_queue_values(uuid[]) from public,anon,authenticated;
grant execute on function public.acquire_attendance_sheet_writer(uuid), public.read_attendance_sheet_queue_values(uuid[]) to service_role;
notify pgrst, 'reload schema';
