import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canAccessPickupManagement } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { vietnamDay } from "@/lib/data-sources/catalog";
import { readOperationsArchive } from "@/lib/supabase/operations-archive";

export async function GET(request: Request) {
  const context = await getCurrentUserContext().catch(() => null);
  if (!context) return Response.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canAccessPickupManagement(context.profile.role, context.profile.permissions)) return Response.json({ error: "Không có quyền xem pickup" }, { status: 403 });
  const day = new URL(request.url).searchParams.get("date") ?? vietnamDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day || day > vietnamDay()) return Response.json({ error: "Ngày xem không hợp lệ" }, { status: 400 });
  const headers = { "Cache-Control": "private, no-store" };
  const db = createAdminClient();
  const archived = await readOperationsArchive<unknown[]>(db, "pickup_cot", day, day, request.signal);
  if (archived) return Response.json({ day, snapshots: archived.flat() }, { headers });
  const { data, error } = await db.from("pickup_cot_oh_snapshots")
    .select("cot,cutoff_at,source_started_at,snapshot_at,riders").eq("report_date", day).order("cot");
  if (error) return Response.json({ error: "Chưa đọc được snapshot OH theo COT. Vui lòng thử lại." }, { status: 503, headers });
  return Response.json({ day, snapshots: data ?? [] }, { headers });
}
