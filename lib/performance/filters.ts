import { z } from "zod";

export const performanceSortSchema = z.enum(["area", "rider", "delivery", "pickup", "deliveryRate", "pickupRate", "convertedPickup", "total"]);
export const performanceDirectionSchema = z.enum(["asc", "desc"]);
export const performanceKvSchema = z.enum(["all", "KV1", "KV2", "KV3", "KV4", "KV5"]);
export const performancePeriodSchema = z.enum(["day", "week", "month", "range"]);

export type PerformanceSortKey = z.infer<typeof performanceSortSchema>;
export type PerformanceDirection = z.infer<typeof performanceDirectionSchema>;
export type PerformanceKvFilter = z.infer<typeof performanceKvSchema>;
export type PerformancePeriod = z.infer<typeof performancePeriodSchema>;

export type PerformanceFilters = {
  date: string;
  period: PerformancePeriod;
  start: string;
  end: string;
  q: string;
  kv: PerformanceKvFilter;
  district: string;
  ward: string;
  cot: string;
  sort: PerformanceSortKey;
  dir: PerformanceDirection;
  page: number;
  pageSize: number;
};

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value);

type SearchParamsLike = Record<string, string | string[] | undefined> | URLSearchParams;

function getParam(params: SearchParamsLike, key: string) {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export function todayString() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

export function parsePerformanceFilters(params: SearchParamsLike): PerformanceFilters {
  const parsedDate = dateSchema.safeParse(getParam(params, "date"));
  const rawPage = Number(getParam(params, "page") ?? 1);
  const rawPageSize = Number(getParam(params, "pageSize") ?? 100);
  const date=parsedDate.success?parsedDate.data:todayString();
  const period=performancePeriodSchema.catch("day").parse(getParam(params,"period"));
  let start=date,end=date;
  if(period==="week"){const day=new Date(`${date}T00:00:00Z`);day.setUTCDate(day.getUTCDate()-6);start=day.toISOString().slice(0,10);}
  if(period==="month")start=`${date.slice(0,7)}-01`;
  if(period==="range"){
    const from=dateSchema.safeParse(getParam(params,"start")),to=dateSchema.safeParse(getParam(params,"end"));
    if(!from.success||!to.success||from.data>to.data)throw new RangeError("Khoảng Từ ngày – Đến ngày không hợp lệ.");
    if((Date.parse(to.data)-Date.parse(from.data))/86400000>3660)throw new RangeError("Chọn khoảng tối đa 10 năm mỗi lần.");
    start=from.data;end=to.data;
  }

  return {
    date: period==="range"?end:date,
    period,start,end,
    q: (getParam(params, "q") ?? "").trim().slice(0, 80),
    kv: performanceKvSchema.catch("all").parse(getParam(params, "kv")),
    district: (getParam(params, "district") ?? "all").trim().slice(0, 80) || "all",
    ward: (getParam(params, "ward") ?? "all").trim().slice(0, 80) || "all",
    cot: (getParam(params, "cot") ?? "all").trim().slice(0, 40) || "all",
    sort: performanceSortSchema.catch("area").parse(getParam(params, "sort")),
    dir: performanceDirectionSchema.catch("asc").parse(getParam(params, "dir")),
    page: Math.min(100000, Math.max(1, Number.isFinite(rawPage) ? Math.trunc(rawPage) : 1)),
    pageSize: Math.min(200, Math.max(25, Number.isFinite(rawPageSize) ? Math.trunc(rawPageSize) : 100)),
  };
}

