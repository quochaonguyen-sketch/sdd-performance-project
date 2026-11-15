import test from "node:test";
import assert from "node:assert/strict";
import { approvedOffCandidates } from "../lib/off-registration/approved-schedule.ts";
import { offSheetHeaders } from "../lib/off-registration/model.ts";

const id = "123e4567-e89b-12d3-a456-426614174000";
function row(day: string | number, code: string, decision = "Đã duyệt", shift = "Cả ngày", type = "OFF có phép") {
  return [id, "", day, code, "", "", "", type, shift, "", "", decision];
}

test("approved OFF imports only approved full-day requests in the selected week, including Sheet serial dates", () => {
  const serial = Date.parse("2026-12-01") / 86_400_000 + 25_569;
  const result = approvedOffCandidates([
    offSheetHeaders, row("30/11/2026", "R001"), row(serial, "R002", "Đã duyệt", "Cả ngày", "OFF tuần"),
    row("2026-12-01", "R003", "Chờ duyệt"), row("2026-12-01", "R004", "Từ chối"),
    row("2026-12-01", "R005", "Đã duyệt", "Ca sáng"), row("2026-12-07", "R006"),
  ], "2026-11-30", "2026-12-06");
  assert.deepEqual(result.candidates.map(item => [item.rider_code, item.work_date, item.status]), [
    ["R001", "2026-11-30", "OFF_APPROVED"], ["R002", "2026-12-01", "OFF_WEEKLY"],
  ]);
  assert.deepEqual(result.issues.map(issue => issue.row), [6]);
});

test("duplicate rider-days, invalid dates and an incompatible sheet header cannot update the schedule", () => {
  const result = approvedOffCandidates([
    offSheetHeaders, row("2026-11-30", "R001"), row("30/11/2026", "R001"), row("31/11/2026", "R002"),
  ], "2026-11-01", "2026-11-30");
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.issues.map(issue => issue.row).sort(), [2, 3, 4]);
  assert.throws(() => approvedOffCandidates([["wrong header"]], "2026-11-01", "2026-11-30"), /tiêu đề/);
});
