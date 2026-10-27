import { z } from "zod";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getCurrentUserContext();
  if (!context) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Thông báo không hợp lệ." }, { status: 400 });
  const { data, error } = await createAdminClient().from("feedback_notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", context.user.id).select("id").maybeSingle();
  if (error) return Response.json({ error: "Chưa đánh dấu được thông báo." }, { status: 500 });
  if (!data) return Response.json({ error: "Không tìm thấy thông báo." }, { status: 404 });
  return Response.json({ success: true });
}
