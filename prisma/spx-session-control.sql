-- Cookie values and decrypted credentials remain on the Windows worker.
create table if not exists public.data_source_spx_sessions (
  worker_id text primary key references public.data_source_workers(id),
  cookie_present boolean not null default false,
  account_saved boolean not null default false,
  profile_ready boolean not null default false,
  cookie_updated_at timestamptz,
  checked_at timestamptz not null default now(),
  request_id uuid,
  status text not null default 'IDLE' check(status in ('IDLE','QUEUED','RUNNING','SUCCEEDED','FAILED')),
  requested_by uuid, requested_at timestamptz, started_at timestamptz, finished_at timestamptz
);
alter table public.data_source_spx_sessions enable row level security;
revoke all on public.data_source_spx_sessions from public,anon,authenticated;
grant select,insert,update on public.data_source_spx_sessions to service_role;
alter table public.data_source_spx_sessions add column if not exists public_key text;
alter table public.data_source_spx_sessions add column if not exists key_id text;
alter table public.data_source_spx_sessions add column if not exists credential_envelope jsonb;
alter table public.data_source_spx_sessions add column if not exists cookie_expires_at timestamptz;
alter table public.data_source_spx_sessions add column if not exists cookie_expiry_kind text not null default 'unknown' check(cookie_expiry_kind in ('fixed','session','unknown','missing'));

create or replace function public.request_spx_session_refresh(p_worker text,p_actor uuid,p_envelope jsonb default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare s public.data_source_spx_sessions;
begin
  select * into s from public.data_source_spx_sessions where worker_id=p_worker for update;
  if not found or s.checked_at < now()-interval '45 seconds' then raise exception 'Worker offline'; end if;
  if s.status in ('QUEUED','RUNNING') then
    if p_envelope is not null then raise exception 'Refresh already pending'; end if;
    return jsonb_build_object('message','Đã có yêu cầu làm mới cookie đang chờ hoặc chạy');
  end if;
  if p_envelope is not null and (s.key_id is null or jsonb_typeof(p_envelope)<>'object' or p_envelope->>'keyId' is distinct from s.key_id
    or p_envelope->>'version' is distinct from '1' or octet_length(p_envelope::text)>10000) then raise exception 'Invalid credential envelope'; end if;
  update public.data_source_spx_sessions set request_id=gen_random_uuid(),status='QUEUED',requested_by=p_actor,
    requested_at=now(),started_at=null,finished_at=null,credential_envelope=p_envelope where worker_id=p_worker;
  return jsonb_build_object('message',case when p_envelope is null then 'Đã gửi yêu cầu làm mới cookie SPX cho tất cả nguồn trên máy chủ'
    else 'Đã gửi tài khoản mã hóa. Chờ worker lưu tài khoản và làm mới cookie SPX.' end);
end $$;
drop function if exists public.request_spx_session_refresh(text,uuid);

create or replace function public.pulse_spx_session(p_worker text,p_cookie boolean,p_account boolean,p_profile boolean,p_updated timestamptz,p_expires timestamptz default null,p_expiry_kind text default 'unknown')
returns uuid language plpgsql security invoker set search_path=pg_catalog as $$
declare s public.data_source_spx_sessions;
begin
  insert into public.data_source_spx_sessions(worker_id,cookie_present,account_saved,profile_ready,cookie_updated_at)
    values(p_worker,p_cookie,p_account,p_profile,p_updated) on conflict(worker_id) do nothing;
  select * into s from public.data_source_spx_sessions where worker_id=p_worker for update;
  if s.status='QUEUED' and s.requested_at<now()-interval '10 minutes' then
    update public.data_source_spx_sessions set status='FAILED',finished_at=now(),credential_envelope=null where worker_id=p_worker;
    s.status:='FAILED';
  end if;
  update public.data_source_spx_sessions set cookie_present=p_cookie,account_saved=p_account,profile_ready=p_profile,
    cookie_updated_at=p_updated,cookie_expires_at=p_expires,cookie_expiry_kind=p_expiry_kind,checked_at=now(),
    status=case when status='RUNNING' and started_at<now()-interval '10 minutes' then 'FAILED' else status end,
    finished_at=case when status='RUNNING' and started_at<now()-interval '10 minutes' then now() else finished_at end,
    credential_envelope=case when status='RUNNING' and started_at<now()-interval '10 minutes' then null else credential_envelope end
    where worker_id=p_worker;
  if s.status='QUEUED' then
    update public.data_source_spx_sessions set status='RUNNING',started_at=now() where worker_id=p_worker;
    return s.request_id;
  end if;
  return null;
end $$;
drop function if exists public.pulse_spx_session(text,boolean,boolean,boolean,timestamptz);

create or replace function public.finish_spx_session_refresh(p_worker text,p_request uuid,p_success boolean)
returns void language sql security invoker set search_path=pg_catalog as $$
  update public.data_source_spx_sessions set status=case when p_success then 'SUCCEEDED' else 'FAILED' end,finished_at=now(),credential_envelope=null
  where worker_id=p_worker and request_id=p_request and status='RUNNING';
$$;
create or replace function public.advertise_spx_session_key(p_worker text,p_key text,p_key_id text)
returns void language plpgsql security invoker set search_path=pg_catalog as $$
begin
  if p_key is null or length(p_key) not between 400 and 1000 or p_key_id is null or p_key_id !~ '^[a-f0-9]{64}$' then raise exception 'Invalid public key'; end if;
  update public.data_source_spx_sessions set public_key=p_key,key_id=p_key_id where worker_id=p_worker;
end $$;

create or replace function public.consume_spx_credentials(p_worker text,p_request uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare s public.data_source_spx_sessions;
begin
  select * into s from public.data_source_spx_sessions where worker_id=p_worker and request_id=p_request and status='RUNNING' for update;
  if not found then raise exception 'Request ownership lost'; end if;
  if s.credential_envelope is not null and s.requested_at<now()-interval '10 minutes' then
    update public.data_source_spx_sessions set credential_envelope=null where worker_id=p_worker;
    return '{"expired":true}'::jsonb;
  end if;
  return s.credential_envelope;
end $$;

revoke all on function public.request_spx_session_refresh(text,uuid,jsonb),public.pulse_spx_session(text,boolean,boolean,boolean,timestamptz,timestamptz,text),public.finish_spx_session_refresh(text,uuid,boolean),public.advertise_spx_session_key(text,text,text),public.consume_spx_credentials(text,uuid) from public,anon,authenticated;
grant execute on function public.request_spx_session_refresh(text,uuid,jsonb),public.pulse_spx_session(text,boolean,boolean,boolean,timestamptz,timestamptz,text),public.finish_spx_session_refresh(text,uuid,boolean),public.advertise_spx_session_key(text,text,text),public.consume_spx_credentials(text,uuid) to service_role;
