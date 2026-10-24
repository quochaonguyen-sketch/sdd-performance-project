-- User activity is append-only from the application; only service_role reads it.
create schema if not exists ops_private;
revoke all on schema ops_private from public, anon, authenticated;

create table if not exists public.user_activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_email text not null default '',
  actor_name text,
  event_type text not null,
  entity_type text,
  entity_id text,
  path text,
  summary text not null,
  changes jsonb not null default '{}'::jsonb,
  event_id uuid unique,
  created_at timestamptz not null default now()
);
alter table public.user_activity_logs enable row level security;
revoke all on public.user_activity_logs from anon, authenticated;
grant select, insert on public.user_activity_logs to service_role;
revoke update, delete, truncate on public.user_activity_logs from service_role;
create index if not exists user_activity_created_idx on public.user_activity_logs(created_at desc);
create index if not exists user_activity_actor_created_idx on public.user_activity_logs(actor_id, created_at desc);
create index if not exists user_activity_event_created_idx on public.user_activity_logs(event_type, created_at desc);

create or replace function ops_private.request_actor()
returns uuid language plpgsql stable security invoker set search_path = pg_catalog as $fn$
declare claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  request_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  candidate text;
begin
  if claims->>'role' = 'authenticated' then candidate := claims->>'sub';
  elsif claims->>'role' = 'service_role' then candidate := request_headers->>'x-app-actor-id';
  end if;
  if candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return candidate::uuid; end if;
  return null;
end $fn$;
revoke all on function ops_private.request_actor() from public, anon, authenticated;

create or replace function ops_private.guard_rider_area()
returns trigger language plpgsql security definer set search_path = pg_catalog as $fn$
declare actor uuid := ops_private.request_actor();
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  actor_role text; metadata jsonb; permitted jsonb;
begin
  -- Server imports without a user actor retain their service-role privileges.
  -- Browser users cannot set the service-role identity or impersonate headers.
  if actor is null then
    if claims->>'role' = 'service_role' or session_user in ('postgres', 'supabase_admin') and claims = '{}'::jsonb then
      if TG_OP = 'DELETE' then return old; else return new; end if;
    end if;
    raise exception 'Chưa xác định người sửa rider' using errcode='42501';
  end if;
  select p.role::text, u.raw_app_meta_data into actor_role, metadata
    from public.profiles p join auth.users u on u.id=p.id where p.id=actor;
  if actor_role = 'admin' then
    if TG_OP = 'DELETE' then return old; else return new; end if;
  end if;
  if coalesce(metadata->'permissions'->>'manage_riders', 'false') <> 'true' then
    raise exception 'Bạn không có quyền chỉnh sửa rider' using errcode='42501';
  end if;
  permitted := case when jsonb_typeof(metadata->'rider_edit_areas')='array' then metadata->'rider_edit_areas' else '[]'::jsonb end;
  if TG_OP <> 'INSERT' and not (permitted ? upper(btrim(coalesce(old.kv,'')))) then
    raise exception 'Rider nằm ngoài KV được cấp quyền' using errcode='42501';
  end if;
  if TG_OP <> 'DELETE' and not (permitted ? upper(btrim(coalesce(new.kv,'')))) then
    raise exception 'Không được tạo/chuyển rider sang KV ngoài quyền' using errcode='42501';
  end if;
  if TG_OP = 'DELETE' then return old; else return new; end if;
end $fn$;
revoke all on function ops_private.guard_rider_area() from public, anon, authenticated;
drop trigger if exists enforce_rider_edit_area on public.riders;
create trigger enforce_rider_edit_area before insert or update or delete on public.riders
  for each row execute function ops_private.guard_rider_area();

create or replace function ops_private.audit_user_change()
returns trigger language plpgsql security definer set search_path = pg_catalog as $fn$
declare actor uuid := ops_private.request_actor();
  before_row jsonb := case when TG_OP='INSERT' then '{}'::jsonb else to_jsonb(old) end;
  after_row jsonb := case when TG_OP='DELETE' then '{}'::jsonb else to_jsonb(new) end;
  difference jsonb; email text; actor_name text;
  request_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
begin
  if actor is null then return null; end if;
  select p.email, p.full_name into email, actor_name from public.profiles p where p.id=actor;
  select coalesce(jsonb_object_agg(k, case
      when k ~* '(password|secret|token|credential|private_key|api_key|raw_data|content|body|payload|config|connection|settings|preferences|encrypted)'
        or jsonb_typeof(coalesce(after_row->k,before_row->k)) in ('object','array') then jsonb_build_object('redacted',true)
      else jsonb_build_object('before',before_row->k,'after',after_row->k) end),'{}'::jsonb)
    into difference from (select jsonb_object_keys(before_row || after_row) k) fields
    where before_row->k is distinct from after_row->k and k not in ('updated_at','created_at');
  if TG_OP='UPDATE' and difference='{}'::jsonb then return null; end if;
  insert into public.user_activity_logs(actor_id,actor_email,actor_name,event_type,entity_type,entity_id,path,summary,changes)
    values(actor,coalesce(email,''),actor_name,lower(TG_OP),TG_TABLE_NAME,
      coalesce(after_row->>'id',before_row->>'id',after_row->>'summary_id',before_row->>'summary_id'),
      request_headers->>'x-app-audit-path',
      case when TG_TABLE_NAME='activity_logs' then coalesce(after_row->>'message','Thao tác hệ thống') else
        TG_TABLE_NAME || ' · ' || TG_OP || coalesce(' · ' || coalesce(after_row->>'rider_code',before_row->>'rider_code'),'') end,difference);
  return null;
