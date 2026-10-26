-- Private compact transport. The established publisher still validates ownership,
-- scope, duplicate IDs and leases and archives the snapshot atomically.
create or replace function public.publish_sdd_delivery_compact(
 p_job_id uuid,p_worker_id text,p_snapshot_id text,p_snapshot_at timestamptz,
 p_records jsonb,p_groups jsonb,p_areas text[],p_complete boolean default false)
returns integer language plpgsql security invoker set search_path=pg_catalog
set statement_timeout='60s' set work_mem='16MB' as $$
declare expanded jsonb;
begin
 if jsonb_typeof(p_records) is distinct from 'array' or jsonb_typeof(p_groups) is distinct from 'array' then raise exception 'Invalid compact arrays'; end if;
 if exists(select 1 from jsonb_array_elements(p_groups) g where case when jsonb_typeof(g)<>'array' then true else jsonb_array_length(g)<>7 end) then raise exception 'Invalid compact group'; end if;
 if exists(select 1 from jsonb_array_elements(p_records) r where case when jsonb_typeof(r)<>'array' then true when jsonb_array_length(r)<>4 then true else
   jsonb_typeof(r->3) is distinct from 'number' or (r->>3)!~'^[0-9]+$' end) then raise exception 'Invalid compact record'; end if;
 if exists(select 1 from jsonb_array_elements(p_records) r where (r->>3)::numeric>=jsonb_array_length(p_groups)) then raise exception 'Invalid compact group reference'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'shipment_id',r->>0,'create_time',r->>1,'received_time',r->>2,
  'report_date',g->>0,'ward',g->>1,'district',g->>2,'area',g->>3,
  'zone_id',g->>4,'order_type',g->>5,'cot_group',g->>6,'status','LMHub_Received')),'[]'::jsonb)
 into expanded from jsonb_array_elements(p_records) r cross join lateral (select p_groups->((r->>3)::int) as g) d;
 return public.publish_sdd_delivery_inventory(p_job_id,p_worker_id,p_snapshot_id,p_snapshot_at,expanded,p_areas,p_complete);
end $$;
revoke all on function public.publish_sdd_delivery_compact(uuid,text,text,timestamptz,jsonb,jsonb,text[],boolean) from public,anon,authenticated;
grant execute on function public.publish_sdd_delivery_compact(uuid,text,text,timestamptz,jsonb,jsonb,text[],boolean) to service_role;
