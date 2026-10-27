-- Membership comes from a fresh SPX scan after 23h, never the cumulative OH ledger.
alter table public.overnight_hold_orders add column if not exists delivering_at timestamptz;
alter table public.overnight_hold_orders add column if not exists is_cutoff_member boolean not null default true;

-- Preserve premature captures and notes for audit, but exclude them from overnight work.
update public.overnight_hold_snapshots set status='invalid'
where (captured_at at time zone 'Asia/Ho_Chi_Minh')::date<>cutoff_date
   or (captured_at at time zone 'Asia/Ho_Chi_Minh')::time<'23:00';
update public.overnight_hold_orders o set is_cutoff_member=false
where exists(select 1 from public.overnight_hold_snapshots s where s.cutoff_date=o.cutoff_date and s.status='invalid');

create or replace function public.overnight_hold_capture_due()
returns boolean language sql stable security invoker set search_path=pg_catalog as $$
 select (now() at time zone 'Asia/Ho_Chi_Minh')::time between '23:00' and '23:14:59.999999'
 and not exists(select 1 from public.overnight_hold_snapshots where cutoff_date=(now() at time zone 'Asia/Ho_Chi_Minh')::date and status='locked');
$$;

create or replace function public.publish_overnight_hold(p_job uuid,p_worker text,p_rows jsonb,p_started timestamptz)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare d date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date; j public.data_source_jobs;
begin
 perform pg_advisory_xact_lock(948251,18);
 select * into j from public.data_source_jobs where id=p_job and source_id='onhold_daily' and report_date=d
 and worker_id=p_worker and status in ('RUNNING','CANCEL_REQUESTED') and phase='publishing' and lease_until>now() for update;
 if not found then raise exception 'Invalid overnight job ownership'; end if;
 if exists(select 1 from public.overnight_hold_snapshots where cutoff_date=d and status='locked') then
   return jsonb_build_object('success',true,'already_locked',true);
 end if;
 if p_started is null or p_started>now() or now()-p_started>interval '15 minutes'
 or (p_started at time zone 'Asia/Ho_Chi_Minh')::date<>d
 or (p_started at time zone 'Asia/Ho_Chi_Minh')::time<'23:00'
 or (now() at time zone 'Asia/Ho_Chi_Minh')::time>='23:15'
 or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Overnight capture requires a fresh 23h scan'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where
   nullif(r->>'order_code','') is null or length(r->>'order_code')>100
   or coalesce(r->>'order_key','') !~ '^[a-f0-9]{64}$'
   or coalesce(r->>'rider_code','') in ('','0','unknown')
   or coalesce(r->>'status','') not in ('1','5')
   or nullif(r->>'delivering_at','') is null
   or ((r->>'delivering_at')::timestamptz at time zone 'Asia/Ho_Chi_Minh')::date<>d
   or (r->>'delivering_at')::timestamptz>p_started
   or coalesce(r->>'area','') not in ('Khu vực 1','Khu vực 2','Khu vực 3','Khu vực 4','Khu vực 5','Chưa rõ KV'))
 then raise exception 'Invalid overnight order or delivering day'; end if;
 if (select count(distinct r->>'order_code') from jsonb_array_elements(p_rows) r)<>jsonb_array_length(p_rows)
 then raise exception 'Duplicate overnight order'; end if;
 insert into public.overnight_hold_snapshots(cutoff_date,status,captured_at) values(d,'locked',now())
 on conflict(cutoff_date) do update set status='locked',captured_at=now();
 update public.overnight_hold_orders set is_cutoff_member=false where cutoff_date=d;
 insert into public.overnight_hold_orders(cutoff_date,order_key,order_code,area,district,ward,rider_code,rider_name,
 cutoff_status,current_status,reason,reason_label,delivering_at,is_cutoff_member)
 select d,r.order_key,r.order_code,r.area,r.district,r.ward,r.rider_code,r.rider_name,r.status,
 case when r.status=1 then 'Delivering' else 'Onhold' end,r.reason,r.reason_label,r.delivering_at,true
 from jsonb_to_recordset(p_rows) r(order_key text,order_code text,area text,district text,ward text,rider_code text,rider_name text,
 status smallint,reason text,reason_label text,delivering_at timestamptz)
 on conflict(cutoff_date,order_code) do update set order_key=excluded.order_key,area=excluded.area,district=excluded.district,
 ward=excluded.ward,rider_code=excluded.rider_code,rider_name=excluded.rider_name,cutoff_status=excluded.cutoff_status,
 current_status=excluded.current_status,reason=excluded.reason,reason_label=excluded.reason_label,
 delivering_at=excluded.delivering_at,is_cutoff_member=true,last_synced_at=now(),created_at=now(),updated_at=now();
 update public.overnight_hold_snapshots set total_orders=jsonb_array_length(p_rows),
 delivering_count=(select count(*) from public.overnight_hold_orders where cutoff_date=d and is_cutoff_member and cutoff_status=1),
 onhold_count=(select count(*) from public.overnight_hold_orders where cutoff_date=d and is_cutoff_member and cutoff_status=5),
 rider_count=(select count(distinct rider_code) from public.overnight_hold_orders where cutoff_date=d and is_cutoff_member),
 resolved_count=0,updated_at=now() where cutoff_date=d;
 return jsonb_build_object('success',true,'total_orders',jsonb_array_length(p_rows));