end $fn$;
revoke all on function ops_private.audit_user_change() from public, anon, authenticated;

do $install$
declare item record;
begin
  for item in select tablename from pg_tables where schemaname='public'
    and tablename <> 'user_activity_logs' loop
    execute format('drop trigger if exists audit_user_changes on public.%I',item.tablename);
    execute format('create trigger audit_user_changes after insert or update or delete on public.%I for each row execute function ops_private.audit_user_change()',item.tablename);
  end loop;
end $install$;

create or replace function public.user_activity_members()
returns table(id uuid,email text,full_name text,role text,last_seen_at timestamptz,last_path text)
language sql stable security invoker set search_path=pg_catalog as $fn$
  select p.id,p.email::text,p.full_name::text,p.role::text,last_event.created_at,last_event.path
  from public.profiles p left join lateral (
    select a.created_at,a.path from public.user_activity_logs a where a.actor_id=p.id
    order by a.created_at desc limit 1
  ) last_event on true order by last_event.created_at desc nulls last,p.email
$fn$;
revoke all on function public.user_activity_members() from public,anon,authenticated;
grant execute on function public.user_activity_members() to service_role;

-- Update trusted metadata and profile role in one transaction. The definer
-- lives in a private schema because service_role cannot update auth.users.
create or replace function ops_private.set_member_access(target_id uuid, target_role text, target_permissions jsonb, target_areas text[])
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare actor uuid := ops_private.request_actor(); prior public.profiles; stored jsonb; who public.profiles;
begin
  select * into who from public.profiles where id=actor;
  if who.id is null or who.role::text <> 'admin' then raise exception 'Chỉ admin được cấp quyền' using errcode='42501'; end if;
  select * into prior from public.profiles where id=target_id for update;
  select raw_app_meta_data into stored from auth.users where id=target_id for update;
  if prior.id is null or stored is null then raise exception 'Không tìm thấy tài khoản'; end if;
  if stored->>'super_admin'='true' then raise exception 'Không thể sửa Super Admin' using errcode='42501'; end if;
  if target_id=actor and target_role<>'admin' then raise exception 'Không thể tự hạ quyền admin' using errcode='42501'; end if;
  if target_role not in ('admin','leader','member','viewer') or jsonb_typeof(target_permissions)<>'object'
    or exists(select 1 from jsonb_each(target_permissions) where jsonb_typeof(value)<>'boolean')
    or target_areas is null or not target_areas <@ array['KV1','KV2','KV3','KV4','KV5']::text[] then
    raise exception 'Quyền hoặc KV không hợp lệ'; end if;
  update auth.users set raw_app_meta_data=stored || jsonb_build_object('permissions',target_permissions,'rider_edit_areas',to_jsonb(target_areas)) where id=target_id;
  update public.profiles set role=target_role,updated_at=now() where id=target_id;
  insert into public.user_activity_logs(actor_id,actor_email,actor_name,event_type,entity_type,entity_id,summary,changes)
    values(actor,who.email,who.full_name,'permission_change','profiles',target_id::text,'Cấp quyền '||prior.email,
      jsonb_build_object('before',jsonb_build_object('role',prior.role,'permissions',stored->'permissions','rider_edit_areas',stored->'rider_edit_areas'),
        'after',jsonb_build_object('role',target_role,'permissions',target_permissions,'rider_edit_areas',target_areas)));
  return jsonb_build_object('permissions',target_permissions,'rider_edit_areas',target_areas);
end $fn$;
revoke all on function ops_private.set_member_access(uuid,text,jsonb,text[]) from public,anon,authenticated;
grant usage on schema ops_private to service_role;
grant execute on function ops_private.set_member_access(uuid,text,jsonb,text[]) to service_role;
create or replace function public.admin_set_member_access(target_id uuid,target_role text,target_permissions jsonb,target_areas text[])
returns jsonb language sql security invoker set search_path=pg_catalog as $fn$
  select ops_private.set_member_access(target_id,target_role,target_permissions,target_areas)
$fn$;
revoke all on function public.admin_set_member_access(uuid,text,jsonb,text[]) from public,anon,authenticated;
grant execute on function public.admin_set_member_access(uuid,text,jsonb,text[]) to service_role;

create or replace function public.delete_rider_with_history(target_id uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $fn$
begin
  -- A no-op update locks the row and runs the same fresh area guard before
  -- unlinking history. Failure rolls back every change in this RPC.
  update public.riders set kv=kv where id=target_id;
  if not found then return false; end if;
  update public.attendance_logs set rider_id=null where rider_id=target_id;
  update public.rider_violations set rider_id=null where rider_id=target_id;
  delete from public.riders where id=target_id;
  return true;
end $fn$;
revoke all on function public.delete_rider_with_history(uuid) from public,anon,authenticated;
grant execute on function public.delete_rider_with_history(uuid) to service_role;
