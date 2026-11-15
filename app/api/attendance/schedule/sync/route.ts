import { NextResponse } from "next/server";
import { processAttendanceSheetSync } from "@/lib/google/attendance-sheet-sync";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canEditStaff } from "@/lib/auth/page-access";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await processAttendanceSheetSync());
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Không thể chạy đồng bộ lịch" }, { status: 500 });
  }
}

export async function POST() {
  const context = await getCurrentUserContext();
  if (!context) return NextResponse.json({ success: false, error: "Chưa đăng nhập." }, { status: 401 });
  if (!canEditStaff(context.profile.role, context.profile.page_access)) {
    return NextResponse.json({ success: false, error: "Bạn không có quyền đồng bộ lịch rider." }, { status: 403 });
  }
  try {
    return NextResponse.json(await processAttendanceSheetSync(300, null, true));
  } catch {
    return NextResponse.json({ success: false, error: "Chưa xử lý được hàng đợi lịch OFF." }, { status: 503 });
  }
}
