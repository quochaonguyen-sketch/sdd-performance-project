-- Durable pivots. Each completed inventory publication archives its own source snapshot.
alter table public.pickup_48h_no_api2 add column if not exists district text not null default '';

-- Keep the six-argument legacy writer's empty guard. Only verified complete empty
-- reads opt into this overload, so a real zero can be archived without inventing data.
create or replace function public.publish_sdd_delivery_inventory(p_job_id uuid,p_worker_id text,p_snapshot_id text,p_snapshot_at timestamptz,p_rows jsonb,p_areas text[],p_complete boolean)
returns integer language plpgsql security invoker set search_path=pg_catalog set statement_timeout='60s' as $$
declare job public.lmhub_fetch_jobs;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Expected inventory array'; end if;
  if jsonb_array_length(p_rows)>0 then return public.publish_sdd_delivery_inventory(p_job_id,p_worker_id,p_snapshot_id,p_snapshot_at,p_rows,p_areas); end if;
  if p_complete is distinct from true then raise exception 'Incomplete empty delivery snapshot'; end if;
  perform pg_advisory_xact_lock(734291,12);
  select * into job from public.lmhub_fetch_jobs where id=p_job_id for update;
  if job.worker_id is distinct from p_worker_id then raise exception 'Delivery job ownership lost'; end if;
  if job.status='DONE' and job.snapshot_id=p_snapshot_id then return job.row_count; end if;
  if job.status is distinct from 'RUNNING' or job.updated_at<now()-interval '5 minutes' then raise exception 'Delivery job inactive'; end if;
  if nullif(btrim(p_snapshot_id),'') is null or p_snapshot_at is null or p_snapshot_at>now()+interval '1 minute' then raise exception 'Invalid snapshot'; end if;
  if p_areas is null or cardinality(p_areas)=0 or not p_areas<@array['KV1','KV2','KV3','KV4','KV5']::text[] then raise exception 'Invalid scope'; end if;
  delete from public.lmhub_inventory_rows where area=any(p_areas);
  update public.lmhub_fetch_jobs set status='DONE',snapshot_id=p_snapshot_id,row_count=0,message='Delivery · 0 đơn · nguồn đã đọc đủ',error_message=null,finished_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_job_id;
  return 0;
end $$;
revoke all on function public.publish_sdd_delivery_inventory(uuid,text,text,timestamptz,jsonb,text[],boolean) from public,anon,authenticated;
grant execute on function public.publish_sdd_delivery_inventory(uuid,text,text,timestamptz,jsonb,text[],boolean) to service_role;

create table if not exists public.backlog_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null check(source in ('pickup','delivery')),
  source_snapshot_id text not null,
  legacy_job_id uuid references public.lmhub_fetch_jobs(id) on delete set null,
  source_job_id uuid references public.data_source_jobs(id) on delete set null,
  source_started_at timestamptz,
  source_snapshot_at timestamptz not null,
  captured_at timestamptz not null default clock_timestamp(),
  work_date date not null,
  slot_at timestamptz not null,
  total_orders bigint not null default 0 check(total_orders>=0),
  unique(source,source_snapshot_id)
);
create index if not exists backlog_snapshots_day_idx on public.backlog_snapshots(source,work_date,captured_at desc);
create index if not exists backlog_snapshots_hour_idx on public.backlog_snapshots(source,work_date,source_snapshot_at desc);
create index if not exists backlog_snapshots_job_idx on public.backlog_snapshots(source_job_id) where source_job_id is not null;
create index if not exists backlog_snapshots_legacy_idx on public.backlog_snapshots(legacy_job_id) where legacy_job_id is not null;
create table if not exists public.backlog_snapshot_rows (
  snapshot_id uuid not null references public.backlog_snapshots(id),
  area text not null check(area in ('KV1','KV2','KV3','KV4','KV5')),
  district text not null,
  ward text not null,
  cot1 bigint not null check(cot1>=0),
  cot2 bigint not null check(cot2>=0),
  other bigint not null check(other>=0),
  orders bigint not null check(orders=cot1+cot2+other),
  primary key(snapshot_id,area,district,ward)
);
create table if not exists public.backlog_checkpoints (
  source text not null check(source in ('pickup','delivery')),
  scheduled_for timestamptz not null,
  status text not null default 'PENDING' check(status in ('PENDING','QUEUED','CAPTURED','FAILED','MISSED')),
  job_id uuid references public.data_source_jobs(id) on delete set null,
  snapshot_id uuid references public.backlog_snapshots(id),
  message text not null default '',
  updated_at timestamptz not null default clock_timestamp(),
  primary key(source,scheduled_for)
);
create index if not exists backlog_checkpoints_pending_idx on public.backlog_checkpoints(scheduled_for) where status in ('PENDING','QUEUED');
create index if not exists backlog_checkpoints_job_idx on public.backlog_checkpoints(job_id) where job_id is not null;
alter table public.backlog_checkpoints add column if not exists attempts integer not null default 0;
alter table public.backlog_snapshots enable row level security;
alter table public.backlog_snapshot_rows enable row level security;
alter table public.backlog_checkpoints enable row level security;
revoke all on public.backlog_snapshots,public.backlog_snapshot_rows,public.backlog_checkpoints from public,anon,authenticated;
grant select,insert,update on public.backlog_snapshots,public.backlog_snapshot_rows,public.backlog_checkpoints to service_role;

