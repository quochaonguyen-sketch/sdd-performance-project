import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseStaffCsv } from "../lib/team/import.ts";
import { staffAreas, shiftKind, addDays, isArchivedStaff } from "../lib/team/model.ts";

function csv(people: string[][], duplicateDate = false) {
  const sheet = XLSX.utils.aoa_to_sheet([
    [...Array(10).fill(""), "Date", "Shift", "4/29/2026", "4/30/2026", duplicateDate ? "4/30/2026" : "5/1/2026", "5/2/2026"],
    ["Team", "Fullname", "OPS ID", "Staff_Id", "Email", "Title", "Status", "Gender", "Onboard", "Vendor", "OFF/month", "Coverage", "4/29/2026", "4/30/2026", "01/05/2026", "5/2/2026"],
    ...people,
  ]);
  return XLSX.utils.sheet_to_csv(sheet);
}
const person = ["SDD", 'Tên có dấu, "A"', "Ops100", "GRG", "", "FTE", "Active", "", "", "GRG", "", "KV 3 & 4", "11:00-20:00/AL", "", "OFF", "SL"];

test("CSV handles quoted names, mixed shifts, blank days and authoritative date header", () => {
  const data = parseStaffCsv(csv([person]), "source.csv");
  assert.equal(data.staff[0].full_name, 'Tên có dấu, "A"');
  assert.deepEqual(data.staff[0].areas, ["KV3", "KV4"]);
  assert.equal(data.shifts.length, 3);
  assert.equal(data.shifts[1].work_date, "2026-05-01");
  assert.equal(data.shifts[1].shift, "OFF");
  assert.ok(data.warnings.some(w => w.includes("2026-05-01")));
  assert.equal(data.shifts.some(s => s.work_date === "2026-04-30"), false);
});
test("repeated vendor Staff IDs remain separate people; stable OPS ID deduplicates imports", () => {
  const data = parseStaffCsv(csv([person, [...person.slice(0, 1), "Người B", "Ops101", ...person.slice(3)]]), "source.csv");
  assert.equal(data.staff.length, 2);
  assert.notEqual(data.staff[0].id, data.staff[1].id);
  assert.equal(parseStaffCsv(csv([person]), "renamed.csv").staff[0].id, data.staff[0].id);
  assert.throws(() => parseStaffCsv(csv([person, person]), "source.csv"), /Trùng định danh/);
});
test("archived group with Active status and unknown title are retained with review notes", () => {
  const row = [...person]; row[0] = "OFF - SBPO"; row[5] = "";
  const data = parseStaffCsv(csv([row]), "source.csv");
  assert.equal(data.staff[0].archived, true);
  assert.equal(data.staff[0].status, "Active");
  assert.equal(data.staff[0].role, "UNKNOWN");
  assert.match(data.staff[0].review_note, /Thiếu chức danh/);
  assert.match(data.staff[0].review_note, /nhưng trạng thái Active/);
});
test("reject duplicate dates and malformed input", () => {
  assert.throws(() => parseStaffCsv(csv([person], true), "source.csv"), /ngày bị trùng/);
  assert.throws(() => parseStaffCsv("random,text", "source.csv"), /Không tìm thấy/);
});
test("do not conflate OFF, missing schedule, work and mixed leave", () => {
  assert.equal(shiftKind(""), "empty"); assert.equal(shiftKind("Off"), "off");
  assert.equal(shiftKind("11:00-20:00"), "work"); assert.equal(shiftKind("SL"), "leave");
  assert.equal(shiftKind("11:00-20:00/AL"), "mixed"); assert.equal(shiftKind("Support TL/02"), "other");
  assert.deepEqual(staffAreas("KV 5+6 + SPF"), ["KV5", "KV6", "SPF"]);
  assert.deepEqual(staffAreas("All"), ["KV1", "KV2", "KV3", "KV4", "KV5"]);
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(isArchivedStaff({ archived: false, status: "Inactive" }), true);
  assert.equal(isArchivedStaff({ archived: true, status: "Active" }), true);
  assert.equal(isArchivedStaff({ archived: false, status: "Active" }), false);
});
