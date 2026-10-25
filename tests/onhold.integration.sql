do $$
begin
  if has_table_privilege('anon','public.onhold_daily_pivot','SELECT') or has_table_privilege('authenticated','public.onhold_daily_reports','SELECT')
    or has_function_privilege('authenticated','public.read_onhold_pivot(date,date)','EXECUTE') then raise exception 'OH privacy grants'; end if;
  if exists(select 1 from information_schema.columns where table_name in ('onhold_daily_pivot','onhold_daily_reports','onhold_daily_seen') and column_name ~ '(shipment|tracking|raw|payload)') then raise exception 'Raw columns'; end if;
  begin
    perform public.publish_central_onhold(gen_random_uuid(),'old-worker','[]',0,0,true);
    raise exception 'Old snapshot worker allowed';
  exception when others then if sqlerrm='Old snapshot worker allowed' then raise; end if; end;
end $$;
