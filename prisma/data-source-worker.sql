-- Control plane: only the authenticated server API and the server-side worker use these tables/RPCs.
create table if not exists public.data_source_settings (
  source_id text primary key check(source_id in ('pickup_inventory','delivery_inventory','pickup_realtime','pickup_volume','delivery_volume','performance','return_inventory','onhold_daily')),
  auto_enabled boolean not null default false,
  interval_seconds integer not null default 1800 check(interval_seconds between 300 and 86400),
  next_run_at timestamptz, updated_at timestamptz not null default now()
);
alter table public.data_source_settings drop constraint if exists data_source_settings_source_id_check;
alter table public.data_source_settings add constraint data_source_settings_source_id_check check(source_id in ('pickup_inventory','delivery_inventory','pickup_realtime','pickup_volume','delivery_volume','performance','return_inventory','onhold_daily'));
alter table public.data_source_settings add column if not exists schedule_mode text not null default 'interval' check(schedule_mode in ('interval','daily'));
alter table public.data_source_settings add column if not exists daily_time time not null default '06:00';
alter table public.data_source_settings add column if not exists day_offset integer not null default 0 check(day_offset in (0,1));
do $$ begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='data_source_settings' and column_name='window_start') then
    alter table public.data_source_settings add column window_start time not null default '08:00';
    alter table public.data_source_settings add column window_end time not null default '00:00';
    update public.data_source_settings set window_start='00:00' where source_id='onhold_daily';
  end if;
end $$;
insert into public.data_source_settings(source_id,interval_seconds) values
 ('pickup_inventory',1800),('delivery_inventory',1800),('pickup_realtime',300),('pickup_volume',1800),('delivery_volume',1800),('performance',1800),('return_inventory',1800),('onhold_daily',300)
on conflict(source_id) do nothing;
create table if not exists public.data_source_workers (
  id text primary key, hostname text not null, version text not null,
  concurrency integer not null check(concurrency between 1 and 4), last_seen_at timestamptz not null default now()
);
create table if not exists public.data_source_jobs (
  id uuid primary key default gen_random_uuid(), source_id text not null references public.data_source_settings,
  report_date date not null, status text not null default 'QUEUED' check(status in ('QUEUED','RUNNING','CANCEL_REQUESTED','SUCCEEDED','FAILED','CANCELLED')),
  phase text not null default 'queued' check(phase in ('queued','fetching','publishing','finished')),
  requested_by uuid, requested_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
  worker_id text, lease_until timestamptz, legacy_job_id uuid references public.lmhub_fetch_jobs(id),
  message text not null default 'Đang chờ máy chủ', events jsonb not null default '[]'::jsonb
);
create unique index if not exists data_source_one_active on public.data_source_jobs(source_id) where status in ('QUEUED','RUNNING','CANCEL_REQUESTED');
create index if not exists data_source_jobs_recent on public.data_source_jobs(requested_at desc);
alter table public.data_source_settings enable row level security;
alter table public.data_source_workers enable row level security;
alter table public.data_source_jobs enable row level security;
revoke all on public.data_source_settings,public.data_source_workers,public.data_source_jobs from public,anon,authenticated;
grant select,insert,update on public.data_source_settings,public.data_source_workers,public.data_source_jobs to service_role;

create or replace function public.next_data_source_daily(p_time time,p_after timestamptz)
returns timestamptz language sql stable security invoker set search_path=pg_catalog as $$
  select ((case when ((p_after at time zone 'Asia/Ho_Chi_Minh')::date+p_time) at time zone 'Asia/Ho_Chi_Minh'>p_after
    then (p_after at time zone 'Asia/Ho_Chi_Minh')::date else (p_after at time zone 'Asia/Ho_Chi_Minh')::date+1 end)+p_time) at time zone 'Asia/Ho_Chi_Minh';
$$;

