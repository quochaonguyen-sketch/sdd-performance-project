import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { staffAreas, type Staff, type StaffShift } from "./model.ts";

export function parseStaffCsv(text: string, filename: string) {
  const workbook = XLSX.read(text.replace(/^\uFEFF/, ""), { type: "string", raw: true });
  const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "", raw: false });
  const clean = (value: unknown) => String(value ?? "").trim().replace(/[\t\r\n]+/g, " ");
  const header = rows.findIndex(row => clean(row[1]).toLowerCase() === "fullname" && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(clean(row[12])));
  if (header < 0) throw new Error("Không tìm thấy dòng Fullname / OPS ID và các cột ngày trong CSV lịch FTE.");
  const dateHeader = rows.findIndex((row, index) => index < header && clean(row[10]) === "Date" && clean(row[11]) === "Shift");
  const dateWarnings: string[] = [];
  const dates = rows[dateHeader >= 0 ? dateHeader : header].map((value, col) => {
    const m = clean(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (col < 12 || !m) return null;
    // Exported schedule headers use month/day/year, including 12/1/2025.
    const date = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    if (Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error(`Ngày không hợp lệ tại cột ${col + 1}.`);
    if (dateHeader >= 0 && clean(rows[header][col]) !== clean(value)) dateWarnings.push(`Cột ${col + 1}: dùng ngày ${date} từ dòng Date / Shift; dòng tiêu đề nhân sự ghi ${clean(rows[header][col])}.`);
    return date;
  });
  const validDates = dates.filter((date): date is string => !!date);
  if (!validDates.length || new Set(validDates).size !== validDates.length) throw new Error("Các cột ngày bị trùng hoặc trống.");
  for (let i = 1; i < validDates.length; i++) if (Date.parse(validDates[i]) - Date.parse(validDates[i-1]) !== 86400000) throw new Error("Các ngày trong lịch không liên tục; cần kiểm tra tiêu đề CSV.");
  const staff: Staff[] = [], shifts: StaffShift[] = [], warnings: string[] = [...dateWarnings];
  const identities = new Set<string>();
  for (let index = header + 1; index < rows.length; index++) {
    const r = rows[index].map(clean), name = r[1] ?? "", title = (r[5] ?? "").toUpperCase();
    if (!name || name.toLowerCase() === "fullname") continue;
    if (!/^(SUPERVISOR|SUP|LEADER|LEAD|FTE|SBPO|BPO)$/.test(title) && !/^ops\d+$/i.test(r[2] ?? "") && !/^SPXVN\d+$/i.test(r[3] ?? "") && !/@spxexpress\.com$/i.test(r[4] ?? "")) continue;
    const role = title === "SUPERVISOR" || title === "SUP" ? "SUP" : title === "LEADER" || title === "LEAD" ? "LEAD" : title === "FTE" ? "FTE" : title === "SBPO" || title === "BPO" ? "BPO" : "UNKNOWN";
    const identity = /^ops\d+$/i.test(r[2] ?? "") ? `ops:${r[2].toLowerCase()}` : /^SPXVN\d+$/i.test(r[3] ?? "") ? `staff:${r[3].toLowerCase()}` : `name:${name.toLowerCase()}:${(r[4] ?? "").toLowerCase()}`;
    const id = createHash("sha256").update(identity).digest("hex").slice(0, 32);
    if (identities.has(id)) throw new Error(`Trùng định danh nhân sự ở dòng ${index + 1}: ${name}.`);
    identities.add(id);
    const archived = /^OFF\b/i.test(r[0] ?? "") || (r[6] ?? "").toLowerCase() === "inactive";
    const notes = [role === "UNKNOWN" ? "Thiếu chức danh" : "", !["active", "inactive"].includes((r[6] ?? "").toLowerCase()) ? "Thiếu trạng thái" : "", /^OFF\b/i.test(r[0] ?? "") && (r[6] ?? "").toLowerCase() === "active" ? "Nhóm OFF nhưng trạng thái Active" : ""].filter(Boolean);
    if (notes.length) warnings.push(`Dòng ${index + 1}: ${notes.join("; ")}.`);
    staff.push({ id, full_name: name, ops_id: r[2] ?? "", staff_id: r[3] ?? "", email: (r[4] ?? "").toLowerCase(), role, source_title: title, team: r[0] ?? "", status: r[6] ?? "", gender: r[7] ?? "", onboard: r[8] ?? "", vendor: r[9] ?? "", coverage: r[11] ?? "", areas: staffAreas(r[11] ?? ""), archived, review_note: notes.join("; "), source_file: filename, source_row: index + 1 });
    dates.forEach((date, col) => {
      if (date && r[col]?.trim()) {
        if (r[col].length > 100) throw new Error(`Ca quá dài tại dòng ${index + 1}, cột ${col + 1}.`);
        shifts.push({ staff_id: id, work_date: date, shift: r[col] });
      }
    });
  }
  if (!staff.length) throw new Error("Không tìm thấy danh sách nhân sự hợp lệ.");
  return { staff, shifts, warnings, start: validDates[0], end: validDates.at(-1)! };
}
