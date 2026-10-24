export const PICKUP_AREAS = ["KV1", "KV2", "KV3", "KV4", "KV5"] as const;
export type Area = typeof PICKUP_AREAS[number];
export type Metrics = { assigned: number; picked: number; onhold: number };
export type SourceRow = Record<string, unknown>;
export type Summary = Metrics & { route: string; ward: string; area: Area | null };
export type RiderGroup = Metrics & { route: string; ward: string; area: Area | null };
export type RouteAssignment = { route: string; ward: string; area: Area | null };
export type PickupRider = {
  id: string; name: string; area: Area; cot: string; routes: string[];
  metrics: Metrics | null; groups: RiderGroup[]; assignments: RouteAssignment[];
  routeSource: "realtime" | "inventory" | "none";
};
export const text = (value: unknown) => String(value ?? "").trim();
export function areaOf(value: unknown): Area | null {
  const match = text(value).toUpperCase().match(/^(?:(?:KV|KHU\s*VUC|AREA)\s*)?([1-5])$/);
  return match ? `KV${match[1]}` as Area : null;
}
const num = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
export const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().trim();
export const label = (value: unknown) => text(value) && text(value).toUpperCase() !== "UNKNOWN" ? text(value) : "Chưa xác định";
export function metrics(row: SourceRow, pickedKey = "picked_orders", assignedKey = "assigned_orders"): Metrics {
  return { assigned: num(row[assignedKey]), picked: num(row[pickedKey]), onhold: num(row.onhold_orders) };
}
export function sum(rows: Metrics[]): Metrics {
  return rows.reduce((a, b) => ({ assigned: a.assigned + b.assigned, picked: a.picked + b.picked, onhold: a.onhold + b.onhold }), { assigned: 0, picked: 0, onhold: 0 });
}
export function buildPickupRealtime(profiles: SourceRow[], realtime: SourceRow[], groups: SourceRow[], summary: SourceRow[], inventory: SourceRow[] = []) {
  const roster = new Map(profiles.map(r => [text(r.rider_code), r]));
  const live = new Map(realtime.map(r => [text(r.driver_id), r]));
  const byRider = new Map<string, RiderGroup[]>();
  const assignmentsByRider = new Map<string, Map<string, RouteAssignment>>();
  for (const row of inventory) {
    const id = text(row.rider_code);
    if (!id) continue;
    const assignments = assignmentsByRider.get(id) ?? new Map<string, RouteAssignment>();
    for (const value of Array.isArray(row.zones) ? row.zones : []) {
      const route = text(value);
      if (!route || ["Chưa có mã zone", "Chưa xác định", "UNKNOWN"].includes(route)) continue;
      const assignment = { route, ward: label(row.ward), area: areaOf(row.area) };
      assignments.set(`${assignment.area}:${assignment.ward}:${route}`, assignment);
    }
    assignmentsByRider.set(id, assignments);
  }
  for (const row of groups) {
    const id = text(row.driver_id);
    const list = byRider.get(id) ?? [];
    list.push({ ...metrics(row), route: label(row.khu_vuc), ward: label(row.ward), area: areaOf(row.ward_area) });
    byRider.set(id, list);
  }
  const riders: PickupRider[] = [];
  for (const id of new Set([...roster.keys(), ...live.keys()])) {
    const profile = roster.get(id), row = live.get(id);
    // Inactive profiles with actual activity remain visible; idle inactive profiles do not.
    if (!id || (!row && text(profile?.status) === "inactive")) continue;
    const area = areaOf(profile?.kv) ?? areaOf(row?.area);
    if (!area) continue;
    const details = byRider.get(id) ?? [];
    const liveRoutes = [
      ...text(row?.zones).split(/[,;\n]+/).map(text).filter(r => r && !["UNKNOWN", "Chưa xác định", "Chưa có mã zone"].includes(r)),
      ...details.map(g => g.route).filter(r => r !== "Chưa xác định"),
    ];
    // Inventory supplies route identity only, never fabricated realtime quantities.
    const assignments = liveRoutes.length ? [] : [...(assignmentsByRider.get(id)?.values() ?? [])];
    const routes = [...new Set([
      ...liveRoutes, ...assignments.map(a => a.route),
    ])].sort((a, b) => a.localeCompare(b, "vi", { numeric: true }));
    riders.push({ id, name: text(profile?.full_name) || text(profile?.name) || text(row?.driver_name) || id,
      area, cot: text(profile?.cot).replace(/\s+/g, "").toUpperCase() || "UNKNOWN", routes,
      metrics: row ? metrics(row, "total_pickup_quantity") : null, groups: details, assignments,
      routeSource: liveRoutes.length ? "realtime" : assignments.length ? "inventory" : "none" });
  }
  return {
    riders: riders.sort((a, b) => (b.metrics?.assigned ?? -1) - (a.metrics?.assigned ?? -1) || a.name.localeCompare(b.name, "vi")),
    summary: summary.map(row => ({ ...metrics(row, "picked_orders", "assign_orders"), route: label(row.khu_vuc), ward: label(row.ward),
      // An explicit out-of-scope ward must not fall back to an in-scope route.
      area: text(row.area) ? areaOf(row.area) : areaOf(row.route_area) })).filter(row => row.area !== null),
  };
}
export function filterRiders(riders: PickupRider[], filters: { area: string; route: string; ward: string; cot: string; coverage: string; query: string }) {
  const q = fold(filters.query);
  return riders.flatMap(rider => {
    if (filters.area !== "all" && rider.area !== filters.area) return [];
    if (filters.cot !== "all" && rider.cot !== filters.cot) return [];
    if (filters.coverage === "missing" && rider.metrics !== null) return [];
    if (filters.coverage === "live" && rider.metrics === null) return [];
    if (q && !fold(`${rider.id} ${rider.name} ${rider.routes.join(" ")}`).includes(q)) return [];
    if (filters.route === "all" && filters.ward === "all") return [rider];
    const groups = rider.groups.filter(g => (filters.route === "all" || g.route === filters.route) && (filters.ward === "all" || g.ward === filters.ward));
    // Group rows carry exact scoped metrics. Never show the rider's full total for one ward/zone.
    if (groups.length) return [{ ...rider, routes: [...new Set(groups.map(g => g.route))], metrics: sum(groups) }];
    const assignments = rider.assignments.filter(a => (filters.route === "all" || a.route === filters.route) && (filters.ward === "all" || a.ward === filters.ward));
    if (assignments.length) return [{ ...rider, routes: [...new Set(assignments.map(a => a.route))], assignments, metrics: null }];
    if (filters.ward === "all" && rider.routes.includes(filters.route)) return [{ ...rider, metrics: null }];
    return [];
  });
}

/** PostgREST enforces a server row cap even if .limit(8000) is requested. */
export async function readAllPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, pageSize = 500): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await page(from, from + pageSize - 1);
    if (result.error) throw new Error(result.error.message);
    const chunk = result.data ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) return rows;
  }
}
