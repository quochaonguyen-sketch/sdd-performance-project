import { normalizeOperatingArea } from "../locations/operating-areas.ts";
import { shiftVolumeDay } from "./volume-overview.ts";

export type VolumeKind = "delivery" | "pickup";
export type VolumePeriod = { start: string; end: string };
export type VolumeGeographyRow = {
  report_date: string | null;
  area: string | null;
  district: string | null;
  old_ward?: string | null;
  new_ward?: string | null;
  total_orders: number | null;
};

export type VolumeNode = {
  label: string;
  total: number;
  days: Map<string, number>;
  children: Map<string, VolumeNode>;
};

const dayMs = 86_400_000;
const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function volumeDates({ start, end }: VolumePeriod, today: string) {
  if (!isDay(start) || !isDay(end) || start > end || end > today) return [];
  const length = (Date.parse(end) - Date.parse(start)) / dayMs + 1;
  if (length > 31) return [];
  return Array.from({ length }, (_, index) => shiftVolumeDay(start, index));
}

const makeNode = (label: string): VolumeNode => ({ label, total: 0, days: new Map(), children: new Map() });

function addVolume(node: VolumeNode, day: string, orders: number) {
  node.total += orders;
  node.days.set(day, (node.days.get(day) ?? 0) + orders);
}

export function buildVolumeGeography(rows: VolumeGeographyRow[], kind: VolumeKind, dates: string[]) {
  const root = makeNode("Tất cả khu vực");
  const includedDays = new Set(dates);
  for (const row of rows) {
    const day = row.report_date?.slice(0, 10);
    const area = normalizeOperatingArea(row.area)
      ?? (kind === "pickup" && row.area === "UNRESOLVED" ? "Chưa rõ khu vực" : null);
    const orders = Number(row.total_orders ?? 1);
    if (!day || !includedDays.has(day) || !area || !Number.isFinite(orders) || orders < 0) continue;

    const district = row.district?.trim() || "Chưa xác định quận/huyện";
    const ward = (kind === "pickup" ? row.new_ward : row.old_ward)?.trim() || "Chưa xác định phường/xã";
    addVolume(root, day, orders);
    let parent = root;
    for (const label of [area, district, ward]) {
      let node = parent.children.get(label);
      if (!node) {
        node = makeNode(label);
        parent.children.set(label, node);
      }
      addVolume(node, day, orders);
      parent = node;
    }
  }
  return root;
}

export function volumeTrail(root: VolumeNode, path: string[]) {
  const trail = [root];
  for (const label of path) {
    const child = trail.at(-1)?.children.get(label);
    if (!child) break;
    trail.push(child);
  }
  return trail;
}
