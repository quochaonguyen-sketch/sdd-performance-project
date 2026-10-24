import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { recordUserActivity } from "@/lib/audit/events";

const eventSchema = z.object({
  event_id: z.string().uuid(),
  path: z.string().max(250).regex(/^\/(?!\/)[a-zA-Z0-9/_-]*$/),
  event_type: z.enum(["page_view", "logout"]).default("page_view"),
});

export async function POST(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Sự kiện không hợp lệ" }, { status: 400 });
  await recordUserActivity(context.user, { ...parsed.data, summary: parsed.data.event_type === "logout" ? "Đăng xuất" : `Truy cập ${parsed.data.path}` });
  return NextResponse.json({ success: true });
}
