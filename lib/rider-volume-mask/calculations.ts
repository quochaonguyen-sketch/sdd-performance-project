export type VolumeMaskScope = "all" | "delivery" | "pickup";

/**
 * Applies volume mask to a realtime delivery rider row.
 */
export function maskDeliveryRow<T extends { driver_id: string; total_assigned: number; delivered: number; delivering: number; failed: number }>(
  row: T,
  masks: Map<string, { factor: number; scope: VolumeMaskScope }>
): T {
  const mask = masks.get(String(row.driver_id).trim().toLowerCase());
  if (!mask || (mask.scope !== "all" && mask.scope !== "delivery")) {
    return row;
  }

  const f = mask.factor;
  const delivered = Math.round(row.delivered * f);
  const delivering = Math.round(row.delivering * f);
  const failed = Math.round(row.failed * f);
  const total_assigned = Math.max(delivered + delivering + failed, Math.round(row.total_assigned * f));

  return {
    ...row,
    delivered,
    delivering,
    failed,
    total_assigned,
  };
}

/**
 * Applies volume mask to pickup metrics.
 */
export function maskPickupMetrics(
  driverId: string,
  metrics: { assigned?: number; picked?: number; onhold?: number } | null | undefined,
  masks: Map<string, { factor: number; scope: VolumeMaskScope }>
) {
  if (!metrics) return metrics;
  const mask = masks.get(String(driverId).trim().toLowerCase());
  if (!mask || (mask.scope !== "all" && mask.scope !== "pickup")) {
    return metrics;
  }

  const f = mask.factor;
  const assigned = metrics.assigned !== undefined ? Math.round(metrics.assigned * f) : undefined;
  const picked = metrics.picked !== undefined ? Math.round(metrics.picked * f) : undefined;
  const onhold = metrics.onhold !== undefined ? Math.round(metrics.onhold * f) : undefined;

  return {
    ...metrics,
    assigned,
    picked,
    onhold,
  };
}

/**
 * Applies volume mask to a performance row.
 */
export function maskPerformanceRow<T extends { driver_id: string; delivery_assigned?: number; delivery_delivered?: number; pickup_assigned?: number; pickup_picked?: number; delivery_rate?: number | null; pickup_rate?: number | null }>(
  row: T,
  masks: Map<string, { factor: number; scope: VolumeMaskScope }>
): T {
  const mask = masks.get(String(row.driver_id).trim().toLowerCase());
  if (!mask) return row;

  const f = mask.factor;
  const copy = { ...row };

  if (mask.scope === "all" || mask.scope === "delivery") {
    if (copy.delivery_assigned !== undefined) copy.delivery_assigned = Math.round(copy.delivery_assigned * f);
    if (copy.delivery_delivered !== undefined) copy.delivery_delivered = Math.round(copy.delivery_delivered * f);
    if (copy.delivery_assigned && copy.delivery_assigned > 0 && copy.delivery_delivered !== undefined) {
      copy.delivery_rate = Math.round((copy.delivery_delivered / copy.delivery_assigned) * 1000) / 10;
    }
  }

  if (mask.scope === "all" || mask.scope === "pickup") {
    if (copy.pickup_assigned !== undefined) copy.pickup_assigned = Math.round(copy.pickup_assigned * f);
    if (copy.pickup_picked !== undefined) copy.pickup_picked = Math.round(copy.pickup_picked * f);
    if (copy.pickup_assigned && copy.pickup_assigned > 0 && copy.pickup_picked !== undefined) {
      copy.pickup_rate = Math.round((copy.pickup_picked / copy.pickup_assigned) * 1000) / 10;
    }
  }

  return copy;
}
