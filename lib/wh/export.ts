import * as XLSX from "xlsx";
import { areaName, sla, type WhOrder } from "./model.ts";

const dateFormat = "dd/mm/yyyy";
const timeFormat = "hh:mm";
const timestampFormat = `${dateFormat} ${timeFormat}`;

function vietnamExcelTimestamp(value: string | null): number | null {
  const timestamp = Date.parse(value ?? "");
  // Excel's date serial has no timezone. Store the wall-clock time in Vietnam.
  return Number.isFinite(timestamp) ? (timestamp + 7 * 3600000) / 86400000 + 25569 : null;
}

function dateCell(value: number | null, format = timestampFormat): XLSX.CellObject | null {
  return value === null ? null : { t: "n", v: value, z: format };
}

export function whOrderWorkbook(orders: readonly WhOrder[]) {
  const headers = [
    "Shipment", "Tracking", "KV", "District", "Ward", "Rider", "Rider ID", "Status", "Attempt",
    "Created", "Received", "Delivering", "Delivered", "Onhold", "Bàn giao SOC (VN)", "Ngày bàn giao",
    "Giờ bàn giao", "4H", "WH", "SDD",
  ];
  const rows = orders.map((order) => {
    const handover = vietnamExcelTimestamp(order.soc_pending_at);
    const handoverDate = handover === null ? null : Math.floor(handover);
    return [
      order.shipment_id, order.tracking_number, areaName(order.area), order.district, order.ward,
      order.driver_name, order.driver_id, order.raw_status, order.attempt,
      ...[order.created_at, order.received_at, order.delivering_at, order.delivered_at, order.onhold_at]
        .map((value) => dateCell(vietnamExcelTimestamp(value))),
      dateCell(handover),
      dateCell(handoverDate, dateFormat),
      dateCell(handover === null ? null : handover % 1, timeFormat),
      sla(order, "4h").state, sla(order, "wh").state, sla(order, "sdd").state,
    ];
  });
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = [22, 22, 15, 24, 24, 26, 13, 22, 10, 21, 21, 21, 21, 21, 23, 18, 18, 12, 12, 12]
    .map((wch) => ({ wch }));
  if (sheet["!ref"]) sheet["!autofilter"] = { ref: sheet["!ref"] };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Chi tiết đơn");
  return workbook;
}

export function downloadWhOrders(orders: readonly WhOrder[], filename: string) {
  XLSX.writeFile(whOrderWorkbook(orders), filename, { compression: true });
}
