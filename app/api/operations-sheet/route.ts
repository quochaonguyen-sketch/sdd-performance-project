import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canAccessPickupManagement, canManageRiders } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateRidersCache } from "@/lib/cache/operations-cache";
import { PLAN_TABS, MAX_PLAN_ROWS, parsePlanSheets, buildPlanChanges, type PlanTab } from "@/lib/operations-sheet/schema";
import { loadCurrentPlan, planSpreadsheetId, readPlanFromGoogle } from "@/lib/operations-sheet/service";
import { createPlanPreviewToken, verifyPlanPreviewToken } from "@/lib/operations-sheet/preview-token";

export const runtime = "nodejs";
export const maxDuration = 60;

async function session() {
  const context = await getCurrentUserContext();
  if (!context) return null;
  const { role, permissions } = context.profile;
  return { ...context, rider: canManageRiders(role, permissions), pickup: canAccessPickupManagement(role, permissions) };
}

export async function GET(request: Request) {
  const auth = await session();
  if (!auth) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  if (!auth.rider && !auth.pickup) return NextResponse.json({ success: false, error: "Bạn chưa có quyền quản lý tuyến." }, { status: 403 });
  if (new URL(request.url).searchParams.get("download") !== "data") {
    return NextResponse.json({ success: true, rider: auth.rider, pickup: auth.pickup, serviceAccount: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ?? "", spreadsheetId: process.env.OPERATIONS_SPREADSHEET_ID?.trim() ?? "", googleConfigured: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) });
  }
  try {
    const tabs = (Object.keys(PLAN_TABS) as PlanTab[]).filter(tab => tab === "TUYEN_RIDER" ? auth.rider : auth.pickup);
    const current = await loadCurrentPlan(tabs);
    const workbook = XLSX.utils.book_new();
    for (const tab of tabs) {
      const config = PLAN_TABS[tab];
      const sheet = XLSX.utils.aoa_to_sheet([[...config.headers], ...current[tab].map(row => config.fields.map(field => String(row[field] ?? "")))]);
      sheet["!cols"] = config.fields.map(() => ({ wch: 24 }));
      XLSX.utils.book_append_sheet(workbook, sheet, tab);
    }
    const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return new Response(bytes, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="SDD_du_lieu_tuyen.xlsx"', "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Không xuất được tuyến." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const auth = await session();
  if (!auth) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  if (!auth.rider && !auth.pickup) return NextResponse.json({ success: false, error: "Bạn chưa có quyền quản lý tuyến." }, { status: 403 });
  try {
    const form = await request.formData();
    const action = String(form.get("action") ?? "preview");
    if (!["preview", "apply"].includes(action)) throw new Error("Thao tác không hợp lệ.");
    let sheets: Record<string, unknown[][]>;
    const file = form.get("file");
    if (file instanceof File) {
      if (file.size > 5 * 1024 * 1024 || !/\.xlsx$/i.test(file.name)) throw new Error("Chọn file .xlsx tối đa 5 MB.");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", sheetRows: MAX_PLAN_ROWS + 3 });
      sheets = Object.fromEntries((Object.keys(PLAN_TABS) as PlanTab[]).filter(tab => workbook.Sheets[tab]).map(tab => {
        const sheet = workbook.Sheets[tab];
        const fullRange = sheet["!fullref"] ?? sheet["!ref"];
        if (fullRange && XLSX.utils.decode_range(fullRange).e.r > MAX_PLAN_ROWS) throw new Error(`Tab ${tab} vượt ${MAX_PLAN_ROWS} dòng.`);
        return [tab, XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" })];
      }));
    } else {
      const id = planSpreadsheetId(String(form.get("spreadsheet") ?? process.env.OPERATIONS_SPREADSHEET_ID ?? ""));
      sheets = await readPlanFromGoogle(id, request.signal);
    }
    const parsed = parsePlanSheets(sheets);
    if (parsed.rows.some(row => row.tab === "TUYEN_RIDER" ? !auth.rider : !auth.pickup)) {
      return NextResponse.json({ success: false, error: "File chứa loại tuyến bạn chưa có quyền chỉnh sửa." }, { status: 403 });
    }
    if (parsed.issues.length) return NextResponse.json({ success: false, issues: parsed.issues.slice(0, 100), error: "Hãy sửa các dòng lỗi trước khi đồng bộ." }, { status: 400 });
    const tabs = [...new Set(parsed.rows.map(row => row.tab))];
    const result = buildPlanChanges(parsed.rows, await loadCurrentPlan(tabs));
    if (result.issues.length) return NextResponse.json({ success: false, issues: result.issues.slice(0, 100), error: "Có mã chưa tồn tại trên web." }, { status: 400 });
    if (action === "preview") {
      return NextResponse.json({ success: true, changes: result.changes, rows: parsed.rows.length, token: createPlanPreviewToken(auth.user.id, result.changes) });
    }
    if (!verifyPlanPreviewToken(String(form.get("token") ?? ""), auth.user.id, result.changes)) {
      return NextResponse.json({ success: false, error: "Dữ liệu đã đổi hoặc bản xem trước hết hạn. Hãy xem trước lại." }, { status: 409 });
    }
    if (!result.changes.length) return NextResponse.json({ success: true, applied: 0 });
    const { data, error } = await createAdminClient().rpc("apply_operations_route_plan", { p_actor: auth.user.id, p_changes: result.changes });
    if (error) throw new Error(`Không áp dụng được tuyến: ${error.message}. Kiểm tra SQL operations-route-plan.sql.`);
    invalidateRidersCache();
    return NextResponse.json({ success: true, applied: data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Không đọc được kế hoạch tuyến." }, { status: 400 });
  }
}
