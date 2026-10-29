import { OPERATING_AREAS, normalizeOperatingArea } from "../locations/operating-areas.ts";

export type LiveDeliveryRow = { driver_id: string; total_assigned: number; delivered: number; delivering: number; failed: number; idle_delivery_seconds: number };
export type DeliveryBacklogRow = { shipment_id: string; area: string; district: string; ward: string; cot_group: string; received_time: string | null };
export type LiveDeliverySummary = ReturnType<typeof summarizeLiveDelivery>;
export type DeliveryBacklogSummary = ReturnType<typeof summarizeDeliveryBacklog>;
export type OperationsOverview = {
  live: { data: LiveDeliverySummary | null; snapshotAt: string | null; workDate: string | null; error: string | null };
  backlog: { data: DeliveryBacklogSummary | null; snapshotAt: string | null; error: string | null };
};
const num = (n: number) => Number.isFinite(Number(n)) ? Math.max(0, Number(n)) : 0;
export const completionRate = (done: number, assigned: number) => assigned > 0 ? done / assigned * 100 : null;

export function summarizeLiveDelivery(rows: LiveDeliveryRow[], profiles: { rider_code: string; kv: string | null; cot?: string | null }[]) {
  const areas = new Map(profiles.map(p => [p.rider_code, normalizeOperatingArea(p.kv)]));
  const scoped = rows.filter(r => areas.get(r.driver_id));
  const sum = (items: LiveDeliveryRow[]) => items.reduce((a, r) => ({
    assigned: a.assigned + num(r.total_assigned), delivered: a.delivered + num(r.delivered),
    delivering: a.delivering + num(r.delivering), failed: a.failed + num(r.failed),
  }), { assigned: 0, delivered: 0, delivering: 0, failed: 0 });
  const assignedIds = new Set(scoped.filter(r => num(r.total_assigned) > 0).map(r => r.driver_id));
  const roster = [...new Map(profiles.filter(p => assignedIds.has(p.rider_code) && normalizeOperatingArea(p.kv)).map(p => [p.rider_code, p])).values()];
  const cot = (p: typeof roster[number]) => p.cot?.replace(/\s/g, "").toUpperCase();
  return { ...sum(scoped), outboundAssigned: sum(rows).assigned, riders: scoped.length,
    headcount: { total: roster.length, cot1: roster.filter(p=>cot(p)==="COT1").length, cot2: roster.filter(p=>cot(p)==="COT2").length, unknownCot: roster.filter(p=>!["COT1","COT2"].includes(cot(p)??"")).length, areas: OPERATING_AREAS.map(area=>({area,total:roster.filter(p=>normalizeOperatingArea(p.kv)===area).length})) },
    completedRiders: scoped.filter(r => r.total_assigned > 0 && r.delivered >= r.total_assigned).length,
    idleRiders: scoped.filter(r => r.idle_delivery_seconds >= 3600 && r.total_assigned > r.delivered).length,
    areas: OPERATING_AREAS.map(area => ({ area, ...sum(scoped.filter(r => areas.get(r.driver_id) === area)) })),
  };
}

export function summarizeDeliveryBacklog(rows: DeliveryBacklogRow[], now: number) {
  const seen = new Set<string>();
  const scoped = rows.filter(r => {
    if (!normalizeOperatingArea(r.area) || !r.shipment_id || seen.has(r.shipment_id)) return false;
    seen.add(r.shipment_id); return true;
  });
  const wards = new Map<string, { area: string; district: string; ward: string; orders: number }>();
  const districts = new Map<string, {area:string;district:string;cot1:number;cot2:number;unknownCot:number;total:number}>();
  let cot1 = 0, cot2 = 0, unknownCot = 0, aged48h = 0, missingReceived = 0;
  for (const row of scoped) {
    const cot = String(row.cot_group ?? "").replace(/\s/g, "").toUpperCase().match(/COT([12])(?:\b|\.)/)?.[1];
    if (cot === "1") cot1++; else if (cot === "2") cot2++; else unknownCot++;
    const received = row.received_time ? Date.parse(row.received_time) : NaN;
    if (!Number.isFinite(received)) missingReceived++; else if (now - received >= 48 * 3600_000) aged48h++;
    const area = normalizeOperatingArea(row.area)!;
    const district = row.district || "Chưa rõ quận", ward = row.ward || "Chưa rõ phường";
    const districtKey = `${area}:${district}`;
    const districtRow = districts.get(districtKey) ?? {area,district,cot1:0,cot2:0,unknownCot:0,total:0};
    districtRow.total++; if(cot==="1")districtRow.cot1++;else if(cot==="2")districtRow.cot2++;else districtRow.unknownCot++;
    districts.set(districtKey,districtRow);
    const key = `${area}:${district}:${ward}`;
    const item = wards.get(key) ?? { area, district, ward, orders: 0 }; item.orders++; wards.set(key, item);
  }
  return { total: scoped.length, cot1, cot2, unknownCot, aged48h, missingReceived,
    districts: [...districts.values()].sort((a,b)=>a.area.localeCompare(b.area)||a.district.localeCompare(b.district,"vi")),
    areas: OPERATING_AREAS.map(area => ({ area, orders: scoped.filter(r => normalizeOperatingArea(r.area) === area).length })),
    topWards: [...wards.values()].sort((a,b) => b.orders - a.orders || a.ward.localeCompare(b.ward, "vi")).slice(0, 5),
  };
}
