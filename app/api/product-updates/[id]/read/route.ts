import { z } from "zod";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getCurrentUserContext();
  if (!context) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Thông báo không hợp lệ." }, { status: 400 });
  const { error } = await createAdminClient().from("product_update_reads").upsert({ user_id: context.user.id, update_id: id }, { onConflict: "user_id,update_id" });
  if (error) return Response.json({ error: "Chưa đánh dấu được thông báo." }, { status: 500 });
  return Response.json({ success: true });
}
