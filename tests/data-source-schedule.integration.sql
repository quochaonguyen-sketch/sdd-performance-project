-- Safe operational assertions: outer transaction is always rolled back by the SQL runner.
do $$
declare n integer; job public.data_source_jobs; next_at timestamptz;
begin
  if exists(select 1 from public.data_source_jobs where source_id in ('pickup_volume','delivery_volume','performance') and status in ('QUEUED','RUNNING','CANCEL_REQUESTED')) then raise exception 'Volume/performance sources must be idle for schedule test'; end if;
  if has_function_privilege('anon','public.configure_data_source_schedule(text,uuid,boolean,text,integer,text,integer)','execute') or has_function_privilege('authenticated','public.enqueue_due_data_sources(timestamptz)','execute') then raise exception 'Scheduler exposed'; end if;
  if public.next_data_source_daily('18:00','2026-10-25 10:59:59+00')<>'2026-10-25 11:00+00'::timestamptz then raise exception 'VN 18:00 conversion failed'; end if;
  if public.next_data_source_daily('18:00','2026-10-25 11:00+00')<>'2026-10-26 11:00+00'::timestamptz then raise exception 'Exact-time advancement failed'; end if;
  if public.next_data_source_daily('06:00','2026-10-24 22:59:59+00')<>'2026-10-24 23:00+00'::timestamptz then raise exception 'VN day boundary failed'; end if;
  update public.data_source_settings set auto_enabled=false;
  begin
    perform public.configure_data_source_schedule('pickup_volume',null,true,'daily',1800,'25:00',0);
    raise exception 'Invalid time accepted';
  exception when raise_exception then if SQLERRM='Invalid time accepted' then raise; end if; end;
  begin
    perform public.configure_data_source_schedule('pickup_inventory',null,true,'daily',1800,'06:00',1);
    raise exception 'Historical inventory schedule accepted';
  exception when raise_exception then if SQLERRM='Historical inventory schedule accepted' then raise; end if; end;
  perform public.configure_data_source_schedule('pickup_volume',null,true,'daily',1800,'18:00',0);
  if not exists(select 1 from public.data_source_settings where source_id='pickup_volume' and schedule_mode='daily' and daily_time='18:00' and day_offset=0 and next_run_at=public.next_data_source_daily('18:00',now())) then raise exception 'Daily configuration not saved'; end if;
  update public.data_source_settings set auto_enabled=true,schedule_mode='daily',daily_time='06:00',day_offset=case when source_id='delivery_volume' then 1 else 0 end,next_run_at='2026-10-24 23:00+00'
    where source_id in ('pickup_volume','delivery_volume');
  if public.enqueue_due_data_sources('2026-10-24 22:59:59+00')<>0 then raise exception 'Schedule ran early'; end if;
  n:=public.enqueue_due_data_sources('2026-10-24 23:00+00');
  if n<>2 then raise exception 'Daily schedule blocked before 08:00'; end if;
  if not exists(select 1 from public.data_source_jobs where source_id='pickup_volume' and status='QUEUED' and report_date='2026-10-25') then raise exception 'Current-day report date wrong'; end if;
  if not exists(select 1 from public.data_source_jobs where source_id='delivery_volume' and status='QUEUED' and report_date='2026-10-24') then raise exception 'Previous-day report date wrong'; end if;
  if public.enqueue_due_data_sources('2026-10-24 23:00+00')<>0 then raise exception 'Duplicate daily occurrence'; end if;
  select * into job from public.data_source_jobs where source_id='pickup_volume' and status='QUEUED';
  select next_run_at into next_at from public.data_source_settings where source_id='pickup_volume';
  update public.data_source_jobs set status='RUNNING',worker_id='schedule-test',lease_until=now()+interval '2 minutes' where id=job.id;
  perform public.finish_data_source_job(job.id,'schedule-test','SUCCEEDED');
  if (select next_run_at from public.data_source_settings where source_id='pickup_volume') is distinct from next_at then raise exception 'Completion shifted fixed daily time'; end if;
  update public.data_source_settings set auto_enabled=false where source_id='pickup_volume';
  -- Busy manual/queued work must not consume an unrun due occurrence.
  update public.data_source_settings set next_run_at='2026-10-24 23:00+00' where source_id='delivery_volume';
  if public.enqueue_due_data_sources('2026-10-25 00:00+00')<>0 then raise exception 'Busy source duplicated'; end if;
  if (select next_run_at from public.data_source_settings where source_id='delivery_volume')<>'2026-10-24 23:00+00'::timestamptz then raise exception 'Busy schedule lost its due time'; end if;
  update public.data_source_jobs set status='SUCCEEDED',phase='finished' where source_id='delivery_volume' and status='QUEUED';
  update public.data_source_settings set next_run_at='2026-10-20 23:00+00' where source_id='delivery_volume';
  if public.enqueue_due_data_sources('2026-10-25 00:00+00')<>1 then raise exception 'Offline catch-up failed'; end if;
  if not exists(select 1 from public.data_source_jobs where source_id='delivery_volume' and status='QUEUED' and report_date='2026-10-24') then raise exception 'Catch-up did not use latest due report date'; end if;
  update public.data_source_settings set auto_enabled=false where source_id='delivery_volume';
  update public.data_source_settings set auto_enabled=true,schedule_mode='interval',interval_seconds=1800,day_offset=0,next_run_at='2026-10-24 23:00+00' where source_id='performance';
  if public.enqueue_due_data_sources('2026-10-24 23:00+00')<>0 then raise exception 'Interval schedule ignored existing work window'; end if;
  if public.enqueue_due_data_sources('2026-10-25 01:00+00')<>1 then raise exception 'Interval regression'; end if;
end $$;

do $$
begin
  if exists(select 1 from public.data_source_jobs where source_id='onhold_daily' and status in ('RUNNING','CANCEL_REQUESTED')) then raise exception 'OH must be idle for schedule test'; end if;
  update public.data_source_settings set auto_enabled=false;
  update public.data_source_jobs set status='SUCCEEDED',phase='finished' where source_id='onhold_daily' and status='QUEUED';
  update public.data_source_settings set auto_enabled=true,schedule_mode='interval',interval_seconds=300,day_offset=0,next_run_at='2026-10-25 00:00+00' where source_id='onhold_daily';
  if public.enqueue_due_data_sources('2026-10-25 00:00+00')<>1 then raise exception 'OH collection blocked before 08:00'; end if;
  if not exists(select 1 from public.data_source_jobs where source_id='onhold_daily' and status='QUEUED' and report_date='2026-10-25') then raise exception 'OH report date wrong'; end if;
  begin
    perform public.configure_data_source_schedule('onhold_daily',null,true,'daily',300,'06:00',1);
    raise exception 'Historical OH collection accepted';
  exception when others then if sqlerrm='Historical OH collection accepted' then raise; end if; end;
end $$;
