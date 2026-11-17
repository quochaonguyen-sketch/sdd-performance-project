import { z } from "zod";
import { offSheetHeaders, offShifts, offStatuses, offTypes } from "./model.ts";

export const offAttendanceStatuses = {
  [offTypes.WEEKLY]: "OFF_WEEKLY",
  [offTypes.PLANNED]: "OFF_APPROVED",
  [offTypes.EMERGENCY]: "OFF_UNEXPECTED",
} as const;

export type ApprovedOffCandidate = {
  row: number;
  request_id: string;
  rider_code: string;
  work_date: string;
  status: typeof offAttendanceStatuses[keyof typeof offAttendanceStatuses];
};

export type ApprovedOffIssue = { row: number; reason: string };

export function offSheetDate(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 2 && value <= 2_958_465) {
    return new Date((value - 25_569) * 86_400_000).toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  const parts = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const iso = parts ? `${parts[3]}-${parts[2].padStart(2, "0")}-${parts[1].padStart(2, "0")}` : text;
  return z.iso.date().safeParse(iso).success ? iso : null;
}

export function assertOffSheetHeaders(rows: unknown[][]) {
  if (!offSheetHeaders.every((header, index) => rows[0]?.[index] === header)) {
    throw Error("Tab Đăng ký OFF có tiêu đề không hợp lệ.");
  }
}

export function approvedOffCandidates(rows: unknown[][], from: string, to: string) {
  assertOffSheetHeaders(rows);
  const issues: ApprovedOffIssue[] = [];
  const groups = new Map<string, ApprovedOffCandidate[]>();
  rows.slice(1).forEach((cells, index) => {
    if (String(cells[11] ?? "").trim() !== offStatuses[1]) return;
    const row = index + 2;
    const work_date = offSheetDate(cells[2]);
    if (work_date && (work_date < from || work_date > to)) return;
    const rider_code = String(cells[3] ?? "").trim();
    const request_id = String(cells[0] ?? "").trim();
    const label = String(cells[7] ?? "").trim();
    const status = Object.hasOwn(offAttendanceStatuses, label) ? offAttendanceStatuses[label as keyof typeof offAttendanceStatuses] : null;
    if (!work_date || !status || !/^[a-z0-9-]{2,30}$/i.test(rider_code) || !z.uuid().safeParse(request_id).success) {
      issues.push({ row, reason: "Thiếu hoặc sai mã yêu cầu, ngày, mã rider hoặc loại OFF." });
      return;
    }
    if (String(cells[8] ?? "").trim() !== offShifts.FULL_DAY) {
      issues.push({ row, reason: "Cần xử lý ca nghỉ riêng vì lịch OFF hiện lưu theo ngày." });
      return;
    }
    const key = `${rider_code}|${work_date}`;
    const group = groups.get(key) ?? [];
    group.push({ row, request_id, rider_code, work_date, status });
    groups.set(key, group);
  });

  const candidates: ApprovedOffCandidate[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) candidates.push(group[0]);
    else group.forEach(({ row }) => issues.push({ row, reason: "Có nhiều yêu cầu đã duyệt cho cùng rider và ngày." }));
  }
  return { candidates, issues };
}
