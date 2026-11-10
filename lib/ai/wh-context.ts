import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { counts, sla, remaining, isUnassigned, isOnhold, type WhOrder, type WhStatus } from "@/lib/wh/model";

/**
 * Checks whether the user's message is asking about iPhone, WH (Kho 4232),
 * High Value orders or SLA 4H delivery.
 */
export function isWhTrackingQuery(question: string): boolean {
  if (!question) return false;
  return /(?:iphone|\bip\b|\bwh\b|4232|high[ _-]?value|giá\s*trị\s*cao|hang\s*gia\s*tri\s*cao|\b4h\b|hàng\s*4h|giao\s*4h|đơn\s*4h|don\s*4h)/iu.test(
    question
  );
}

export type WhAiIssue = {
  type: "onhold" | "overdue_4h" | "near_sla_4h" | "unassigned" | "soc_pending" | "delivered_late";
  severity: "critical" | "warning" | "info";
  shipment_id: string;
  tracking_number: string;
  driver_name: string;
  area: string;
  district: string;
  ward: string;
  status: WhStatus;
  created_at: string | null;
  detail: string;
  remaining_minutes: number | null;
};

export type WhAiContext = {
  station_id: string;
  report_date: string;
  snapshot_at: string | null;
  is_stale: boolean;
  total_orders: number;
  status_counts: {
    total: number;
    delivering: number;
    created: number;
    delivered: number;
    onhold: number;
    soc_pending: number;
    unassigned: number;
    riders_count: number;
    delivery_rate_percent: number;
    sla_4h_late: number;
    sla_4h_ontime: number;
  };
  areas_summary: Record<
    string,
    {
      total: number;
      delivering: number;
      delivered: number;
      onhold: number;
      unassigned: number;
    }
  >;
  delivering_orders: Array<{
    shipment_id: string;
    tracking_number: string;
    driver_name: string;
    area: string;
    district: string;
    ward: string;
    created_at: string | null;
    delivering_at: string | null;
    remaining_sla_minutes: number | null;
    is_overdue_4h: boolean;
    attempt: number | null;
    onhold_reason: string;
  }>;
  onhold_orders: Array<{
    shipment_id: string;
    tracking_number: string;
    driver_name: string;
    area: string;
    district: string;
    onhold_reason: string;
    created_at: string | null;
    attempt: number | null;
  }>;
  issues: WhAiIssue[];
};

