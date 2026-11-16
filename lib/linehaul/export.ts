import * as XLSX from "xlsx";
import { LH_PHASES, linehaulOrigin, type LinehaulRange, type LinehaulTrip } from "./model.ts";
import { fullyUnloaded } from "./summary.ts";

const dateTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "medium",
});
const timestamp = (value: string | null | undefined) =>
  value && Number.isFinite(Date.parse(value)) ? dateTime.format(new Date(value)) : null;
const direction = { inbound: "Xe vào hub", outbound: "Xuất hub", stopover: "Qua hub" };

export function linehaulWorkbook(trips: readonly LinehaulTrip[]) {
  const headers = [
    "Ngày vận hành", "Mã LT", "Biển số", "Loại xe", "Tài xế", "Kho xuất phát", "Điểm đến", "Luồng", "Trạng thái",
    "Số đơn", "Số bao", "Số xá", "Tổng kiện TO", "Dự kiến xả TO", "Đã xả TO",
    "STA", "Rời kho xuất phát", "Đến hub", "Mở seal", "Xả xong", "Rời hub",
  ];
  const rows = trips.map(trip => [
    trip.trip_day, trip.lt_code, trip.plate_number, trip.vehicle, trip.driver_name,
    linehaulOrigin(trip).label, trip.destination, direction[trip.direction],
    fullyUnloaded(trip) ? "Đã xả đủ tải" : LH_PHASES[trip.phase],
    trip.orders, trip.bags, trip.loose, trip.load_total, trip.expected_unload, trip.unloaded_units,
    timestamp(trip.hub_sta), timestamp(trip.origin_atd), timestamp(trip.hub_ata),
    timestamp(trip.hub_unseal_at), timestamp(trip.hub_unloaded_at), timestamp(trip.hub_atd),
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = headers.map((header, index) => ({ wch: Math.max(header.length + 2, index >= 15 ? 22 : index >= 4 && index <= 8 ? 25 : 14) }));
  if (sheet["!ref"]) sheet["!autofilter"] = { ref: sheet["!ref"] };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Linehaul");
  return workbook;
}

export function downloadLinehaul(trips: readonly LinehaulTrip[], { from, to }: LinehaulRange) {
  XLSX.writeFile(linehaulWorkbook(trips), `linehaul-${from}${from === to ? "" : `_den_${to}`}.xlsx`, { compression: true });
}
