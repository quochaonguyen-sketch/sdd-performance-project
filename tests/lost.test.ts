import assert from "node:assert/strict";
import test from "node:test";
import { buildLostAnalysis, parseLostAnalysisFilters, recentLostDays } from "../lib/lost/analysis.ts";
import { matchesLostGroup, parseLostSheet, reconcileLostRow, type LostSourceRow } from "../lib/lost/model.ts";
import { defaultLostFilters, parseLostFilters, prepareLostSnapshot, selectLostPage } from "../lib/lost/list.ts";

const row: LostSourceRow = { row: 2, date: "2026-11-12", shipment: "VN12345", status: "OnHold", reason: "Quá hạn tại Hub", reasonType: "Lost", result: "Chốt đền bù", amount: 0 };
const time = (clock: string) => Date.parse(`2026-11-12T${clock}+07:00`) / 1000;
const log = (clock: string, rider: string) => ({ at: time(clock), rider, error: "SPX error" });

test("LOST analysis accepts inclusive report date ranges and validates calendar days", () => {
  assert.deepEqual(recentLostDays(row.date), { from: "2026-10-14", to: "2026-11-12" });
  for (const query of ["from=2026-10-32", "from=2026-11-08&to=2026-11-07", "to=2026-11-13"]) {
    assert.equal(parseLostAnalysisFilters(new URLSearchParams(query), row.date), null);
  }
  const filters = parseLostAnalysisFilters(new URLSearchParams("from=2026-01-01&to=2026-11-12&rank=pickup"), row.date);
  assert.ok(filters);
  assert.equal(filters.rank, "pickup");
  const analysis = buildLostAnalysis([], filters, row.date);
  assert.ok(analysis.points.length <= 31);
  assert.equal(analysis.points[0].from, filters.from);
  assert.equal(analysis.points.at(-1)?.to, filters.to);
});

test("LOST analysis counts each shipment once and ranks by the rider for its tracking milestone", () => {
  const pickup = { ...reconcileLostRow(row), status: "FMHub_Pickup_Done", event: { status: 39, at: 1, station: 4232, code: "101", rider: "Nguyễn Văn A" } };
  const handover = { ...pickup, shipment: "VN2", date: "2026-11-10", status: "FMhub_Pickup_Handedover_to_Station", event: { ...pickup.event, code: "", rider: "NGUYEN VAN A" } };
  const delivery = { ...pickup, shipment: "VN3", status: "Delivered", reason: "Buyer/Seller chưa nhận được hàng", event: { ...pickup.event, status: 4, code: "202", rider: "Rider B" } };
  const rows = [pickup, { ...pickup, date: "2026-11-11" }, handover, delivery, { ...delivery, shipment: "VN4", event: pickup.event },
    { ...delivery, shipment: "VN5", reason: "Ticket thiếu hàng" }, { ...delivery, shipment: "VN6", date: "2026-11-09" }];
  const range = { from: "2026-11-10", to: "2026-11-12" };
  const analysis = buildLostAnalysis(rows, { ...range, rank: "total" }, row.date);
  assert.deepEqual(analysis.totals, { pickup: 2, notReceived: 2 });
  assert.deepEqual(analysis.points.map(point => [point.pickup, point.notReceived]), [[1, 0], [0, 0], [1, 2]]);
  assert.deepEqual(analysis.riders.map(rider => [rider.code, rider.total]), [["101", 2], ["202", 1]]);
  assert.equal(analysis.withoutRider, 1);
  assert.deepEqual(buildLostAnalysis(rows, { ...range, rank: "notReceived" }, row.date).riders.map(rider => rider.code), ["202"]);
});

test("LOST quick filters use the actual pickup statuses and issue reasons", () => {
  assert.equal(matchesLostGroup({ status: "FMhub_Pickup_Handedover_to_Station", reason: row.reason }, "pickup"), true);
  assert.equal(matchesLostGroup({ status: "FMHub_Pickup_Done", reason: row.reason }, "pickup"), true);
  assert.equal(matchesLostGroup({ status: "Delivered", reason: "Buyer/Seller chưa nhận được hàng" }, "not-received"), true);
  for (const reason of ["Ticket thiếu hàng", "Rỗng ruột"]) {
    assert.equal(matchesLostGroup({ status: "Delivered", reason }, "shortage"), true);
    assert.equal(matchesLostGroup({ status: "Delivered", reason }, "other"), false);
  }
  assert.equal(matchesLostGroup({ status: "Delivered", reason: "Hư hỏng bể vỡ" }, "other"), true);
  assert.equal(matchesLostGroup(row, "all"), true);
});

test("LOST pages send 30 summaries and still search rider names from unloaded log details", () => {
  const source = Array.from({ length: 32 }, (_, index) => reconcileLostRow({ ...row, row: index + 2, shipment: `VN1234${index}` }, {
    shipment_id: `VN1234${index}`,
    tracking: [],
    logs: { items: index === 31 ? [log("10:00:00", "Rider mới nhất"), log("09:00:00", "Nguyễn Văn B")] : [] },
  }));
  const snapshot = prepareLostSnapshot(source, "2026-11-12T01:00:00Z", null);
  const first = selectLostPage(snapshot, defaultLostFilters);
  assert.equal(first.rows.length, 30);
  assert.equal(first.total, 32);
  assert.ok(!("logs" in first.rows[0]));
  const final = selectLostPage(snapshot, { ...defaultLostFilters, page: 500 });
  assert.equal(final.page, 1);
  assert.equal(final.rows.length, 2);
  const matches = selectLostPage(snapshot, parseLostFilters(new URLSearchParams("q=nguyen+van+b&withLogs=1&page=-1")));
  assert.equal(matches.total, 1);
  assert.equal(matches.rows[0].logRider, "Rider mới nhất");
  assert.equal(snapshot.rowsByNumber.get(matches.rows[0].row)?.logs.length, 2);
});

