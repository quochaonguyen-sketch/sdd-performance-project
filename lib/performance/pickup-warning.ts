import type { PerformanceRow } from "./driver-performance";
import { allocateCotRemainder } from "./cot-allocation";

export function pickupCotWarning(row: Pick<PerformanceRow, "cot" | "pickup_assigned" | "pickup_picked" | "pickup_assigned_cot1" | "pickup_picked_cot1" | "pickup_assigned_cot2" | "pickup_picked_cot2">): string | null {
  const cot = (row.cot ?? "").replace(/\s/g, "").toUpperCase();
  if (!/^(COT)?2$/.test(cot) || !(row.pickup_picked > 0)) return null;
  const pickup = allocateCotRemainder({
    assigned: row.pickup_assigned, completed: row.pickup_picked,
    a1: row.pickup_assigned_cot1, c1: row.pickup_picked_cot1,
    a2: row.pickup_assigned_cot2, c2: row.pickup_picked_cot2,
  }, cot);
  if (!(pickup.c1 > 0)) return null;
  return `Rider COT2 có ${pickup.c1.toLocaleString("vi-VN")} đơn Pick COT1 (lấy đến 13:00).`;
}
