-- Executed in a transaction that is always rolled back.
do $test$
declare actor uuid := gen_random_uuid(); admin_actor uuid; blocked boolean;
  key text := 'test-' || gen_random_uuid(); logs integer; payload jsonb;
begin
  select id into admin_actor from public.profiles where role='admin' limit 1;
  if admin_actor is null then raise exception 'No admin fixture available'; end if;
  insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
    values(actor,'team-test-'||actor||'@spxexpress.com','{}','{}');
  insert into public.profiles(id,email,full_name,role) values(actor,'team-test-'||actor||'@spxexpress.com','Team test','member');
  insert into public.team_staff(id,full_name,role) values(key,'Before','FTE');
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.headers',jsonb_build_object('x-app-actor-id',actor)::text,true);
  blocked := false;
  begin update public.team_staff set full_name='Forbidden' where id=key;
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Member edited staff'; end if;
  blocked := false;
  begin insert into public.team_staff_shifts(staff_id,work_date,shift) values(key,'2026-10-24','OFF');
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Member edited schedule'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
  perform set_config('request.headers',jsonb_build_object('x-app-actor-id',admin_actor)::text,true);
  blocked := false;
  begin update public.team_staff set full_name='Spoof' where id=key;
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Spoofed actor changed staff'; end if;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.headers',jsonb_build_object('x-app-actor-id',admin_actor)::text,true);
  update public.team_staff set full_name='After' where id=key;
  insert into public.team_staff_shifts(staff_id,work_date,shift) values(key,'2026-10-24','OFF');
  update public.team_staff_shifts set shift='11:00-20:00' where staff_id=key;
  if not exists(select 1 from public.user_activity_logs where entity_id=key and actor_id=admin_actor
    and changes->'full_name'->>'before'='Before' and changes->'full_name'->>'after'='After') then raise exception 'Staff edit audit missing'; end if;
  if not exists(select 1 from public.user_activity_logs where actor_id=admin_actor and entity_type='team_staff_shifts'
    and changes->'shift'->>'before'='OFF' and changes->'shift'->>'after'='11:00-20:00') then raise exception 'Shift edit audit missing'; end if;
  -- Re-importing identical data must not produce updates or duplicate people/shifts.
  select jsonb_build_object('staff',jsonb_build_array(to_jsonb(s)), 'shifts',jsonb_build_array(jsonb_build_object('staff_id',key,'work_date','2026-10-24','shift','11:00-20:00')))
    into payload from public.team_staff s where s.id=key;
  perform public.import_team_roster(payload,'test.csv');
  select count(*) into logs from public.user_activity_logs where actor_id=admin_actor;
  perform public.import_team_roster(payload,'test.csv');
  if (select count(*) from public.user_activity_logs where actor_id=admin_actor) <> logs then raise exception 'Identical import created spurious updates'; end if;
  if (select count(*) from public.team_staff_shifts where staff_id=key) <> 1 then raise exception 'Duplicate shifts'; end if;
  -- FK failure rolls back a partially imported person inside the RPC.
  payload := jsonb_set(payload,'{staff,0,id}',to_jsonb(key||'-bad'));
  payload := jsonb_set(payload,'{shifts,0,staff_id}',to_jsonb(key||'-nonexistent'));
  blocked := false;
  begin perform public.import_team_roster(payload,'test.csv');
  exception when foreign_key_violation then blocked:=true; end;
  if not blocked or exists(select 1 from public.team_staff where id=key||'-bad') then raise exception 'Import was not atomic'; end if;
  if has_table_privilege('authenticated','public.team_staff','SELECT')
     or has_table_privilege('anon','public.team_staff_shifts','SELECT')
     or has_function_privilege('authenticated','public.import_team_roster(jsonb,text)','EXECUTE') then raise exception 'Browser bypasses team API'; end if;
end $test$;
