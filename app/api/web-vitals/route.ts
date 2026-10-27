import { z } from "zod";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { vitalSampleSchema } from "@/lib/metrics/web-vitals";

export async function POST(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const parsed = z.object({ samples: z.array(vitalSampleSchema).min(1).max(10) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Số liệu không hợp lệ." }, { status: 400 });
  const { error } = await createAdminClient().from("web_vital_samples").upsert(parsed.data.samples, { onConflict: "metric_id,name" });
  return error ? Response.json({ error: "Chưa lưu được số liệu." }, { status: 500 }) : new Response(null, { status: 204 });
}
export async function GET() {
  const context = await getCurrentUserContext();
  if (!context) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  if (context.profile.role !== "admin") return Response.json({ error: "Không có quyền xem số liệu." }, { status: 403 });
  const { data, error } = await createAdminClient().rpc("web_vital_summary");
  return error ? Response.json({ error: "Không tải được số liệu." }, { status: 500 }) : Response.json({ summary: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}
