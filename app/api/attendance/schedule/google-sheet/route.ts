import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { createAttendanceClient } from "@/lib/attendance/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createPrivateKey, createSign } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canEditRiderSchedule } from "@/lib/auth/page-access";
import { loadRoleAccess } from "@/lib/auth/role-access-server";
import { invalidateAttendanceCache } from "@/lib/cache/operations-cache";
import { withAttendanceSheetWriter } from "@/lib/google/attendance-sheet-sync";
import { assertOffScheduleHeaders, offScheduleStatus, parseOffScheduleDate, resolveOffScheduleSpreadsheetId } from "@/lib/google/off-schedule";

const bodySchema = z.object({
  sheet_url: z.url().max(1000),
  range_mode: z.enum(["week", "month"]),
  anchor_date: z.iso.date(),
});
type Status = NonNullable<ReturnType<typeof offScheduleStatus>>;

async function adminSession() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { admin, role: profile?.role ?? "viewer", user };
}

function syncRange(mode: "week" | "month", anchor: string) {
  const date = new Date(`${anchor}T00:00:00Z`);
  if (mode === "month") {
    const start = `${anchor.slice(0, 7)}-01`;
    const endDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    return { start, end: endDate.toISOString().slice(0, 10) };
  }
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  const start = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { start, end: date.toISOString().slice(0, 10) };
}

function base64Url(value: string | Buffer) { return Buffer.from(value).toString("base64url"); }
function cleanCredential(value: string | undefined) {
  let clean = value?.trim() ?? "";
  if (clean.endsWith(",")) clean = clean.slice(0, -1).trim();
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) clean = clean.slice(1, -1);
  return clean.replace(/\\n/g, "\n").trim();
}
async function googleAccessToken() {
  const email = cleanCredential(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const privateKey = cleanCredential(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
  if (!email || !privateKey) throw new Error("Chưa cấu hình Google Service Account trên máy chủ");
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${claims}`;
  let key;
  try { key = createPrivateKey(privateKey); }
  catch { throw new Error("Private key của Google Service Account không đúng định dạng"); }
  const signer = createSign("RSA-SHA256"); signer.update(unsigned); signer.end();
  const assertion = `${unsigned}.${base64Url(signer.sign(key))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), cache: "no-store" });
  const result = await response.json().catch(() => null) as { access_token?: string; error_description?: string } | null;
  if (!response.ok || !result?.access_token) throw new Error(result?.error_description ?? "Không thể xác thực Google Service Account");
  return result.access_token;
}

export async function GET() {
  const session = await adminSession();
  if (!session) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditRiderSchedule(session.role, await loadRoleAccess(session.role))) return NextResponse.json({ success: false, error: "Bạn không có quyền đồng bộ lịch" }, { status: 403 });
  const email = cleanCredential(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) || null;
  return NextResponse.json({ success: true, configured: Boolean(email && cleanCredential(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)), service_account_email: email });
}

