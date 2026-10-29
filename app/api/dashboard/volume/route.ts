import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { readAllPages } from "@/lib/pickup/realtime";
import { summarizeDashboardVolume, shiftVolumeDay, type DashboardVolumeRow } from "@/lib/dashboard/volume-overview";
import { TtlCache } from "@/lib/cache/ttl-cache";

type VolumePayload = { today: string; delivery: { data: ReturnType<typeof summarizeDashboardVolume> | null; error: string | null }; pickup: { data: ReturnType<typeof summarizeDashboardVolume> | null; error: string | null } };
const cache = new TtlCache<VolumePayload>(300_000, 24);

export async function GET(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) return NextResponse.json({ error: "Chưa đăng nhập" }, { status:401 });
  const db = await createClient();
  const today = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).format(new Date());
  async function load(table: "delivery_order" | "pickup_volume") {
    try {
      const latest = await db.from(table).select("report_date").in("area",OPERATING_AREAS).lte("report_date",today).order("report_date",{ascending:false}).limit(1).maybeSingle();
      if (latest.error) throw new Error(latest.error.message);
      const latestDate = latest.data?.report_date?.slice(0,10);
      const windowStart = shiftVolumeDay(today,-13);
      const fromDate = latestDate && latestDate < windowStart ? latestDate : windowStart;
      const rows = await readAllPages<DashboardVolumeRow>((from,to)=>db.from(table)
        .select("report_date,area,total_orders").in("area",OPERATING_AREAS)
        .gte("report_date",fromDate).lte("report_date",today)
        .order("report_date").order("id").range(from,to));
      return {data:summarizeDashboardVolume(rows,today),error:null};
    } catch(error) { return {data:null,error:error instanceof Error ? error.message : "Không tải được sản lượng"}; }
  }
  const key = JSON.stringify([context.user.id, context.profile, today]);
  if (request.headers.get("x-dashboard-refresh") === "1") cache.delete(key);
  const result = await cache.load(key, async () => {
    const [delivery,pickup]=await Promise.all([load("delivery_order"),load("pickup_volume")]);
    return {today,delivery,pickup};
  }, value => !value.delivery.error && !value.pickup.error);
  return NextResponse.json(result.value,{headers:{"Cache-Control":"private, no-store", "X-Data-Cache": result.hit ? "HIT" : "MISS", "X-Cache-Expires": String(result.expiresAt)}});
}
