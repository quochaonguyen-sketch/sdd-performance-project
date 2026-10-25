do $$
declare job_id uuid; n integer; today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if exists(select 1 from public.data_source_jobs where source_id='pickup_volume' and status in ('QUEUED','RUNNING','CANCEL_REQUESTED')) then raise exception 'Pickup volume must be idle for window tests'; end if;
  if public.next_data_source_window('07:00','17:00','2026-10-25 00:00+00')<>'2026-10-25 00:00+00'::timestamptz then raise exception '07:00 start excluded'; end if;
  if public.next_data_source_window('07:00','17:00','2026-10-25 09:59:59+00')<>'2026-10-25 09:59:59+00'::timestamptz then raise exception 'Before 17:00 excluded'; end if;
  if public.next_data_source_window('07:00','17:00','2026-10-25 10:00+00')<>'2026-10-26 00:00+00'::timestamptz then raise exception '17:00 cutoff ignored'; end if;
  if public.next_data_source_window('07:00','23:00','2026-10-25 16:00+00')<>'2026-10-26 00:00+00'::timestamptz then raise exception 'OH 23:00 cutoff ignored'; end if;
  if public.next_data_source_window('22:00','07:00','2026-10-25 18:00+00')<>'2026-10-25 18:00+00'::timestamptz then raise exception 'Overnight valid hour blocked'; end if;
  if public.next_data_source_window('22:00','07:00','2026-10-25 05:00+00')<>'2026-10-25 15:00+00'::timestamptz then raise exception 'Overnight next start wrong'; end if;
  if public.next_data_source_window('00:00','00:00','2026-10-25 05:00+00')<>'2026-10-25 05:00+00'::timestamptz then raise exception 'Full day blocked'; end if;
  update public.data_source_settings set auto_enabled=false;
  perform public.configure_data_source_schedule('pickup_volume',null,true,'interval',300,'18:00',0,'07:00','17:00');
  update public.data_source_settings set next_run_at='2026-10-24 23:59+00' where source_id='pickup_volume';
  if public.enqueue_due_data_sources('2026-10-24 23:59+00')<>0 then raise exception 'Started before window'; end if;
  if public.enqueue_due_data_sources('2026-10-25 00:00+00')<>1 then raise exception 'Did not start at window opening'; end if;
  update public.data_source_jobs set status='SUCCEEDED',phase='finished' where source_id='pickup_volume' and status='QUEUED';
  update public.data_source_settings set next_run_at='2026-10-25 10:00+00' where source_id='pickup_volume';
  if public.enqueue_due_data_sources('2026-10-25 10:00+00')<>0 then raise exception 'Enqueued at closing time'; end if;
  if (select next_run_at from public.data_source_settings where source_id='pickup_volume')<>'2026-10-26 00:00+00'::timestamptz then raise exception 'Next window not reflected'; end if;
  -- Closed window: skip stale automatic queue entries, still allow manual runs.
  update public.data_source_settings set window_start=((now() at time zone 'Asia/Ho_Chi_Minh')+interval '2 hours')::time,
    window_end=((now() at time zone 'Asia/Ho_Chi_Minh')+interval '3 hours')::time,next_run_at=now()+interval '1 day' where source_id='pickup_volume';
  insert into public.data_source_workers(id,hostname,version,concurrency) values('window-test','test','test',4);
  insert into public.data_source_jobs(source_id,report_date,events) values('pickup_volume',today,jsonb_build_array(jsonb_build_object('scheduled_at',now()))) returning id into job_id;
  perform public.claim_data_source_job('window-test');
  if (select status from public.data_source_jobs where id=job_id)<>'CANCELLED' then raise exception 'Stale automatic work started'; end if;
  perform public.control_data_source('pickup_volume','run',today,null);
  -- Other existing queued sources may be claimed first; inspect only the target manual job.
  if not exists(select 1 from public.data_source_jobs where source_id='pickup_volume' and status='QUEUED' and not(events->0 ? 'scheduled_at')) then raise exception 'Manual run blocked'; end if;
end $$;