test("LOST sorts filtered rows before pagination and places missing SPX riders last in both directions", () => {
  const base = reconcileLostRow(row);
  const withRider = (index: number, rider: string, date = row.date) => ({
    ...base, row: index + 2, shipment: `VN${index}`, date,
    event: { status: 2, at: time("09:00:00"), station: 4232, rider },
  });
  const usual = Array.from({ length: 30 }, (_, index) => withRider(index, "Bảo"));
  const snapshot = prepareLostSnapshot([
    ...usual, withRider(30, "Đức"), withRider(31, "An", "2026-11-01"), withRider(32, "Dũng"),
    { ...base, row: 35, shipment: "VN33", logs: [log("10:00:00", "AAA")] },
    { ...withRider(34, "AAA"), status: "Delivered" },
  ], null, null);
  const result = (query: string) => selectLostPage(snapshot, parseLostFilters(new URLSearchParams(`status=OnHold&${query}`)));
  assert.equal(result("sort=date-asc").rows[0].shipment, "VN31");
  assert.equal(result("sort=invalid").sort, "date-desc");
  assert.equal(result("sort=date-desc&page=1").rows.at(-1)?.shipment, "VN31");
  assert.equal(result("sort=rider-asc").rows[0].shipment, "VN31");
  assert.deepEqual(result("sort=rider-asc&page=1").rows.slice(-3).map(entry => entry.shipment), ["VN32", "VN30", "VN33"]);
  assert.deepEqual(result("sort=rider-desc").rows.slice(0, 2).map(entry => entry.shipment), ["VN30", "VN32"]);
  assert.equal(result("sort=rider-desc&page=1").rows.at(-1)?.shipment, "VN33");
});

test("OnHold uses the Delivering event for that attempt and lists only later logs by a different rider", () => {
  const result = reconcileLostRow(row, {
    shipment_id: row.shipment,
    tracking: [
      { status: 2, at: time("09:00:00"), station: 4232, rider: "NGUYỄN VĂN A" },
      { status: 5, at: time("10:00:00"), station: 4232 },
      { status: 2, at: time("11:00:00"), station: 4232, rider: "Rider C" },
    ],
    logs: { items: [log("09:00:00", "Rider X"), log("09:30:00", "Nguyen Van A"), log("09:45:00", "Rider B"), log("10:05:00", "Rider B")] },
  });
  assert.equal(result.event?.rider, "NGUYỄN VĂN A");
  assert.equal(result.logCount, 2);
  assert.deepEqual(result.logs, [log("10:05:00", "Rider B")]);
});

test("LMHub Received uses the hub timestamp and keeps staff identity out of the rider column", () => {
  const result = reconcileLostRow({ ...row, status: "LMHub_Received" }, {
    shipment_id: row.shipment,
    tracking: [{ status: 1, at: time("08:00:00"), station: 4232, rider: "Hub Operator" }, { status: 1, at: time("09:00:00"), station: 9999 }],
    logs: { items: [log("07:59:00", "Rider B"), log("08:01:00", "Rider B")] },
  });
  assert.equal(result.eventLabel, "LMHub Received");
  assert.equal(result.event?.rider, undefined);
  assert.deepEqual(result.logs, [log("08:01:00", "Rider B")]);
});

test("pickup handed over to station uses the Pickup Done rider and timestamp", () => {
  const pickup = { status: 39, at: time("08:30:00"), station: 4232, rider: "NGUYỄN VĂN A" };
  const result = reconcileLostRow({ ...row, status: "FMhub_Pickup_Handedover_to_Station" }, {
    shipment_id: row.shipment,
    tracking: [pickup, { status: 591, at: time("10:00:00"), station: 4232, rider: "Hub Operator" }],
    logs: { items: [log("08:30:00", "Rider B"), log("09:00:00", "Nguyen Van A"), log("09:30:00", "Rider C")] },
  });
  assert.equal(result.eventLabel, "Pickup Done");
  assert.deepEqual(result.event, pickup);
  assert.deepEqual(result.logs, [log("09:30:00", "Rider C")]);
});

test("a status without a known SPX event still exposes checked driver logs", () => {
  const result = reconcileLostRow({ ...row, status: "Return_SOC_Received" }, {
    shipment_id: row.shipment, tracking: [], logs: { items: [log("08:01:00", "Rider B")] },
  });
  assert.equal(result.event, null);
  assert.equal(result.trackingChecked, true);
  assert.equal(result.logsChecked, true);
  assert.equal(result.logs.length, 1);
});

test("LOST parsing keeps SDD-01 source row numbers and zero amounts", () => {
  const rows = parseLostSheet([
    ["report_date", "Station Name", "AOM", "Province", "Order Type", "Shipment ID", "reason", "result", "Reason Type", "Last Status", "Amount"],
    ["2026-11-12", "Other Hub", "", "", "", "VN11111"],
    ["2026-11-12", "52-HCM SDD-01 Hub", "", "", "", "vn12345", "Quá hạn tại Hub", "Chốt đền bù", "Lost", "OnHold", 0],
  ]);
  assert.deepEqual(rows, [{ ...row, row: 3 }]);
});
