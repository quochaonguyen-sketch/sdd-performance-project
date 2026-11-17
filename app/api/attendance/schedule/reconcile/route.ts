import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { createAttendanceClient } from "@/lib/attendance/database";
import { scheduleStatuses } from "@/lib/attendance/statuses";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canEditRiderSchedule } from "@/lib/auth/page-access";
import { loadRoleAccess } from "@/lib/auth/role-access-server";
import { withAttendanceSheetWriter } from "@/lib/google/attendance-sheet-sync";
import { invalidateAttendanceCache } from "@/lib/cache/operations-cache";
import { resolveOffScheduleSpreadsheetId, syncScheduleUpdatesToGoogleSheet, type GoogleScheduleStatus } from "@/lib/google/off-schedule";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

const bodySchema = z.object({
  month: monthSchema,
  sheet_url: z.string().trim().max(1000).optional().nullable(),
});

async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { user, role: profile?.role ?? "viewer", admin };
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

function normalizeGoogleScheduleStatus(value: string | null | undefined): GoogleScheduleStatus {
  const normalized = value?.trim().toUpperCase() ?? "";
  return scheduleStatuses.find(status => status === normalized) ?? "";
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!canEditRiderSchedule(session.role, await loadRoleAccess(session.role))) {
    return NextResponse.json({ success: false, error: "Bạn không có quyền sửa lịch rider" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Dữ liệu tháng không hợp lệ" }, { status: 400 });
  }

  const { start, end } = monthRange(parsed.data.month);
  const attendance = createAttendanceClient();
  const { data: rows, error } = await attendance
    .from("attendance_logs")
    .select("rider_code, work_date, status")
    .gte("work_date", start)
    .lte("work_date", end)
    .order("work_date", { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const riderCodes = Array.from(new Set((rows ?? []).map((row) => row.rider_code).filter(Boolean)));
  const { data: riders, error: riderError } = riderCodes.length
    ? await session.admin.from("riders").select("rider_code, full_name").in("kv", OPERATING_AREAS).in("rider_code", riderCodes)
    : { data: [], error: null };

  if (riderError) {
    return NextResponse.json({ success: false, error: riderError.message }, { status: 500 });
  }

  const riderNameMap = new Map((riders ?? []).map((rider) => [rider.rider_code, rider.full_name ?? ""]));
  const updates = (rows ?? []).map((row) => ({
    rider_code: row.rider_code,
    rider_name: riderNameMap.get(row.rider_code) ?? "",
    work_date: row.work_date,
    status: normalizeGoogleScheduleStatus(row.status),
  })).filter(row => row.status && riderNameMap.has(row.rider_code));

  try {
    const spreadsheetId = resolveOffScheduleSpreadsheetId(parsed.data.sheet_url ?? null);
    if (!spreadsheetId) throw new Error("Chưa chọn Google Sheet lịch OFF để đồng bộ.");

    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]);
    const result = await withAttendanceSheetWriter(attendance, () => syncScheduleUpdatesToGoogleSheet(spreadsheetId, updates, signal));
    if (!result) return NextResponse.json({ success: false, error: "Có lượt đồng bộ lịch OFF đang chạy." }, { status: 409 });
    invalidateAttendanceCache(parsed.data.month);

    await session.admin.from("activity_logs").insert({
      entity_type: "attendance_schedule",
      action: "bulk_sync_to_google_sheet",
      message: `Bulk synced ${updates.length} attendance rows to OFF sheet for ${parsed.data.month}`,
      raw_data: { month: parsed.data.month, spreadsheet_id: spreadsheetId, result },
    });

    return NextResponse.json({
      success: true,
      month: parsed.data.month,
      updated: result.updated,
      appended: result.appended,
      cleared: result.cleared,
      spreadsheet_id: result.spreadsheet_id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Không thể đồng bộ lịch web lên Google Sheet",
      },
      { status: 400 },
    );
  }
}
