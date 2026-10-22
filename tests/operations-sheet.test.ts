import test from "node:test";
import assert from "node:assert/strict";
import { PLAN_TABS, parsePlanSheets, buildPlanChanges, type PlanTab } from "../lib/operations-sheet/schema.ts";
import { createPlanPreviewToken, verifyPlanPreviewToken } from "../lib/operations-sheet/preview-token.ts";
import { createRequire } from "node:module";

function sheet(rows: unknown[][]) { return { TUYEN_RIDER: [[...PLAN_TABS.TUYEN_RIDER.headers], ...rows] }; }
function current(riders: Record<string, unknown>[], pickups: Record<string, unknown>[] = []): Record<PlanTab, Record<string, unknown>[]> { return { TUYEN_RIDER: riders, TUYEN_PICKUP: pickups }; }

test("blank template and ignored example tabs do not create updates", () => {
  const parsed = parsePlanSheets({ ...sheet([[], ["", "", ""]]), VI_DU: [["DEMO_R001"]] });
  assert.deepEqual(parsed, { rows: [], issues: [] });
});
test("headers are accent insensitive but reordering is rejected", () => {
  const input = sheet([]);
  input.TUYEN_RIDER[0][0] = "Ma rider";
  assert.equal(parsePlanSheets(input).issues.length, 0);
  [input.TUYEN_RIDER[0][0], input.TUYEN_RIDER[0][1]] = [input.TUYEN_RIDER[0][1], input.TUYEN_RIDER[0][0]];
  assert.equal(parsePlanSheets(input).issues[0].row, 1);
});
test("duplicate and missing keys report the original Excel row", () => {
  const result = parsePlanSheets(sheet([["R001", "A"], ["R001", "B"], ["", "C"]]));
  assert.deepEqual(result.issues.map(x => x.row), [3, 4]);
});
test("blank cells preserve existing values and only changed fields are emitted", () => {
  const parsed = parsePlanSheets(sheet([["00123", "", " kv 4 ", "cot2"]]));
  assert.equal(parsed.rows[0].key, "00123");
  assert.equal(parsed.issues.length, 0);
  const result = buildPlanChanges(parsed.rows, current([{ rider_code: "00123", full_name: "Existing", kv: "KV5", cot: "COT2" }]));
  assert.deepEqual(result.changes[0].after, { kv: "KV4" });
  assert.deepEqual(result.changes[0].before, { kv: "KV5" });
});
test("explicit clear only removes an optional field", () => {
  const result = parsePlanSheets(sheet([["R001", "", "", "", "", "", "[XOA]"]]));
  assert.equal(result.rows[0].patch.pickup_ward, null);
  assert.equal(result.issues.length, 0);
  assert.equal(parsePlanSheets(sheet([["R001", "[XOA]"]])).issues.length, 1);
});
test("invalid KV, COT and status are rejected", () => {
  assert.equal(parsePlanSheets(sheet([["R001", "A", "KV7", "COT3", "", "", "", "", "", "", "ON"]])).issues.length, 3);
});
test("unknown keys are rejected instead of creating partial riders", () => {
  const result = buildPlanChanges(parsePlanSheets(sheet([["unknown", "A"]])).rows, current([]));
  assert.equal(result.changes.length, 0);
  assert.equal(result.issues.length, 1);
});
test("removing a row from a file does not delete the web record", () => {
  const result = buildPlanChanges([], current([{ rider_code: "R001", kv: "KV5" }]));
  assert.deepEqual(result, { changes: [], issues: [] });
});
test("pickup rows use assignment keys and preserve unrelated assignment details", () => {
  const parsed = parsePlanSheets({ TUYEN_PICKUP: [[...PLAN_TABS.TUYEN_PICKUP.headers], ["assignment-01", "Tuyến mới", "COT1"]] });
  const result = buildPlanChanges(parsed.rows, current([], [{ assignment_key: "assignment-01", route_name: "Tuyến cũ", cot: "COT1", pickup_point_id: "PUP01" }]));
  assert.equal(parsed.issues.length, 0);
  assert.deepEqual(result.changes[0].after, { route_name: "Tuyến mới" });
});
test("oversized input and unrecognized workbook are rejected", () => {
  assert.equal(parsePlanSheets(sheet(Array.from({ length: 5001 }, () => []))).issues.length, 1);
  assert.equal(parsePlanSheets({ VI_DU: [] }).issues.length, 1);
});

test("delivered Excel template follows the import contract without sample records", () => {
  const XLSX = createRequire(import.meta.url)("xlsx") as typeof import("xlsx");
  const workbook = XLSX.readFile(new URL("../public/templates/SDD_Quan_ly_tuyen.xlsx", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  assert.equal(workbook.SheetNames.length, 5);
  const sheets = Object.fromEntries(Object.keys(PLAN_TABS).map(tab => [tab, XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[tab], { header: 1, defval: "" })]));
  assert.deepEqual(parsePlanSheets(sheets), { rows: [], issues: [] });
});

test("preview token rejects tampering, different users, stale data and expiration", () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-route-plan-secret";
  const changes = buildPlanChanges(parsePlanSheets(sheet([["R001", "", "KV4"]])).rows, current([{ rider_code: "R001", kv: "KV5" }])).changes;
  const originalNow = Date.now;
  try {
    const token = createPlanPreviewToken("user-a", changes);
    assert.equal(verifyPlanPreviewToken(token, "user-a", changes), true);
    assert.equal(verifyPlanPreviewToken(`${token}changed`, "user-a", changes), false);
    assert.equal(verifyPlanPreviewToken(token, "user-b", changes), false);
    assert.equal(verifyPlanPreviewToken(token, "user-a", [{ ...changes[0], before: { kv: "KV4" } }]), false);
    const time = originalNow();
    Date.now = () => time + 601_000;
    assert.equal(verifyPlanPreviewToken(token, "user-a", changes), false);
  } finally {
    Date.now = originalNow;
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});
