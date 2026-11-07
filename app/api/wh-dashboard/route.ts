import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canViewPage } from "@/lib/auth/page-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { sourceAllowed, vietnamDay } from "@/lib/data-sources/catalog";
import { counts, type WhDailySummary, type WhOrder } from "@/lib/wh/model";

export async function GET(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) return Response.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canViewPage(context.profile.role, context.profile.page_access, "wh_tracking")) {
    return Response.json({ error: "Không có quyền xem WH" }, { status: 403 });
  }

  const today = vietnamDay();
  let fromDate = today;
  let toDate = today;
  let mode: "day" | "week" | "range" | "month" = "day";

  if (request && typeof request.url === "string") {
    try {
      const url = new URL(request.url);
      const qFrom = url.searchParams.get("from");
      const qTo = url.searchParams.get("to");
      const qDate = url.searchParams.get("date");
      const qMode = url.searchParams.get("mode") as "day" | "week" | "range" | "month" | null;

      if (qMode && ["day", "week", "range", "month"].includes(qMode)) {
        mode = qMode;
      }

      if (qFrom && qTo) {
        fromDate = qFrom;
        toDate = qTo;
      } else if (qDate) {
        fromDate = qDate;
        toDate = qDate;
      }
    } catch {
      // fallback to today
    }
  }

  // Basic sanity check on date strings
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) fromDate = today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate)) toDate = today;
  if (fromDate > toDate) {
    const temp = fromDate;
    fromDate = toDate;
    toDate = temp;
  }

  const admin = createAdminClient();

  // If single date, use simple maybeSingle query to stay 100% compatible with existing test fixtures
  if (fromDate === toDate) {
    const { data, error } = await admin
      .from("wh_tracking_snapshots")
      .select("snapshot_at,orders")
      .eq("station_id", "4232")
      .eq("report_date", fromDate)
      .maybeSingle();

    if (error) {
      return Response.json(
        { error: "Chưa đọc được dữ liệu WH. Kiểm tra nguồn WH / iPhone trên máy worker." },
        { status: 503 }
      );
    }

    const orders = (data?.orders ?? []) as WhOrder[];
    const dayC = counts(orders, fromDate);

    return Response.json(
      {
        day: fromDate,
        from: fromDate,
        to: toDate,
        mode,
        snapshotAt: data?.snapshot_at ?? null,
        orders,
        canRefresh: sourceAllowed(context.profile.role, context.profile.permissions, "wh_tracking"),
        availableDates: [fromDate],
        dailyBreakdown: data
          ? [
              {
                date: fromDate,
                total: dayC.total,
                delivered: dayC.delivered,
                delivering: dayC.delivering,
                onhold: dayC.onhold,
                unassigned: dayC.unassigned,
                ontime: dayC.ontime,
                late: dayC.late,
                ontimeRate: dayC.ontimeRate,
                lateRate: dayC.lateRate,
                rate: dayC.rate,
              },
            ]
          : [],
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  // Multi-date range query
  try {
    const { data: snapshots, error } = await admin
      .from("wh_tracking_snapshots")
      .select("report_date, snapshot_at, orders")
      .eq("station_id", "4232")
      .gte("report_date", fromDate)
      .lte("report_date", toDate)
      .order("report_date", { ascending: false });

    if (error) {
      return Response.json(
        { error: "Chưa đọc được dữ liệu WH. Kiểm tra nguồn WH / iPhone trên máy worker." },
        { status: 503 }
      );
    }

    const orderMap = new Map<string, WhOrder>();
    const dailyBreakdown: WhDailySummary[] = [];

    for (const snapshot of snapshots ?? []) {
      const snapOrders = (snapshot.orders ?? []) as WhOrder[];
      for (const order of snapOrders) {
        if (!orderMap.has(order.shipment_id)) {
          orderMap.set(order.shipment_id, order);
        }
      }
      const dayC = counts(snapOrders, snapshot.report_date);
      dailyBreakdown.push({
        date: snapshot.report_date,
        total: dayC.total,
        delivered: dayC.delivered,
        delivering: dayC.delivering,
        onhold: dayC.onhold,
        unassigned: dayC.unassigned,
        ontime: dayC.ontime,
        late: dayC.late,
        ontimeRate: dayC.ontimeRate,
        lateRate: dayC.lateRate,
        rate: dayC.rate,
      });
    }

    const orders = Array.from(orderMap.values());
    const latestSnapshotAt = snapshots?.[0]?.snapshot_at ?? null;

    return Response.json(
      {
        day: `${fromDate}..${toDate}`,
        from: fromDate,
        to: toDate,
        mode,
        snapshotAt: latestSnapshotAt,
        orders,
        canRefresh: sourceAllowed(context.profile.role, context.profile.permissions, "wh_tracking"),
        availableDates: dailyBreakdown.map((d) => d.date),
        dailyBreakdown,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return Response.json(
      { error: "Chưa đọc được dữ liệu WH theo khoảng ngày." },
      { status: 503 }
    );
  }
}

export async function POST() {
  const context = await getCurrentUserContext();
  if (!context) return Response.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (
    !canViewPage(context.profile.role, context.profile.page_access, "wh_tracking") ||
    !sourceAllowed(context.profile.role, context.profile.permissions, "wh_tracking")
  ) {
    return Response.json({ error: "Không có quyền đồng bộ WH" }, { status: 403 });
  }

  const { data, error } = await createAdminClient().rpc("control_data_source", {
    p_source: "wh_tracking",
    p_action: "run",
    p_day: vietnamDay(),
    p_actor: context.user.id,
  });

  if (error) return Response.json({ error: "Chưa gửi được lệnh đồng bộ WH." }, { status: 503 });
  return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
