-- Keep one row per shipment; publish current membership atomically for existing readers.
create unique index if not exists return_order_snapshots_shipment_unique on public.return_order_snapshots(shipment_id);
create or replace function public.publish_central_returns(p_job uuid,p_worker text,p_rows jsonb,p_complete boolean,p_station integer)
returns integer language plpgsql security invoker set search_path=pg_catalog set statement_timeout='60s' as $$
declare j public.data_source_jobs; n integer;
begin
  perform pg_advisory_xact_lock(948251,7);
  select * into j from public.data_source_jobs where id=p_job and source_id='return_inventory' and worker_id=p_worker
    and status in ('RUNNING','CANCEL_REQUESTED') and phase='publishing' and lease_until>now() for update;
  if not found then raise exception 'Invalid return ownership'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or p_complete is distinct from true or p_station is null or p_station<=0 then raise exception 'Incomplete return snapshot'; end if;
  n:=jsonb_array_length(p_rows);
  if exists(select 1 from jsonb_array_elements(p_rows) r where nullif(btrim(r->>'shipment_id'),'') is null
    or (r->>'order_status')::integer not in (10,67,72) or r->>'order_status' is null
    or (r->>'current_station_id')::integer is distinct from p_station
    or coalesce(r->>'seller_area','') not in ('Khu vực 1','Khu vực 2','Khu vực 3','Khu vực 4','Khu vực 5','Chưa rõ KV')) then raise exception 'Invalid return row'; end if;
  if (select count(distinct r->>'shipment_id') from jsonb_array_elements(p_rows) r)<>n then raise exception 'Duplicate return shipment'; end if;
  insert into public.return_order_snapshots(return_order_key,snapshot_id,snapshot_at,shipment_id,sls_tracking_number,shopee_order_sn,order_status,status_label,
    lowest_seller_address_id,seller_district,seller_ward,seller_new_ward,seller_area,seller_zone_id,order_zone_id,current_station_id,current_station_name,
    pickup_station_id,pickup_station_name,pickup_point_id,return_zone,return_rider_codes,return_rider_names,return_riders_cot1,return_riders_cot2,return_driver_id,return_driver_name,
    create_time,receive_time,delivering_time,current_station_received_time)
  select 'return:'||r.shipment_id,p_job::text,now(),r.shipment_id,r.sls_tracking_number,r.shopee_order_sn,r.order_status,r.status_label,
    r.lowest_seller_address_id,r.seller_district,r.seller_ward,r.seller_new_ward,r.seller_area,r.seller_zone_id,r.order_zone_id,r.current_station_id,r.current_station_name,
    r.pickup_station_id,r.pickup_station_name,r.pickup_point_id,r.return_zone,r.return_rider_codes,r.return_rider_names,r.return_riders_cot1,r.return_riders_cot2,r.return_driver_id,r.return_driver_name,
    r.create_time,r.receive_time,r.delivering_time,r.current_station_received_time
  from jsonb_populate_recordset(null::public.return_order_snapshots,p_rows) r
  on conflict(shipment_id) do update set
    snapshot_id=excluded.snapshot_id,
    snapshot_at=excluded.snapshot_at,
    sls_tracking_number=excluded.sls_tracking_number,
    shopee_order_sn=excluded.shopee_order_sn,
    order_status=excluded.order_status,
    status_label=excluded.status_label,
    lowest_seller_address_id=excluded.lowest_seller_address_id,
    seller_district=excluded.seller_district,
    seller_ward=excluded.seller_ward,
    seller_new_ward=excluded.seller_new_ward,
    seller_area=excluded.seller_area,
    seller_zone_id=excluded.seller_zone_id,
    order_zone_id=excluded.order_zone_id,
    current_station_id=excluded.current_station_id,
    current_station_name=excluded.current_station_name,
    pickup_station_id=excluded.pickup_station_id,
    pickup_station_name=excluded.pickup_station_name,
    pickup_point_id=excluded.pickup_point_id,
    return_zone=excluded.return_zone,
    return_rider_codes=excluded.return_rider_codes,
    return_rider_names=excluded.return_rider_names,
    return_riders_cot1=excluded.return_riders_cot1,
    return_riders_cot2=excluded.return_riders_cot2,
    return_driver_id=excluded.return_driver_id,
    return_driver_name=excluded.return_driver_name,
    create_time=excluded.create_time,
    receive_time=excluded.receive_time,
    delivering_time=excluded.delivering_time,
    current_station_received_time=excluded.current_station_received_time;
  delete from public.return_order_snapshots where shipment_id not in (select r->>'shipment_id' from jsonb_array_elements(p_rows) r);
  return n;
end $$;
revoke all on function public.publish_central_returns(uuid,text,jsonb,boolean,integer) from public,anon,authenticated;
grant execute on function public.publish_central_returns(uuid,text,jsonb,boolean,integer) to service_role;
notify pgrst,'reload schema';
