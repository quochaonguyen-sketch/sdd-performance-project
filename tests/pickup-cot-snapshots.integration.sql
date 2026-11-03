do $test$
declare n int;
begin
  select count(*) into n from public.pickup_cot_capture_window('2026-11-03','2026-11-03 12:59+07','2026-11-03 13:02+07','2026-11-03 13:02+07');
  if n<>0 then raise exception 'Pre-cutoff collection was accepted'; end if;
  select count(*) into n from public.pickup_cot_capture_window('2026-11-03','2026-11-03 13:00+07','2026-11-03 13:04+07','2026-11-03 13:04+07') where cot='COT1';
  if n<>1 then raise exception 'COT1 at 13h was not accepted'; end if;
  select count(*) into n from public.pickup_cot_capture_window('2026-11-03','2026-11-03 17:01+07','2026-11-03 17:06+07','2026-11-03 17:06+07') where cot='COT2';
  if n<>1 then raise exception 'COT2 at 17h was not accepted'; end if;
  select count(*) into n from public.pickup_cot_capture_window('2026-11-03','2026-11-03 13:14+07','2026-11-03 13:16+07','2026-11-03 13:16+07');
  if n<>0 then raise exception 'Late capture was accepted'; end if;
  select count(*) into n from public.pickup_cot_capture_window('2026-11-02','2026-11-03 13:01+07','2026-11-03 13:02+07','2026-11-03 13:02+07');
  if n<>0 then raise exception 'Wrong source day was accepted'; end if;
  select count(*) into n from public.pickup_cot_capture_window('2026-11-03','2026-11-03 13:01+07','2026-11-03 13:02+07','2026-11-03 14:02+07');
  if n<>0 then raise exception 'Historical replay was accepted'; end if;
  if has_table_privilege('anon','public.pickup_cot_oh_snapshots','SELECT')
    or has_table_privilege('authenticated','public.pickup_cot_oh_snapshots','SELECT')
    or has_table_privilege('service_role','public.pickup_cot_oh_snapshots','UPDATE') then raise exception 'History permissions too broad'; end if;
end $test$;

-- Test trigger independently of the actual clock. Entire test runs inside a rollback transaction.
create or replace function public.pickup_cot_capture_window(p_day date,p_started timestamptz,p_snapshot timestamptz,p_now timestamptz)
returns table(cot text,cutoff_at timestamptz) language sql immutable set search_path='' as $stub$
 select * from (values ('COT1'::text,p_snapshot),('COT2'::text,p_snapshot)) x
$stub$;
set local role service_role;
do $test$
declare one text:='cot-oh-'||gen_random_uuid(); two text:='cot-oh-'||gen_random_uuid(); payload jsonb; n int;
begin
  insert into public.riders(rider_code,name,full_name,cot,kv,status) values
    (one,'Snapshot test 1','Snapshot test 1','COT 1','KV1','active'),
    (two,'Snapshot test 2','Snapshot test 2','COT2','KV3','active');
  payload:=jsonb_build_array(jsonb_build_object('driver_id',one,'onhold_orders',7),jsonb_build_object('driver_id',two,'onhold_orders',0));
  insert into public.pickup_realtime_current(id,snapshot_id,snapshot_at,source_date,inventory_snapshot_id,inventory_snapshot_at,task_count,riders,groups)
    values(1,'cot-test-first',now(),'2099-01-01','fixture',now(),1,payload,'[]')
    on conflict(id) do update set snapshot_id=excluded.snapshot_id,snapshot_at=excluded.snapshot_at,source_date=excluded.source_date,
      inventory_snapshot_at=excluded.inventory_snapshot_at,riders=excluded.riders;
  select count(*) into n from public.pickup_cot_oh_snapshots where report_date='2099-01-01'
    and ((cot='COT1' and riders->0->>'id'=one and riders->0->>'name'='Snapshot test 1' and (riders->0->>'onhold')::int=7 and riders->0->>'area'='KV1')
      or (cot='COT2' and riders->0->>'id'=two and (riders->0->>'onhold')::int=0));
  if n<>2 then raise exception 'Trigger lost COT identity or genuine zero'; end if;
  update public.riders set kv='KV5',cot='COT2',full_name='Renamed after capture',name='Renamed after capture' where rider_code=one;
  update public.pickup_realtime_current set snapshot_id='cot-test-later',riders=jsonb_build_array(jsonb_build_object('driver_id',one,'onhold_orders',999));
  if exists(select 1 from public.pickup_cot_oh_snapshots where report_date='2099-01-01' and snapshot_id<>'cot-test-first') then raise exception 'Later publication overwrote frozen snapshot'; end if;
  if (select riders->0->>'area' from public.pickup_cot_oh_snapshots where report_date='2099-01-01' and cot='COT1')<>'KV1' then raise exception 'Roster edits changed history'; end if;
  if (select riders->0->>'name' from public.pickup_cot_oh_snapshots where report_date='2099-01-01' and cot='COT1')<>'Snapshot test 1' then raise exception 'Rider rename rewrote frozen name'; end if;
  update public.pickup_realtime_current set source_date='2099-01-02',riders=jsonb_build_array(jsonb_build_object('driver_id',one,'onhold_orders',null));
  if exists(select 1 from public.pickup_cot_oh_snapshots where report_date='2099-01-02') then raise exception 'Invalid source became partial snapshot'; end if;
end $test$;
reset role;
