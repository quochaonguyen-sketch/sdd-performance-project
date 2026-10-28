-- Direct SPX lookups run on the cookie-owning worker, independently of browser tabs.
alter table public.overnight_hold_snapshots
 add column if not exists status_sync_requested_at timestamptz,
 add column if not exists status_sync_attempted_at timestamptz,
 add column if not exists status_sync_started_at timestamptz,
 add column if not exists status_synced_at timestamptz,
 add column if not exists status_sync_token uuid,
 add column if not exists status_sync_error text;

-- Keep the existing web RPC, but queue a fresh SPX read instead of inferring statuses.
create or replace function public.sync_overnight_hold_status(p_day date)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
begin
 update public.overnight_hold_snapshots set status_sync_requested_at=now()
 where cutoff_date=p_day and status='locked'
 and status_sync_requested_at is null and status_sync_token is null;
 if not exists(select 1 from public.overnight_hold_snapshots where cutoff_date=p_day and status='locked')
 then raise exception 'Không có danh sách đã chốt cho ngày này'; end if;
 return jsonb_build_object('success',true,'queued',true);
end $$;

create or replace function public.claim_overnight_status_sync()
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare s public.overnight_hold_snapshots; token uuid:=gen_random_uuid();
begin
 select * into s from public.overnight_hold_snapshots h
 where h.status='locked'
 and (h.status_sync_token is null or h.status_sync_started_at<now()-interval '10 minutes')
 and (h.status_sync_requested_at is not null or
   (coalesce(h.status_sync_attempted_at,'-infinity'::timestamptz)<=now()-interval '5 minutes'
    and exists(select 1 from public.overnight_hold_orders o where o.cutoff_date=h.cutoff_date
     and o.is_cutoff_member and o.current_status not in ('Delivered','Returned'))))
 order by h.status_sync_requested_at nulls last,h.status_sync_attempted_at nulls first,h.cutoff_date desc
 for update skip locked limit 1;
 if not found then return null; end if;
 update public.overnight_hold_snapshots set status_sync_token=token,status_sync_started_at=now(),
 status_sync_attempted_at=now(),status_sync_requested_at=null,status_sync_error=null where cutoff_date=s.cutoff_date;
 return jsonb_build_object('day',s.cutoff_date,'token',token,'orders',coalesce((
 select jsonb_agg(jsonb_build_object('order_code',order_code,'created_at',created_at) order by order_code)
 from public.overnight_hold_orders where cutoff_date=s.cutoff_date and is_cutoff_member),'[]'::jsonb));
end $$;

create or replace function public.finish_overnight_status_sync(p_day date,p_token uuid,p_rows jsonb,p_error text default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare s public.overnight_hold_snapshots; n integer;
begin
 select * into s from public.overnight_hold_snapshots where cutoff_date=p_day and status_sync_token=p_token
 and status_sync_started_at>=now()-interval '10 minutes' for update;
 if not found then raise exception 'Overnight sync lease expired'; end if;
 if p_error is not null then
  update public.overnight_hold_snapshots set status_sync_token=null,status_sync_error=left(p_error,500) where cutoff_date=p_day;
  return jsonb_build_object('success',false);
 end if;
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid SPX status rows'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where nullif(r->>'order_code','') is null
  or coalesce(r->>'current_status','') !~ '^(Delivering|Onhold|Delivered|Returned|LMHub_Received|SPX \([0-9]{1,6}\))$')
 or (select count(distinct r->>'order_code') from jsonb_array_elements(p_rows) r)<>jsonb_array_length(p_rows)
 or exists(select 1 from public.overnight_hold_orders o where o.cutoff_date=p_day and o.is_cutoff_member
   and not exists(select 1 from jsonb_array_elements(p_rows) r where r->>'order_code'=o.order_code))
 or exists(select 1 from jsonb_array_elements(p_rows) r where not exists(select 1 from public.overnight_hold_orders o
   where o.cutoff_date=p_day and o.is_cutoff_member and o.order_code=r->>'order_code'))
 then raise exception 'Incomplete or invalid SPX status lookup'; end if;
 update public.overnight_hold_orders o set current_status=r.current_status,last_synced_at=s.status_sync_started_at,updated_at=now()
 from jsonb_to_recordset(p_rows) r(order_code text,current_status text)
 where o.cutoff_date=p_day and o.is_cutoff_member and o.order_code=r.order_code;
 select count(*) into n from public.overnight_hold_orders where cutoff_date=p_day and is_cutoff_member and current_status in ('Delivered','Returned');
 update public.overnight_hold_snapshots set resolved_count=n,status_synced_at=s.status_sync_started_at,
 status_sync_token=null,status_sync_error=null,updated_at=now() where cutoff_date=p_day;
 return jsonb_build_object('success',true,'resolved_count',n,'synced_count',jsonb_array_length(p_rows));
end $$;

revoke all on function public.claim_overnight_status_sync(),public.finish_overnight_status_sync(date,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_overnight_status_sync(),public.finish_overnight_status_sync(date,uuid,jsonb,text) to service_role;
notify pgrst,'reload schema';
