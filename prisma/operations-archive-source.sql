-- Apply only to the primary project. Return small, server-only version records.
begin;

create or replace function public.read_operations_archive_versions(p_kind text, p_from date, p_to date)
returns table(report_date date, version text)
language plpgsql stable security invoker set search_path=pg_catalog set statement_timeout='5s' as $$
declare
  v_to date := least(p_to, (now() at time zone 'Asia/Ho_Chi_Minh')::date - 1);
  v_source text;
begin
  if p_from is null or p_to is null or p_to - p_from not between 0 and 92 then
    raise exception 'Invalid archive date range';
  end if;
  case p_kind
    when 'return' then
      return query select d.report_date, jsonb_build_array(d.snapshot_id,d.captured_at,d.capture_count)::text
        from public.return_daily_history d where d.report_date between p_from and v_to;
    when 'pickup_cot' then
      return query select s.report_date, jsonb_agg(jsonb_build_array(s.cot,s.snapshot_id,s.snapshot_at) order by s.cot)::text
        from public.pickup_cot_oh_snapshots s where s.report_date between p_from and v_to group by s.report_date;
    when 'wh' then
      return query select s.report_date, jsonb_build_array(s.job_id,s.snapshot_at)::text
        from public.wh_tracking_snapshots s where s.station_id='4232' and s.report_date between p_from and v_to;
    when 'backlog_pickup', 'backlog_delivery' then
      v_source := substring(p_kind from 9);
      return query
        with snaps as (
          select s.work_date as day, count(*) as n, max(s.captured_at) as captured, max(s.source_snapshot_at) as latest
          from public.backlog_snapshots s where s.source=v_source and s.work_date between p_from and v_to group by s.work_date
        ), checks as (
          select (c.scheduled_for at time zone 'Asia/Ho_Chi_Minh')::date as day, count(*) as n, max(c.updated_at) as updated
          from public.backlog_checkpoints c where c.source=v_source
            and c.scheduled_for >= (p_from::timestamp at time zone 'Asia/Ho_Chi_Minh')
            and c.scheduled_for < ((v_to+1)::timestamp at time zone 'Asia/Ho_Chi_Minh') group by 1
        )
        select coalesce(s.day,c.day), jsonb_build_array(s.n,s.captured,s.latest,c.n,c.updated)::text
        from snaps s full join checks c on c.day=s.day;
    else
      raise exception 'Invalid archive kind';
  end case;
end $$;

revoke all on function public.read_operations_archive_versions(text,date,date) from public,anon,authenticated;
grant execute on function public.read_operations_archive_versions(text,date,date) to service_role;
notify pgrst, 'reload schema';
commit;