create or replace function public.backlog_checkpoint_deadline(p_target timestamptz)
returns timestamptz language sql immutable security invoker set search_path=pg_catalog as $$
  select p_target+case when extract(minute from p_target at time zone 'Asia/Ho_Chi_Minh')=50 then interval '10 minutes' else interval '15 minutes' end;
$$;
create or replace function public.backlog_checkpoint_valid(p_target timestamptz,p_started timestamptz,p_finished timestamptz)
returns boolean language sql immutable security invoker set search_path=pg_catalog as $$
  select p_started>=p_target and p_finished>=p_started and case
    when extract(minute from p_target at time zone 'Asia/Ho_Chi_Minh')=50
      then p_started<public.backlog_checkpoint_deadline(p_target) and p_finished<public.backlog_checkpoint_deadline(p_target)
    else p_started<=public.backlog_checkpoint_deadline(p_target) end;
$$;

create or replace function public.capture_backlog_snapshot(p_source text,p_snapshot text,p_at timestamptz,p_started timestamptz default null,p_legacy uuid default null,p_job uuid default null)
returns uuid language plpgsql security invoker set search_path=pg_catalog as $$
declare snap uuid; local_at timestamp; n bigint;
begin
  if p_source not in ('pickup','delivery') or nullif(p_snapshot,'') is null or p_at is null then raise exception 'Invalid backlog snapshot'; end if;
  local_at:=p_at at time zone 'Asia/Ho_Chi_Minh';
  insert into public.backlog_snapshots(source,source_snapshot_id,legacy_job_id,source_job_id,source_started_at,source_snapshot_at,work_date,slot_at)
    values(p_source,p_snapshot,p_legacy,p_job,p_started,p_at,local_at::date,
      (date_trunc('hour',local_at)+make_interval(mins=>(extract(minute from local_at)::integer/30)*30)) at time zone 'Asia/Ho_Chi_Minh')
    on conflict(source,source_snapshot_id) do nothing returning id into snap;
  if snap is null then
    select id into snap from public.backlog_snapshots where source=p_source and source_snapshot_id=p_snapshot;
    return snap;
  end if;
  if p_source='pickup' then
    insert into public.backlog_snapshot_rows(snapshot_id,area,district,ward,cot1,cot2,other,orders)
    with raw as (
      select distinct on (coalesce(nullif(shipment_id,''),tracking_id)) area,
        coalesce(nullif(btrim(district),''),case when pickup_point_district ~* '^(Quận|Huyện|Thành phố Thủ Đức)' and position(',' in pickup_point_district)=0 then pickup_point_district end,'Chưa xác định quận') as district,
        coalesce(nullif(btrim(ward),''),'Chưa xác định phường') as ward,
        case when cot_group ~* 'COT[[:space:]]*2$' then 2 when cot_group ~* 'COT[[:space:]]*1$' then 1 else 0 end as cot
      from public.pickup_48h_no_api2 where snapshot_id=p_snapshot and status='Assigned' and area in ('KV1','KV2','KV3','KV4','KV5')
      order by coalesce(nullif(shipment_id,''),tracking_id),tracking_id
    ) select snap,area,district,ward,count(*) filter(where cot=1),count(*) filter(where cot=2),count(*) filter(where cot=0),count(*)
      from raw group by area,district,ward;
  else
    insert into public.backlog_snapshot_rows(snapshot_id,area,district,ward,cot1,cot2,other,orders)
    with raw as (
      select distinct on (shipment_id) area,coalesce(nullif(btrim(district),''),'Chưa xác định quận') as district,
        coalesce(nullif(btrim(ward),''),'Chưa xác định phường') as ward,
        case when cot_group ~* 'COT[[:space:]]*2$' then 2 when cot_group ~* 'COT[[:space:]]*1$' then 1 else 0 end as cot
      from public.lmhub_inventory_rows where snapshot_id=p_snapshot and area in ('KV1','KV2','KV3','KV4','KV5') order by shipment_id,id
    ) select snap,area,district,ward,count(*) filter(where cot=1),count(*) filter(where cot=2),count(*) filter(where cot=0),count(*)
      from raw group by area,district,ward;
  end if;
  select coalesce(sum(orders),0) into n from public.backlog_snapshot_rows where snapshot_id=snap;
  update public.backlog_snapshots set total_orders=n where id=snap;
  update public.backlog_checkpoints set
    status=case when public.backlog_checkpoint_valid(scheduled_for,p_started,p_at) then 'CAPTURED' else 'MISSED' end,
    snapshot_id=case when public.backlog_checkpoint_valid(scheduled_for,p_started,p_at) then snap end,
    message=case when public.backlog_checkpoint_valid(scheduled_for,p_started,p_at) then 'Đã chốt pivot từ lượt đọc mới' else 'Nguồn hoàn tất ngoài cửa sổ chốt; không gán dữ liệu muộn vào giờ cũ' end,
    updated_at=clock_timestamp()
    where source=p_source and job_id=p_job and status='QUEUED';
  return snap;
