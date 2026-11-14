import type { OHCell, OHData } from "./model.ts";

type PackedCell = [date: number, area: number, reason: number, hour: number, status: OHCell["status"], orders: number,
  district: number, ward: number, code: number, name: number, label: number];

type PackedOHData = { reports: OHData["reports"]; dictionary: string[]; rows: PackedCell[] };

export function packOHPivot({ reports, cells }: OHData): PackedOHData {
  const dictionary: string[] = [];
  const ids = new Map<string, number>();
  function id(value: string | undefined) {
    if (value === undefined) return -1;
    const index = ids.get(value);
    if (index !== undefined) return index;
    ids.set(value, dictionary.length);
    return dictionary.push(value) - 1;
  }
  return { reports, dictionary, rows: cells.map(cell => [id(cell.report_date), id(cell.area), id(cell.reason), cell.hour, cell.status, cell.orders,
    id(cell.district), id(cell.ward), id(cell.rider_code), id(cell.rider_name), id(cell.reason_label)]) };
}

export function unpackOHPivot({ reports, dictionary, rows }: PackedOHData): OHData {
  return { reports, cells: rows.map(([date, area, reason, hour, status, orders, district, ward, code, name, label]) => ({
    report_date: dictionary[date], area: dictionary[area], reason: dictionary[reason], hour, status, orders,
    district: dictionary[district], ward: dictionary[ward], rider_code: dictionary[code], rider_name: dictionary[name], reason_label: dictionary[label],
  })) };
}
