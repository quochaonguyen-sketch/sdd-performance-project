-- Executed inside an explicit rollback-only transaction by apply-backlog-history.cjs --test.
do $$
declare target timestamptz:=(((now() at time zone 'Asia/Ho_Chi_Minh')::date+1)+'16:00'::time) at time zone 'Asia/Ho_Chi_Minh';
  legacy uuid; central uuid; snap uuid; same uuid; token text:='history-test-'||gen_random_uuid()::text;
begin
  perform pg_advisory_xact_lock(948251,1);
  if has_table_privilege('anon','public.backlog_snapshots','select') or has_table_privilege('authenticated','public.backlog_snapshot_rows','select') then raise exception 'History exposed outside server API'; end if;
  if has_function_privilege('authenticated','public.enqueue_backlog_checkpoints(timestamptz)','execute') then raise exception 'Scheduler exposed'; end if;
  if (select count(*) from pg_class where oid in ('public.backlog_snapshots'::regclass,'public.backlog_snapshot_rows'::regclass,'public.backlog_checkpoints'::regclass) and relrowsecurity)<>3 then raise exception 'RLS missing'; end if;
  perform public.enqueue_backlog_checkpoints(target-interval '1 minute');
  if exists(select 1 from public.backlog_checkpoints where scheduled_for=target and status<>'PENDING') then raise exception 'Checkpoint started early'; end if;
  perform public.enqueue_backlog_checkpoints(target);
  if exists(select 1 from public.backlog_checkpoints c join public.data_source_jobs j on j.id=c.job_id
    where c.scheduled_for=target and c.status='QUEUED' and j.started_at<c.scheduled_for) then raise exception 'Attached stale running source'; end if;
  if public.enqueue_backlog_checkpoints(target)<>0 then raise exception 'Duplicate checkpoint queued'; end if;
  perform public.enqueue_backlog_checkpoints(target+interval '16 minutes');
  if exists(select 1 from public.backlog_checkpoints where scheduled_for=target and status in ('PENDING','QUEUED')) then raise exception 'Late source mislabeled as on-time'; end if;

  insert into public.lmhub_fetch_jobs(status,started_at,params) values('RUNNING',target+interval '2 seconds','{"kind":"pickup"}') returning id into legacy;
  insert into public.data_source_jobs(source_id,report_date,status,phase,legacy_job_id) values('pickup_inventory',(target at time zone 'Asia/Ho_Chi_Minh')::date,'SUCCEEDED','finished',legacy) returning id into central;
  update public.backlog_checkpoints set status='QUEUED',job_id=central where source='pickup' and scheduled_for=target;
  insert into public.pickup_48h_no_api2(tracking_id,shipment_id,status,area,district,ward,cot_group,snapshot_id,snapshot_at) values
    (token||'a',token||'1','Assigned','KV1','Quận 4','Phường A','26/10/2026 COT 1',token,target),
    (token||'b',token||'2','Assigned','KV1','Quận 4','Phường A','26/10/2026 COT 2',token,target),
    (token||'c',token||'2','Assigned','KV1','Quận 4','Phường A','26/10/2026 COT 2',token,target),
    (token||'d',token||'3','Pickup Onhold','KV1','Quận 4','Phường A','COT1',token,target);
  update public.lmhub_fetch_jobs set status='DONE',snapshot_id=token,row_count=4,finished_at=target+interval '10 seconds' where id=legacy;
  select id into snap from public.backlog_snapshots where source='pickup' and source_snapshot_id=token;
  if snap is null or (select total_orders from public.backlog_snapshots where id=snap)<>2 then raise exception 'Wrong distinct Assigned pivot'; end if;
  if not exists(select 1 from public.backlog_snapshot_rows where snapshot_id=snap and cot1=1 and cot2=1 and orders=2) then raise exception 'COT pivot mismatch'; end if;
  if not exists(select 1 from public.backlog_checkpoints where source='pickup' and scheduled_for=target and status='CAPTURED' and snapshot_id=snap) then raise exception 'Checkpoint not linked to fresh publication'; end if;
  same:=public.capture_backlog_snapshot('pickup',token,target);
  if same<>snap or (select count(*) from public.backlog_snapshots where source_snapshot_id=token)<>1 then raise exception 'Snapshot not immutable/idempotent'; end if;
  if (select slot_at from public.backlog_snapshots where id=snap)<>target then raise exception 'UTC+7 slot wrong'; end if;
  if (public.read_backlog_snapshot(snap,'delivery')) is not null then raise exception 'Cross-source lookup'; end if;

  same:=public.capture_backlog_snapshot('pickup',token||'-empty',target+interval '30 minutes');
  if (select total_orders from public.backlog_snapshots where id=same)<>0 or exists(select 1 from public.backlog_snapshot_rows where snapshot_id=same) then raise exception 'Empty snapshot lost'; end if;
  if jsonb_array_length(public.read_backlog_snapshot(same,'pickup')->'rows')<>0 then raise exception 'Empty detail wrong'; end if;
  insert into public.lmhub_inventory_rows(snapshot_id,snapshot_at,shipment_id,area,district,ward,cot_group) values
    (token,target,token||'-delivery','KV2','Quận 7','Phường B','COT1');
  same:=public.capture_backlog_snapshot('delivery',token,target);
  if (select total_orders from public.backlog_snapshots where id=same)<>1 then raise exception 'Delivery pivot mismatch'; end if;
  insert into public.lmhub_fetch_jobs(status,worker_id,updated_at,started_at,params) values('RUNNING','history-zero-test',now(),now(),'{"kind":"delivery"}') returning id into legacy;
  begin
    perform public.publish_sdd_delivery_inventory(legacy,'history-zero-test',token||'-zero',now(),'[]',array['KV1'],false);
    raise exception 'Unverified empty source accepted';
  exception when others then
    if sqlerrm='Unverified empty source accepted' then raise; end if;
  end;
  perform public.publish_sdd_delivery_inventory(legacy,'history-zero-test',token||'-zero',now(),'[]',array['KV1'],true);
  if not exists(select 1 from public.backlog_snapshots where source_snapshot_id=token||'-zero' and source='delivery' and total_orders=0) then raise exception 'Verified delivery zero not archived'; end if;
