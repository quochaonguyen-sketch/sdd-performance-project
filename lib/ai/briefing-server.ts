import "server-only";
import type { CurrentUserContext } from "@/lib/auth/current-user";
import { briefingAccess } from "./source-access";
import { createClient } from "@/lib/supabase/server";
import { readAllPages, type PickupRider } from "@/lib/pickup/realtime";
import { loadTeam } from "@/lib/team/server";
import { addDays } from "@/lib/team/model";
import { todayInVietnam } from "@/lib/ai/work-date";
import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { TtlCache } from "@/lib/cache/ttl-cache";
import { buildBriefing, snapshotState, type BriefingInput, type BriefingSource, type BriefingProfile, type DeliveryBriefRow } from "./briefing";

const rosterCache = new TtlCache<BriefingProfile[]>(60_000, 1);

export async function loadOperationsBriefing(context: CurrentUserContext, question = "", signal?: AbortSignal) {
  const access = briefingAccess(context), day = todayInVietnam(), now = new Date().toISOString();
  const input: BriefingInput = { day, now, sources: [], profiles: null, delivery: null, pickup: null, team: null };
  const source = (id: string, label: string, href: string, allowed: boolean): BriefingSource => ({ id, label, href, at: null, state: allowed ? "missing" : "forbidden", note: allowed ? "Chưa có dữ liệu." : "Tài khoản không có quyền xem nguồn này." });
  const roster = source("riders", "Danh bạ rider", access.riders ? "/riders" : "/realtime-dashboard", access.riders || access.delivery);
  const delivery = source("delivery", "Delivery Realtime", "/realtime-dashboard", access.delivery);
  const pickup = source("pickup", "Pickup Realtime", "/pickup-realtime", access.pickup);
  const team = source("team", "Lịch FTE", "/team", access.team);
  input.sources = [roster, delivery, pickup, team];
  // Do not create a privileged client or query a source before checking its page access.
  const db = roster.state !== "forbidden" || access.delivery ? await createClient() : null;
  async function attempt(target: BriefingSource, read: () => Promise<void>) {
    if (target.state === "forbidden") return;
    try { await read(); } catch {
      target.state = "error"; target.note = "Không tải được nguồn. Mở trang nguồn để kiểm tra hoặc thử tải lại.";
    }
  }
  const profiles = attempt(roster, async () => {
    input.profiles = (await rosterCache.load("roster", () => readAllPages<BriefingProfile>((from, to) => db!.from("riders")
      .select("rider_code,full_name,kv,status,delivery_district,delivery_ward").in("kv", OPERATING_AREAS).order("id").range(from, to).abortSignal(signal ?? AbortSignal.timeout(30000)), 1000))).value;
    roster.state = "ready"; roster.at = new Date().toISOString(); roster.note = "Thời điểm đọc danh bạ; chưa phải thời điểm snapshot giao hàng.";
  });
  await Promise.all([
    profiles,
    attempt(delivery, async () => {
      const headQuery = () => db!.from("realtime_delivery_riders").select("snapshot_id,snapshot_at").eq("work_date", day).order("snapshot_at", { ascending: false }).limit(1).maybeSingle();
      const head = await headQuery(); if (head.error) throw head.error;
      if (!head.data) return;
      const rows = await readAllPages<DeliveryBriefRow>((from, to) => db!.from("realtime_delivery_riders")
        .select("driver_id,driver_name,total_assigned,delivered,idle_delivery_seconds").eq("work_date", day).eq("snapshot_id", head.data!.snapshot_id).order("driver_id").range(from, to).abortSignal(signal ?? AbortSignal.timeout(30000)), 1000);
      const check = await headQuery();
      if (check.error || check.data?.snapshot_id !== head.data.snapshot_id) throw Error("Snapshot changed");
      input.delivery = rows; delivery.at = head.data.snapshot_at; delivery.state = snapshotState(delivery.at, day, now);
      delivery.note = delivery.state === "ready" ? "Toàn bộ snapshot trong ngày, ghép rider KV1–KV5." : "Snapshot quá 20 phút hoặc thời điểm không hợp lệ; chưa dùng cho cảnh báo vận hành.";
    }),
    attempt(pickup, async () => {
      // Compose the existing authenticated read endpoint to keep its full-fleet/fallback rules.
      const { GET } = await import("@/app/api/pickup-realtime/route");
      const response = await GET(new Request("http://localhost/api/pickup-realtime"));
      if (!response.ok) throw Error("Pickup unavailable");
      const payload = await response.json() as { riders: PickupRider[]; riderSnapshotAt: string | null; riderStale?: boolean };
      input.pickup = payload.riders; pickup.at = payload.riderSnapshotAt;
      pickup.state = snapshotState(pickup.at, day, now);
      if (payload.riderStale && pickup.state === "ready") pickup.state = "stale";
      pickup.note = pickup.state === "ready" ? "Số liệu theo rider; lượt gán có thể trùng đơn giữa các rider." : "Chưa có snapshot Pickup mới trong ngày; chưa dùng để kết luận tiến độ.";
    }),
    attempt(team, async () => {
      const data = await loadTeam(day, addDays(day, 1));
      input.team = { staff: data.staff, shifts: data.shifts }; team.state = "ready"; team.at = new Date().toISOString();
      team.note = "Thời điểm đọc lịch. Chỉ FTE hiện tại; ca kèm nghỉ và mã chưa rõ được tách riêng. Coverage nhiều KV không cộng trùng trong tổng toàn đội.";
    }),
  ]);
  if (roster.state !== "ready" && delivery.state === "ready") { delivery.state = "error"; delivery.note = "Chưa ghép được danh bạ rider; không tính tổng KV từ dữ liệu chưa đủ."; }
  return buildBriefing(input, question);
}
