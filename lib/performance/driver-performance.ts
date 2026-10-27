import { cache } from "react";
import { Prisma } from "@prisma/client";
import { getPerformanceDatabase } from "./database";
import { TtlCache } from "@/lib/cache/ttl-cache";
import { buildPerformanceAnalysis, shiftPerformanceDate, type PerformanceAnalysis, type PerformanceAnalysisInput } from "@/lib/performance/analysis";

import type { PerformanceFilters,PerformanceDirection,PerformanceSortKey } from "./filters";
export {parsePerformanceFilters,todayString,performanceSortSchema,performanceDirectionSchema,performanceKvSchema,performancePeriodSchema} from "./filters";
export type {PerformanceFilters,PerformancePeriod,PerformanceDirection,PerformanceSortKey,PerformanceKvFilter} from "./filters";

export type PerformanceRow = {
  rider_id?: string | null;
  report_date: string;
  driver_id: string;
  driver_name: string | null;
  rider_name: string | null;
  kv: string | null;
  cot: string | null;
  pickup_district: string | null;
  delivery_district: string | null;
  delivery_ward: string | null;
  delivery_assigned: number;
  delivery_delivered: number;
  delivery_assigned_cot1: number;
  delivery_delivered_cot1: number;
  delivery_assigned_cot2: number;
  delivery_delivered_cot2: number;
  pickup_assigned: number;
  pickup_picked: number;
  pickup_assigned_cot1: number;
  pickup_picked_cot1: number;
  pickup_assigned_cot2: number;
  pickup_picked_cot2: number;
  delivery_rate: number | null;
  pickup_rate: number | null;
  cot_breakdown?: {
    delivery?: Record<string, { assigned: number; delivered: number }>;
    pickup?: Record<string, { assigned: number; picked: number }>;
  } | null;
};

export type PerformanceSummary = {
  groups: number;
  active_riders: number;
  delivery_assigned: number;
  delivery_delivered: number;
  pickup_assigned: number;
  pickup_picked: number;
};

export type PerformanceWardRow = {
  ward: string | null;
  district: string | null;
  delivery_assigned: number;
  delivery_delivered: number;
  on_hold: number;
  rate: number | null;
};

export type PerformanceResult = {
  filters: PerformanceFilters;
  rows: PerformanceRow[];
  summary: PerformanceSummary;
  wardOnHold: PerformanceWardRow[];
  analysis: PerformanceAnalysis;
  options: {
    districts: string[];
    cots: string[];
    wards: string[];
  };
};

function tryParseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function orderClause(sort: PerformanceSortKey, direction: PerformanceDirection) {
  const dir = direction === "asc" ? Prisma.sql`asc nulls last` : Prisma.sql`desc nulls last`;
  const areaAsc = Prisma.sql`
    final.kv asc nulls last,
    final.delivery_district asc nulls last,
    final.cot asc nulls last,
    coalesce(final.rider_name, final.driver_name, final.driver_id) asc nulls last
  `;
  const areaDesc = Prisma.sql`
    final.kv desc nulls last,
    final.delivery_district desc nulls last,
    final.cot desc nulls last,
    coalesce(final.rider_name, final.driver_name, final.driver_id) desc nulls last
  `;

  if (sort === "area") return direction === "asc" ? areaAsc : areaDesc;
  if (sort === "rider") return Prisma.sql`coalesce(final.rider_name, final.driver_name, final.driver_id) ${dir}, ${areaAsc}`;
  if (sort === "pickup") return Prisma.sql`final.pickup_picked ${dir}, ${areaAsc}`;
  if (sort === "convertedPickup") return Prisma.sql`ceil(final.pickup_picked::numeric / 3) ${dir}, ${areaAsc}`;
  if (sort === "total") return Prisma.sql`(final.delivery_delivered + ceil(final.pickup_picked::numeric / 3)) ${dir}, ${areaAsc}`;
  if (sort === "deliveryRate") return Prisma.sql`final.delivery_rate ${dir}, ${areaAsc}`;
  if (sort === "pickupRate") return Prisma.sql`final.pickup_rate ${dir}, ${areaAsc}`;
  return Prisma.sql`final.delivery_delivered ${dir}, ${areaAsc}`;
}