export async function POST(request: Request) {
  const session = await adminSession();
  if (!session) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditRiderSchedule(session.role, await loadRoleAccess(session.role))) return NextResponse.json({ success: false, error: "Bạn không có quyền đồng bộ lịch" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Link Google Sheet không hợp lệ" }, { status: 400 });
  const id = resolveOffScheduleSpreadsheetId();
  if (!id) return NextResponse.json({ success: false, error: "Chưa thiết lập Google Sheet lịch rider." }, { status: 503 });
  try {
    resolveOffScheduleSpreadsheetId(parsed.data.sheet_url);
  } catch {
    return NextResponse.json({ success: false, error: "Link không khớp với file Google Sheet lịch rider đã cấu hình." }, { status: 400 });
  }
  const range = syncRange(parsed.data.range_mode, parsed.data.anchor_date);
  try {
    const attendance = createAttendanceClient();
    const result = await withAttendanceSheetWriter(attendance, () => pullOffSchedule(session, attendance, id, range, request));
    return result ?? NextResponse.json({ success: false, error: "Có lượt đồng bộ đang chạy. Hãy thử lại sau." }, { status: 409 });
  } catch {
    return NextResponse.json({ success: false, error: "Chưa bắt đầu được lượt lấy lịch OFF." }, { status: 503 });
  }
}

async function pullOffSchedule(session: NonNullable<Awaited<ReturnType<typeof adminSession>>>, attendance: ReturnType<typeof createAttendanceClient>, id: string,
  range: { start: string; end: string }, request: Request) {
  let rows: unknown[][];
  try {
    const token = await googleAccessToken();
    const range = encodeURIComponent("OFF!A:D");
    const source = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]) });
    const result = await source.json().catch(() => null) as { values?: unknown[][]; error?: { message?: string } } | null;
    if (!source.ok) throw new Error(result?.error?.message ?? "Google Sheets API từ chối truy cập");
    if (!result?.values?.length) throw Error("Tab OFF không có tiêu đề hoặc không đọc được dữ liệu.");
    rows = result.values;
    assertOffScheduleHeaders(rows[0]);
  } catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Không đọc được sheet OFF" }, { status: 400 }); }

  const fallbackYear = Number(range.start.slice(0, 4));
  const issues: Array<{ row: number; error: string }> = [];
  const records = new Map<string, { rider_code: string; work_date: string; status: Status; source_row: number }>();
  const seen = new Set<string>();
  rows.slice(1).forEach((row, index) => {
    const sourceRow = index + 2;
    const code = String(row[0] ?? "").trim();
    if (!code) return;
    const day = parseOffScheduleDate(row[2], fallbackYear);
    if (!day || !z.iso.date().safeParse(day).success) { issues.push({ row: sourceRow, error: "Ngày không hợp lệ" }); return; }
    if (day < range.start || day > range.end) return;
    const key = `${code}|${day}`;
    seen.add(key);
    const status = offScheduleStatus(row[3]);
    if (!status) { issues.push({ row: sourceRow, error: "Trạng thái không hợp lệ" }); return; }
    records.set(key, { rider_code: code, work_date: day, status, source_row: sourceRow });
  });

  const codes = Array.from(new Set(Array.from(records.values(), (item) => item.rider_code)));
  const riderMap = new Map<string, string>();
  for (let offset = 0; offset < codes.length; offset += 150) {
    const { data: riders, error } = await session.admin.from("riders").select("id,rider_code").in("kv", OPERATING_AREAS)
      .in("rider_code", codes.slice(offset, offset + 150));
    if (error) return NextResponse.json({ success: false, error: "Chưa đối chiếu được rider." }, { status: 502 });
    for (const rider of riders ?? []) riderMap.set(rider.rider_code, rider.id);
  }
  const missing = codes.filter((code) => !riderMap.has(code));
  const missingSet = new Set(missing);
  for (const item of records.values()) {
    if (missingSet.has(item.rider_code)) issues.push({ row: item.source_row, error: `ID ${item.rider_code} chưa tồn tại trên web` });
  }

  const payload = Array.from(records.values())
    .filter((item) => riderMap.has(item.rider_code))
    .map((item) => ({ rider_code: item.rider_code, work_date: item.work_date, status: item.status, rider_id: riderMap.get(item.rider_code) }));
  if (request.signal.aborted) return new NextResponse(null, { status: 499 });
  const { data: result, error } = await attendance.rpc("import_google_rider_schedule", {
    p_rows: payload, p_seen: [...seen], p_from: range.start, p_to: range.end, p_spreadsheet: id,
  });
  if (error || !result) return NextResponse.json({ success: false, error: "Chưa lưu được lịch từ Google Sheet." }, { status: 502 });

  // Xóa cache lịch để trang Attendance thấy ngay dữ liệu mới thay vì chờ 30s TTL
  {
    const startMonth = range.start.slice(0, 7);
    const endMonth = range.end.slice(0, 7);
    invalidateAttendanceCache(startMonth);
    if (endMonth !== startMonth) invalidateAttendanceCache(endMonth);
  }

  const skipped = issues.length + Number(result.pending ?? 0);
  await session.admin.from("activity_logs").insert({ entity_type: "attendance_schedule", action: "synced", message: `Synced OFF sheet: ${result.imported} rows`, raw_data: { spreadsheet_id: id, ...result, skipped } });
  return NextResponse.json({ success: true, ...result, skipped, errors: issues, range });
}
