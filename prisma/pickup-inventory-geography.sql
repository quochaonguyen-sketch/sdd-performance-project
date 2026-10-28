-- One deduplicated shipment scope for both geographic counts and drill-down orders.
create or replace function public.pickup_inventory_geography(p_status text)
returns table(shipment_id text,sls_tracking_number text,pickup_point_id text,pickup_point_name text,area text,district text,ward text,zone text,cot_group text,order_cot text,create_time text,snapshot_at timestamptz)
language sql stable security invoker set search_path=pg_catalog as $$
 select distinct on (t.shipment_id) t.shipment_id,t.sls_tracking_number,t.pickup_point_id,t.pickup_point_name,t.area,
   coalesce(nullif(btrim(t.district),''),nullif(btrim(t.pickup_point_district),''),'Chưa có quận'),
   coalesce(nullif(btrim(t.ward),''),'Chưa có phường'),coalesce(nullif(btrim(t.zone_name),''),'Chưa có mã zone'),t.cot_group,
   case when upper(regexp_replace(coalesce(t.cot_group,''),'\s','','g')) like '%COT2%' or btrim(t.cot_group)='2' then 'cot2' else 'cot1' end,
   t.create_time,t.snapshot_at
 from public.pickup_48h_no_api2 t where t.status=p_status and t.area in ('KV1','KV2','KV3','KV4','KV5') and nullif(btrim(t.shipment_id),'') is not null
 order by t.shipment_id,t.snapshot_at desc nulls last,t.tracking_id;
$$;
create or replace function public.pickup_inventory_geography_dashboard(p_status text)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
 with raw as materialized (select * from public.pickup_inventory_geography(p_status)), grouped as (
 select area,district,ward,upper(order_cot) as cot,count(*) as orders from raw group by area,district,ward,order_cot
 ) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(g) order by area,district,ward,cot) from grouped g),'[]'),
 'riders',public.pickup_inventory_riders(p_status)->'rows','snapshotAt',coalesce((select max(snapshot_at) from raw),
 (select max(finished_at) from public.lmhub_fetch_jobs where status='DONE' and params->>'kind' in ('pickup','ton_pickup','all','both') and p_status='Assigned')));
$$;
drop function if exists public.pickup_inventory_geography_orders(text,text,text,text,text,text,integer);
create or replace function public.pickup_inventory_geography_orders(p_area text,p_status text,p_district text,p_ward text,p_cot text,p_query text,p_offset integer,p_wards text[])
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
 with raw as materialized (select * from public.pickup_inventory_geography(p_status)), scoped as materialized (
 select * from raw where (p_area='all' or area=p_area) and (p_district='' or district=p_district) and (p_ward='' or ward=p_ward)
 and (coalesce(cardinality(p_wards),0)=0 or ward=any(p_wards))
 and (p_cot='all' or order_cot=p_cot) and (p_query='' or strpos(lower(concat_ws(' ',shipment_id,sls_tracking_number)),lower(p_query))>0)
 ), page as (select * from scoped order by shipment_id limit 100 offset greatest(0,p_offset))
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by shipment_id) from page p),'[]'),'total',(select count(*) from scoped),'pageSize',100,'snapshotAt',(select max(snapshot_at) from raw));
$$;
revoke all on function public.pickup_inventory_geography(text),public.pickup_inventory_geography_dashboard(text),public.pickup_inventory_geography_orders(text,text,text,text,text,text,integer,text[]) from public,anon,authenticated;
grant execute on function public.pickup_inventory_geography(text),public.pickup_inventory_geography_dashboard(text),public.pickup_inventory_geography_orders(text,text,text,text,text,text,integer,text[]) to service_role;
notify pgrst,'reload schema';
