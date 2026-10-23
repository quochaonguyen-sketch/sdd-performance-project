import { OPERATING_AREAS, normalizeOperatingArea, type OperatingArea } from "../locations/operating-areas.ts";

export type VolumeAverageRow = { report_date: string | null; district: string | null; area: string | null; total_orders: number | null };
export type AverageAreaSelection = "all" | OperatingArea;

export function buildDistrictAverages(rows: VolumeAverageRow[], endDate: string, districtLabel: (name: string) => string = (name) => name) {
  const monthStart = `${endDate.slice(0, 7)}-01`;
  const dataDates = new Set<string>();
  const totals = new Map<string, { district: string; shortName: string; area: OperatingArea; total: number }>();
  for (const row of rows) {
    const date = row.report_date?.slice(0, 10);
    const area = normalizeOperatingArea(row.area);
    const district = row.district?.trim();
    if (!date || date < monthStart || date > endDate || !area || !district) continue;
    dataDates.add(date);
    const key = JSON.stringify([area, district]);
    const current = totals.get(key) ?? { district, shortName: districtLabel(district), area, total: 0 };
    current.total += row.total_orders ?? 1;
    totals.set(key, current);
  }
  const dayCount = dataDates.size;
  const rowsByDistrict = Array.from(totals.values(), (value) => ({ district: value.district, shortName: value.shortName, area: value.area, average: dayCount ? value.total / dayCount : 0 }))
    .sort((a, b) => a.area.localeCompare(b.area) || b.average - a.average || a.district.localeCompare(b.district, "vi"));
  return { rows: rowsByDistrict, dayCount, monthLabel: `Tháng ${endDate.slice(5, 7)}/${endDate.slice(0, 4)}` };
}

export function averageChartRows(data: ReturnType<typeof buildDistrictAverages>, selectedArea: AverageAreaSelection) {
  if (selectedArea !== "all") return data.rows.filter((row) => row.area === selectedArea)
    .map((row) => ({ key: JSON.stringify([row.area, row.district]), label: row.shortName, average: row.average, area: row.area }));
  return OPERATING_AREAS.map((area) => ({ key: area, label: `Khu vực ${area.slice(2)}`, area,
    average: data.rows.filter((row) => row.area === area).reduce((sum, row) => sum + row.average, 0) }));
}
