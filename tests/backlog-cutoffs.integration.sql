do $test$
declare day date:='2098-08-04'; target timestamptz; n int; official uuid; token text:='cutoff-test-'||gen_random_uuid();
begin
  if (select array_agg(t order by t) from public.backlog_cutoff_times('pickup') t)<>array['11:15'::time,'15:30'::time] then raise exception 'Wrong pickup cutoff times'; end if;
  if (select array_agg(t order by t) from public.backlog_cutoff_times('delivery') t)<>array['13:30'::time,'17:30'::time] then raise exception 'Wrong delivery cutoff times'; end if;
  perform public.enqueue_backlog_checkpoints((day+'00:00'::time) at time zone 'Asia/Ho_Chi_Minh');
  select count(*) into n from public.backlog_checkpoints where (scheduled_for at time zone 'Asia/Ho_Chi_Minh')::date=day;
  if n<>52 then raise exception 'Expected 48 hourly and 4 source-specific checkpoints, got %',n; end if;
  if exists(select 1 from public.backlog_checkpoints where (scheduled_for at time zone 'Asia/Ho_Chi_Minh')::date=day and (scheduled_for at time zone 'Asia/Ho_Chi_Minh')::time in ('16:00'::time,'16:30'::time)) then raise exception 'Old fixed slots still created'; end if;
  target:=(day+'13:30'::time) at time zone 'Asia/Ho_Chi_Minh';
  if not public.backlog_checkpoint_valid(target,target+interval '1 minute',target+interval '12 minutes') then raise exception 'Fresh cutoff source rejected'; end if;
  if public.backlog_checkpoint_valid(target,target-interval '1 minute',target+interval '2 minutes') then raise exception 'Pre-cutoff source accepted'; end if;
  if public.backlog_checkpoint_valid(target,target+interval '14 minutes',target+interval '16 minutes') then raise exception 'Late completion accepted'; end if;
  perform public.enqueue_backlog_checkpoints(target-interval '1 second');
  if (select status from public.backlog_checkpoints where source='delivery' and scheduled_for=target)<>'PENDING' then raise exception 'Delivery queued early'; end if;
  perform public.enqueue_backlog_checkpoints(target);
  perform public.enqueue_backlog_checkpoints(target+interval '16 minutes');
  if (select status from public.backlog_checkpoints where source='delivery' and scheduled_for=target) in ('PENDING','QUEUED') then raise exception 'Missed cutoff remains active'; end if;
  official:=public.capture_backlog_snapshot('delivery',token,target+interval '1 minute',target);
  update public.backlog_checkpoints set status='CAPTURED',snapshot_id=official where source='delivery' and scheduled_for=target;
  perform public.enqueue_backlog_checkpoints(target+interval '18 minutes');
  if (select snapshot_id from public.backlog_checkpoints where source='delivery' and scheduled_for=target)<>official then raise exception 'Captured cutoff overwritten'; end if;
  if has_function_privilege('authenticated','public.backlog_cutoff_times(text)','EXECUTE') then raise exception 'Cutoff helper exposed'; end if;
end $test$;