end $$;

-- Hour boundaries, canonical snapshot stability, zero versus missing.
do $$
declare target timestamptz:='2000-01-02 11:50:00+07'; official uuid; later uuid; report jsonb; token text:='hour-test-'||gen_random_uuid()::text;
begin
  if not public.backlog_checkpoint_valid(target,target+interval '2 seconds',target+interval '40 seconds') then raise exception 'Valid :50 read rejected'; end if;
  if public.backlog_checkpoint_valid(target,target-interval '1 second',target+interval '1 minute') then raise exception 'Pre-50 read accepted'; end if;
  if public.backlog_checkpoint_valid(target,target+interval '1 minute',target+interval '10 minutes') then raise exception 'Next hour incorrectly assigned to previous hour'; end if;
  if public.backlog_checkpoint_valid('2000-01-02 23:50+07','2000-01-02 23:51+07','2000-01-03 00:00+07') then raise exception 'Midnight crossed'; end if;
  if not public.backlog_checkpoint_valid('2000-01-02 16:00+07','2000-01-02 16:10+07','2000-01-02 16:20+07') then raise exception 'Special checkpoint behavior changed'; end if;
  official:=public.capture_backlog_snapshot('pickup',token,target+interval '40 seconds',target+interval '2 seconds');
  insert into public.backlog_checkpoints(source,scheduled_for,status,snapshot_id) values('pickup',target,'CAPTURED',official);
  later:=public.capture_backlog_snapshot('pickup',token||'-later',target+interval '8 minutes',target+interval '7 minutes');
  report:=public.read_backlog_hourly('pickup','2000-01-02');
  if jsonb_array_length(report->'hours')<>24 then raise exception 'Expected 24 hour buckets'; end if;
  if report->'hours'->11->>'snapshot_id'<>official::text then raise exception 'Later ordinary read overwrote canonical hour'; end if;
  if not (report->'hours'->11->>'is_final')::boolean or (report->'hours'->11->>'total_orders')::int<>0 then raise exception 'Finalized zero lost'; end if;
  if report->'hours'->10->>'total_orders' is not null or report->'hours'->10->>'snapshot_id' is not null then raise exception 'Missing hour fabricated as zero'; end if;
  perform public.capture_backlog_snapshot('delivery',token||'-provisional','2000-01-02 12:35+07','2000-01-02 12:34+07');
  report:=public.read_backlog_hourly('delivery','2000-01-02');
  if report->'hours'->12->>'status'<>'PROVISIONAL' or (report->'hours'->12->>'is_final')::boolean then raise exception 'Provisional snapshot mislabeled'; end if;
  if has_function_privilege('authenticated','public.read_backlog_hourly(text,date)','execute') then raise exception 'Hourly data exposed'; end if;
end $$;


