import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canViewPage } from "@/lib/auth/page-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { sourceAllowed, vietnamDay } from "@/lib/data-sources/catalog";
import { counts, handoverSla, type WhDailySummary, type WhHandoverWindow, type WhOrder } from "@/lib/wh/model";
import { TtlCache } from "@/lib/cache/ttl-cache";
import { operationsArchiveWindow, readOperationsArchive } from "@/lib/supabase/operations-archive";
import { readWhSnapshots, whUsesArchive, type WhSnapshot } from "@/lib/wh/archive";

interface WhRangePayload {
  day: string;
  from: string;
  to: string;
  mode: string;
  snapshotAt: string | null;
  orders: WhOrder[];
  canRefresh: boolean;
  availableDates: string[];
  dailyBreakdown: WhDailySummary[];
  handoverWindows: WhHandoverWindow[] | null;
}

const whRangeCache = new TtlCache<Omit<WhRangePayload, "canRefresh">>(30_000, 10);

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
      } else if (mode === "month") {
        const [y, m] = today.slice(0, 7).split("-").map(Number);
        const firstDay = `${y}-${String(m).padStart(2, "0")}-01`;
        const lastDate = new Date(y, m, 0).getDate();
        const lastDay = `${y}-${String(m).padStart(2, "0")}-${String(lastDate).padStart(2, "0")}`;
        fromDate = firstDay;
        toDate = lastDay;
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
  const canRefresh = sourceAllowed(context.profile.role, context.profile.permissions, "wh_tracking");
  const { yesterday } = operationsArchiveWindow();
  const dates = { from: fromDate, to: toDate };

  async function summarizeHandover(snapshots: WhSnapshot[], legacyArchive: WhSnapshot[] | null) {
    const deliveryOnly = legacyArchive?.filter((snapshot) => !("job_id" in snapshot));
    if (!deliveryOnly?.length) return handoverSla(snapshots, dates.from, dates.to);

    // Legacy archive payloads may only contain delivered orders. Read those dates from the full source.
    try {
      const full = await readWhSnapshots(admin, {
        from: dates.from,
        to: dates.to < today ? dates.to : yesterday,
      });
      const byDate = new Map(full.map((snapshot) => [snapshot.report_date, snapshot]));
      if (deliveryOnly.some((snapshot) => !byDate.has(snapshot.report_date))) return null;
      const deliveryOnlyDates = new Set(deliveryOnly.map((snapshot) => snapshot.report_date));
      return handoverSla(snapshots.map((snapshot) =>
        deliveryOnlyDates.has(snapshot.report_date) ? byDate.get(snapshot.report_date)! : snapshot), dates.from, dates.to);
    } catch {
      return null;
    }
  }

  if (fromDate === toDate) {
    let data: WhSnapshot | undefined;
    let archive: WhSnapshot[] | null;
    try {
      archive = !whUsesArchive() && fromDate < today
        ? await readOperationsArchive<WhSnapshot>(admin, "wh", fromDate, toDate, request.signal)
        : null;
      data = (archive ?? await readWhSnapshots(admin, { from: fromDate, to: toDate }, request.signal))[0];
    } catch {
      return Response.json(
        { error: "Chưa đọc được dữ liệu WH. Kiểm tra nguồn WH / iPhone trên máy worker." },
        { status: 503 }
      );
    }

    const rawOrders = (data?.orders ?? []) as WhOrder[];
    const isHistorical = fromDate < today;
    // Historical snapshots strictly retain Delivered orders; active in-flight orders are fetched fresh today
    const orders = isHistorical ? rawOrders.filter((o) => o.raw_status === "Delivered") : rawOrders;
    const dayC = counts(orders, fromDate);
    const handoverWindows = await summarizeHandover(data ? [data] : [], archive);

    return Response.json(
      {
        day: fromDate,
        from: fromDate,
        to: toDate,
        mode,
        snapshotAt: data?.snapshot_at ?? null,
        orders,
        handoverWindows,
        canRefresh,
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

  // Multi-date range query with high-speed in-memory TTL caching (30s)
  try {
    const cacheKey = `${today}:${fromDate}:${toDate}:${mode}`;
    const result = await whRangeCache.load(cacheKey, async () => {
      const read = (from: string, to: string) => readWhSnapshots(admin, { from, to });
      const archive = !whUsesArchive() && fromDate < today
        ? await readOperationsArchive<WhSnapshot>(admin, "wh", fromDate, toDate < today ? toDate : yesterday)
        : null;
      const snapshots = archive
        ? [...(toDate >= today ? await read(today, toDate) : []), ...[...archive].reverse()]
        : await read(fromDate, toDate);
      const handoverWindows = await summarizeHandover(snapshots, archive);

      const orderMap = new Map<string, WhOrder>();
      const dailyBreakdown: WhDailySummary[] = [];

      for (const snapshot of snapshots ?? []) {
        const isHistorical = snapshot.report_date < today;
        const snapRawOrders = (snapshot.orders ?? []) as WhOrder[];
        // For historical snapshots: only keep Delivered orders. Non-delivered active orders are fetched fresh in today's active run.
        const snapOrders = isHistorical
          ? snapRawOrders.filter((o) => o.raw_status === "Delivered")
          : snapRawOrders;

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

      return {
        day: `${fromDate}..${toDate}`,
        from: fromDate,
        to: toDate,
        mode,
        snapshotAt: latestSnapshotAt,
        orders,
        handoverWindows,
        availableDates: dailyBreakdown.map((d) => d.date),
        dailyBreakdown,
      };
    });

    return Response.json({ ...result.value, canRefresh }, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Cache": result.hit ? "HIT" : "MISS",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Chưa đọc được dữ liệu WH theo khoảng ngày.";
    return Response.json({ error: msg }, { status: 503 });
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
  whRangeCache.clear();
  return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
