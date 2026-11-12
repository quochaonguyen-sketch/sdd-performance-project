import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canViewPage } from "@/lib/auth/page-access";
import { sourceAllowed } from "@/lib/data-sources/catalog";
import { createAdminClient } from "@/lib/supabase/admin";
import { seatalkBotConfig } from "@/lib/wh/seatalk-bot";
import { whSeatalkImage } from "@/lib/wh/seatalk-image";
import { loadWhSeatalkReport, sendWhSeatalkReport, whSeatalkFailure as fail, whSeatalkHeaders as headers } from "@/lib/wh/seatalk-send";

export const maxDuration = 60;

async function authorize() {
  const context = await getCurrentUserContext();
  if (!context) return fail("Chưa đăng nhập.", 401);
  const { role, page_access, permissions } = context.profile;
  if (!canViewPage(role, page_access, "wh_tracking") || !sourceAllowed(role, permissions, "wh_tracking")) {
    return fail("Không có quyền gửi báo cáo HV.", 403);
  }
}

export async function GET(request: Request) {
  const denied = await authorize();
  if (denied) return denied;
  const report = await loadWhSeatalkReport(createAdminClient());
  if (report instanceof Response) return report;
  const params = new URL(request.url).searchParams;
  const image = params.get("image");
  if (image !== null) {
    const index = Number(image);
    if (params.get("snapshotAt") !== report.snapshotAt) return fail("Dữ liệu HV đã cập nhật. Hãy tải lại bản xem trước.", 409);
    if (!/^\d+$/.test(image) || index > report.riders.length) return fail("Không tìm thấy trang báo cáo.", 404);
    return whSeatalkImage(report, index);
  }
  return Response.json({
    snapshotAt: report.snapshotAt, stamp: report.stamp, orders: report.totals.total,
    images: 1 + report.riders.length, configured: !!seatalkBotConfig(),
  }, { headers });
}

export async function POST(request: Request) {
  const denied = await authorize();
  if (denied) return denied;
  const bot = seatalkBotConfig();
  if (!bot) return fail("Máy chủ chưa cấu hình SeaTalk Bot cho báo cáo HV.", 503);
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return fail("Yêu cầu gửi báo cáo phải dùng JSON.", 415);
  }
  const input = await request.json().catch(() => null);
  if (typeof input?.snapshotAt !== "string") return fail("Hãy mở bản xem trước trước khi gửi.", 400);
  const admin = createAdminClient();
  const report = await loadWhSeatalkReport(admin);
  if (report instanceof Response) return report;
  if (input.snapshotAt !== report.snapshotAt) return fail("Dữ liệu HV đã cập nhật. Hãy tải lại bản xem trước.", 409);
  return sendWhSeatalkReport(admin, bot, report, { retryUnconfirmed: input.retryUnconfirmed === true });
}
