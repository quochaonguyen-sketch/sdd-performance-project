-- Apply to the primary project.
create or replace function public.rider_schedule_archive_snapshot(p_month date, p_include_rows boolean default false)
returns jsonb
language sql stable security invoker set search_path = pg_catalog set statement_timeout = '10s'
as $$
  select jsonb_build_object(
    'version',md5(coalesce(string_agg(a.id::text||':'||a.xmin::text,',' order by a.id),'')),
    'captured_at',statement_timestamp(),
    'row_count',count(*),
    'rows',case when p_include_rows then coalesce(
      jsonb_agg(to_jsonb(a) order by a.updated_at desc,a.id) filter(where p_include_rows),'[]'::jsonb
    ) end
  )
  from public.attendance_logs a
  where p_month=date_trunc('month',p_month)::date
    and a.work_date>=p_month and a.work_date<(p_month+interval '1 month')::date and a.status<>'ON';
$$;

create or replace function public.rider_schedule_archive_months()
returns table(schedule_month date)
language sql stable security invoker set search_path = pg_catalog set statement_timeout = '10s'
as $$
  select distinct date_trunc('month',work_date)::date
  from public.attendance_logs where status<>'ON' and work_date is not null order by 1;
$$;

revoke all on function public.rider_schedule_archive_snapshot(date,boolean), public.rider_schedule_archive_months() from public,anon,authenticated;
grant execute on function public.rider_schedule_archive_snapshot(date,boolean), public.rider_schedule_archive_months() to service_role;
notify pgrst, 'reload schema';
