import type { CotFilter, DistrictAgg } from "./lmhub-inventory-model";

export type ReportRow = {
  kind: "district" | "subtotal" | "total";
  area: string;
  district: string;
  cot1: number;
  cot2: number;
  total: number;
};

export function buildDeliveryReport(districts: DistrictAgg[], cot: CotFilter): ReportRow[] {
  const areas = new Map<string, ReportRow[]>();
  for (const district of districts) {
    const cot1 = cot === "cot2" ? 0 : district.totals.cot1;
    const cot2 = cot === "cot1" ? 0 : district.totals.cot2;
    const rows = areas.get(district.area) ?? [];
    rows.push({ kind: "district", area: district.area, district: district.district, cot1, cot2, total: cot1 + cot2 });
    areas.set(district.area, rows);
  }
  const result: ReportRow[] = [];
  const total: ReportRow = { kind: "total", area: "TỔNG CỘNG", district: "", cot1: 0, cot2: 0, total: 0 };
  for (const [area, rows] of [...areas.entries()].sort(([a], [b]) => a.localeCompare(b, "vi", { numeric: true }))) {
    rows.sort((a, b) => a.district.localeCompare(b.district, "vi", { numeric: true }));
    const subtotal: ReportRow = { kind: "subtotal", area, district: "Tổng khu vực", cot1: 0, cot2: 0, total: 0 };
    for (const row of rows) {
      for (const key of ["cot1", "cot2", "total"] as const) subtotal[key] += row[key];
    }
    result.push(...rows, subtotal);
    for (const key of ["cot1", "cot2", "total"] as const) total[key] += subtotal[key];
  }
  return [...result, total];
}

export function reportHeat(value: number, max: number) {
  if (!value) return "#ffffff";
  const ratio = value / Math.max(1, max);
  if (ratio <= 0.15) return "#a7d9b5";
  if (ratio <= 0.4) return "#ffe08a";
  if (ratio <= 0.7) return "#ffb779";
  return "#ee9390";
}
