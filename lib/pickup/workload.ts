import type { Metrics, PickupRider } from "./realtime.ts";

export type PickupFocus = "all" | "pending" | "onhold";
export type PickupSort = "assigned" | "picked" | "pending" | "onhold" | "rate" | "name";
export const pendingPickup = (metrics: Metrics) => Math.max(0, metrics.assigned - metrics.picked - metrics.onhold);

export function pickupWorkload(riders: PickupRider[], focus: PickupFocus, sort: PickupSort, direction: "asc" | "desc" = sort === "rate" || sort === "name" ? "asc" : "desc") {
  return riders.filter(rider => focus === "all" || (rider.metrics !== null && (focus === "onhold" ? rider.metrics.onhold > 0 : pendingPickup(rider.metrics) > 0))).sort((a, b) => {
    const byName = a.name.localeCompare(b.name, "vi") || a.id.localeCompare(b.id, "vi", {numeric:true});
    if (sort === "name") return (direction === "asc" ? 1 : -1) * byName;
    if (!a.metrics || !b.metrics) return Number(!!b.metrics) - Number(!!a.metrics) || byName;
    if (sort === "rate" && (a.metrics.assigned <= 0 || b.metrics.assigned <= 0)) return Number(b.metrics.assigned > 0) - Number(a.metrics.assigned > 0) || byName;
    const score = (metrics: Metrics) => sort === "pending" ? pendingPickup(metrics) : sort === "onhold" ? metrics.onhold : sort === "picked" ? metrics.picked : sort === "rate" ? metrics.picked / metrics.assigned : metrics.assigned;
    const difference = (score(a.metrics) - score(b.metrics)) * (direction === "asc" ? 1 : -1);
    return (Number.isNaN(difference) ? 0 : difference) || a.name.localeCompare(b.name, "vi");
  });
}
