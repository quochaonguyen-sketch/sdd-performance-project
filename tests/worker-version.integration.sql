do $$
declare token text:='test-version-'||gen_random_uuid()::text; long_version text:='1.5-lh-dashboard-lh-unseal-pick13'; job jsonb; claimed jsonb;
begin
  if length(long_version)<=30 then raise exception 'Fixture must reproduce truncation'; end if;
  perform public.pulse_data_source_worker(token,'test-host',long_version,1);
  if not exists(select 1 from public.data_source_workers where id=token and version=long_version) then raise exception 'Worker capability was truncated'; end if;
  -- This test always rolls back, including temporary isolation of the real queue.
  update public.data_source_settings set auto_enabled=false;
  update public.data_source_jobs set status='CANCELLED' where status='QUEUED';
  if exists(select 1 from public.data_source_jobs where source_id='performance' and status in ('RUNNING','CANCEL_REQUESTED')) then raise exception 'Wait for active Performance before testing'; end if;
  job:=public.control_data_source('performance','run',(now() at time zone 'Asia/Ho_Chi_Minh')::date,null);
  perform public.pulse_data_source_worker(token,'test-host','1.5-lh-unseal',1);
  if public.claim_data_source_job(token) is not null then raise exception 'Unsupported worker accepted Performance'; end if;
  perform public.pulse_data_source_worker(token,'test-host',long_version,1);
  claimed:=public.claim_data_source_job(token);
  if claimed->>'id' is distinct from job->>'jobId' or claimed->>'status'<>'RUNNING' then raise exception 'Supported worker cannot claim Performance'; end if;
  if has_function_privilege('anon','public.pulse_data_source_worker(text,text,text,integer)','execute') or has_function_privilege('authenticated','public.pulse_data_source_worker(text,text,text,integer)','execute') then raise exception 'Worker heartbeat exposed'; end if;
end $$;