end $$;

create or replace function public.capture_overnight_hold(p_day date,p_actor text default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if exists(select 1 from public.overnight_hold_snapshots where cutoff_date=p_day and status='locked') then
  return (select to_jsonb(s)||jsonb_build_object('success',true,'already_locked',true) from public.overnight_hold_snapshots s where cutoff_date=p_day);
 end if;
 raise exception 'Danh sách được tự động chốt từ SPX lúc 23h; không thể dựng lại bằng dữ liệu ban ngày.';
end $$;

-- Absence from a partial daily feed is not proof of successful delivery. Keep cutoff riders immutable.
create or replace function public.sync_overnight_hold_status(p_day date)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare n integer;
begin
 update public.overnight_hold_orders h set current_status='Returned',last_synced_at=now(),updated_at=now()
 where h.cutoff_date=p_day and h.is_cutoff_member and h.current_status not in ('Delivered','Returned')
 and (exists(select 1 from public.return_order_snapshots r where r.shipment_id=h.order_code
 and r.snapshot_at>=h.created_at and r.order_status in (10,67,72))
 or exists(select 1 from public.lmhub_inventory_rows r where r.shipment_id=h.order_code
 and r.snapshot_at>=h.created_at and r.received_time>=h.created_at and r.status='LMHub_Received'));
 select count(*) into n from public.overnight_hold_orders where cutoff_date=p_day and is_cutoff_member and current_status in ('Delivered','Returned');
 update public.overnight_hold_snapshots set resolved_count=n,updated_at=now() where cutoff_date=p_day and status='locked';
 return jsonb_build_object('success',true,'resolved_count',n);
end $$;

revoke all on function public.capture_overnight_hold(date,text),public.publish_overnight_hold(uuid,text,jsonb,timestamptz),
public.overnight_hold_capture_due(),public.sync_overnight_hold_status(date) from public,anon,authenticated;
grant execute on function public.capture_overnight_hold(date,text),public.publish_overnight_hold(uuid,text,jsonb,timestamptz),
public.overnight_hold_capture_due(),public.sync_overnight_hold_status(date) to service_role;
-- The web edits notes through its authenticated API, never direct table updates.
revoke update on public.overnight_hold_orders from authenticated;
drop policy if exists "Authenticated users can update overnight hold orders" on public.overnight_hold_orders;
alter function public.update_overnight_hold_note(uuid,text,text) security invoker;
revoke all on function public.update_overnight_hold_note(uuid,text,text) from public,anon,authenticated;
grant execute on function public.update_overnight_hold_note(uuid,text,text) to service_role;

-- Queue a fresh scan; retry within the cutoff window if the PC was temporarily busy.
select cron.schedule('sdd-overnight-hold-23h','0-14 16 * * *',
$cron$select public.control_data_source('onhold_daily','run',(now() at time zone 'Asia/Ho_Chi_Minh')::date,null)
where public.overnight_hold_capture_due();$cron$);
notify pgrst,'reload schema';
