import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canEditRiderSchedule } from "@/lib/auth/page-access";
import { loadRoleAccess } from "@/lib/auth/role-access-server";
import { getCachedAttendanceSchedule, getCachedRiders, invalidateAttendanceCache } from "@/lib/cache/operations-cache";
import {
  processAttendanceSheetSync,
} from "@/lib/google/attendance-sheet-sync";
import type { Rider } from "@/types";
import { createAttendanceClient } from "@/lib/attendance/database";
import { scheduleStatuses } from "@/lib/attendance/statuses";
import { OPERATING_AREAS } from "@/lib/locations/operating-areas";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const dateSchema = z.iso.date();
const scheduleStatusSchema = z.enum(["", ...scheduleStatuses]);

const updateSchema = z.object({
  sheet_url: z.string().trim().max(1000).optional().nullable(),
  updates: z
    .array(
      z.object({
        rider_id: z.string().uuid(),
        work_date: dateSchema,
        status: scheduleStatusSchema,
        shift: z.string().trim().max(50).optional().nullable(),
        note: z.string().trim().max(500).optional().nullable(),
      }),
    )
    .min(1)
    .max(1000),
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

async function fetchAll<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const month = params.get("month");
  const parsedMonth = monthSchema.safeParse(month);
  const area = z.enum(OPERATING_AREAS).safeParse(params.get("area"));
  if (!area.success) return NextResponse.json({ success: false, error: "Chọn một khu vực từ KV1 đến KV5." }, { status: 400 });
  if (!parsedMonth.success) {
    return NextResponse.json({ success: false, error: "Tháng không hợp lệ" }, { status: 400 });
  }

  const { start, end } = monthRange(parsedMonth.data);

  try {
    const { data, cache } = await getCachedAttendanceSchedule(parsedMonth.data, area.data, async () => {
      const { data: riders } = await getCachedRiders(area.data);
      const attendance = createAttendanceClient();
      const batches = Array.from({ length: Math.ceil(riders.length / 100) }, (_, index) =>
        riders.slice(index * 100, (index + 1) * 100).map(rider => rider.rider_code));
      const logs = (await Promise.all(batches.map(codes => fetchAll((from, to) =>
        attendance.from("attendance_logs").select("*").in("rider_code", codes)
          .gte("work_date", start).lte("work_date", end).neq("status", "ON")
          .order("id").range(from, to),
      )))).flat();
      return { riders: [...riders].sort(compareScheduleRiders), logs };
    }, params.get("fresh") === "1");

    return NextResponse.json({
      success: true,
      can_edit: canEditRiderSchedule(session.role, await loadRoleAccess(session.role)),
      riders: data.riders,
      logs: data.logs,
      cache,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Không thể tải lịch rider" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canEditRiderSchedule(session.role, await loadRoleAccess(session.role))) {
    return NextResponse.json({ success: false, error: "Bạn không có quyền sửa lịch rider" }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Dữ liệu lịch không hợp lệ", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updates = [...new Map(parsed.data.updates.map(item => [
    item.rider_id + ":" + item.work_date,
    { ...item, status: item.status || "ON" },
  ])).values()];
  const ids = [...new Set(updates.map(row => row.rider_id))];
  const riderCodes = new Map<string, string>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await session.admin.from("riders").select("id,rider_code")
      .in("kv", OPERATING_AREAS).in("id", ids.slice(offset, offset + 100));
    if (error) return NextResponse.json({ success: false, error: "Chưa đối chiếu được rider." }, { status: 503 });
    for (const rider of data) riderCodes.set(rider.id, rider.rider_code);
  }
  if (riderCodes.size !== ids.length) return NextResponse.json({ success: false, error: "Có rider không hợp lệ." }, { status: 400 });
  const { data: saved, error } = await createAttendanceClient().rpc("save_rider_schedule", {
    p_changes: updates.map(row => ({ ...row, rider_code: riderCodes.get(row.rider_id) })),
  });
  if (error || !saved) {
    return NextResponse.json({ success: false, error: "Chưa lưu được lịch rider. Kiểm tra rider và thử lại." }, { status: 400 });
  }
  for (const month of new Set(updates.map(item => item.work_date.slice(0, 7)))) invalidateAttendanceCache(month);
  const sheetSync = await processAttendanceSheetSync(300, parsed.data.sheet_url).catch(() => ({
    success: false, synced: 0, queued: 0, error: "Thay đổi đã lưu và đang chờ gửi lên Google Sheet.",
  }));
  await session.admin.from("activity_logs").insert({
    entity_type: "attendance_schedule",
    action: "updated",
    message: `Updated ${parsed.data.updates.length} rider schedule cells`,
    raw_data: {
      count: parsed.data.updates.length,
      dates: Array.from(new Set(parsed.data.updates.map((item) => item.work_date))),
      google_sheet: sheetSync,
    },
  });

  return NextResponse.json({
    success: true,
    ...saved,
    sheet_sync: sheetSync,
  });
}

function compareScheduleRiders(a: Rider, b: Rider) {
  return (
    String(a.kv ?? "").localeCompare(String(b.kv ?? ""), "vi") ||
    String(a.cot ?? "").localeCompare(String(b.cot ?? ""), "vi", { numeric: true }) ||
    String(a.full_name ?? a.rider_code).localeCompare(String(b.full_name ?? b.rider_code), "vi")
  );
}