end $$;

create or replace function public.archive_completed_backlog()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare kind text; central uuid;
begin
  kind:=lower(coalesce(new.params->>'kind','delivery'));
  if kind not in ('pickup','delivery') or new.snapshot_id is null then return new; end if;
  select id into central from public.data_source_jobs where legacy_job_id=new.id order by requested_at desc limit 1;
  perform public.capture_backlog_snapshot(kind,new.snapshot_id,coalesce(new.finished_at,clock_timestamp()),new.started_at,new.id,central);
  return new;
end $$;
drop trigger if exists archive_completed_backlog on public.lmhub_fetch_jobs;
create trigger archive_completed_backlog after update of status on public.lmhub_fetch_jobs
  for each row when(new.status='DONE' and old.status is distinct from 'DONE') execute function public.archive_completed_backlog();

create or replace function public.enqueue_backlog_checkpoints(p_now timestamptz default now())
returns integer language plpgsql security invoker set search_path=pg_catalog as $$
declare day date:=(p_now at time zone 'Asia/Ho_Chi_Minh')::date; c public.backlog_checkpoints; j public.data_source_jobs;
  source_key text; n integer:=0; deadline timestamptz; hourly boolean; existing uuid;
begin
  perform pg_advisory_xact_lock(948251,1);
  insert into public.backlog_checkpoints(source,scheduled_for)
    select s,(day+make_time(h,50,0)) at time zone 'Asia/Ho_Chi_Minh'
      from unnest(array['pickup','delivery']) s cross join generate_series(0,23) h
    union all select s,(day+t) at time zone 'Asia/Ho_Chi_Minh'
      from unnest(array['pickup','delivery']) s cross join unnest(array['16:00'::time,'16:30'::time]) t
    on conflict do nothing;
  for c in select * from public.backlog_checkpoints where status in ('PENDING','QUEUED') and scheduled_for<=p_now order by scheduled_for,source for update loop
    hourly:=extract(minute from c.scheduled_for at time zone 'Asia/Ho_Chi_Minh')=50;
    deadline:=public.backlog_checkpoint_deadline(c.scheduled_for);
    -- Reuse only a real, qualifying source read already in history. Never invent past hours.
    select id into existing from public.backlog_snapshots s where s.source=c.source
      and s.work_date=(c.scheduled_for at time zone 'Asia/Ho_Chi_Minh')::date
      and s.source_started_at>=c.scheduled_for
      and public.backlog_checkpoint_valid(c.scheduled_for,s.source_started_at,s.source_snapshot_at)
      order by s.source_snapshot_at desc limit 1;
    if existing is not null then
      update public.backlog_checkpoints set status='CAPTURED',snapshot_id=existing,
        message='Đã chốt bằng snapshot nguồn thực trong cửa sổ cuối giờ',updated_at=p_now where source=c.source and scheduled_for=c.scheduled_for;
      continue;
    end if;
    if c.status='QUEUED' then
      select * into j from public.data_source_jobs where id=c.job_id;
      if j.status in ('FAILED','CANCELLED') then
        update public.backlog_checkpoints set status=case when hourly and p_now<deadline and c.attempts<2 then 'PENDING' else 'FAILED' end,
          job_id=case when hourly and p_now<deadline and c.attempts<2 then null else c.job_id end,
          message='Lượt đọc thất bại; chỉ thử lại khi còn trong giờ chốt',updated_at=p_now where source=c.source and scheduled_for=c.scheduled_for;
      elsif (hourly and p_now>=deadline) or ((j.started_at is null or j.started_at>deadline) and p_now>deadline) then
        update public.backlog_checkpoints set status='MISSED',message='Không chốt kịp trong giờ; không gán dữ liệu của giờ sau',updated_at=p_now where source=c.source and scheduled_for=c.scheduled_for;
      end if;
      continue;
    end if;
    if (hourly and p_now>=deadline) or (not hourly and p_now>deadline) then
      update public.backlog_checkpoints set status='MISSED',message='Đã lỡ giờ chốt; không tạo dữ liệu quá khứ',updated_at=p_now where source=c.source and scheduled_for=c.scheduled_for;
      continue;
    end if;
    source_key:=case c.source when 'pickup' then 'pickup_inventory' else 'delivery_inventory' end;
    select * into j from public.data_source_jobs where data_source_jobs.source_id=source_key and status in ('QUEUED','RUNNING','CANCEL_REQUESTED') order by requested_at limit 1;
    if found and (j.status='CANCEL_REQUESTED' or (j.started_at is not null and j.started_at<c.scheduled_for)) then continue; end if;
    if not found then
      insert into public.data_source_jobs(source_id,report_date,message,events) values(source_key,day,
        case when hourly then 'Chốt tồn giờ '||to_char(c.scheduled_for at time zone 'Asia/Ho_Chi_Minh','HH24')||'h · lấy nguồn lúc :50' else 'Snapshot đối chiếu '||to_char(c.scheduled_for at time zone 'Asia/Ho_Chi_Minh','HH24:MI') end,
        jsonb_build_array(jsonb_build_object('at',p_now,'checkpoint_at',c.scheduled_for,'message','Chốt backlog · giờ Việt Nam')))
        returning * into j;
    end if;
    update public.backlog_checkpoints set status='QUEUED',job_id=j.id,attempts=attempts+1,message='Đang lấy nguồn mới cho giờ chốt',updated_at=p_now where source=c.source and scheduled_for=c.scheduled_for;
    n:=n+1;
  end loop;
  return n;
