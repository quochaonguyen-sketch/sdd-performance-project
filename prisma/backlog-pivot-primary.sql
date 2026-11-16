-- Keep snapshot metadata and checkpoint scheduling in the primary project.
create extension if not exists http with schema extensions;

create or replace function public.backlog_archive_rpc(p_function text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare config jsonb; response extensions.http_response;
begin
  if p_function not in ('write_backlog_archive_pivot', 'read_backlog_archive_pivots') then
    raise exception 'Invalid backlog archive operation';
  end if;
  select decrypted_secret::jsonb into strict config
    from vault.decrypted_secrets where name = 'backlog_pivot_archive';
  select * into response from extensions.http((
    'POST', (config->>'url') || '/rest/v1/rpc/' || p_function,
    array[extensions.http_header('apikey', config->>'key')] ||
      case when config->>'key' like 'eyJ%' then
        array[extensions.http_header('Authorization', 'Bearer ' || (config->>'key'))]
      else array[]::extensions.http_header[] end,
    'application/json', p_payload::text
  )::extensions.http_request);
  if response.status <> 200 then
    raise exception 'Backlog archive RPC % returned HTTP %', p_function, response.status;
  end if;
  return response.content::jsonb;
end;
$$;
revoke all on function public.backlog_archive_rpc(text, jsonb) from public, anon, authenticated;
grant execute on function public.backlog_archive_rpc(text, jsonb) to service_role;

create or replace function public.capture_backlog_snapshot(p_source text,p_snapshot text,p_at timestamptz,p_started timestamptz default null,p_legacy uuid default null,p_job uuid default null)
returns uuid language plpgsql security invoker set search_path=pg_catalog as $$
declare snap public.backlog_snapshots; local_at timestamp; n bigint; rows jsonb; stored jsonb;
begin
  if p_source not in ('pickup','delivery') or nullif(p_snapshot,'') is null or p_at is null then raise exception 'Invalid backlog snapshot'; end if;
  local_at:=p_at at time zone 'Asia/Ho_Chi_Minh';
  -- Use the same ID if the archive commits and the primary transaction must retry.
  insert into public.backlog_snapshots(id,source,source_snapshot_id,legacy_job_id,source_job_id,source_started_at,source_snapshot_at,work_date,slot_at)
    values(md5(jsonb_build_array('sdd-backlog',p_source,p_snapshot)::text)::uuid,p_source,p_snapshot,p_legacy,p_job,p_started,p_at,local_at::date,
      (date_trunc('hour',local_at)+make_interval(mins=>(extract(minute from local_at)::integer/30)*30)) at time zone 'Asia/Ho_Chi_Minh')
    on conflict(source,source_snapshot_id) do nothing returning * into snap;
  if snap.id is null then
    select * into snap from public.backlog_snapshots where source=p_source and source_snapshot_id=p_snapshot;
    return snap.id;
  end if;
  with raw as (
    (select distinct on (coalesce(nullif(shipment_id,''),tracking_id)) area,
      coalesce(nullif(btrim(district),''),case when pickup_point_district ~* '^(Quận|Huyện|Thành phố Thủ Đức)' and position(',' in pickup_point_district)=0 then pickup_point_district end,'Chưa xác định quận') as district,
      coalesce(nullif(btrim(ward),''),'Chưa xác định phường') as ward,
      case when cot_group ~* 'COT[[:space:]]*2$' then 2 when cot_group ~* 'COT[[:space:]]*1$' then 1 else 0 end as cot
    from public.pickup_48h_no_api2 where p_source='pickup' and snapshot_id=p_snapshot and status='Assigned' and area in ('KV1','KV2','KV3','KV4','KV5')
    order by coalesce(nullif(shipment_id,''),tracking_id),tracking_id)
    union all
    (select distinct on (shipment_id) area,coalesce(nullif(btrim(district),''),'Chưa xác định quận') as district,
      coalesce(nullif(btrim(ward),''),'Chưa xác định phường') as ward,
      case when cot_group ~* 'COT[[:space:]]*2$' then 2 when cot_group ~* 'COT[[:space:]]*1$' then 1 else 0 end as cot
    from public.lmhub_inventory_rows where p_source='delivery' and snapshot_id=p_snapshot and area in ('KV1','KV2','KV3','KV4','KV5') order by shipment_id,id)
  ), pivot as (
    select area,district,ward,count(*) filter(where cot=1) as cot1,count(*) filter(where cot=2) as cot2,
      count(*) filter(where cot=0) as other,count(*) as orders
    from raw group by area,district,ward
  )
  select coalesce(jsonb_agg(to_jsonb(pivot)),'[]'::jsonb),coalesce(sum(orders),0) into rows,n from pivot;
  snap.total_orders:=n;
  stored:=public.backlog_archive_rpc('write_backlog_archive_pivot',jsonb_build_object('p_snapshot',to_jsonb(snap),'p_rows',rows));
  if stored is distinct from to_jsonb(n) then raise exception 'Backlog archive did not confirm the pivot total'; end if;
  update public.backlog_snapshots set total_orders=n where id=snap.id;
  update public.backlog_checkpoints set
    status=case when public.backlog_checkpoint_valid(scheduled_for,p_started,p_at) then 'CAPTURED' else 'MISSED' end,
    snapshot_id=case when public.backlog_checkpoint_valid(scheduled_for,p_started,p_at) then snap.id end,
    message=case when public.backlog_checkpoint_valid(scheduled_for,p_started,p_at) then 'Đã chốt pivot từ lượt đọc mới' else 'Nguồn hoàn tất ngoài cửa sổ chốt; không gán dữ liệu muộn vào giờ cũ' end,
    updated_at=clock_timestamp()
    where source=p_source and job_id=p_job and status='QUEUED';
  return snap.id;
end $$;

create or replace function public.read_backlog_snapshot(p_id uuid,p_source text)
returns jsonb language sql volatile security invoker set search_path=pg_catalog as $$
  select jsonb_build_object('snapshot',to_jsonb(s),'rows',coalesce(
    public.backlog_archive_rpc('read_backlog_archive_pivots',jsonb_build_object('p_ids',array[s.id],'p_by_area',false))->(s.id::text),
    '[]'::jsonb))
  from public.backlog_snapshots s where s.id=p_id and s.source=p_source;
$$;

create or replace function public.read_backlog_hourly(p_source text,p_day date)
returns jsonb language sql volatile security invoker set search_path=pg_catalog as $$
  with hours as (
    select h, (p_day+make_time(h,0,0)) at time zone 'Asia/Ho_Chi_Minh' as begins,
      (p_day+make_time(h,50,0)) at time zone 'Asia/Ho_Chi_Minh' as target
      from generate_series(0,23) h
  ), selected as materialized (
    select h.*,c.status as checkpoint_status,c.snapshot_id as official_id,s.id,s.source_started_at,s.source_snapshot_at,s.total_orders
    from hours h left join public.backlog_checkpoints c on c.source=p_source and c.scheduled_for=h.target
    left join lateral (
      select s.* from public.backlog_snapshots s where s.source=p_source and s.work_date=p_day
        and s.source_snapshot_at>=h.begins and s.source_snapshot_at<h.begins+interval '1 hour'
        and s.source_snapshot_at<=now()
      order by (c.status='CAPTURED' and s.id=c.snapshot_id) desc nulls last,s.source_snapshot_at desc limit 1
    ) s on true
  ), pivots as materialized (
    select case when count(id)>0 then public.backlog_archive_rpc('read_backlog_archive_pivots',
      jsonb_build_object('p_ids',array_agg(id) filter(where id is not null),'p_by_area',true)) else '{}'::jsonb end as value
    from selected
  ) select jsonb_build_object('source',p_source,'day',p_day,'hours',(
    select jsonb_agg(jsonb_build_object('hour',s.h,'scheduled_for',s.target,
      'status',case when s.checkpoint_status='CAPTURED' and s.id=s.official_id then 'CAPTURED'
        when now()<s.begins then 'FUTURE' when s.checkpoint_status='QUEUED' and now()<s.begins+interval '1 hour' then 'QUEUED'
        when s.id is not null then 'PROVISIONAL' when now()>=s.begins+interval '1 hour' then case when s.checkpoint_status='FAILED' then 'FAILED' else 'MISSED' end else 'PENDING' end,
      'is_final',coalesce(s.checkpoint_status='CAPTURED' and s.id=s.official_id,false),
      'snapshot_id',s.id,'source_started_at',s.source_started_at,'source_snapshot_at',s.source_snapshot_at,'total_orders',s.total_orders,
      'areas',coalesce(pivots.value->(s.id::text),'[]'::jsonb)) order by s.h) from selected s cross join pivots
  ),'checkpoints',coalesce((select jsonb_agg(to_jsonb(c) order by c.scheduled_for) from public.backlog_checkpoints c
    where c.source=p_source and c.scheduled_for>=(p_day::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and c.scheduled_for<((p_day+1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and extract(minute from c.scheduled_for at time zone 'Asia/Ho_Chi_Minh')<>50),'[]'::jsonb));
$$;

notify pgrst, 'reload schema';
