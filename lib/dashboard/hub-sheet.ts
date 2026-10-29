export const HUB_SHEET_ID = "1gsUhZMc5jLvFizy804gtAan3vtzxmmjKwOvycrj4xZU";
export const HUB_METRICS = [
  ["lm_hub_inbounded_order_qty_eod", "Inbound"],
  ["Picked", "Picked"],
  ["pending_outbound", "Pending Outbound"],
  ["lm_hub_total_driver_qty_eod", "Total Driver"],
  ["lm_hub_delivered_order_qty_eod", "Delivered · Hub"],
  ["lm_hub_fleet_delivered_order_qty_eod", "Delivered · Fleet"],
  ["Outbound", "Outbound"],
  ["pending_inbound", "Pending Inbound"],
  ["Total FM Inbound", "FM Inbound"],
  ["pending_pickup_total", "Pending Pickup"],
  ["handover", "Handover"],
  ["backlog_d0", "Backlog D0"],
  ["lm_hub_fleet_received_in_system_order_qty_td", "Fleet Received"],
  ["lm_hub_fleet_delivering_in_system_order_qty_eod", "Delivering"],
  ["lm_hub_fleet_onhold_in_system_order_qty_eod", "Onhold"],
  ["pending_pickup_from_seller_backlog", "Pickup Backlog"],
  ["pending_pickup_from_seller_backlog_1_2_days", "Pickup Backlog · 1–2 ngày"],
  ["pending_pickup_from_seller_backlog_3_5_days", "Pickup Backlog · 3–5 ngày"],
  ["pending_pickup_from_seller_backlog_gt_5_days", "Pickup Backlog · >5 ngày"],
] as const;
export function parseHubSheet(grid: unknown[][]) {
  const headers = grid[0]?.map(v => String(v).trim()) ?? [];
  for (const field of ["station_id", "station_name", "snapshot_date", ...HUB_METRICS.map(m => m[0])]) {
    if (!headers.includes(field)) throw Error(`Nguồn dashboard thiếu cột ${field}`);
  }
  const rows = grid.slice(1).filter(row => row.some(v => String(v ?? "").trim())).map(row => {
    const get = (key: string) => String(row[headers.indexOf(key)] ?? "").trim();
    const date = get("snapshot_date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !get("station_id")) throw Error("Ngày hoặc station_id không hợp lệ");
    const metrics = Object.fromEntries(HUB_METRICS.map(([key]) => {
      const raw = get(key), value = raw === "" ? null : Number(raw);
      if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw Error(`Giá trị ${key} không hợp lệ`);
      return [key, value];
    }));
    return { stationId: get("station_id"), stationName: get("station_name"), date, fetchedAt: get("fetched_at"), status: get("data_status"), metrics };
  });
  if (!rows.length) throw Error("Nguồn dashboard chưa có dữ liệu");
  const latestDate = rows.map(r => r.date).sort().at(-1)!;
  const latest = rows.filter(r => r.date === latestDate);
  if (new Set(latest.map(r => r.stationId)).size !== latest.length) throw Error("Trùng snapshot của hub trong ngày; chưa tổng hợp");
  return { date: latestDate, stations: latest, totals: Object.fromEntries(HUB_METRICS.map(([key]) => [key, latest.some(r => r.metrics[key] === null) ? null : latest.reduce((n, r) => n + r.metrics[key]!, 0)])) };
}
export type HubSheetData = ReturnType<typeof parseHubSheet>;