-- Start inclusive, end exclusive. Equal endpoints represent a full day.
create or replace function public.next_data_source_window(p_start time,p_end time,p_after timestamptz)
returns timestamptz language plpgsql stable security invoker set search_path=pg_catalog as $$
declare local_at timestamp:=p_after at time zone 'Asia/Ho_Chi_Minh'; t time:=local_at::time;
begin
  if p_start=p_end or (p_start<p_end and t>=p_start and t<p_end) or (p_start>p_end and (t>=p_start or t<p_end)) then return p_after; end if;
  return ((local_at::date+case when p_start<p_end and t>=p_end then 1 else 0 end)+p_start) at time zone 'Asia/Ho_Chi_Minh';
end $$;

create or replace function public.configure_data_source_schedule(p_source text,p_actor uuid,p_enabled boolean,p_mode text,p_interval integer,p_time text,p_offset integer,p_start text default null,p_end text default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare s public.data_source_settings; next_at timestamptz;
begin
  if p_mode is null or p_mode not in ('interval','daily') or p_enabled is null or p_interval is null or p_interval not between 300 and 86400
    or p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p_offset is null or p_offset not in (0,1)
    or (p_source not in ('pickup_volume','delivery_volume','performance') and p_offset<>0) then raise exception 'Invalid source schedule'; end if;
  perform pg_advisory_xact_lock(948251,1);
  select * into s from public.data_source_settings where source_id=p_source for update;
  if not found then raise exception 'Unknown source'; end if;
  if (p_start is not null and p_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') or (p_end is not null and p_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'Invalid work window'; end if;
  s.window_start:=coalesce(p_start::time,s.window_start); s.window_end:=coalesce(p_end::time,s.window_end);
  next_at:=case when not p_enabled then null when p_mode='daily' then public.next_data_source_daily(p_time::time,now()) else public.next_data_source_window(s.window_start,s.window_end,now()+make_interval(secs=>p_interval)) end;
  update public.data_source_settings set auto_enabled=p_enabled,schedule_mode=p_mode,interval_seconds=p_interval,
    daily_time=p_time::time,day_offset=p_offset,window_start=s.window_start,window_end=s.window_end,next_run_at=next_at,updated_at=now() where source_id=p_source;
  insert into public.activity_logs(entity_type,action,message,raw_data) values('data_sources','schedule','Lịch nguồn dữ liệu: '||p_source||' · '||p_mode,
    jsonb_build_object('source',p_source,'actor_id',p_actor,'enabled',p_enabled,'mode',p_mode,'daily_time',p_time,'day_offset',p_offset,'interval',p_interval,'window_start',s.window_start,'window_end',s.window_end,'next_run_at',next_at));
  return jsonb_build_object('message','Đã lưu lịch chạy theo giờ Việt Nam','nextRunAt',next_at);
end $$;
drop function if exists public.configure_data_source_schedule(text,uuid,boolean,text,integer,text,integer);

-- One most recent due occurrence is queued after downtime; never replay a backlog of missed days.
-- Busy sources keep their due time until free; insertion and advancement share one lock/transaction.
create or replace function public.enqueue_due_data_sources(p_now timestamptz default now())
returns integer language plpgsql security invoker set search_path=pg_catalog as $$
declare s public.data_source_settings; scheduled_at timestamptz; report_day date; inserted integer; enqueued integer:=0;
begin
  perform pg_advisory_xact_lock(948251,1);
  for s in select * from public.data_source_settings where auto_enabled and next_run_at<=p_now
    for update loop
    if s.schedule_mode='interval' and public.next_data_source_window(s.window_start,s.window_end,p_now)>p_now then
      update public.data_source_settings set next_run_at=public.next_data_source_window(s.window_start,s.window_end,p_now) where source_id=s.source_id;
      continue;
    end if;
    if exists(select 1 from public.data_source_jobs where source_id=s.source_id and status in ('QUEUED','RUNNING','CANCEL_REQUESTED')) then continue; end if;
    scheduled_at:=p_now;
    if s.schedule_mode='daily' then
      scheduled_at:=((p_now at time zone 'Asia/Ho_Chi_Minh')::date+s.daily_time) at time zone 'Asia/Ho_Chi_Minh';
      if scheduled_at>p_now then scheduled_at:=(((p_now at time zone 'Asia/Ho_Chi_Minh')::date-1)+s.daily_time) at time zone 'Asia/Ho_Chi_Minh'; end if;
    end if;
    report_day:=case when s.source_id in ('pickup_volume','delivery_volume','performance') then (scheduled_at at time zone 'Asia/Ho_Chi_Minh')::date-s.day_offset else (p_now at time zone 'Asia/Ho_Chi_Minh')::date end;
    insert into public.data_source_jobs(source_id,report_date,message,events)
      values(s.source_id,report_day,'Đến lượt chạy tự động',jsonb_build_array(jsonb_build_object('at',p_now,'message',case when s.schedule_mode='daily' then 'Lịch hằng ngày '||to_char(s.daily_time,'HH24:MI')||' · giờ Việt Nam' else 'Lịch theo chu kỳ' end,'scheduled_at',scheduled_at,'report_date',report_day)))
      on conflict(source_id) where status in ('QUEUED','RUNNING','CANCEL_REQUESTED') do nothing;
    get diagnostics inserted=row_count;
    if inserted>0 then
      enqueued:=enqueued+1;
      update public.data_source_settings set next_run_at=case when s.schedule_mode='daily' then public.next_data_source_daily(s.daily_time,p_now) else public.next_data_source_window(s.window_start,s.window_end,p_now+make_interval(secs=>s.interval_seconds)) end where source_id=s.source_id;
    end if;
  end loop;
  return enqueued;
end $$;
revoke all on function public.next_data_source_window(time,time,timestamptz),public.next_data_source_daily(time,timestamptz),public.configure_data_source_schedule(text,uuid,boolean,text,integer,text,integer,text,text),public.enqueue_due_data_sources(timestamptz) from public,anon,authenticated;
grant execute on function public.next_data_source_window(time,time,timestamptz),public.next_data_source_daily(time,timestamptz),public.configure_data_source_schedule(text,uuid,boolean,text,integer,text,integer,text,text),public.enqueue_due_data_sources(timestamptz) to service_role;

create or replace function public.control_data_source(p_source text,p_action text,p_day date,p_actor uuid,p_enabled boolean default false,p_interval integer default 1800)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare j public.data_source_jobs; s public.data_source_settings;
begin
  if p_source not in ('pickup_inventory','delivery_inventory','pickup_realtime','pickup_volume','delivery_volume','performance','return_inventory','onhold_daily') or p_action not in ('run','stop','auto') then raise exception 'Invalid source/action'; end if;
  if p_day is null or p_day>(now() at time zone 'Asia/Ho_Chi_Minh')::date or p_day<(now() at time zone 'Asia/Ho_Chi_Minh')::date-366 then raise exception 'Invalid report day'; end if;
  perform pg_advisory_xact_lock(948251,1);
  select * into s from public.data_source_settings where source_id=p_source for update;
  if p_action='run' then
    select * into j from public.data_source_jobs where source_id=p_source and status in ('QUEUED','RUNNING','CANCEL_REQUESTED') limit 1;
    if found then return jsonb_build_object('jobId',j.id,'deduplicated',true,'message','Nguồn này đã có lượt chạy hoặc đang chờ'); end if;
    insert into public.data_source_jobs(source_id,report_date,requested_by,events)
    values(p_source,p_day,p_actor,jsonb_build_array(jsonb_build_object('at',now(),'message','Đã nhận lệnh chạy từ web'))) returning * into j;
  elsif p_action='stop' then
    update public.data_source_jobs set status=case when status='QUEUED' then 'CANCELLED' else 'CANCEL_REQUESTED' end,
      finished_at=case when status='QUEUED' then now() else null end,
      message=case when phase='publishing' then 'Đang ghi dữ liệu; hoàn tất lượt ghi trước khi dừng' else 'Đã nhận yêu cầu dừng' end,
      events=events||jsonb_build_array(jsonb_build_object('at',now(),'message','Người dùng yêu cầu dừng'))
    where source_id=p_source and status in ('QUEUED','RUNNING','CANCEL_REQUESTED') returning * into j;
  else
    if p_interval not between 300 and 86400 then raise exception 'Invalid interval'; end if;
    update public.data_source_settings set auto_enabled=p_enabled,interval_seconds=p_interval,schedule_mode='interval',day_offset=0,
      next_run_at=case when p_enabled then public.next_data_source_window(window_start,window_end,now()+make_interval(secs=>p_interval)) else null end,updated_at=now() where source_id=p_source;
  end if;
  insert into public.activity_logs(entity_type,action,message,raw_data) values('data_sources',p_action,'Nguồn dữ liệu: '||p_source||' · '||p_action,
    jsonb_build_object('source',p_source,'actor_id',p_actor,'job_id',j.id,'report_date',p_day,'enabled',p_enabled,'interval',p_interval));
  return jsonb_build_object('jobId',j.id,'message',case p_action when 'run' then 'Đã xếp lịch chạy trên máy chủ' when 'stop' then 'Đã gửi yêu cầu dừng; bật/tắt tự động là lựa chọn riêng' else 'Đã cập nhật chế độ tự động' end);
end $$;

create or replace function public.pulse_data_source_worker(p_worker text,p_hostname text,p_version text,p_concurrency integer)
returns boolean language sql security invoker set search_path=pg_catalog as $$
  insert into public.data_source_workers(id,hostname,version,concurrency,last_seen_at) values(p_worker,left(p_hostname,100),left(p_version,30),p_concurrency,now())
  on conflict(id) do update set last_seen_at=now(),version=excluded.version,concurrency=excluded.concurrency returning true;
$$;

create or replace function public.claim_data_source_job(p_worker text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare j public.data_source_jobs; s public.data_source_settings; capacity integer;
begin
  perform pg_advisory_xact_lock(948251,1);
  select concurrency into capacity from public.data_source_workers where id=p_worker and last_seen_at>now()-interval '45 seconds';
  if capacity is null then raise exception 'Worker offline'; end if;
  update public.data_source_jobs set status='FAILED',phase='finished',finished_at=now(),message='Mất kết nối worker; kiểm tra máy chủ trước khi chạy lại',
    events=events||jsonb_build_array(jsonb_build_object('at',now(),'message','Worker hết hạn heartbeat'))
    where status in ('RUNNING','CANCEL_REQUESTED') and lease_until<now();
  perform public.enqueue_due_data_sources();
  if (select count(*) from public.data_source_jobs where worker_id=p_worker and status in ('RUNNING','CANCEL_REQUESTED'))>=capacity then return null; end if;
  -- Automatic work queued for capacity must not start after its window closes.
  update public.data_source_jobs queued set status='CANCELLED',phase='finished',finished_at=now(),message='Đã qua khung giờ tự động; chờ lượt trong khung tiếp theo',
    events=queued.events||jsonb_build_array(jsonb_build_object('at',now(),'message','Đã qua khung giờ tự động'))
    from public.data_source_settings config where queued.source_id=config.source_id and queued.status='QUEUED' and (queued.events->0 ? 'scheduled_at')
      and config.schedule_mode='interval' and public.next_data_source_window(config.window_start,config.window_end,now())>now();
  select * into j from public.data_source_jobs where status='QUEUED' order by requested_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update public.data_source_jobs set status='RUNNING',phase='fetching',worker_id=p_worker,started_at=now(),lease_until=now()+interval '2 minutes',message='Máy chủ đang lấy dữ liệu',
    events=events||jsonb_build_array(jsonb_build_object('at',now(),'message','Worker nhận tác vụ')) where id=j.id returning * into j;
  return to_jsonb(j);
end $$;

create or replace function public.pulse_data_source_job(p_job uuid,p_worker text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare j public.data_source_jobs;
begin
  update public.data_source_jobs set lease_until=now()+interval '2 minutes' where id=p_job and worker_id=p_worker and status in ('RUNNING','CANCEL_REQUESTED') returning * into j;
  if not found then return null; end if;
  update public.lmhub_fetch_jobs set updated_at=now() where id in
    (select id from public.lmhub_fetch_jobs where id=j.legacy_job_id and status='RUNNING' for update skip locked);
  return jsonb_build_object('status',j.status,'phase',j.phase);
end $$;

create or replace function public.begin_data_source_publish(p_job uuid,p_worker text)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
begin
  update public.data_source_jobs set phase='publishing',message='Đang ghi dữ liệu; yêu cầu dừng sẽ chờ lượt ghi hoàn tất',
    events=events||jsonb_build_array(jsonb_build_object('at',now(),'message','Bắt đầu ghi dữ liệu'))
    where id=p_job and worker_id=p_worker and status='RUNNING' and lease_until>now() and phase='fetching';
  return found;
end $$;

create or replace function public.begin_data_source_inventory(p_job uuid,p_worker text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare j public.data_source_jobs; legacy public.lmhub_fetch_jobs; kind text; owner text;
begin
  perform pg_advisory_xact_lock(734291,12);
  select * into j from public.data_source_jobs where id=p_job and worker_id=p_worker and status='RUNNING' and lease_until>now() for update;
  if not found or j.source_id not in ('pickup_inventory','delivery_inventory') then raise exception 'Invalid inventory ownership'; end if;
  kind:=case j.source_id when 'pickup_inventory' then 'pickup' else 'delivery' end;
  owner:='sdd-'||kind||'-central-'||p_job::text;
  if exists(select 1 from public.lmhub_fetch_jobs where status='RUNNING' and updated_at>now()-interval '5 minutes'
    and coalesce(params->>'kind','delivery') in (kind,'all','both')) then return null; end if;
  select * into legacy from public.lmhub_fetch_jobs where status='PENDING' and lower(coalesce(params->>'kind',params->>'job',params->>'type','delivery')) in (kind,'ton_'||kind) order by requested_at,id for update skip locked limit 1;
  if not found then
    insert into public.lmhub_fetch_jobs(status,message,params) values('PENDING','Worker trung tâm · '||kind,jsonb_build_object('kind',kind,'source','central_worker')) returning * into legacy;
  end if;
  update public.lmhub_fetch_jobs set status='RUNNING',worker_id=owner,started_at=now(),updated_at=now(),error_message=null,params=coalesce(params,'{}'::jsonb)||jsonb_build_object('kind',kind) where id=legacy.id returning * into legacy;
  update public.data_source_jobs set legacy_job_id=legacy.id where id=j.id;
  return jsonb_build_object('id',legacy.id,'worker_id',owner);
end $$;

create or replace function public.finish_data_source_job(p_job uuid,p_worker text,p_status text)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare j public.data_source_jobs; msg text;
begin
  if p_status not in ('SUCCEEDED','FAILED','CANCELLED') then raise exception 'Invalid finish status'; end if;
  select * into j from public.data_source_jobs where id=p_job and worker_id=p_worker and status in ('RUNNING','CANCEL_REQUESTED') for update;
  if not found then return false; end if;
  if p_status='SUCCEEDED' and j.legacy_job_id is not null and not exists(select 1 from public.lmhub_fetch_jobs where id=j.legacy_job_id and status='DONE') then raise exception 'Inventory publication not confirmed'; end if;
  msg:=case p_status when 'SUCCEEDED' then 'Đồng bộ thành công' when 'CANCELLED' then 'Đã dừng trước bước ghi dữ liệu' else 'Tác vụ thất bại; xem nhật ký trên máy chủ' end;
  update public.data_source_jobs set status=p_status,phase='finished',finished_at=now(),lease_until=null,message=msg,
    events=events||jsonb_build_array(jsonb_build_object('at',now(),'message',msg)) where id=p_job;
  update public.lmhub_fetch_jobs set status='ERROR',error_message=msg,finished_at=now(),updated_at=now() where id=j.legacy_job_id and status='RUNNING';
  update public.data_source_settings set next_run_at=public.next_data_source_window(window_start,window_end,now()+make_interval(secs=>interval_seconds)) where source_id=j.source_id and auto_enabled and schedule_mode='interval';
  return true;
end $$;

revoke all on function public.control_data_source(text,text,date,uuid,boolean,integer),public.pulse_data_source_worker(text,text,text,integer),public.claim_data_source_job(text),public.pulse_data_source_job(uuid,text),public.begin_data_source_publish(uuid,text),public.begin_data_source_inventory(uuid,text),public.finish_data_source_job(uuid,text,text) from public,anon,authenticated;
grant execute on function public.control_data_source(text,text,date,uuid,boolean,integer),public.pulse_data_source_worker(text,text,text,integer),public.claim_data_source_job(text),public.pulse_data_source_job(uuid,text),public.begin_data_source_publish(uuid,text),public.begin_data_source_inventory(uuid,text),public.finish_data_source_job(uuid,text,text) to service_role;

-- Replace the scoped pickup snapshot and acknowledge its queue job in one transaction.
alter table public.pickup_48h_no_api2 add column if not exists district text not null default '';
create or replace function public.publish_central_pickup(p_job uuid,p_worker text,p_snapshot text,p_at timestamptz,p_rows jsonb,p_areas text[],p_complete boolean)
returns integer language plpgsql security invoker set search_path=pg_catalog as $$
declare j public.data_source_jobs; legacy public.lmhub_fetch_jobs; n integer;
begin
  select * into j from public.data_source_jobs where id=p_job and worker_id=p_worker and phase='publishing' and status in ('RUNNING','CANCEL_REQUESTED') and lease_until>now() for update;
  if not found or j.source_id<>'pickup_inventory' then raise exception 'Invalid pickup ownership'; end if;
  select * into legacy from public.lmhub_fetch_jobs where id=j.legacy_job_id for update;
  if legacy.status='DONE' and legacy.snapshot_id=p_snapshot then return legacy.row_count; end if;
  if legacy.status is distinct from 'RUNNING' then raise exception 'Inventory job inactive'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or p_areas is null or cardinality(p_areas)=0 or not p_areas<@array['KV1','KV2','KV3','KV4','KV5']::text[] then raise exception 'Invalid snapshot'; end if;
  n:=jsonb_array_length(p_rows);
  if (n=0 and p_complete is distinct from true) or nullif(p_snapshot,'') is null or p_at is null then raise exception 'Incomplete snapshot'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r where nullif(r->>'tracking_id','') is null or r->>'status' is distinct from 'Assigned' or (r->>'area') is null or not (r->>'area')=any(p_areas)) then raise exception 'Only scoped Assigned orders allowed'; end if;
  if (select count(distinct r->>'tracking_id') from jsonb_array_elements(p_rows) r)<>n then raise exception 'Duplicate tracking'; end if;
  insert into public.pickup_48h_no_api2(tracking_id,shipment_id,sls_tracking_number,pickup_station_id,pickup_station_name,pickup_point_id,pickup_point_name,pickup_point_district,district,full_address,create_time,status,cot_group,zone_name,assigned_riders_today,area,ward,snapshot_id,snapshot_at)
  select r.tracking_id,r.shipment_id,r.sls_tracking_number,r.pickup_station_id,r.pickup_station_name,r.pickup_point_id,r.pickup_point_name,r.pickup_point_district,coalesce(r.district,''),r.full_address,r.create_time,r.status,r.cot_group,r.zone_name,r.assigned_riders_today,r.area,r.ward,p_snapshot,p_at
  from jsonb_populate_recordset(null::public.pickup_48h_no_api2,p_rows) r
  on conflict(tracking_id) do update set shipment_id=excluded.shipment_id,sls_tracking_number=excluded.sls_tracking_number,pickup_station_id=excluded.pickup_station_id,pickup_station_name=excluded.pickup_station_name,pickup_point_id=excluded.pickup_point_id,pickup_point_name=excluded.pickup_point_name,pickup_point_district=excluded.pickup_point_district,district=excluded.district,full_address=excluded.full_address,create_time=excluded.create_time,status=excluded.status,cot_group=excluded.cot_group,zone_name=excluded.zone_name,assigned_riders_today=excluded.assigned_riders_today,area=excluded.area,ward=excluded.ward,snapshot_id=excluded.snapshot_id,snapshot_at=excluded.snapshot_at;
  delete from public.pickup_48h_no_api2 where area=any(p_areas) and snapshot_id is distinct from p_snapshot;
  update public.lmhub_fetch_jobs set status='DONE',snapshot_id=p_snapshot,row_count=n,message='Pickup · '||n||' đơn',finished_at=now(),updated_at=now(),error_message=null where id=legacy.id;
  return n;
end $$;
revoke all on function public.publish_central_pickup(uuid,text,text,timestamptz,jsonb,text[],boolean) from public,anon,authenticated;
grant execute on function public.publish_central_pickup(uuid,text,text,timestamptz,jsonb,text[],boolean) to service_role;
-- Only this bounded publication gets a longer budget; other API queries keep their existing limits.
alter function public.publish_central_pickup(uuid,text,text,timestamptz,jsonb,text[],boolean) set statement_timeout='60s';
notify pgrst,'reload schema';

-- Preserve the old "fetch both" button, acknowledging it only after both child sources finish.
create or replace function public.bridge_combined_inventory()
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare legacy public.lmhub_fetch_jobs; a jsonb; b jsonb; total integer; finished integer; succeeded integer;
begin
  perform pg_advisory_xact_lock(948251,1);
  for legacy in select * from public.lmhub_fetch_jobs where status='PENDING' and lower(coalesce(params->>'kind','')) in ('all','both') for update skip locked loop
    a:=public.control_data_source('pickup_inventory','run',(now() at time zone 'Asia/Ho_Chi_Minh')::date,legacy.requested_by);
    b:=public.control_data_source('delivery_inventory','run',(now() at time zone 'Asia/Ho_Chi_Minh')::date,legacy.requested_by);
    update public.lmhub_fetch_jobs set status='RUNNING',worker_id='sdd-central-combined-'||id::text,started_at=now(),updated_at=now(),
      message='Worker trung tâm đang chạy Pickup + Delivery',params=params||jsonb_build_object('central_children',jsonb_build_array(a->>'jobId',b->>'jobId')) where id=legacy.id;
  end loop;
  for legacy in select * from public.lmhub_fetch_jobs where status='RUNNING' and worker_id like 'sdd-central-combined-%' for update skip locked loop
    select count(*),count(*) filter(where status in ('SUCCEEDED','FAILED','CANCELLED')),count(*) filter(where status='SUCCEEDED') into total,finished,succeeded
      from public.data_source_jobs where id in(select value::uuid from jsonb_array_elements_text(legacy.params->'central_children'));
    if total=2 and finished=2 then
      update public.lmhub_fetch_jobs set status=case when succeeded=2 then 'DONE' else 'ERROR' end,finished_at=now(),updated_at=now(),
        message=case when succeeded=2 then 'Pickup + Delivery hoàn tất' else 'Có nguồn thất bại hoặc đã dừng; xem Nguồn dữ liệu' end,
        error_message=case when succeeded=2 then null else 'Pickup/Delivery chưa hoàn tất cả hai; xem Nguồn dữ liệu' end where id=legacy.id;
    else
      update public.lmhub_fetch_jobs set updated_at=now() where id=legacy.id;
    end if;
  end loop;
  return true;
end $$;
revoke all on function public.bridge_combined_inventory() from public,anon,authenticated;
grant execute on function public.bridge_combined_inventory() to service_role;
notify pgrst,'reload schema';
