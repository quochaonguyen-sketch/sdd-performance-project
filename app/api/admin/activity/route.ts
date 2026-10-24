import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

const filters = z.object({
  actor: z.union([z.literal("all"), z.string().uuid()]).default("all"),
  type: z.enum(["all", "login", "page_view", "insert", "update", "delete", "permission_change", "member_created", "member_deleted", "logout"]).default("all"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (context.profile.role !== "admin") return NextResponse.json({ error: "Chỉ admin được xem nhật ký" }, { status: 403 });
  const parsed = filters.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Bộ lọc không hợp lệ" }, { status: 400 });
  const { actor, type, page, date } = parsed.data;
  const admin = createAdminClient();
  let query = admin.from("user_activity_logs").select("*", { count: "exact" });
  if (actor !== "all") query = query.eq("actor_id", actor);
  if (type !== "all") query = query.eq("event_type", type);
  if (date) {
    const begin = new Date(`${date}T00:00:00+07:00`);
    if (!Number.isFinite(begin.getTime())) return NextResponse.json({ error: "Ngày không hợp lệ" }, { status: 400 });
    query = query.gte("created_at", begin.toISOString()).lt("created_at", new Date(begin.getTime() + 86400000).toISOString());
  }
  const [logs, members] = await Promise.all([
    query.order("created_at", { ascending: false }).order("id").range((page - 1) * 40, page * 40 - 1),
    admin.rpc("user_activity_members"),
  ]);
  const error = logs.error ?? members.error;
  if (error) return NextResponse.json({ error: "Không tải được nhật ký người dùng" }, { status: 500 });
  return NextResponse.json({ events: logs.data, members: members.data, total: logs.count ?? 0, page, page_size: 40 });
}
