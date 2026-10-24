-- Rider COT is the roster COT, not the order creation COT.
create or replace function public.pickup_inventory_riders(p_status text)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $fn$
  with raw as (
    select area,coalesce(nullif(btrim(ward),''),'Chưa có phường') as ward,shipment_id,
      coalesce(nullif(btrim(zone_name),''),'Chưa có mã zone') as zone,assigned_riders_today,snapshot_at
    from public.pickup_48h_no_api2 where status=p_status and area in ('KV1','KV2','KV3','KV4','KV5') and nullif(btrim(shipment_id),'') is not null
  ), profiles as (
    select btrim(rider_code) as code,coalesce(nullif(btrim(full_name),''),nullif(btrim(name),'')) as name,
      case upper(regexp_replace(coalesce(cot,''),'\s','','g')) when 'COT1' then 'COT1' when '1' then 'COT1' when 'COT2' then 'COT2' when '2' then 'COT2' end as cot
    from public.riders
  ), unique_names as (
    select lower(regexp_replace(name,'\s+',' ','g')) as name_key,min(code) as code,min(name) as name,min(cot) as cot
    from profiles where name is not null group by lower(regexp_replace(name,'\s+',' ','g')) having count(distinct code)=1
  ), parts as (
    select r.*,btrim(part) as part,btrim(regexp_replace(btrim(part),'^\[COT[12]\]\s*','','i')) as label
    from raw r cross join lateral regexp_split_to_table(coalesce(r.assigned_riders_today,''),'[,;\n]+') part
  ), parsed as (
    select p.*,substring(label from '^([0-9]+)[[:space:]]*[-–:]') as code,
      regexp_replace(label,'^[0-9]+[[:space:]]*[-–:][[:space:]]*','') as clean_name,
      case when part ~* '^\[COT1\]' then 'COT1' when part ~* '^\[COT2\]' then 'COT2' end as tagged_cot
    from parts p where label not in ('','—','(chưa có tên rider)')
  ), resolved as (
    select p.area,p.ward,p.zone,p.shipment_id,
      coalesce(by_code.code,p.code,by_name.code,lower(p.clean_name)) as rider_code,
      coalesce(by_code.name,by_name.name,p.clean_name) as rider_name,
      coalesce(by_code.cot,by_name.cot,p.tagged_cot,'UNKNOWN') as rider_cot
    from parsed p left join profiles by_code on p.code=by_code.code
    left join unique_names by_name on p.code is null and lower(regexp_replace(p.clean_name,'\s+',' ','g'))=by_name.name_key
  ), grouped as (
    select area,ward,rider_code,rider_name,rider_cot,array_agg(distinct zone order by zone) as zones,count(distinct shipment_id) as total,
      case when rider_cot='COT1' then count(distinct shipment_id) else 0 end as cot1,
      case when rider_cot='COT2' then count(distinct shipment_id) else 0 end as cot2
    from resolved group by area,ward,rider_code,rider_name,rider_cot
  ) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(g) order by g.total desc,g.rider_name) from grouped g),'[]'),
    'snapshotAt',(select max(snapshot_at) from raw),'cotBasis','rider');
$fn$;
revoke all on function public.pickup_inventory_riders(text) from public,anon,authenticated;
grant execute on function public.pickup_inventory_riders(text) to service_role;

create or replace function public.pickup_inventory_ward_zones(p_area text,p_ward text,p_status text)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $fn$
  with raw as (
    select coalesce(nullif(btrim(zone_name),''),'Chưa có mã zone') as zone,shipment_id,
      case when upper(regexp_replace(coalesce(cot_group,''),'\s','','g')) like '%COT2%' or btrim(cot_group)='2' then 'COT2' else 'COT1' end as cot
    from public.pickup_48h_no_api2 where area=p_area and area in ('KV1','KV2','KV3','KV4','KV5')
      and coalesce(nullif(btrim(ward),''),'Chưa có phường')=p_ward and status=p_status and nullif(btrim(shipment_id),'') is not null
  ), grouped as (
    select zone,count(distinct shipment_id) filter(where cot='COT1') as cot1,count(distinct shipment_id) filter(where cot='COT2') as cot2,
      count(distinct shipment_id) as total from raw group by zone
  ) select coalesce(jsonb_agg(to_jsonb(g) order by g.total desc,g.zone),'[]') from grouped g;
$fn$;
revoke all on function public.pickup_inventory_ward_zones(text,text,text) from public,anon,authenticated;
grant execute on function public.pickup_inventory_ward_zones(text,text,text) to service_role;

-- Aggregate directly by area and zone, regardless of ward labels.
create or replace function public.pickup_inventory_zone_board(p_status text)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $fn$
  with raw as (
    select area,coalesce(nullif(btrim(zone_name),''),'Chưa có mã zone') as zone,shipment_id,snapshot_at,
      case when upper(regexp_replace(coalesce(cot_group,''),'\s','','g')) like '%COT2%' or btrim(cot_group)='2' then 'COT2' else 'COT1' end as cot
    from public.pickup_48h_no_api2 where status=p_status and area in ('KV1','KV2','KV3','KV4','KV5') and nullif(btrim(shipment_id),'') is not null
  ), grouped as (
    select area,zone,cot,count(distinct shipment_id) as orders from raw group by area,zone,cot
  ) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(g) order by g.orders desc,g.zone) from grouped g),'[]'),
    'snapshotAt',(select max(snapshot_at) from raw));
$fn$;
revoke all on function public.pickup_inventory_zone_board(text) from public,anon,authenticated;
grant execute on function public.pickup_inventory_zone_board(text) to service_role;
