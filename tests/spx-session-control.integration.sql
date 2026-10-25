do $$
declare request uuid; duplicate uuid; result uuid; envelope jsonb;
begin
  if has_table_privilege('anon','public.data_source_spx_sessions','select')
    or has_table_privilege('authenticated','public.data_source_spx_sessions','update')
    or has_function_privilege('anon','public.request_spx_session_refresh(text,uuid,jsonb)','execute')
    or has_function_privilege('authenticated','public.pulse_spx_session(text,boolean,boolean,boolean,timestamptz,timestamptz,text)','execute')
    or has_function_privilege('authenticated','public.finish_spx_session_refresh(text,uuid,boolean)','execute') then
    raise exception 'Session control exposed';
  end if;
  if has_function_privilege('authenticated','public.consume_spx_credentials(text,uuid)','execute')
    or has_function_privilege('anon','public.advertise_spx_session_key(text,text,text)','execute') then raise exception 'Credential transport exposed'; end if;
  if not (select relrowsecurity from pg_class where oid='public.data_source_spx_sessions'::regclass) then raise exception 'Missing RLS'; end if;
  insert into public.data_source_workers(id,hostname,version,concurrency) values('session-test-worker','test','test',1);
  perform public.pulse_spx_session('session-test-worker',true,true,false,now());
  perform public.request_spx_session_refresh('session-test-worker',null);
  select request_id into request from public.data_source_spx_sessions where worker_id='session-test-worker';
  perform public.request_spx_session_refresh('session-test-worker',null);
  select request_id into duplicate from public.data_source_spx_sessions where worker_id='session-test-worker';
  if duplicate<>request then raise exception 'Duplicate refresh request'; end if;
  result:=public.pulse_spx_session('session-test-worker',true,true,false,now());
  if result<>request then raise exception 'Refresh not claimed'; end if;
  if public.pulse_spx_session('session-test-worker',true,true,false,now()) is not null then raise exception 'Double claim'; end if;
  perform public.finish_spx_session_refresh('session-test-worker',gen_random_uuid(),true);
  if (select status from public.data_source_spx_sessions where worker_id='session-test-worker')<>'RUNNING' then raise exception 'Wrong ownership accepted'; end if;
  perform public.finish_spx_session_refresh('session-test-worker',request,false);
  if (select status from public.data_source_spx_sessions where worker_id='session-test-worker')<>'FAILED' then raise exception 'Failure missing'; end if;
  perform public.request_spx_session_refresh('session-test-worker',null);
  request:=public.pulse_spx_session('session-test-worker',true,true,false,now());
  perform public.finish_spx_session_refresh('session-test-worker',request,true);
  if (select status from public.data_source_spx_sessions where worker_id='session-test-worker')<>'SUCCEEDED' then raise exception 'Success missing'; end if;
  update public.data_source_spx_sessions set status='RUNNING',started_at=now()-interval '11 minutes' where worker_id='session-test-worker';
  perform public.pulse_spx_session('session-test-worker',true,true,false,now());
  if (select status from public.data_source_spx_sessions where worker_id='session-test-worker')<>'FAILED' then raise exception 'Timeout not recovered'; end if;
  update public.data_source_spx_sessions set checked_at=now()-interval '1 minute' where worker_id='session-test-worker';
  begin
    perform public.request_spx_session_refresh('session-test-worker',null);
    raise exception 'Offline worker accepted';
  exception when raise_exception then
    if sqlerrm<>'Worker offline' then raise; end if;
  end;
  perform public.pulse_spx_session('session-test-worker',true,true,false,now());
  perform public.advertise_spx_session_key('session-test-worker',repeat('x',450),repeat('a',64));
  envelope:=jsonb_build_object('version',1,'keyId',repeat('a',64),'key','encrypted-key','iv','iv','data','encrypted-data');
  begin
    perform public.request_spx_session_refresh('session-test-worker',null,envelope||'{"keyId":"wrong"}'::jsonb);
    raise exception 'Wrong key accepted';
  exception when raise_exception then
    if sqlerrm<>'Invalid credential envelope' then raise; end if;
  end;
  perform public.request_spx_session_refresh('session-test-worker',null,envelope);
  begin
    perform public.request_spx_session_refresh('session-test-worker',null,envelope);
    raise exception 'Pending credentials replaced';
  exception when raise_exception then
    if sqlerrm<>'Refresh already pending' then raise; end if;
  end;
  request:=public.pulse_spx_session('session-test-worker',true,true,false,now());
  begin
    perform public.consume_spx_credentials('other-worker',request);
    raise exception 'Other worker read credentials';
  exception when raise_exception then
    if sqlerrm<>'Request ownership lost' then raise; end if;
  end;
  if public.consume_spx_credentials('session-test-worker',request)<>envelope then raise exception 'Envelope not delivered'; end if;
  if public.consume_spx_credentials('session-test-worker',request)<>envelope then raise exception 'Envelope cannot be retried'; end if;
  perform public.finish_spx_session_refresh('session-test-worker',request,true);
  if (select credential_envelope from public.data_source_spx_sessions where worker_id='session-test-worker') is not null then raise exception 'Envelope not removed after completion'; end if;
  perform public.request_spx_session_refresh('session-test-worker',null,envelope);
  update public.data_source_spx_sessions set requested_at=now()-interval '11 minutes' where worker_id='session-test-worker';
  if public.pulse_spx_session('session-test-worker',true,true,false,now()) is not null then raise exception 'Expired credentials claimed'; end if;
  if (select credential_envelope from public.data_source_spx_sessions where worker_id='session-test-worker') is not null then raise exception 'Expired envelope not purged'; end if;
  perform public.pulse_spx_session('session-test-worker',true,true,false,now(),'2030-03-17 17:46:40+00','fixed');
  if not exists(select 1 from public.data_source_spx_sessions where worker_id='session-test-worker' and cookie_expiry_kind='fixed' and cookie_expires_at='2030-03-17 17:46:40+00') then raise exception 'Cookie expiry metadata missing'; end if;
  perform public.pulse_spx_session('session-test-worker',true,true,false,now(),null,'session');
  if not exists(select 1 from public.data_source_spx_sessions where worker_id='session-test-worker' and cookie_expiry_kind='session' and cookie_expires_at is null) then raise exception 'Previous expiry not cleared'; end if;
end $$;
