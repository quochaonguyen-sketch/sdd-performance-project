import { z } from "zod";

export const offSheetTitle = "Đăng ký OFF";
export const offSheetTabId = 1875902011;
export const offStatuses = ["Chờ duyệt", "Đã duyệt", "Từ chối"] as const;
export const offTypes = { WEEKLY: "OFF tuần", PLANNED: "OFF có phép", EMERGENCY: "OFF đột xuất" } as const;
export const offShifts = { FULL_DAY: "Cả ngày", MORNING: "Ca sáng", AFTERNOON: "Ca chiều" } as const;
export const offSheetHeaders = [
  "Mã yêu cầu", "Ngày gửi (VN)", "Ngày OFF", "Mã rider", "Họ tên rider", "Khu vực", "COT",
  "Loại OFF", "Ca nghỉ", "Lý do", "Email liên hệ", "Trạng thái", "Ghi chú quản lý",
];

export const offRegistrationSchema = z.object({
  id: z.uuid(),
  riderCode: z.string().trim().regex(/^[a-zA-Z0-9-]{2,30}$/),
  riderName: z.string().trim().min(2).max(120),
  email: z.string().trim().pipe(z.email().max(254)),
  type: z.enum(["WEEKLY", "PLANNED", "EMERGENCY"]),
  shift: z.enum(["FULL_DAY", "MORNING", "AFTERNOON"]),
  dates: z.array(z.iso.date()).min(1).max(31),
  reason: z.string().trim().max(500),
  website: z.literal("").optional(),
});
export type OffRegistration = z.infer<typeof offRegistrationSchema>;

export function offIdentity(name: string) {
  return name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").trim().replace(/\s+/g, " ");
}
