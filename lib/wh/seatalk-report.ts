import { AREAS, compareWhOrders, counts, formatVnDate, isOnhold, remaining, sla, type WhOrder } from "./model";

const riderPageSize = 25;
const clockOptions = { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" } as const;
const clock = new Intl.DateTimeFormat("vi-VN", { ...clockOptions, hourCycle: "h23" });
const dateTime = new Intl.DateTimeFormat("en-GB", { ...clockOptions, day: "2-digit", month: "2-digit" });

export function whSeatalkReport(orders: WhOrder[], day: string, snapshotAt: string) {
  const now = Date.parse(snapshotAt);
  const areas = new Map(AREAS.map(area => [area, [] as WhOrder[]]));
  for (const order of orders) (areas.get(order.area) ?? areas.get("UNRESOLVED")!).push(order);

  const sorted = [...orders].sort((a, b) => compareWhOrders(a, b, "status", now));
  const riders = Array.from({ length: Math.max(1, Math.ceil(sorted.length / riderPageSize)) }, (_, index) =>
    sorted.slice(index * riderPageSize, (index + 1) * riderPageSize).map(order => {
      const left = order.raw_status === "Delivering" && order.attempt === 0 ? remaining(order, now, "4h") : null;
      const created = Date.parse(order.created_at ?? "");
      const status = isOnhold(order) ? "On-Hold"
        : order.raw_status === "LMhub_received" ? "Received"
        : order.raw_status === "SOC_pendingReceive" ? "WH Ready"
        : order.raw_status;
      return {
        status,
        cells: [
          order.shipment_id || order.tracking_number, order.driver_name || "—", areas.has(order.area) && order.area !== "UNRESOLVED" ? order.area : "—",
          order.attempt ?? "—", order.district || "—", order.ward || "—", Number.isFinite(created) ? dateTime.format(created) : "—",
          status, left === null || !Number.isFinite(left) ? "—" : left <= 0 ? "Quá hạn" : `${Math.floor(left / 60)}h ${String(left % 60).padStart(2, "0")}p`,
          ...(["4h", "wh", "sdd"] as const).map(kind => {
            const { state } = sla(order, kind);
            return state === "Pending" ? "—" : state;
          }),
        ],
      };
    })
  );
  return {
    day,
    snapshotAt,
    stamp: `Ngày báo cáo ${formatVnDate(day)} · Cập nhật dữ liệu ${clock.format(now)} (UTC+7)`,
    totals: counts(orders, day, now),
    areas: Array.from(areas, ([area, rows]) => ({ area, ...counts(rows, day, now) }))
      .filter(row => row.area !== "UNRESOLVED" || row.total > 0),
    riders,
  };
}

export type WhSeatalkReport = ReturnType<typeof whSeatalkReport>;
