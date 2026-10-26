-- SDD Web Data delivery worker. Existing inventory/queue tables are retained.
-- Run as the database owner. All RPCs are invoker functions, service_role only.
begin;

create or replace function public.claim_sdd_delivery_job(p_worker_id text, p_auto boolean default false)
returns public.lmhub_fetch_jobs
language plpgsql security invoker set search_path = '' as $$
declare job public.lmhub_fetch_jobs;
begin
  if p_worker_id is null or p_worker_id not like 'sdd-delivery-%' then
    raise exception 'Invalid delivery worker identifier';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(734291, 12);
  update public.lmhub_fetch_jobs set status='ERROR', error_message='Delivery worker lost heartbeat',
    finished_at=now(), updated_at=now()
  where status='RUNNING' and worker_id like 'sdd-delivery-%'
    and updated_at < now() - interval '5 minutes';
  if exists(select 1 from public.lmhub_fetch_jobs where status='RUNNING') then return null; end if;
  select * into job from public.lmhub_fetch_jobs
  where status='PENDING'
    and lower(coalesce(params->>'kind', params->>'job', params->>'type', 'delivery')) in ('delivery','ton_delivery','')
  order by requested_at, id for update skip locked limit 1;
  if not found then
    if not p_auto or exists(select 1 from public.lmhub_fetch_jobs where status='PENDING') then return null; end if;
    insert into public.lmhub_fetch_jobs(status,message,params)
    values ('PENDING','SDD auto-fetch tồn Delivery',jsonb_build_object('kind','delivery','source','sdd_web_data_auto'))
    returning * into job;
  end if;
  update public.lmhub_fetch_jobs set status='RUNNING',worker_id=p_worker_id,
    started_at=now(),updated_at=now(),error_message=null where id=job.id returning * into job;
  return job;
end;
$$;

create or replace function public.heartbeat_sdd_delivery_job(p_job_id uuid, p_worker_id text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.lmhub_fetch_jobs set updated_at=now()
  where id=p_job_id and status='RUNNING' and worker_id=p_worker_id;
  return found;
end;
$$;

create or replace function public.fail_sdd_delivery_job(p_job_id uuid,p_worker_id text,p_error text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.lmhub_fetch_jobs set status='ERROR',error_message=left(p_error,500),
    finished_at=now(),updated_at=now()
  where id=p_job_id and status='RUNNING' and worker_id=p_worker_id;
  return found;
end;
$$;

create or replace function public.publish_sdd_delivery_inventory(
  p_job_id uuid,p_worker_id text,p_snapshot_id text,p_snapshot_at timestamptz,
  p_rows jsonb,p_areas text[])
returns integer language plpgsql security invoker set search_path = '' set statement_timeout = '60s' set work_mem = '16MB' as $$
declare job public.lmhub_fetch_jobs; row_total integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(734291, 12);
  select * into job from public.lmhub_fetch_jobs where id=p_job_id for update;
  if job.worker_id is distinct from p_worker_id then raise exception 'Delivery job ownership lost'; end if;
  -- A network retry after a committed response must not publish twice.
  if job.status='DONE' and job.snapshot_id=p_snapshot_id then return job.row_count; end if;
  if job.status is distinct from 'RUNNING' or job.updated_at < now()-interval '5 minutes' then
    raise exception 'Delivery job is not running or lease expired';
  end if;
  if p_snapshot_id is null or trim(p_snapshot_id)='' or p_snapshot_at is null
    or p_snapshot_at > now()+interval '1 minute' then raise exception 'Invalid snapshot'; end if;
  if p_areas is null or cardinality(p_areas)=0
    or not p_areas <@ array['KV1','KV2','KV3','KV4','KV5']::text[] then raise exception 'Invalid area scope'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Expected inventory array'; end if;
  row_total := jsonb_array_length(p_rows);
  if row_total=0 then raise exception 'Empty snapshot: retaining previous inventory'; end if;
  if exists(select 1 from jsonb_to_recordset(p_rows) as r(shipment_id text,received_time timestamptz,area text,status text)
    where nullif(trim(r.shipment_id),'') is null or r.received_time is null
      or r.area is null or not r.area=any(p_areas) or r.status is distinct from 'LMHub_Received') then
    raise exception 'Invalid inventory row';
  end if;
  -- Sort only shipment IDs, not full JSON order objects (which spill to disk).
  if (select count(distinct r.shipment_id) from jsonb_to_recordset(p_rows) as r(shipment_id text)) <> row_total then
    raise exception 'Duplicate inventory shipment';
  end if;
  insert into public.lmhub_inventory_rows(snapshot_id,snapshot_at,shipment_id,create_time,received_time,
    report_date,ward,district,area,zone_id,status,order_type,cot_group)
  select p_snapshot_id,p_snapshot_at,r.shipment_id,r.create_time,r.received_time,r.report_date,
    coalesce(r.ward,''),coalesce(r.district,''),r.area,coalesce(r.zone_id,''),r.status,
    coalesce(r.order_type,''),coalesce(r.cot_group,'')
  from jsonb_to_recordset(p_rows) as r(shipment_id text,create_time timestamptz,received_time timestamptz,
    report_date date,ward text,district text,area text,zone_id text,status text,order_type text,cot_group text);
  delete from public.lmhub_inventory_rows where area=any(p_areas) and snapshot_id<>p_snapshot_id;
  update public.lmhub_fetch_jobs set status='DONE',snapshot_id=p_snapshot_id,row_count=row_total,
    message='Delivery · '||row_total||' đơn · snapshot '||p_snapshot_id,error_message=null,
    finished_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_job_id;
  return row_total;
end;
$$;

revoke all on function public.claim_sdd_delivery_job(text,boolean) from public,anon,authenticated;
revoke all on function public.heartbeat_sdd_delivery_job(uuid,text) from public,anon,authenticated;
revoke all on function public.fail_sdd_delivery_job(uuid,text,text) from public,anon,authenticated;
revoke all on function public.publish_sdd_delivery_inventory(uuid,text,text,timestamptz,jsonb,text[]) from public,anon,authenticated;
grant execute on function public.claim_sdd_delivery_job(text,boolean) to service_role;
grant execute on function public.heartbeat_sdd_delivery_job(uuid,text) to service_role;
grant execute on function public.fail_sdd_delivery_job(uuid,text,text) to service_role;
grant execute on function public.publish_sdd_delivery_inventory(uuid,text,text,timestamptz,jsonb,text[]) to service_role;
notify pgrst,'reload schema';
commit;
