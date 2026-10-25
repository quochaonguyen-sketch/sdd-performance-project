-- Same order/COT and rider identity rules as the pickup inventory aggregates.
create or replace function public.pickup_inventory_orders(
  p_area text, p_status text, p_zone text, p_rider text, p_rider_cot text,
  p_cot text, p_query text, p_offset integer
) returns jsonb language sql stable security invoker set search_path=pg_catalog as $fn$
  with profiles as materialized (
    select btrim(rider_code) as code,coalesce(nullif(btrim(full_name),''),nullif(btrim(name),'')) as name,
      case upper(regexp_replace(coalesce(cot,''),'\s','','g')) when 'COT1' then 'COT1' when '1' then 'COT1' when 'COT2' then 'COT2' when '2' then 'COT2' end as cot
    from public.riders
  ), unique_names as (
    select lower(regexp_replace(name,'\s+',' ','g')) as name_key,min(code) as code,min(cot) as cot
    from profiles where name is not null group by lower(regexp_replace(name,'\s+',' ','g')) having count(distinct code)=1
  ), raw as (
    select tracking_id,shipment_id,sls_tracking_number,pickup_point_id,pickup_point_name,area,
      coalesce(nullif(btrim(ward),''),'Chưa có phường') as ward,
      coalesce(nullif(btrim(zone_name),''),'Chưa có mã zone') as zone,
      cot_group,create_time,assigned_riders_today,snapshot_at,
      case when upper(regexp_replace(coalesce(cot_group,''),'\s','','g')) like '%COT2%' or btrim(cot_group)='2' then 'cot2' else 'cot1' end as order_cot
    from public.pickup_48h_no_api2
    where status=p_status and area in ('KV1','KV2','KV3','KV4','KV5')
      and (p_area='all' or area=p_area) and nullif(btrim(shipment_id),'') is not null
      and (p_zone='' or coalesce(nullif(btrim(zone_name),''),'Chưa có mã zone')=p_zone)
  ), scoped as materialized (
    select r.* from raw r where (p_cot='all' or r.order_cot=p_cot)
      and (p_query='' or strpos(lower(concat_ws(' ',shipment_id,sls_tracking_number)),lower(p_query))>0)
      and (p_rider='' or exists (
        select 1 from regexp_split_to_table(coalesce(r.assigned_riders_today,''),'[,;\n]+') part
        cross join lateral (select btrim(regexp_replace(btrim(part),'^\[COT[12]\]\s*','','i')) as label) l
        cross join lateral (select substring(label from '^([0-9]+)[[:space:]]*[-–:]') as code,
          regexp_replace(label,'^[0-9]+[[:space:]]*[-–:][[:space:]]*','') as clean_name,
          case when btrim(part) ~* '^\[COT1\]' then 'COT1' when btrim(part) ~* '^\[COT2\]' then 'COT2' end as tagged_cot) p
        left join profiles by_code on p.code=by_code.code
        left join unique_names by_name on p.code is null and lower(regexp_replace(p.clean_name,'\s+',' ','g'))=by_name.name_key
        where label not in ('','—','(chưa có tên rider)')
          and coalesce(by_code.code,p.code,by_name.code,lower(p.clean_name))=p_rider
          and coalesce(by_code.cot,by_name.cot,p.tagged_cot,'UNKNOWN')=p_rider_cot
      ))
  ), orders as materialized (
    select distinct on (shipment_id) shipment_id,sls_tracking_number,pickup_point_id,pickup_point_name,
      area,ward,zone,cot_group,create_time,order_cot,snapshot_at
    from scoped order by shipment_id,snapshot_at desc nulls last,tracking_id
  ), page as (
    select * from orders order by shipment_id limit 100 offset greatest(0,p_offset)
  ) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by shipment_id) from page p),'[]'),
      'total',(select count(*) from orders),'pageSize',100,'snapshotAt',(select max(snapshot_at) from raw));
$fn$;
revoke all on function public.pickup_inventory_orders(text,text,text,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.pickup_inventory_orders(text,text,text,text,text,text,text,integer) to service_role;
