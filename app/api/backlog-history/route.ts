import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canAccessPickupManagement } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { validHistoryDay, vietnamDay } from "@/lib/dashboard/backlog-history";

export async function GET(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canAccessPickupManagement(context.profile.role, context.profile.permissions)) return NextResponse.json({ error: "Không có quyền xem tồn" }, { status: 403 });
  const query = new URL(request.url).searchParams;
  const source = query.get("source");
  if (source !== "pickup" && source !== "delivery") return NextResponse.json({ error: "Nguồn tồn không hợp lệ" }, { status: 400 });
  const db = createAdminClient();
  const headers = { "Cache-Control": "private, no-store" };
  if (query.get("mode") === "hourly") {
    const day = query.get("day") ?? vietnamDay();
    if (!validHistoryDay(day)) return NextResponse.json({ error: "Ngày phân tích không hợp lệ" }, { status: 400 });
    const { data, error } = await db.rpc("read_backlog_hourly", { p_source: source, p_day: day });
    if (error) return NextResponse.json({ error: "Không đọc được báo cáo theo giờ" }, { status: 503 });
    return NextResponse.json(data, { headers });
  }
  const id = query.get("snapshot");
  if (id) {
    if (!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) return NextResponse.json({ error: "Mã snapshot không hợp lệ" }, { status: 400 });
    const { data, error } = await db.rpc("read_backlog_snapshot", { p_id: id, p_source: source });
    if (error) return NextResponse.json({ error: "Không đọc được pivot lịch sử" }, { status: 503 });
    if (!data) return NextResponse.json({ error: "Không tìm thấy snapshot của nguồn này" }, { status: 404 });
    return NextResponse.json(data, { headers });
  }
  const from = query.get("from") ?? vietnamDay(), to = query.get("to") ?? from;
  if (!validHistoryDay(from) || !validHistoryDay(to) || from > to || Date.parse(to) - Date.parse(from) > 30 * 86400000) {
    return NextResponse.json({ error: "Chọn khoảng ngày hợp lệ, tối đa 31 ngày mỗi lần" }, { status: 400 });
  }
  const [snapshots, checkpoints] = await Promise.all([
    db.from("backlog_snapshots").select("id,source,source_snapshot_id,source_started_at,source_snapshot_at,captured_at,work_date,slot_at,total_orders")
      .eq("source", source).gte("work_date", from).lte("work_date", to).order("source_snapshot_at", { ascending: false }).limit(501),
    db.from("backlog_checkpoints").select("source,scheduled_for,status,snapshot_id,message")
      .eq("source", source).gte("scheduled_for", `${from}T00:00:00+07:00`).lte("scheduled_for", `${to}T23:59:59.999+07:00`).order("scheduled_for"),
  ]);
  if (snapshots.error || checkpoints.error) return NextResponse.json({ error: "Chưa đọc được lịch sử tồn. Vui lòng thử lại." }, { status: 503 });
  return NextResponse.json({ snapshots: snapshots.data.slice(0, 500), checkpoints: checkpoints.data, truncated: snapshots.data.length > 500 }, { headers });
}
