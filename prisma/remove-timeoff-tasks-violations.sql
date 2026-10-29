-- Explicit feature removal. Shared attendance, rider and AI memory data remain.
do $$
declare definition text;
begin
  drop function if exists public.execute_ai_off_reschedule(uuid,uuid) restrict;
  drop function if exists public.execute_ai_off_auto_schedule(uuid,uuid) restrict;
  select pg_get_functiondef(oid) into definition from pg_proc where oid=to_regprocedure('public.delete_rider_with_history(uuid)');
  if definition is not null and definition like '%rider_violations%' then
    definition:=regexp_replace(definition,'[[:space:]]*update public[.]rider_violations set rider_id=null where rider_id=target_id;','','g');
    if definition like '%rider_violations%' then raise exception 'Unexpected rider deletion function; review dependencies'; end if;
    execute definition;
  end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','ops_private') and p.prosrc ~ 'rider_off_requests|member_tasks|rider_violations|ai_pending_actions') then
    raise exception 'A database function still depends on the removed features';
  end if;
  drop table if exists public.rider_off_requests restrict;
  drop table if exists public.member_tasks restrict;
  drop table if exists public.rider_violations restrict;
  drop table if exists public.ai_pending_actions restrict;
  drop function if exists public.touch_rider_off_request_updated_at() restrict;
  drop function if exists public.set_rider_violations_updated_at() restrict;
  drop function if exists public.set_member_tasks_updated_at() restrict;
  if to_regclass('public.role_page_permissions') is not null then
    update public.role_page_permissions set pages=pages-'off_schedule'-'tasks'-'violations';
  end if;
end $$;
