import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { readAllPages } from "@/lib/pickup/realtime";
import { summarizeDashboardVolume, shiftVolumeDay, type DashboardVolumeRow } from "@/lib/dashboard/volume-overview";
import { TtlCache } from "@/lib/cache/ttl-cache";

type VolumePayload = { today: string; delivery: { data: ReturnType<typeof summarizeDashboardVolume> | null; error: string | null }; pickup: { data: ReturnType<typeof summarizeDashboardVolume> | null; error: string | null } };
type GroupedVolumeRow = DashboardVolumeRow & { source: "delivery" | "pickup" };
const cache = new TtlCache<VolumePayload>(300_000, 24);

export async function GET(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) return NextResponse.json({ error: "Chưa đăng nhập" }, { status:401 });
  const today = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).format(new Date());
  const key = JSON.stringify([context.user.id, context.profile, today]);
  if (request.headers.get("x-dashboard-refresh") === "1") cache.delete(key);
  const result = await cache.load(key, async () => {
    const db = await createClient();
    const grouped = await db.rpc("dashboard_volume_daily", { p_today: today });
    if (!grouped.error && Array.isArray(grouped.data)) {
      const rows: GroupedVolumeRow[] = grouped.data;
      const summarize = (source: GroupedVolumeRow["source"]) => ({
        data: summarizeDashboardVolume(rows.filter(row => row.source === source), today),
        error: null,
      });
      return { today, delivery: summarize("delivery"), pickup: summarize("pickup") };
    }

    // Retain per-source availability while the RPC is unavailable or not installed.
    async function load(table: "delivery_order" | "pickup_volume") {
      try {
        const latest = await db.from(table).select("report_date").in("area",OPERATING_AREAS).lte("report_date",today).order("report_date",{ascending:false}).limit(1).maybeSingle();
        if (latest.error) throw new Error(latest.error.message);
        const latestDate = latest.data?.report_date?.slice(0,10);
        const windowStart = shiftVolumeDay(today,-13);
        const fromDate = latestDate && latestDate < windowStart ? latestDate : windowStart;
        const sourceRows = await readAllPages<DashboardVolumeRow>((from,to)=>db.from(table)
          .select("report_date,area,total_orders").in("area",OPERATING_AREAS)
          .gte("report_date",fromDate).lte("report_date",today)
          .order("report_date").order("id").range(from,to), 1000, 4);
        return {data:summarizeDashboardVolume(sourceRows,today),error:null};
      } catch(error) { return {data:null,error:error instanceof Error ? error.message : "Không tải được sản lượng"}; }
    }
    const [delivery, pickup] = await Promise.all([load("delivery_order"), load("pickup_volume")]);
    return { today, delivery, pickup };
  }, value => !value.delivery.error && !value.pickup.error);
  return NextResponse.json(result.value,{headers:{"Cache-Control":"private, no-store", "X-Data-Cache": result.hit ? "HIT" : "MISS", "X-Cache-Expires": String(result.expiresAt)}});
}