const resultsCache=new TtlCache<PerformanceResult>(10000,24);
type PerformanceMetadata={options:Array<{delivery_district:string|null;cot:string|null}>;wardOptions:Array<{delivery_ward:string|null}>;wardOnHoldRows:Array<{delivery_ward:string|null;delivery_district:string|null;delivery_assigned:number;delivery_delivered:number}>};
const metadataCache=new TtlCache<PerformanceMetadata>(30000,24);
const aggregatesCache=new TtlCache<PerformanceAnalysisInput[]>(10000,24);
export const getDriverPerformance=cache(async(filters:PerformanceFilters,revision=""):Promise<PerformanceResult>=>{
  return (await resultsCache.load(JSON.stringify([filters,revision]),()=>loadDriverPerformance(filters,revision))).value;
});
export function getDriverPerformanceExport(filters:PerformanceFilters,mode:"summary"|"daily"="summary"):Promise<PerformanceResult>{
  return loadDriverPerformance(filters,"",true,mode==="daily");
}
async function loadDriverPerformance(filters:PerformanceFilters,revision:string,allRows=false,dailyRows=false):Promise<PerformanceResult>{
  const prisma=await getPerformanceDatabase();
  const orderBy = orderClause(filters.sort, filters.dir);
  const offset = (filters.page - 1) * filters.pageSize;
  const { start, end } = filters;
  const reportDateSelect = filters.period === "day" || dailyRows
    ? Prisma.sql`p.report_date::date`
    : Prisma.sql`${end}::date`;
  const groupBy = filters.period === "day" || dailyRows
    ? Prisma.sql`p.report_date, p.driver_id`
    : Prisma.sql`p.driver_id`;
  const likeQuery = `%${filters.q}%`;
  const kvClause = filters.kv === "all" ? Prisma.empty : Prisma.sql`and upper(coalesce(kv, '')) = ${filters.kv}`;
  const districtClause = filters.district === "all" ? Prisma.empty : Prisma.sql`and delivery_district = ${filters.district}`;
  const wardClause = filters.ward === "all" ? Prisma.empty : Prisma.sql`and delivery_ward = ${filters.ward}`;
  const cotClause = filters.cot === "all"
    ? Prisma.empty
    : Prisma.sql`and lower(trim(coalesce(nullif(trim(r.cot), ''), nullif(trim(p.cot), '')))) = lower(trim(${filters.cot}))`;
  const searchClause = filters.q
    ? Prisma.sql`and (
        p.driver_id ilike ${likeQuery}
        or p.driver_name ilike ${likeQuery}
        or p.contract_type_name ilike ${likeQuery}
        or r.full_name ilike ${likeQuery}
        or r.kv ilike ${likeQuery}
        or coalesce(p.cot, r.cot) ilike ${likeQuery}
        or r.pickup_district ilike ${likeQuery}
        or r.delivery_district ilike ${likeQuery}
        or r.delivery_ward ilike ${likeQuery}
        or r.pickup_ward ilike ${likeQuery}
        or r.point_name ilike ${likeQuery}
        or r.route_name ilike ${likeQuery}
      )`
    : Prisma.empty;

  const rowsPromise = prisma.$queryRaw<
    Array<{
      report_date: Date;
      driver_id: string;
      rider_id: string | null;
      driver_name: string | null;
      rider_name: string | null;
      kv: string | null;
      cot: string | null;
      pickup_district: string | null;
      delivery_district: string | null;
      delivery_ward: string | null;
      delivery_assigned: bigint;
      delivery_delivered: bigint;
      delivery_assigned_cot1: bigint;
      delivery_delivered_cot1: bigint;
      delivery_assigned_cot2: bigint;
      delivery_delivered_cot2: bigint;
      pickup_assigned: bigint;
      pickup_picked: bigint;
      pickup_assigned_cot1: bigint;
      pickup_picked_cot1: bigint;
      pickup_assigned_cot2: bigint;
      pickup_picked_cot2: bigint;
      cot_breakdown_raw: string | null;
      delivery_rate: Prisma.Decimal | null;
      pickup_rate: Prisma.Decimal | null;
    }>
  >`
    with rider_scope as (
      select
        id,
        rider_code,
        full_name,
        kv,
        cot,
        pickup_district,
        delivery_district,
        delivery_ward,
        pickup_ward,
        point_name,
        (select z.name from public.zones z where z.id=riders.zone_id) as route_name
      from public.riders
      where upper(coalesce(kv, '')) in ('KV1', 'KV2', 'KV3', 'KV4', 'KV5')
        ${kvClause}
        ${districtClause}
        ${wardClause}
    ),
    grouped as (
      select
        ${reportDateSelect} as report_date,
        p.driver_id,
        max(r.id::text) as rider_id,
        max(p.driver_name) as driver_name,
        max(r.full_name) as rider_name,
        max(r.kv) as kv,
        max(coalesce(nullif(trim(r.cot), ''), nullif(trim(p.cot), ''))) as cot,
        max(r.pickup_district) as pickup_district,
        max(r.delivery_district) as delivery_district,
        max(r.delivery_ward) as delivery_ward,
        sum(coalesce(p.delivery_assigned, 0))::bigint as delivery_assigned,
        sum(coalesce(p.delivery_delivered, 0))::bigint as delivery_delivered,
        sum(coalesce(p.delivery_assigned_cot1, 0))::bigint as delivery_assigned_cot1,
        sum(coalesce(p.delivery_delivered_cot1, 0))::bigint as delivery_delivered_cot1,
        sum(coalesce(p.delivery_assigned_cot2, 0))::bigint as delivery_assigned_cot2,
        sum(coalesce(p.delivery_delivered_cot2, 0))::bigint as delivery_delivered_cot2,
        sum(coalesce(p.pickup_assigned, 0))::bigint as pickup_assigned,
        sum(coalesce(p.pickup_picked, 0))::bigint as pickup_picked,
        sum(coalesce(p.pickup_assigned_cot1, 0))::bigint as pickup_assigned_cot1,
        sum(coalesce(p.pickup_picked_cot1, 0))::bigint as pickup_picked_cot1,
        sum(coalesce(p.pickup_assigned_cot2, 0))::bigint as pickup_assigned_cot2,
        sum(coalesce(p.pickup_picked_cot2, 0))::bigint as pickup_picked_cot2,
        null::text as cot_breakdown_raw
      from public.driver_performance_daily p
      join rider_scope r on r.rider_code = p.driver_id
      where p.report_date between ${start}::date and ${end}::date
        ${cotClause}
        ${searchClause}
      group by ${groupBy}
    ),
    final as (
      select
        *,
        case when delivery_assigned > 0 then delivery_delivered::numeric / delivery_assigned * 100 end as delivery_rate,
        case when pickup_assigned > 0 then pickup_picked::numeric / pickup_assigned * 100 end as pickup_rate
      from grouped
    )
    select final.*
    from final
    order by ${dailyRows?Prisma.sql`final.report_date asc,`:Prisma.empty} ${orderBy}, final.delivery_delivered desc, final.pickup_picked desc, final.driver_id asc
    ${allRows?Prisma.empty:Prisma.sql`limit ${filters.pageSize} offset ${offset}`}
  `;

  const metadataPromise=metadataCache.load(JSON.stringify([revision,start,end,filters.kv,filters.district]),()=>prisma.$queryRaw<PerformanceMetadata[]>`
    with rider_scope as (
      select rider_code,cot,delivery_district,delivery_ward from public.riders
      where upper(coalesce(kv,'')) in ('KV1','KV2','KV3','KV4','KV5') ${kvClause}
    ), scoped as (
      select p.delivery_assigned,p.delivery_delivered,r.delivery_district,r.delivery_ward,
        nullif(trim(coalesce(nullif(trim(r.cot),''),nullif(trim(p.cot),''))),'') as cot
      from public.driver_performance_daily p join rider_scope r on r.rider_code=p.driver_id
      where p.report_date between ${start}::date and ${end}::date
    ), eligible as (select * from scoped where true ${districtClause})
    select
      coalesce((select jsonb_agg(to_jsonb(o)) from (
        select distinct nullif(trim(delivery_district),'') as delivery_district,cot from scoped
        order by delivery_district nulls last,cot nulls last
      ) o),'[]'::jsonb) as options,
      coalesce((select jsonb_agg(to_jsonb(w)) from (
        select distinct nullif(trim(delivery_ward),'') as delivery_ward from eligible order by delivery_ward nulls last
      ) w),'[]'::jsonb) as "wardOptions",
      coalesce((select jsonb_agg(to_jsonb(h)) from (
        select max(delivery_ward) as delivery_ward,max(delivery_district) as delivery_district,
          sum(coalesce(delivery_assigned,0)) as delivery_assigned,sum(coalesce(delivery_delivered,0)) as delivery_delivered
        from eligible group by delivery_ward,delivery_district
      ) h),'[]'::jsonb) as "wardOnHoldRows"
  `.then(([metadata])=>metadata??{options:[],wardOptions:[],wardOnHoldRows:[]})).then(entry=>entry.value);

  // Charts aggregate the full filtered scope, independently of table pagination.
  // Daily mode adds six preceding dates for context; week/month use the selected range.
  const trendStart = filters.period === "day" ? shiftPerformanceDate(end, -6) : start;
  // Pagination and sorting do not change chart totals; refresh revisions bypass this cache.
  const aggregatesPromise = aggregatesCache.load(JSON.stringify([revision,start,end,trendStart,filters.kv,filters.district,filters.ward,filters.cot,filters.q]),()=>prisma.$queryRaw<PerformanceAnalysisInput[]>`
    with rider_scope as (
      select rider_code,full_name,kv,cot,pickup_district,delivery_district,delivery_ward,pickup_ward,point_name,(select z.name from public.zones z where z.id=riders.zone_id) as route_name
      from public.riders where upper(coalesce(kv,'')) in ('KV1','KV2','KV3','KV4','KV5')
      ${kvClause} ${districtClause} ${wardClause}
    ), scoped as (
      select p.report_date,p.driver_id,p.delivery_assigned,p.delivery_delivered,p.pickup_assigned,p.pickup_picked,upper(r.kv) as analytics_area,lower(replace(coalesce(nullif(trim(r.cot),''),nullif(trim(p.cot),''),''),' ','')) as analytics_cot from public.driver_performance_daily p
      join rider_scope r on r.rider_code=p.driver_id
      where p.report_date between ${trendStart}::date and ${end}::date ${cotClause} ${searchClause}
    ), selected as (select * from scoped where report_date between ${start}::date and ${end}::date),
    daily as (
      select to_char(report_date,'YYYY-MM-DD') as date,count(distinct driver_id)::integer as riders,
        sum(coalesce(delivery_assigned,0)) as delivery_assigned,sum(coalesce(delivery_delivered,0)) as delivery_delivered,
        sum(coalesce(pickup_assigned,0)) as pickup_assigned,sum(coalesce(pickup_picked,0)) as pickup_picked
      from scoped group by report_date order by report_date
    ), areas as (
      select analytics_area as kv,sum(coalesce(delivery_assigned,0)) as delivery_assigned,sum(coalesce(delivery_delivered,0)) as delivery_delivered,
        sum(coalesce(pickup_assigned,0)) as pickup_assigned,sum(coalesce(pickup_picked,0)) as pickup_picked,
        sum(case when analytics_cot in ('cot1','cot1.1','cot1.2') then coalesce(delivery_assigned,0) else 0 end) as delivery_assigned_cot1,sum(case when analytics_cot in ('cot1','cot1.1','cot1.2') then coalesce(delivery_delivered,0) else 0 end) as delivery_delivered_cot1,
        sum(case when analytics_cot='cot2' then coalesce(delivery_assigned,0) else 0 end) as delivery_assigned_cot2,sum(case when analytics_cot='cot2' then coalesce(delivery_delivered,0) else 0 end) as delivery_delivered_cot2,
        sum(case when analytics_cot in ('cot1','cot1.1','cot1.2') then coalesce(pickup_assigned,0) else 0 end) as pickup_assigned_cot1,sum(case when analytics_cot in ('cot1','cot1.1','cot1.2') then coalesce(pickup_picked,0) else 0 end) as pickup_picked_cot1,
        sum(case when analytics_cot='cot2' then coalesce(pickup_assigned,0) else 0 end) as pickup_assigned_cot2,sum(case when analytics_cot='cot2' then coalesce(pickup_picked,0) else 0 end) as pickup_picked_cot2
      from selected group by analytics_area order by analytics_area
    ), rider_totals as (
      select driver_id,sum(coalesce(delivery_assigned,0)) as delivery_assigned,sum(coalesce(delivery_delivered,0)) as delivery_delivered,
        sum(coalesce(pickup_assigned,0)) as pickup_assigned,sum(coalesce(pickup_picked,0)) as pickup_picked
      from selected group by driver_id
    ) select (select jsonb_agg(to_jsonb(daily)) from daily) as daily,
      (select jsonb_agg(to_jsonb(areas)) from areas) as areas,
      (select jsonb_agg(to_jsonb(rider_totals)-'driver_id') from rider_totals) as riders
  `).then(entry=>entry.value);
  const [rows,metadata,aggregateRows]=await Promise.all([rowsPromise,metadataPromise,aggregatesPromise]);
  const {options,wardOptions,wardOnHoldRows}=metadata;
  const [aggregates]=aggregateRows;
  const analysis = buildPerformanceAnalysis(aggregates ?? { daily: [], areas: [], riders: [] }, trendStart, end);
  const lastPage=Math.max(1,Math.ceil(analysis.riderCount/filters.pageSize));
  if(!allRows&&filters.page>lastPage){
    if(analysis.riderCount>0)return loadDriverPerformance({...filters,page:lastPage},revision);
    filters={...filters,page:1};
  }
  return {
    filters,
    rows: rows.map((row) => ({
      report_date: row.report_date.toISOString().slice(0, 10),
      driver_id: row.driver_id,
      rider_id: row.rider_id,
      driver_name: row.driver_name,
      rider_name: row.rider_name,
      kv: row.kv,
      cot: row.cot,
      pickup_district: row.pickup_district,
      delivery_district: row.delivery_district,
      delivery_ward: row.delivery_ward,
      delivery_assigned: Number(row.delivery_assigned),
      delivery_delivered: Number(row.delivery_delivered),
      delivery_assigned_cot1: Number(row.delivery_assigned_cot1 ?? 0),
      delivery_delivered_cot1: Number(row.delivery_delivered_cot1 ?? 0),
      delivery_assigned_cot2: Number(row.delivery_assigned_cot2 ?? 0),
      delivery_delivered_cot2: Number(row.delivery_delivered_cot2 ?? 0),
      pickup_assigned: Number(row.pickup_assigned),
      pickup_picked: Number(row.pickup_picked),
      pickup_assigned_cot1: Number(row.pickup_assigned_cot1 ?? 0),
      pickup_picked_cot1: Number(row.pickup_picked_cot1 ?? 0),
      pickup_assigned_cot2: Number(row.pickup_assigned_cot2 ?? 0),
      pickup_picked_cot2: Number(row.pickup_picked_cot2 ?? 0),
      cot_breakdown: tryParseJson(row.cot_breakdown_raw),
      delivery_rate: decimalToNumber(row.delivery_rate),
      pickup_rate: decimalToNumber(row.pickup_rate),
    })),
    summary: { groups: analysis.riderCount, active_riders: analysis.riderCount, ...analysis.totals },
    analysis,
    wardOnHold: wardOnHoldRows
      .map((row) => {
        const assigned = Number(row.delivery_assigned);
        const delivered = Number(row.delivery_delivered);
        const onHold = Math.max(0, assigned - delivered);
        return {
          ward: row.delivery_ward?.trim() || null,
          district: row.delivery_district?.trim() || null,
          delivery_assigned: assigned,
          delivery_delivered: delivered,
          on_hold: onHold,
          rate: assigned > 0 ? (onHold / assigned) * 100 : null,
        };
      })
      .filter((row) => row.delivery_assigned > 0)
      .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.on_hold - a.on_hold),
    options: {
      districts: Array.from(new Set(options.map((option) => option.delivery_district).filter(Boolean) as string[])).sort((a, b) =>
        a.localeCompare(b, "vi"),
      ),
      cots: Array.from(new Set(options.map((option) => option.cot).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "vi")),
      wards: Array.from(new Set(wardOptions.map((option) => option.delivery_ward).filter(Boolean) as string[])).sort((a, b) =>
        a.localeCompare(b, "vi"),
      ),
    },
  };
}

function decimalToNumber(value: Prisma.Decimal | null | undefined) {
  if (value === null || value === undefined) return null;
  return Number(value);
}
