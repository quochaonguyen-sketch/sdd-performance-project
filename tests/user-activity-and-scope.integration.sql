-- Run only inside a transaction that is rolled back by admin-audit-db.cjs --test.
do $assertions$
declare actor uuid := gen_random_uuid(); one uuid := gen_random_uuid(); two uuid := gen_random_uuid(); admin_id uuid;
  blocked boolean; before_count integer; after_count integer;
begin
  insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
    values(actor,'audit-scope-'||actor||'@spxexpress.com',
      '{"permissions":{"manage_riders":true},"rider_edit_areas":["KV1"]}', '{}');
  insert into public.profiles(id,email,full_name,role) values(actor,'audit-scope-'||actor||'@spxexpress.com','Scope test','member');
  insert into public.riders(id,rider_code,name,full_name,kv,status) values
    (one,'audit-'||one,'Before','Before','KV1','active'),(two,'audit-'||two,'Other','Other','KV2','active');
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.headers',jsonb_build_object('x-app-actor-id',actor::text,'x-app-audit-path','/riders')::text,true);
  update public.riders set full_name='After' where id=one;
  if not exists(select 1 from public.user_activity_logs where actor_id=actor and entity_id=one::text
      and event_type='update' and changes->'full_name'->>'before'='Before' and changes->'full_name'->>'after'='After') then
    raise exception 'Audit actor/before/after missing'; end if;
  select count(*) into before_count from public.user_activity_logs where actor_id=actor;
  blocked := false;
  begin update public.riders set full_name='Forbidden' where id=two;
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Cross-area UPDATE was allowed'; end if;
  blocked := false;
  begin update public.riders set kv='KV2' where id=one;
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Cross-area transfer was allowed'; end if;
  blocked := false;
  begin delete from public.riders where id=two;
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Cross-area DELETE was allowed'; end if;
  blocked := false;
  begin insert into public.riders(rider_code,name,kv) values('forbidden-'||actor,'Forbidden','KV2');
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Cross-area INSERT was allowed'; end if;
  select count(*) into after_count from public.user_activity_logs where actor_id=actor;
  if after_count<>before_count then raise exception 'Rejected writes produced successful change events'; end if;
  update public.riders set raw_data='{"password":"hidden-test-value"}' where id=one;
  if exists(select 1 from public.user_activity_logs where actor_id=actor and changes::text like '%hidden-test-value%') then
    raise exception 'Sensitive JSON leaked to audit'; end if;
  -- Fresh metadata must revoke access without issuing another JWT.
  update auth.users set raw_app_meta_data='{"permissions":{"manage_riders":true},"rider_edit_areas":[]}' where id=actor;
  blocked := false;
  begin update public.riders set full_name='Revoked' where id=one;
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Scope revocation did not apply immediately'; end if;
  select id into admin_id from public.profiles where role::text='admin' limit 1;
  if admin_id is null then raise exception 'Admin fixture unavailable'; end if;
  perform set_config('request.headers',jsonb_build_object('x-app-actor-id',admin_id::text)::text,true);
  update public.riders set full_name='Admin edit' where id=two;
  -- Authenticated callers cannot impersonate a privileged actor via custom headers.
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor::text)::text,true);
  blocked := false;
  begin update public.riders set full_name='Spoofed' where id=two;
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Actor header spoofing was allowed'; end if;
  blocked := false;
  begin perform public.admin_set_member_access(actor,'admin','{}'::jsonb,array['KV1']);
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Member escalated their own role'; end if;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.headers',jsonb_build_object('x-app-actor-id',admin_id::text)::text,true);
  perform public.admin_set_member_access(actor,'member','{"manage_riders":true}'::jsonb,array['KV1']);
  if not exists(select 1 from auth.users where id=actor and raw_app_meta_data->'rider_edit_areas'='["KV1"]'::jsonb)
    or not exists(select 1 from public.user_activity_logs where entity_id=actor::text and event_type='permission_change' and actor_id=admin_id) then
      raise exception 'Atomic access update or permission audit missing'; end if;
  perform set_config('request.headers',jsonb_build_object('x-app-actor-id',actor::text)::text,true);
  blocked := false;
  begin perform public.delete_rider_with_history(two);
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked or not exists(select 1 from public.riders where id=two) then raise exception 'Scoped delete RPC bypassed guard'; end if;
  blocked := public.delete_rider_with_history(one);
  if not blocked or exists(select 1 from public.riders where id=one) then raise exception 'Scoped delete RPC failed for allowed rider'; end if;
  if has_table_privilege('authenticated','public.user_activity_logs','SELECT')
    or has_table_privilege('authenticated','public.user_activity_logs','INSERT')
    or has_table_privilege('authenticated','public.user_activity_logs','UPDATE')
    or has_table_privilege('authenticated','public.user_activity_logs','DELETE') then
      raise exception 'Authenticated user can read/forge/erase activity logs'; end if;
  if has_table_privilege('service_role','public.user_activity_logs','UPDATE') or has_table_privilege('service_role','public.user_activity_logs','DELETE') then
    raise exception 'Service API can rewrite activity history'; end if;
end $assertions$;
