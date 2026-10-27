import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { feedbackSchema } from "@/lib/feedback/model";
import { FEEDBACK_PAGE_SIZE, feedbackListSchema, feedbackSearchFilter } from "@/lib/feedback/query";

export async function GET(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const isAdmin = context.profile.role === "admin";
  const parsed = feedbackListSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Trang, trạng thái hoặc từ khóa không hợp lệ." }, { status: 400 });
  const { page, status, search, feedback_id } = parsed.data;
  const offset = (page - 1) * FEEDBACK_PAGE_SIZE;
  let query = createAdminClient().from("user_feedback").select("id,user_id,author_name,kind,title,content,page_path,status,response,created_at", { count: "exact" }).order("created_at", { ascending: false }).order("id", { ascending: false });
  if (!isAdmin) query = query.eq("user_id", context.user.id);
  if (feedback_id) query = query.eq("id", feedback_id);
  if (status !== "ALL") query = query.eq("status", status);
  if (search) query = query.or(feedbackSearchFilter(search));
  const { data, error, count } = await query.range(offset, offset + FEEDBACK_PAGE_SIZE - 1).abortSignal(request.signal);
  if (error) return Response.json({ error: "Không tải được phản hồi. Vui lòng thử lại." }, { status: 500 });
  return Response.json({ feedback: data ?? [], isAdmin, total: count ?? 0, page, pageSize: FEEDBACK_PAGE_SIZE }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const parsed = feedbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Tiêu đề cần 3–160 ký tự, nội dung 10–5.000 ký tự và đường dẫn hợp lệ." }, { status: 400 });
  const { error } = await createAdminClient().from("user_feedback").insert({ ...parsed.data, user_id: context.user.id, author_name: context.profile.full_name || context.user.email });
  if (error) return Response.json({ error: "Chưa gửi được phản hồi. Nội dung vẫn được giữ để thử lại." }, { status: 500 });
  return Response.json({ success: true }, { status: 201 });
}
