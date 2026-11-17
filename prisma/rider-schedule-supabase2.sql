begin;

create table if not exists public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid,
  rider_code text not null,
  work_date date not null,
  shift text,
  status text not null,
  note text,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rider_code, work_date)
);
create index if not exists attendance_logs_work_date_idx on public.attendance_logs(work_date);

create table if not exists public.attendance_sheet_sync_outbox (
  id uuid primary key default gen_random_uuid(),
  rider_code text not null,
  work_date date not null,
  attendance_status text not null,
  operation text not null check (operation in ('UPSERT', 'CLEAR')),
  state text not null default 'PENDING' check (state in ('PENDING', 'PROCESSING', 'SYNCED', 'FAILED')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  synced_at timestamptz,
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists attendance_outbox_due on public.attendance_sheet_sync_outbox(next_attempt_at, created_at)
  where state in ('PENDING','FAILED');
create index if not exists attendance_outbox_rider_day on public.attendance_sheet_sync_outbox(rider_code, work_date)
  where state <> 'SYNCED';

create table if not exists public.attendance_sheet_writer_lease (
  singleton boolean primary key default true check(singleton),
  owner uuid not null,
  expires_at timestamptz not null
);

create table if not exists public.rider_off_requests (
  request_id uuid not null,
  rider_code text not null,
  work_date date not null,
  rider_name text not null,
  area text not null,
  cot text not null,
  type text not null,
  shift text not null,
  reason text not null,
  email text not null,
  status text not null default 'Chờ duyệt' check (status in ('Chờ duyệt','Đã duyệt','Từ chối')),
  manager_note text not null default '',
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  primary key (request_id, rider_code, work_date)
);
create index if not exists rider_off_requests_rider_day on public.rider_off_requests(rider_code, work_date);

alter table public.attendance_logs enable row level security;
alter table public.attendance_sheet_sync_outbox enable row level security;
alter table public.attendance_sheet_writer_lease enable row level security;
alter table public.rider_off_requests enable row level security;
revoke all on public.attendance_logs, public.attendance_sheet_sync_outbox, public.attendance_sheet_writer_lease, public.rider_off_requests from public, anon, authenticated;
grant select, insert, update, delete on public.attendance_logs, public.attendance_sheet_sync_outbox, public.attendance_sheet_writer_lease to service_role;
grant select, insert on public.rider_off_requests to service_role;

create or replace function public.attendance_updated_at()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if current_setting('app.attendance_restore', true) is distinct from 'on' then
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists attendance_updated_at on public.attendance_logs;
create trigger attendance_updated_at before update on public.attendance_logs
  for each row execute function public.attendance_updated_at();
drop trigger if exists attendance_updated_at on public.attendance_sheet_sync_outbox;
create trigger attendance_updated_at before update on public.attendance_sheet_sync_outbox
  for each row execute function public.attendance_updated_at();

create or replace function public.queue_attendance_sheet_sync()
returns trigger language plpgsql set search_path = pg_catalog as $$
declare
  rider text;
  day date;
  calendar_status text;
begin
  if current_setting('app.attendance_restore', true) = 'on' or current_setting('app.attendance_from_google', true) = 'on' then
    return null;
  end if;
  if tg_op = 'DELETE' then
    rider := old.rider_code;
    day := old.work_date;
    calendar_status := 'ON';
  else
    rider := new.rider_code;
    day := new.work_date;
    calendar_status := new.status;
  end if;
  if calendar_status in ('ON','OFF_WEEKLY','OFF_APPROVED','OFF_UNEXPECTED','WORKING_REST_DAY','NO_PICKUP','NO_DELIVERY','OFF_HOLIDAY','SUPPORT','APP_LOCKED') then
    insert into public.attendance_sheet_sync_outbox(rider_code,work_date,attendance_status,operation)
    values (rider,day,calendar_status,case when calendar_status='ON' then 'CLEAR' else 'UPSERT' end);
  end if;
  return null;
end $$;
drop trigger if exists attendance_sheet_sync_outbox_trigger on public.attendance_logs;
create trigger attendance_sheet_sync_outbox_trigger after insert or update or delete on public.attendance_logs
  for each row execute function public.queue_attendance_sheet_sync();

create or replace function public.save_rider_schedule(p_changes jsonb)
returns jsonb language plpgsql set search_path = pg_catalog as $$
declare result jsonb;
begin
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) not between 1 and 1000 then
    raise exception 'Invalid attendance batch';
  end if;
  perform pg_advisory_xact_lock(72532, 1);
  with changes as materialized (
    select * from jsonb_to_recordset(p_changes) as c(rider_id uuid,rider_code text,work_date date,status text,shift text,note text,raw_data jsonb)
  ), cleared as (
    delete from public.attendance_logs l using changes c
    where c.status='ON' and l.rider_code=c.rider_code and l.work_date=c.work_date
    returning l.rider_code,l.work_date
  ), saved as (
    insert into public.attendance_logs(rider_id,rider_code,work_date,status,shift,note,raw_data)
    select rider_id,rider_code,work_date,status,shift,note,coalesce(raw_data,jsonb_build_object('source','schedule_ui','status',status))
    from changes where status<>'ON'
    on conflict (rider_code,work_date) do update
      set rider_id=excluded.rider_id,status=excluded.status,shift=excluded.shift,note=excluded.note,raw_data=excluded.raw_data
    returning *
  ), queued as (
    insert into public.attendance_sheet_sync_outbox(rider_code,work_date,attendance_status,operation)
    select c.rider_code,c.work_date,'ON','CLEAR'
    from changes c where c.status='ON' and not exists (
      select 1 from cleared d where d.rider_code=c.rider_code and d.work_date=c.work_date
    )
  )
  select jsonb_build_object(
    'logs',coalesce((select jsonb_agg(to_jsonb(saved)) from saved),'[]'::jsonb),
    'cleared',coalesce((select jsonb_agg(jsonb_build_object('rider_id',rider_id,'work_date',work_date)) from changes where status='ON'),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.import_google_rider_schedule(
  p_rows jsonb, p_seen jsonb, p_from date, p_to date, p_spreadsheet text, p_webhook boolean default false
)
returns jsonb language plpgsql set search_path = pg_catalog as $$
declare result jsonb;
begin
  if p_from is null or p_to is null or p_from>p_to or (not p_webhook and p_to-p_from>30) then
    raise exception 'Invalid Google OFF range';
  end if;
  perform pg_advisory_xact_lock(72532, 1);
  perform set_config('app.attendance_from_google','on',true);
  with incoming as materialized (
    select * from jsonb_to_recordset(p_rows) as c(rider_id uuid,rider_code text,work_date date,status text)
    where work_date between p_from and p_to
      and status in ('ON','OFF_WEEKLY','OFF_APPROVED','OFF_UNEXPECTED','WORKING_REST_DAY','NO_PICKUP','NO_DELIVERY','OFF_HOLIDAY','SUPPORT','APP_LOCKED')
  ), pending as materialized (
    select distinct rider_code,work_date from public.attendance_sheet_sync_outbox
    where work_date between p_from and p_to and state<>'SYNCED'
  ), saved as (
    insert into public.attendance_logs(rider_id,rider_code,work_date,status,raw_data)
    select rider_id,rider_code,work_date,status,jsonb_build_object(
      'source',case when p_webhook then 'google_sheet_webhook' else 'google_sheet_off' end,'spreadsheet_id',p_spreadsheet)
    from incoming c where status<>'ON'
      and not exists(select 1 from pending p where p.rider_code=c.rider_code and p.work_date=c.work_date)
    on conflict (rider_code,work_date) do update set rider_id=excluded.rider_id,status=excluded.status,raw_data=excluded.raw_data
      where attendance_logs.status is distinct from excluded.status
    returning 1
  ), cleared as (
    delete from public.attendance_logs l
    where l.work_date between p_from and p_to
      and not exists(select 1 from pending p where p.rider_code=l.rider_code and p.work_date=l.work_date)
      and (
        (p_webhook and exists(select 1 from incoming i where i.rider_code=l.rider_code and i.work_date=l.work_date and i.status='ON'))
        or (not p_webhook and l.raw_data->>'spreadsheet_id'=p_spreadsheet
          and l.raw_data->>'source' in ('google_sheet_off','google_sheet_webhook')
          and not p_seen ? (l.rider_code || '|' || l.work_date::text))
      )
    returning 1
  )
  select jsonb_build_object('imported',(select count(*) from saved),'removed',(select count(*) from cleared),
    'pending',(select count(*) from incoming join pending using (rider_code,work_date))) into result;
  perform set_config('app.attendance_from_google','off',true);
  return result;
end $$;

create or replace function public.submit_rider_off(p_request jsonb, p_days date[])
returns text language plpgsql set search_path = pg_catalog as $$
declare
  item public.rider_off_requests%rowtype := jsonb_populate_record(null::public.rider_off_requests,p_request);
begin
  if cardinality(p_days) not between 1 and 31 or item.request_id is null or item.rider_code is null then
    raise exception 'Invalid OFF request';
  end if;
  perform pg_advisory_xact_lock(72532, 1);
  if exists(select 1 from public.rider_off_requests r where r.request_id=item.request_id) then
    if (select count(*) from public.rider_off_requests r where r.request_id=item.request_id)=cardinality(p_days)
      and (select count(*) from public.rider_off_requests r where r.request_id=item.request_id and r.rider_code=item.rider_code
        and r.work_date=any(p_days) and r.type=item.type and r.shift=item.shift and r.reason=item.reason and r.email=item.email)=cardinality(p_days) then
      return 'saved';
    end if;
    return 'duplicate';
  end if;
  if exists(select 1 from public.rider_off_requests r where r.rider_code=item.rider_code and r.work_date=any(p_days)) then
    return 'duplicate';
  end if;
  insert into public.rider_off_requests(request_id,rider_code,work_date,rider_name,area,cot,type,shift,reason,email)
  select item.request_id,item.rider_code,day,item.rider_name,item.area,item.cot,item.type,item.shift,item.reason,item.email
  from unnest(p_days) as day;
  return 'saved';
end $$;

create or replace function public.decide_rider_off(
  p_request_id uuid, p_rider_code text, p_work_date date, p_status text, p_manager_note text,
  p_decided_by uuid, p_rider_id uuid
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  item public.rider_off_requests%rowtype;
  calendar_status text;
begin
  if p_status is null or p_status not in ('Đã duyệt','Từ chối') or p_manager_note is null or length(p_manager_note)>500
    or (p_status='Từ chối' and btrim(p_manager_note)='') then
    raise exception 'Invalid OFF decision';
  end if;
  perform pg_advisory_xact_lock(72532, 1);
  select * into item from public.rider_off_requests
  where request_id=p_request_id and rider_code=p_rider_code and work_date=p_work_date;
  if not found then return jsonb_build_object('conflict','request'); end if;
  if item.decided_at is not null then
    if item.status=p_status and item.manager_note=p_manager_note then return jsonb_build_object('success',true); end if;
    return jsonb_build_object('conflict','request');
  end if;
  if item.status='Từ chối' or (item.status='Đã duyệt' and p_status='Từ chối') then
    return jsonb_build_object('conflict','request');
  end if;
  if p_status='Đã duyệt' then
    if p_rider_id is null then return jsonb_build_object('conflict','rider'); end if;
    calendar_status := case item.type when 'OFF tuần' then 'OFF_WEEKLY' when 'OFF có phép' then 'OFF_APPROVED'
      when 'OFF đột xuất' then 'OFF_UNEXPECTED' end;
    if item.shift<>'Cả ngày' or calendar_status is null then return jsonb_build_object('conflict','shift'); end if;
    insert into public.attendance_logs(rider_id,rider_code,work_date,status,raw_data)
    values (p_rider_id,p_rider_code,p_work_date,calendar_status,jsonb_build_object('source','off_registration_approved','request_id',p_request_id))
    on conflict (rider_code,work_date) do nothing;
    if not found and not exists (
      select 1 from public.attendance_logs l where l.rider_code=p_rider_code and l.work_date=p_work_date
        and l.status=calendar_status and l.raw_data->>'request_id'=p_request_id::text
    ) then return jsonb_build_object('conflict','schedule'); end if;
  end if;
  update public.rider_off_requests set status=p_status,manager_note=p_manager_note,decided_at=now(),decided_by=p_decided_by
  where request_id=p_request_id and rider_code=p_rider_code and work_date=p_work_date;
  return jsonb_build_object('success',true);
end $$;

create or replace function public.acquire_attendance_sheet_writer(p_owner uuid)
returns boolean language sql set search_path = pg_catalog as $$
  with claimed as (
    insert into public.attendance_sheet_writer_lease(singleton,owner,expires_at)
    values (true,p_owner,now()+interval '90 seconds')
    on conflict(singleton) do update set owner=excluded.owner,expires_at=excluded.expires_at
      where attendance_sheet_writer_lease.expires_at<=now()
    returning 1
  ) select exists(select 1 from claimed);
$$;

create or replace function public.read_attendance_sheet_queue_values(p_ids uuid[])
returns table(rider_code text,work_date date,status text)
language sql stable set search_path = pg_catalog as $$
  select distinct q.rider_code,q.work_date,coalesce(l.status,'ON')
  from public.attendance_sheet_sync_outbox q
  left join public.attendance_logs l using (rider_code,work_date)
  where q.id=any(p_ids);
$$;

create or replace function public.restore_attendance_logs(p_rows jsonb)
returns void language plpgsql set search_path = pg_catalog as $$
begin
  perform set_config('app.attendance_restore','on',true);
  insert into public.attendance_logs
  select * from jsonb_populate_recordset(null::public.attendance_logs,p_rows)
  on conflict (rider_code,work_date) do nothing;
  perform set_config('app.attendance_restore','off',true);
end $$;

revoke all on function public.save_rider_schedule(jsonb), public.import_google_rider_schedule(jsonb,jsonb,date,date,text,boolean),
  public.submit_rider_off(jsonb,date[]), public.decide_rider_off(uuid,text,date,text,text,uuid,uuid),
  public.acquire_attendance_sheet_writer(uuid), public.read_attendance_sheet_queue_values(uuid[]), public.restore_attendance_logs(jsonb)
  from public,anon,authenticated;
grant execute on function public.save_rider_schedule(jsonb), public.import_google_rider_schedule(jsonb,jsonb,date,date,text,boolean),
  public.submit_rider_off(jsonb,date[]), public.decide_rider_off(uuid,text,date,text,text,uuid,uuid),
  public.acquire_attendance_sheet_writer(uuid), public.read_attendance_sheet_queue_values(uuid[]), public.restore_attendance_logs(jsonb)
  to service_role;
notify pgrst, 'reload schema';
commit;
