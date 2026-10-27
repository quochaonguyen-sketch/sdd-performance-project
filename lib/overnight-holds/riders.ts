import type { OvernightHoldOrder, OvernightRider } from "./model";

export type RiderNote = { rider_code: string; note: string; updated_by: string | null };

export function groupOvernightRiders(orders: OvernightHoldOrder[], notes: RiderNote[] = []): OvernightRider[] {
  const byCode = new Map<string, OvernightRider>();
  const noteByCode = new Map(notes.map(note => [note.rider_code, note]));
  for (const order of orders) {
    const code = order.rider_code || "unknown";
    let rider = byCode.get(code);
    if (!rider) {
      const note = noteByCode.get(code);
      rider = {code, name: order.rider_name || "Chưa rõ tên", total:0, remaining:0, resolved:0,
        areas:[], note:note?.note ?? "", noteUpdatedBy:note?.updated_by ?? null};
      byCode.set(code, rider);
    }
    rider.total++;
    if (order.current_status === "Delivered" || order.current_status === "Returned") rider.resolved++;
    else rider.remaining++;
    if (order.area && !rider.areas.includes(order.area)) rider.areas.push(order.area);
  }
  return [...byCode.values()].sort((a,b) => b.remaining-a.remaining || b.total-a.total || a.code.localeCompare(b.code,"vi",{numeric:true}));
}

export function paginateOvernightRiders(orders: OvernightHoldOrder[], notes: RiderNote[], page: number, limit: number, exportAll = false) {
  const groups = groupOvernightRiders(orders, notes);
  const safePage = Math.min(page, Math.max(0, Math.ceil(groups.length/limit)-1));
  const riders = exportAll ? groups : groups.slice(safePage*limit,(safePage+1)*limit);
  const codes = new Set(riders.map(rider => rider.code));
  return {riders, totalRiders:groups.length, page:safePage,
    orders:orders.filter(order => codes.has(order.rider_code || "unknown"))};
}