end $$;

create or replace function public.read_backlog_snapshot(p_id uuid,p_source text)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
  select jsonb_build_object('snapshot',to_jsonb(s),'rows',coalesce((
    select jsonb_agg(to_jsonb(r)-'snapshot_id' order by r.area,r.district,r.ward)
      from public.backlog_snapshot_rows r where r.snapshot_id=s.id),'[]'::jsonb))
    from public.backlog_snapshots s where s.id=p_id and s.source=p_source;
$$;

create or replace function public.read_backlog_hourly(p_source text,p_day date)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
  with hours as (
    select h, (p_day+make_time(h,0,0)) at time zone 'Asia/Ho_Chi_Minh' as begins,
      (p_day+make_time(h,50,0)) at time zone 'Asia/Ho_Chi_Minh' as target
      from generate_series(0,23) h
  ), selected as (
    select h.*,c.status as checkpoint_status,c.snapshot_id as official_id,s.id,s.source_started_at,s.source_snapshot_at,s.total_orders
    from hours h left join public.backlog_checkpoints c on c.source=p_source and c.scheduled_for=h.target
    left join lateral (
      select s.* from public.backlog_snapshots s where s.source=p_source and s.work_date=p_day
        and s.source_snapshot_at>=h.begins and s.source_snapshot_at<h.begins+interval '1 hour'
        and s.source_snapshot_at<=now()
      order by (c.status='CAPTURED' and s.id=c.snapshot_id) desc nulls last,s.source_snapshot_at desc limit 1
    ) s on true
  ) select jsonb_build_object('source',p_source,'day',p_day,'hours',(
    select jsonb_agg(jsonb_build_object('hour',s.h,'scheduled_for',s.target,
      'status',case when s.checkpoint_status='CAPTURED' and s.id=s.official_id then 'CAPTURED'
        when now()<s.begins then 'FUTURE' when s.checkpoint_status='QUEUED' and now()<s.begins+interval '1 hour' then 'QUEUED'
        when s.id is not null then 'PROVISIONAL' when now()>=s.begins+interval '1 hour' then case when s.checkpoint_status='FAILED' then 'FAILED' else 'MISSED' end else 'PENDING' end,
      'is_final',coalesce(s.checkpoint_status='CAPTURED' and s.id=s.official_id,false),
      'snapshot_id',s.id,'source_started_at',s.source_started_at,'source_snapshot_at',s.source_snapshot_at,'total_orders',s.total_orders,
      'areas',coalesce((select jsonb_agg(to_jsonb(a) order by a.area) from (
        select r.area,sum(r.cot1) as cot1,sum(r.cot2) as cot2,sum(r.other) as other,sum(r.orders) as orders
        from public.backlog_snapshot_rows r where r.snapshot_id=s.id group by r.area
      ) a),'[]'::jsonb)) order by s.h) from selected s
  ),'checkpoints',coalesce((select jsonb_agg(to_jsonb(c) order by c.scheduled_for) from public.backlog_checkpoints c
    where c.source=p_source and c.scheduled_for>=(p_day::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and c.scheduled_for<((p_day+1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and extract(minute from c.scheduled_for at time zone 'Asia/Ho_Chi_Minh')<>50),'[]'::jsonb));
$$;
revoke all on function public.backlog_checkpoint_deadline(timestamptz),public.backlog_checkpoint_valid(timestamptz,timestamptz,timestamptz),public.read_backlog_hourly(text,date) from public,anon,authenticated;
grant execute on function public.backlog_checkpoint_deadline(timestamptz),public.backlog_checkpoint_valid(timestamptz,timestamptz,timestamptz),public.read_backlog_hourly(text,date) to service_role;
revoke all on function public.capture_backlog_snapshot(text,text,timestamptz,timestamptz,uuid,uuid),public.archive_completed_backlog(),public.enqueue_backlog_checkpoints(timestamptz),public.read_backlog_snapshot(uuid,text) from public,anon,authenticated;
grant execute on function public.capture_backlog_snapshot(text,text,timestamptz,timestamptz,uuid,uuid),public.archive_completed_backlog(),public.enqueue_backlog_checkpoints(timestamptz),public.read_backlog_snapshot(uuid,text) to service_role;

-- pg_cron runs in UTC. Tick every minute; eligibility and date are computed in UTC+7.
select cron.schedule('sdd-backlog-checkpoints','* * * * *','select public.enqueue_backlog_checkpoints();');
notify pgrst, 'reload schema';
