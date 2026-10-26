import { z } from "zod";

export const performanceSortSchema = z.enum(["area", "rider", "delivery", "pickup", "deliveryRate", "pickupRate", "convertedPickup", "total"]);
export const performanceDirectionSchema = z.enum(["asc", "desc"]);
export const performanceKvSchema = z.enum(["all", "KV1", "KV2", "KV3", "KV4", "KV5"]);
export const performancePeriodSchema = z.enum(["day", "week", "month"]);

export type PerformanceSortKey = z.infer<typeof performanceSortSchema>;
export type PerformanceDirection = z.infer<typeof performanceDirectionSchema>;
export type PerformanceKvFilter = z.infer<typeof performanceKvSchema>;
export type PerformancePeriod = z.infer<typeof performancePeriodSchema>;

export type PerformanceFilters = {
  date: string;
  period: PerformancePeriod;
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

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

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

  return {
    date: parsedDate.success ? parsedDate.data : todayString(),
    period: performancePeriodSchema.catch("day").parse(getParam(params, "period")),
    q: (getParam(params, "q") ?? "").trim().slice(0, 80),
    kv: performanceKvSchema.catch("all").parse(getParam(params, "kv")),
    district: (getParam(params, "district") ?? "all").trim().slice(0, 80) || "all",
    ward: (getParam(params, "ward") ?? "all").trim().slice(0, 80) || "all",
    cot: (getParam(params, "cot") ?? "all").trim().slice(0, 40) || "all",
    sort: performanceSortSchema.catch("area").parse(getParam(params, "sort")),
    dir: performanceDirectionSchema.catch("asc").parse(getParam(params, "dir")),
    page: Math.max(1, Number.isFinite(rawPage) ? Math.trunc(rawPage) : 1),
    pageSize: Math.min(200, Math.max(25, Number.isFinite(rawPageSize) ? Math.trunc(rawPageSize) : 100)),
  };
}

