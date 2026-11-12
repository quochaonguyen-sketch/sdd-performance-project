import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canViewPage } from "@/lib/auth/page-access";
import { vietnamDay } from "@/lib/data-sources/catalog";
import { buildLostAnalysis, parseLostAnalysisFilters } from "@/lib/lost/analysis";
import { parseLostFilters, selectLostPage } from "@/lib/lost/list";
import { readLostSnapshot } from "@/lib/lost/list-server";

const headers = { "Cache-Control": "private, no-store" };
const reply = (data: object, status = 200) => Response.json(data, { status, headers });

export async function GET(request: Request) {
  const user = await getCurrentUserContext();
  if (!user) return reply({ error: "Chưa đăng nhập." }, 401);
  if (!canViewPage(user.profile.role, user.profile.page_access, "lost")) return reply({ error: "Bạn không có quyền xem trang này." }, 403);

  const params = new URL(request.url).searchParams;
  const rowNumber = Number(params.get("row"));
  if (params.has("row") && (!Number.isSafeInteger(rowNumber) || rowNumber < 2 || !params.get("shipment"))) {
    return reply({ error: "Thông tin đơn không hợp lệ." }, 400);
  }
  try {
    if (params.get("view") === "analysis") {
      const today = vietnamDay();
      const filters = parseLostAnalysisFilters(params, today);
      if (!filters) return reply({ error: "Chọn khoảng ngày hợp lệ đến hôm nay." }, 400);
      const snapshot = await readLostSnapshot();
      return reply(buildLostAnalysis(snapshot.rowsByNumber.values(), filters, today));
    }
    const snapshot = await readLostSnapshot();
    if (params.has("row")) {
      const row = snapshot.rowsByNumber.get(rowNumber);
      if (!row || row.shipment !== params.get("shipment")) return reply({ error: "Không tìm thấy đơn trong bản đối soát hiện tại." }, 404);
      return reply({ logs: row.logs });
    }
    return reply(selectLostPage(snapshot, parseLostFilters(params)));
  } catch {
    return reply({ error: "Chưa đọc được dữ liệu Lost & Compensated. Hãy thử lại." }, 503);
  }
}
