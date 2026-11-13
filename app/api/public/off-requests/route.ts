import { createAdminClient } from "@/lib/supabase/admin";
import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { vietnamDay } from "@/lib/data-sources/catalog";
import { shiftCalendarDay } from "@/lib/performance/calendar";
import { offIdentity, offRegistrationSchema } from "@/lib/off-registration/model";
import { offRegistrationSpreadsheetId, writeOffRegistration } from "@/lib/off-registration/sheets";

const reply = (body: object, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site" || !request.headers.get("content-type")?.startsWith("application/json")
    || Number(request.headers.get("content-length")) > 16_384) {
    return reply({ error: "Dữ liệu đăng ký không hợp lệ." }, 400);
  }
  const parsed = offRegistrationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "Kiểm tra mã rider, họ tên, email và ngày OFF." }, 400);
  const input = parsed.data;
  const today = vietnamDay();
  const lastDay = shiftCalendarDay(today, 90);
  input.dates = [...new Set(input.dates)].sort();
  if (input.dates.some(date => date < today || date > lastDay)) return reply({ error: "Chọn ngày OFF trong 90 ngày tới." }, 400);
  const sheetId = offRegistrationSpreadsheetId();
  if (!sheetId) return reply({ error: "Trang chưa được kết nối với file đăng ký OFF. Liên hệ quản lý hub." }, 503);

  try {
    const { data: rider, error } = await createAdminClient().from("riders").select("id,rider_code,full_name,status,kv,cot")
      .in("kv", OPERATING_AREAS).ilike("rider_code", input.riderCode).maybeSingle();
    if (error) throw Error("Không đọc được hồ sơ rider.");
    if (!rider?.full_name || String(rider.status).toLowerCase() === "inactive" || offIdentity(rider.full_name) !== offIdentity(input.riderName)) {
      return reply({ error: "Mã rider và họ tên cần khớp với hồ sơ rider đang hoạt động." }, 400);
    }
    const result = await writeOffRegistration(sheetId, input, rider);
    if (result === "duplicate") return reply({ error: "Có ngày đã được đăng ký. Liên hệ quản lý hub nếu cần chỉnh yêu cầu cũ." }, 409);
    return reply({ id: input.id, dates: input.dates, rider: rider.full_name }, 201);
  } catch {
    return reply({ error: "Chưa xác nhận được yêu cầu. Vui lòng thử lại." }, 503);
  }
}
