import { NextResponse } from "next/server";
import { processAttendanceSheetSync } from "@/lib/google/attendance-sheet-sync";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canEditStaff } from "@/lib/auth/page-access";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

async function sync(retryNow = false) {
  const result = await processAttendanceSheetSync(300, null, retryNow)
    .catch(() => ({ success: false, queued: 0, synced: 0, error: "Chưa xử lý được hàng đợi lịch OFF." }));
  return NextResponse.json(result);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  return sync();
}

export async function POST() {
  const context = await getCurrentUserContext();
  if (!context) return NextResponse.json({ success: false, error: "Chưa đăng nhập." }, { status: 401 });
  if (!canEditStaff(context.profile.role, context.profile.page_access)) {
    return NextResponse.json({ success: false, error: "Bạn không có quyền đồng bộ lịch rider." }, { status: 403 });
  }
  return sync(true);
}
