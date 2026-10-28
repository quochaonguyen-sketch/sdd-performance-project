do $$
begin
 if not (select relrowsecurity from pg_class where oid='public.role_page_permissions'::regclass) then raise exception 'Missing RLS'; end if;
 if has_table_privilege('anon','public.role_page_permissions','SELECT')
 or has_table_privilege('authenticated','public.role_page_permissions','UPDATE')
 or has_table_privilege('authenticated','public.role_page_permissions','SELECT') then raise exception 'Public role policy access'; end if;
 if not has_table_privilege('service_role','public.role_page_permissions','UPDATE') then raise exception 'Missing service role access'; end if;
 update public.role_page_permissions set pages='{"team":false,"pickup_management":false}' where role='member';
 if not exists(select 1 from public.role_page_permissions where role='member' and pages->>'team'='false') then raise exception 'Role setting not saved'; end if;
 begin
  insert into public.role_page_permissions(role,pages) values('admin','{}');
  raise exception 'TEST: admin policy accepted';
 exception when check_violation then null; end;
 begin
  update public.role_page_permissions set pages='[]' where role='leader';
  raise exception 'TEST: malformed policy accepted';
 exception when check_violation then null; end;
end $$;
