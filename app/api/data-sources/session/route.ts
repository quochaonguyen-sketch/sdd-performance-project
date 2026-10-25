import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { DATA_SOURCES, sourceAllowed } from "@/lib/data-sources/catalog";
import { validCredentialEnvelope } from "@/lib/data-sources/spx-credentials";

export async function GET() {
  const context = await getCurrentUserContext().catch(() => null);
  if (!context) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!DATA_SOURCES.some(s => sourceAllowed(context.profile.role, context.profile.permissions, s.id))) {
    return NextResponse.json({ error: "Không có quyền quản lý nguồn dữ liệu" }, { status: 403 });
  }
  const { data, error } = await createAdminClient().from("data_source_spx_sessions")
    .select("worker_id,cookie_present,account_saved,profile_ready,cookie_updated_at,cookie_expires_at,cookie_expiry_kind,checked_at,status,requested_at,finished_at,public_key,key_id")
    .order("checked_at", { ascending: false }).limit(1);
  if (error) return NextResponse.json({ error: "Chưa có trạng thái phiên SPX. Cần cập nhật cấu hình và worker trên máy chủ." }, { status: 503 });
  return NextResponse.json({ sessions: data, canRefresh: context.profile.role === "admin", serverTime: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ" }, { status: 403 });
  const context = await getCurrentUserContext().catch(() => null);
  if (!context) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (context.profile.role !== "admin") return NextResponse.json({ error: "Chỉ Admin được làm mới phiên SPX dùng chung" }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 12000) return NextResponse.json({ error: "Yêu cầu quá lớn" }, { status: 413 });
  let body;
  try { body = JSON.parse(raw); } catch { body = null; }
  if (!body || !["refresh", "save_credentials"].includes(body.action) || typeof body.worker !== "string" || !/^[\w.-]{1,200}$/.test(body.worker)
    || (body.action === "save_credentials" && !validCredentialEnvelope(body.envelope))) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 400 });
  }
  const { data, error } = await createAdminClient().rpc("request_spx_session_refresh", { p_worker: body.worker, p_actor: context.user.id, p_envelope: body.action === "save_credentials" ? body.envelope : null });
  if (error) return NextResponse.json({ error: "Không gửi được yêu cầu. Kiểm tra worker đang kết nối rồi thử lại." }, { status: 503 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
