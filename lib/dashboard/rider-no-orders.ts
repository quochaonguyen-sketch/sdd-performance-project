import type { PrismaClient } from "@prisma/client";

export type RiderNoOrdersReport = {
  asOf: string | null;
  windowStart: string;
  rows: {
    riderCode: string;
    riderName: string;
    area: string;
    cot: string | null;
    days: number;
    since: string;
  }[];
};

export async function queryRiderNoOrders(
  db: Pick<PrismaClient, "$queryRaw">,
  start: string,
  yesterday: string,
  excludedRiderCodes: string[],
): Promise<RiderNoOrdersReport> {
  const [report] = await db.$queryRaw<RiderNoOrdersReport[]>`
    with roster as (
      select rider_code, coalesce(nullif(trim(full_name), ''), rider_code) as rider_name,
        upper(trim(kv)) as area, nullif(trim(cot), '') as cot
      from public.riders
      where status = 'active' and upper(trim(kv)) in ('KV1', 'KV2', 'KV3', 'KV4', 'KV5')
    ), daily as (
      select p.driver_id, p.report_date,
        bool_or(p.delivery_assigned > 0 or p.delivery_delivered > 0) as has_delivery,
        bool_or(p.pickup_assigned > 0 or p.pickup_picked > 0) as has_pickup,
        bool_and(coalesce(p.delivery_assigned = 0 and p.delivery_delivered = 0
          and p.pickup_assigned = 0 and p.pickup_picked = 0, false)) as zero_orders
      from public.driver_performance_daily p
      join roster r on r.rider_code = p.driver_id
      where p.report_date between ${start}::date and ${yesterday}::date
      group by p.driver_id, p.report_date
    ), covered_days as (
      -- Require both order sources to show activity before using zeroes on that date.
      select report_date from daily
      group by report_date
      having bool_or(has_delivery) and bool_or(has_pickup)
    ), cutoff as (
      select max(report_date) as day from covered_days
    ), zero_days as (
      select d.driver_id, d.report_date, c.day - d.report_date as days_ago,
        row_number() over (partition by d.driver_id order by d.report_date desc) - 1 as expected_days_ago
      from daily d
      join covered_days using (report_date)
      cross join cutoff c
      where d.zero_orders and not (${JSON.stringify(excludedRiderCodes)}::jsonb ? lower(trim(d.driver_id)))
    ), streaks as (
      select driver_id, count(*)::int as days, min(report_date) as since
      from zero_days
      -- A gap makes actual elapsed days greater than the zero-day index from here on.
      where days_ago = expected_days_ago
      group by driver_id
      having count(*) >= 2
    ), ranked as (
      select r.rider_code as "riderCode", r.rider_name as "riderName", r.area, r.cot,
        s.days, to_char(s.since, 'YYYY-MM-DD') as since
      from streaks s
      join roster r on r.rider_code = s.driver_id
      order by s.days desc, r.rider_code
      limit 10
    )
    select to_char(c.day, 'YYYY-MM-DD') as "asOf", ${start}::text as "windowStart",
      coalesce((select jsonb_agg(r order by r.days desc, r."riderCode") from ranked r), '[]'::jsonb) as rows
    from cutoff c
  `;
  return report;
}
