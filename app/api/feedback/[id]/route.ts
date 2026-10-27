import { z } from "zod";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewSchema } from "@/lib/feedback/model";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getCurrentUserContext();
  if (!context) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  if (context.profile.role !== "admin") return Response.json({ error: "Chỉ quản trị viên được xử lý phản hồi." }, { status: 403 });
  const { id } = await params;
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !parsed.success) return Response.json({ error: "Nội dung cập nhật không hợp lệ." }, { status: 400 });
  const { data, error } = await createAdminClient().from("user_feedback").update({ ...parsed.data, updated_at: new Date().toISOString() }).eq("id", id).select("id").maybeSingle();
  if (error) return Response.json({ error: "Chưa lưu được trạng thái." }, { status: 500 });
  if (!data) return Response.json({ error: "Không tìm thấy phản hồi." }, { status: 404 });
  return Response.json({ success: true });
}
