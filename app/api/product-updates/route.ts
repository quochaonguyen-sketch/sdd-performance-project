import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateSchema } from "@/lib/feedback/model";

export async function GET() {
  const context = await getCurrentUserContext();
  if (!context) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const client = createAdminClient();
  const [{ data, error }, privateNotifications] = await Promise.all([
    client.from("product_updates").select("id,title,content,created_at").order("created_at", { ascending: false }).limit(50),
    client.from("feedback_notifications").select("id,feedback_id,title,response,status,read_at,created_at").eq("user_id", context.user.id).order("created_at", { ascending: false }).limit(50),
  ]);
  if (error) return Response.json({ error: "Không tải được thông báo." }, { status: 500 });
  const ids = (data ?? []).map(item => item.id);
  const reads = ids.length ? await client.from("product_update_reads").select("update_id").eq("user_id", context.user.id).in("update_id", ids) : { data: [], error: null };
  if (reads.error) return Response.json({ error: "Không tải được trạng thái đã đọc." }, { status: 500 });
  if (privateNotifications.error) return Response.json({ error: "Không tải được thông báo phản hồi." }, { status: 500 });
  const readIds = new Set((reads.data ?? []).map(item => item.update_id));
  return Response.json({ updates: (data ?? []).map(item => ({ ...item, read: readIds.has(item.id) })), feedbackNotifications: (privateNotifications.data ?? []).map(item => ({ ...item, read: !!item.read_at })) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  if (context.profile.role !== "admin") return Response.json({ error: "Chỉ quản trị viên được đăng thông báo." }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Tiêu đề cần 3–160 ký tự, nội dung 10–5.000 ký tự." }, { status: 400 });
  const { error } = await createAdminClient().from("product_updates").insert({ ...parsed.data, author_id: context.user.id });
  if (error) return Response.json({ error: "Chưa đăng được thông báo." }, { status: 500 });
  return Response.json({ success: true }, { status: 201 });
}
