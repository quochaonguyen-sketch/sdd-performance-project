import type { Metrics, PickupRider } from "./realtime.ts";

export type PickupFocus = "all" | "pending" | "onhold";
export type PickupSort = "assigned" | "pending" | "onhold" | "rate";
export const pendingPickup = (metrics: Metrics) => Math.max(0, metrics.assigned - metrics.picked - metrics.onhold);

export function pickupWorkload(riders: PickupRider[], focus: PickupFocus, sort: PickupSort) {
  return riders.filter(rider => focus === "all" || (rider.metrics !== null && (focus === "onhold" ? rider.metrics.onhold > 0 : pendingPickup(rider.metrics) > 0))).sort((a, b) => {
    if (!a.metrics || !b.metrics) return Number(!!b.metrics) - Number(!!a.metrics) || a.name.localeCompare(b.name, "vi");
    const score = (metrics: Metrics) => sort === "pending" ? pendingPickup(metrics) : sort === "onhold" ? metrics.onhold : sort === "rate" ? (metrics.assigned > 0 ? metrics.picked / metrics.assigned : Infinity) : metrics.assigned;
    const difference = sort === "rate" ? score(a.metrics) - score(b.metrics) : score(b.metrics) - score(a.metrics);
    return (Number.isNaN(difference) ? 0 : difference) || a.name.localeCompare(b.name, "vi");
  });
}
