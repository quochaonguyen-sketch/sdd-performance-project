import { getCurrentUserContext } from "@/lib/auth/current-user";
import { TtlCache } from "@/lib/cache/ttl-cache";
import { readRiderPlan } from "@/lib/google/rider-plan-source";
import { RIDER_PLAN_ID, RIDER_PLAN_TAB } from "@/lib/google/rider-plan";
import { buildBinhChanhPlan, type BinhChanhPlan } from "@/components/zones/zone-model";

const cache = new TtlCache<{ wardAreas: BinhChanhPlan; checkedAt: string }>(60_000, 1);

export async function GET() {
  if (!await getCurrentUserContext()) return Response.json({ error: "Chưa đăng nhập" }, { status: 401 });
  try {
    const { value } = await cache.load("binh-chanh", async () => {
      const source = await readRiderPlan();
      return { wardAreas: buildBinhChanhPlan(source.riders), checkedAt: new Date().toISOString() };
    });
    return Response.json({ ...value, spreadsheetId: RIDER_PLAN_ID, tab: RIDER_PLAN_TAB }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không đọc được địa bàn Bình Chánh từ Plan" }, { status: 502 });
  }
}
