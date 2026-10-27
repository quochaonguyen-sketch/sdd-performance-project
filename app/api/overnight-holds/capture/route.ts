import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { overnightCutoffDay } from "@/lib/overnight-holds/dates";
import { captureOvernightHold } from "@/lib/overnight-holds/server";

export async function POST(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  try {
    const body = (await request.json().catch(() => null)) as { day?: string } | null;
    const day = body?.day ?? overnightCutoffDay();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return NextResponse.json({ error: "Ngày không hợp lệ" }, { status: 400 });
    }

    const actor = context.profile.full_name || context.user.email || "user";
    const result = await captureOvernightHold(day, actor);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể chốt danh sách 23h" },
      { status: 500 }
    );
  }
}