export async function loadWhOperationsContext(
  admin: SupabaseClient,
  day: string
): Promise<WhAiContext | null> {
  try {
    // 1. Fetch snapshot for station 4232 and day
    let { data, error } = await admin
      .from("wh_tracking_snapshots")
      .select("station_id, report_date, snapshot_at, orders")
      .eq("station_id", "4232")
      .eq("report_date", day)
      .maybeSingle();

    // Fallback: If no snapshot for today, try fetching the most recent snapshot
    if (!data && !error) {
      const fallback = await admin
        .from("wh_tracking_snapshots")
        .select("station_id, report_date, snapshot_at, orders")
        .eq("station_id", "4232")
        .order("snapshot_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fallback.data) {
        data = fallback.data;
      }
    }

    if (!data || !Array.isArray(data.orders)) {
      return null;
    }

    const orders = data.orders as WhOrder[];
    const reportDate = data.report_date || day;
    const snapshotAt = data.snapshot_at;
    const now = Date.now();
    const isStale = snapshotAt ? (now - Date.parse(snapshotAt)) > 30 * 60 * 1000 : true;

    // 2. Compute aggregated metrics
    const c = counts(orders, reportDate);

    // 3. Breakdown by area
    const areasSummary: Record<
      string,
      { total: number; delivering: number; delivered: number; onhold: number; unassigned: number }
    > = {
      KV1: { total: 0, delivering: 0, delivered: 0, onhold: 0, unassigned: 0 },
      KV2: { total: 0, delivering: 0, delivered: 0, onhold: 0, unassigned: 0 },
      KV3: { total: 0, delivering: 0, delivered: 0, onhold: 0, unassigned: 0 },
      KV4: { total: 0, delivering: 0, delivered: 0, onhold: 0, unassigned: 0 },
      KV5: { total: 0, delivering: 0, delivered: 0, onhold: 0, unassigned: 0 },
      UNRESOLVED: { total: 0, delivering: 0, delivered: 0, onhold: 0, unassigned: 0 },
    };

    const issues: WhAiIssue[] = [];
    const deliveringOrders: WhAiContext["delivering_orders"] = [];
    const onholdOrders: WhAiContext["onhold_orders"] = [];

    for (const order of orders) {
      const areaKey = areasSummary[order.area] ? order.area : "UNRESOLVED";
      areasSummary[areaKey].total++;

      // Accurate SDD 3H SLA remaining calculation (soc_pending_at -> delivered_at <= 180 min)
      const sddStart = order.soc_pending_at || order.created_at;
      const deadline = sddStart ? Date.parse(sddStart) + 3 * 3600000 : null;
      const remMinutes = deadline ? Math.floor((deadline - now) / 60000) : null;
      const isOverdue = remMinutes !== null && remMinutes < 0;

      if (order.raw_status === "Delivered") {
        areasSummary[areaKey].delivered++;
        const sddSla = sla(order, "sdd");
        if (sddSla.state === "Late") {
          issues.push({
            type: "delivered_late",
            severity: "info",
            shipment_id: order.shipment_id,
            tracking_number: order.tracking_number,
            driver_name: order.driver_name,
            area: order.area,
            district: order.district,
            ward: order.ward,
            status: order.raw_status,
            created_at: order.created_at,
            detail: `Giao trễ SLA SDD (${sddSla.minutes ?? 0} phút, quy chuẩn ≤180 phút từ lúc SOC nhận hàng)`,
            remaining_minutes: null,
          });
        }
      } else if (isOnhold(order) || order.raw_status === "Onhold") {
        areasSummary[areaKey].onhold++;
        onholdOrders.push({
          shipment_id: order.shipment_id,
          tracking_number: order.tracking_number,
          driver_name: order.driver_name,
          area: order.area,
          district: order.district,
          onhold_reason: order.onhold_reason || "Chưa có lý do",
          created_at: order.created_at,
          attempt: order.attempt,
        });
        issues.push({
          type: "onhold",
          severity: "critical",
          shipment_id: order.shipment_id,
          tracking_number: order.tracking_number,
          driver_name: order.driver_name,
          area: order.area,
          district: order.district,
          ward: order.ward,
          status: order.raw_status,
          created_at: order.created_at,
          detail: `Đang hoãn/giữ hàng (Onhold). Lý do: "${order.onhold_reason || "Chưa rõ"}" (Lần giao: ${order.attempt ?? 1})`,
          remaining_minutes: null,
        });
      } else if (order.raw_status === "Delivering") {
        areasSummary[areaKey].delivering++;
        deliveringOrders.push({
          shipment_id: order.shipment_id,
          tracking_number: order.tracking_number,
          driver_name: order.driver_name,
          area: order.area,
          district: order.district,
          ward: order.ward,
          created_at: order.created_at,
          delivering_at: order.delivering_at,
          remaining_sla_minutes: remMinutes,
          is_overdue_4h: isOverdue,
          attempt: order.attempt,
          onhold_reason: order.onhold_reason,
        });

        if (isOverdue) {
          issues.push({
            type: "overdue_4h",
            severity: "critical",
            shipment_id: order.shipment_id,
            tracking_number: order.tracking_number,
            driver_name: order.driver_name,
            area: order.area,
            district: order.district,
            ward: order.ward,
            status: order.raw_status,
            created_at: order.created_at,
            detail: `Đang giao nhưng đã trễ SLA SDD 3H (quá hạn ${Math.abs(remMinutes!)} phút từ lúc SOC nhận)`,
            remaining_minutes: remMinutes,
          });
        } else if (remMinutes !== null && remMinutes <= 45) {
          issues.push({
            type: "near_sla_4h",
            severity: "warning",
            shipment_id: order.shipment_id,
            tracking_number: order.tracking_number,
            driver_name: order.driver_name,
            area: order.area,
            district: order.district,
            ward: order.ward,
            status: order.raw_status,
            created_at: order.created_at,
            detail: `Sắp chạm mốc SLA SDD 3H (chỉ còn ${remMinutes} phút)`,
            remaining_minutes: remMinutes,
          });
        }
      } else if (isUnassigned(order)) {
        areasSummary[areaKey].unassigned++;
        issues.push({
          type: "unassigned",
          severity: "warning",
          shipment_id: order.shipment_id,
          tracking_number: order.tracking_number,
          driver_name: "",
          area: order.area,
          district: order.district,
          ward: order.ward,
          status: order.raw_status,
          created_at: order.created_at,
          detail: "Đã về LM Hub nhưng chưa gán rider đi giao",
          remaining_minutes: remMinutes,
        });
      } else if (order.raw_status === "SOC_pendingReceive") {
        issues.push({
          type: "soc_pending",
          severity: "info",
          shipment_id: order.shipment_id,
          tracking_number: order.tracking_number,
          driver_name: "",
          area: order.area,
          district: order.district,
          ward: order.ward,
          status: order.raw_status,
          created_at: order.created_at,
          detail: "Chờ trung chuyển từ SOC về LM Hub",
          remaining_minutes: remMinutes,
        });
      }
    }

    return {
      station_id: data.station_id || "4232",
      report_date: reportDate,
      snapshot_at: snapshotAt,
      is_stale: isStale,
      total_orders: orders.length,
      status_counts: {
        total: c.total,
        delivering: c.delivering,
        created: c.created,
        delivered: c.delivered,
        onhold: c.onhold,
        soc_pending: c.ready,
        unassigned: c.unassigned,
        riders_count: c.riders,
        delivery_rate_percent: Math.round(c.rate * 10) / 10,
        sla_4h_late: c.late,
        sla_4h_ontime: c.ontime,
      },
      areas_summary: areasSummary,
      delivering_orders: deliveringOrders,
      onhold_orders: onholdOrders,
      issues,
    };
  } catch (err) {
    console.error("Failed to load WH AI context:", err);
    return null;
  }
}
