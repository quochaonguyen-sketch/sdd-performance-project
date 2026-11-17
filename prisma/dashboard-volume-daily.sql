begin;

create or replace function public.dashboard_volume_daily(p_today date)
returns table (source text, report_date date, area text, total_orders bigint)
language sql stable security invoker set search_path = pg_catalog
as $$
  with scope as (select array['KV1', 'KV2', 'KV3', 'KV4', 'KV5'] as areas)
  select 'delivery', d.report_date, d.area, sum(coalesce(d.total_orders, 1))
  from public.delivery_order d cross join scope s
  where d.area = any(s.areas)
    and d.report_date between least(p_today - 13, (
      select newest.report_date from public.delivery_order newest
      where newest.area = any(s.areas) and newest.report_date <= p_today
      order by newest.report_date desc limit 1
    )) and p_today
    and coalesce(d.total_orders, 1) >= 0
  group by d.report_date, d.area
  union all
  select 'pickup', p.report_date, p.area, sum(coalesce(p.total_orders, 1))
  from public.pickup_volume p cross join scope s
  where p.area = any(s.areas)
    and p.report_date between least(p_today - 13, (
      select newest.report_date from public.pickup_volume newest
      where newest.area = any(s.areas) and newest.report_date <= p_today
      order by newest.report_date desc limit 1
    )) and p_today
    and coalesce(p.total_orders, 1) >= 0
  group by p.report_date, p.area;
$$;

revoke all on function public.dashboard_volume_daily(date) from public, anon;
grant execute on function public.dashboard_volume_daily(date) to authenticated;
notify pgrst, 'reload schema';

commit;
