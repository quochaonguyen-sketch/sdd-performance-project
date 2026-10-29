import { OPERATING_AREAS, normalizeOperatingArea } from "../locations/operating-areas.ts";
import { summarizeDeliveryProgress } from "./delivery-progress.ts";

export type RealtimeRider = { id: string; driver_id: string; driver_name: string | null; total_assigned: number; delivered: number; delivering: number; failed: number; zone_id: string | null; first_delivery_at: string | null; idle_delivery_seconds: number; snapshot_id: string; snapshot_at: string };
export type RiderProfile = { rider_code: string; full_name: string | null; kv: string | null; delivery_district: string | null; delivery_ward: string | null; cot: string | null };
export type RiderStatus = "delivering" | "completed" | "warning";
export type DisplayRider = RealtimeRider & { name: string; kv: string; district: string; ward: string; cot: string; status: RiderStatus; progress: number };
export type DistrictDetail = {
  key: string;
  name: string;
  kv: string;
  area: string;
  riders: DisplayRider[];
  totalAssigned: number;
  delivered: number;
  delivering: number;
  failed: number;
  warning: number;
  completed: number;
  rate: number;
  avgProgress: number;
};

export const UNKNOWN_DELIVERY = "Không rõ";
const normalizeId = (value: string) => value.trim().toLowerCase();
export function enrichDeliveryRiders(rows: RealtimeRider[], profiles: RiderProfile[]): DisplayRider[] {
  const profileMap = new Map(profiles.map(profile => [normalizeId(profile.rider_code), profile]));
  return rows.map(row => {
    const profile = profileMap.get(normalizeId(row.driver_id));
    const rawKv = profile?.kv?.trim();
    const extraKv = rawKv?.toUpperCase().match(/^KV\s*(\d+)$/);
    const kv = normalizeOperatingArea(rawKv) ?? (extraKv ? `KV${Number(extraKv[1])}` : UNKNOWN_DELIVERY);
    const failureRate = row.total_assigned > 0 ? row.failed / row.total_assigned : 0;
    const status: RiderStatus = (row.total_assigned > 0 && row.delivered === 0) || (row.delivering > 0 && row.idle_delivery_seconds > 3600) || failureRate >= 0.2 ? "warning" : row.delivering > 0 ? "delivering" : "completed";
    return {...row, name:profile?.full_name?.trim() || row.driver_name?.trim() || UNKNOWN_DELIVERY,
      kv, district:profile?.delivery_district?.trim() || UNKNOWN_DELIVERY,
      ward:profile?.delivery_ward?.trim() || UNKNOWN_DELIVERY, cot:profile?.cot?.trim() || UNKNOWN_DELIVERY,
      status, progress:row.total_assigned ? Math.round(row.delivered/row.total_assigned*100) : 0};
  });
}

export function deliveryKvOrder(values: string[]) {
  return [...new Set([...OPERATING_AREAS, ...values.filter(kv=>kv!==UNKNOWN_DELIVERY).sort((a,b)=>a.localeCompare(b,"vi",{numeric:true})), ...(values.includes(UNKNOWN_DELIVERY)?[UNKNOWN_DELIVERY]:[])])];
}

export function buildDistrictDetails(riders: DisplayRider[]): DistrictDetail[] {
  const groups = new Map<string, DisplayRider[]>();
  for (const rider of riders) {
    const key = JSON.stringify([rider.kv,rider.district]);
    const group = groups.get(key) ?? [];
    group.push(rider); groups.set(key,group);
  }
  return [...groups].map(([key,entries]) => {
    const {kv,district:name} = entries[0];
    return {key,name,kv,area:kv===UNKNOWN_DELIVERY?UNKNOWN_DELIVERY:`Khu vực ${kv.slice(2)}`,
      riders:entries,...summarizeDeliveryProgress(entries),
      delivering:entries.reduce((n,r)=>n+r.delivering,0),failed:entries.reduce((n,r)=>n+r.failed,0),
      warning:entries.filter(r=>r.status==="warning").length,completed:entries.filter(r=>r.status==="completed").length};
  }).sort((a,b)=>b.totalAssigned-a.totalAssigned || a.name.localeCompare(b.name,"vi"));
}

export function buildKvAggregates(details: DistrictDetail[]): {kvs:Array<{kv:string;detail:DistrictDetail|null}>} {
  return {kvs:deliveryKvOrder(details.map(d=>d.kv)).map(kv=>{
    const list=details.filter(d=>d.kv===kv),riders=list.flatMap(d=>d.riders);
    return {kv,detail:list.length ? {key:kv,name:kv,kv,area:kv===UNKNOWN_DELIVERY?UNKNOWN_DELIVERY:`Khu vực ${kv.slice(2)}`,
      riders,...summarizeDeliveryProgress(riders),delivering:riders.reduce((n,r)=>n+r.delivering,0),failed:riders.reduce((n,r)=>n+r.failed,0),
      warning:riders.filter(r=>r.status==="warning").length,completed:riders.filter(r=>r.status==="completed").length} : null};
  })};
}
