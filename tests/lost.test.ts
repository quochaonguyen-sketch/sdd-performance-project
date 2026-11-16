import assert from "node:assert/strict";
import test from "node:test";
import { buildLostAnalysis, buildLostCompensation, parseLostAnalysisFilters, recentLostDays } from "../lib/lost/analysis.ts";
import { lostDisplayLogs, lostLogRole, matchesLostGroup, parseLostSheet, reconcileLostRow, type LostSourceRow } from "../lib/lost/model.ts";
import { defaultLostFilters, noLostClassification, parseLostFilters, prepareLostSnapshot, selectLostPage } from "../lib/lost/list.ts";

const row: LostSourceRow = { row: 2, date: "2026-11-12", shipment: "VN12345", status: "OnHold", reason: "Quá hạn tại Hub", reasonType: "Lost", result: "Chốt đền bù", amount: 0 };
const time = (clock: string) => Date.parse(`2026-11-12T${clock}+07:00`) / 1000;
const log = (clock: string, rider: string) => ({ at: time(clock), rider, error: "SPX error" });

test("LOST compensation compares through the latest current date and keeps the full prior month total", () => {
  const data = buildLostCompensation([
    { date: "2026-01-03", amount: 200_000 },
    { date: "2026-01-03", amount: 100_000 },
    { date: "2026-01-04", amount: null },
    { date: "2026-01-21", amount: 700_000 },
    { date: "2025-12-01", amount: 200_000 },
    { date: "2025-12-03", amount: 0 },
    { date: "2025-12-05", amount: 600_000 },
  ], "2026-01-20");
  assert.equal(data.currentEnd, "2026-01-04");
  assert.equal(data.previousMonth, "2025-12");
  assert.equal(data.currentTotal, 300_000);
  assert.equal(data.previousTotal, 200_000);
  assert.equal(data.previousMonthTotal, 800_000);
  assert.equal(data.delta, 100_000);
  assert.equal(data.change, 0.5);
  assert.deepEqual(data.points[2], { day: 3, current: 300_000, previous: 0 });
  assert.deepEqual(data.points[3], { day: 4, current: null, previous: null });
});

test("LOST compensation handles empty periods, zero comparison bases and shorter months", () => {
  const data = buildLostCompensation([
    { date: "2026-02-28", amount: 0 },
    { date: "2026-03-28", amount: -50_000 },
    { date: "2026-03-31", amount: 100_000 },
  ], "2026-03-31");
  assert.equal(data.previousDays, 28);
  assert.equal(data.currentTotal, 50_000);
  assert.equal(data.delta, -50_000);
  assert.equal(data.change, null);
  assert.equal(data.points.at(-1)?.previous, null);
  const empty = buildLostCompensation([{ date: "2026-02-01", amount: 50_000 }], "2026-03-05");
  assert.equal(empty.currentTotal, null);
  assert.equal(empty.previousTotal, 50_000);
  assert.equal(empty.delta, null);
});

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
  assert.equal(matches.rows[0].logError, "SPX error");
  assert.equal(snapshot.rowsByNumber.get(matches.rows[0].row)?.logs.length, 2);
});

test("LOST chips count incident classifications and filter together with status before pagination", () => {
  const hub = "Đơn hàng mất tại hub";
  const incidents = [hub, hub, "Rider làm mất đơn", "Chưa xác định", undefined] as const;
  const rows = incidents.map((incidentType, index) => ({
    ...reconcileLostRow(row), row: index + 2, incidentType, status: index === 1 ? "Delivered" : "Lost",
  }));
  const snapshot = prepareLostSnapshot(rows, null, null);
  const query = (params: Record<string, string>) => selectLostPage(snapshot, parseLostFilters(new URLSearchParams(params)));
  const all = query({});
  assert.equal(all.incident, null);
  assert.equal(all.incidents.length, 4);
  assert.equal(all.incidents.reduce((total, incident) => total + incident.count, 0), all.total);
  assert.deepEqual(all.incidents[0], { key: hub, label: hub, count: 2 });
  assert.ok(all.incidents.some(incident => incident.key === "" && incident.label === noLostClassification));
  const selected = query({ incident: hub, status: "Delivered", page: "2" });
  assert.equal(selected.total, 1);
  assert.equal(selected.rows[0].row, 3);
  assert.equal(selected.page, 0);
  assert.deepEqual(selected.incidents, all.incidents);
  assert.equal(query({ incident: "" }).rows[0].incidentType, undefined);
  assert.equal(query({ incident: "Chưa xác định" }).total, 1);
  assert.equal(query({ q: "qua han tai hub" }).total, 0);
});

test("LOST list filters inclusively by compensation date before pagination", () => {
  const rows = Array.from({ length: 34 }, (_, index) => ({
    ...reconcileLostRow(row),
    row: index + 2,
    shipment: `VN${index}`,
    date: index === 0 ? "2026-11-09" : index === 33 ? "2026-11-13" : index === 1 ? "2026-11-10" : "2026-11-12",
  }));
  const snapshot = prepareLostSnapshot(rows, null, null);
  const filters = parseLostFilters(new URLSearchParams({ from: "2026-11-10", to: "2026-11-12", page: "1" }));
  const result = selectLostPage(snapshot, filters);
  assert.equal(result.total, 32);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows.at(-1)?.date, "2026-11-10");
  const sameDay = selectLostPage(snapshot, { ...filters, from: "2026-11-12", page: 0 });
  assert.equal(sameDay.total, 31);
  assert.ok(sameDay.rows.every(({ date }) => date === "2026-11-12"));
  for (const dates of [{ from: "2026-02-30" }, { from: "2026-11-12", to: "2026-11-10" }]) {
    assert.throws(() => parseLostFilters(new URLSearchParams(dates as Record<string, string>)), /Khoảng ngày chốt/);
  }
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
  assert.deepEqual(rows, [{ ...row, row: 3, hub: "52-HCM SDD-01 Hub" }]);
});

test("LOST compensation layout keeps all twelve fields, source row numbers and blank money fields", () => {
  const sheet = [
    ["Ngày chốt đền bù", "Month", "SPX tracking", "Trạng thái hệ thống", "Region", "Hub", "Loại yêu\ncầu",
      "% đền bù", "COD/COGS", "Số tiền đền bù", "Lý do", "Kết quả"],
    ["2026-11-12", 11, "SPXVN12345A", "Lost", "HCM", "50-HCM D8 Hub", "Đền bù", 1, 66000, 66000],
    [46338, "11", "spxvn12345b", "Lost", "HCM", "52-HCM SDD-01 Hub", "Đền bù",
      "50%", 260928, "130464.0", "Rỗng ruột", "Chốt đền bù"],
    ["2026-11-11", "", "VN12346", "Delivered", "HCM", "52-HCM SDD-01 Hub", "Đền bù", 1, "", 0, "Giao/Hoàn chéo"],
    ["2026-11-10", "", "VN12347", "Lost", "HCM", "52-HCM SDD-01 Hub", "Đền bù"],
  ];
  const entries = parseLostSheet(sheet);
  assert.equal(entries.length, 3);
  assert.deepEqual(entries[0], {
    row: 3, date: "2026-11-12", month: 11, shipment: "SPXVN12345B", status: "Lost", region: "HCM",
    hub: "52-HCM SDD-01 Hub", requestType: "Đền bù", compensationRate: 0.5, codCogs: 260928,
    amount: 130464, reason: "Rỗng ruột", reasonType: "", result: "Chốt đền bù",
  });
  const snapshot = prepareLostSnapshot(entries.map(entry => reconcileLostRow(entry)), null, null);
  const { rows } = selectLostPage(snapshot, defaultLostFilters);
  assert.equal(rows[0].codCogs, 260928);
  assert.equal(rows[1].month, 11);
  assert.equal(rows[1].compensationRate, 1);
  assert.equal(rows[1].codCogs, null);
  assert.equal(rows[1].amount, 0);
  assert.equal(rows[2].compensationRate, null);
  assert.equal(rows[2].amount, null);
});

test("LOST uses SPX Last Status, the stage before loss and the latest Driver APP log", () => {
  const latestLog = log("09:30:00", "Rider pickup");
  const tracking = {
    displayStatus: 11,
    events: [
      { status: 39, at: time("09:00:00"), station: 4232, rider: "Rider pickup" },
      { status: 11, at: time("10:00:00"), station: 0 },
      { status: 648, at: time("11:00:00"), station: 0 },
    ],
  };
  const pickup = reconcileLostRow({ ...row, status: "Lost" }, {
    shipment_id: row.shipment, tracking, logs: { items: [latestLog] },
  });
  assert.equal(pickup.lastStatus, "Lost");
  assert.equal(pickup.incidentType, "Rider pickup chưa bàn giao");
  assert.equal(matchesLostGroup(pickup, "pickup"), true);
  assert.equal(pickup.event?.rider, latestLog.rider);
  assert.deepEqual(pickup.logs, []);
  assert.deepEqual(lostDisplayLogs(pickup), [latestLog]);
  const page = selectLostPage(prepareLostSnapshot([pickup], null, null), { ...defaultLostFilters, status: "Lost", withLogs: true });
  assert.equal(page.rows[0].logRider, latestLog.rider);
  assert.equal(page.rows[0].logAt, latestLog.at);
  assert.equal(page.logRows, 1);
  const hub = reconcileLostRow({ ...row, status: "Lost" }, {
    shipment_id: row.shipment, tracking: {
      ...tracking, events: [...tracking.events, { status: 1, at: time("09:45:00"), station: 4232 }],
    }, logs: null,
  });
  assert.equal(hub.incidentType, "Đơn hàng mất tại hub");
  assert.equal(hub.event?.status, 1);
  assert.equal(hub.event?.rider, undefined);
});

test("LOST distinguishes the event before loss from current status and reports the latest operator from any source", () => {
  const driver = { ...log("09:40:00", "Rider A"), app: "Driver APP" };
  const ops = { ...log("10:10:00", "Nhân viên B"), app: "FMS Portal" };
  const check = {
    shipment_id: row.shipment,
    tracking: { displayStatus: 11, events: [
      { status: 11, at: time("10:00:00"), station: 0 },
      { status: 650, at: time("09:50:00"), station: 4232 },
      { status: 5, at: time("09:45:00"), station: 0 },
      { status: 2, at: time("09:35:00"), station: 0, rider: "Rider giao" },
      { status: 648, at: time("10:02:00"), station: 0 },
    ] },
    logs: { items: [driver], latestOperation: ops },
  };
  const lost = reconcileLostRow({ ...row, status: "Lost" }, check);
  assert.equal(lost.lastStatus, "Lost");
  assert.equal(lost.statusBeforeLost, "LMHub_LHUnloaded");
  assert.equal(lost.operationalStatusBeforeLost, "On Hold");
  assert.equal(lost.incidentType, "Rider làm mất đơn");
  assert.equal(lost.event?.rider, "Rider giao");
  assert.equal(lost.logSourcesChecked, true);
  assert.deepEqual(lostDisplayLogs(lost), [ops, driver]);
  const snapshot = prepareLostSnapshot([lost], null, null);
  const { rows } = selectLostPage(snapshot, { ...defaultLostFilters, withLogs: true, q: "nhan vien b" });
  assert.equal(rows[0].logRider, "Nhân viên B");
  assert.equal(rows[0].logRole, "Ops");
  assert.equal(rows[0].logSource, "FMS Portal");
  assert.equal(lostLogRole(driver), "Rider");
  assert.equal(lostLogRole({ ...ops, rider: "System Operator" }), "Hệ thống");
  assert.equal(lostLogRole({ ...ops, app: "" }), "Chưa rõ vai trò");
  assert.equal(reconcileLostRow(row, { ...check, tracking: { displayStatus: 4, events: [] } }).statusBeforeLost, null);
});

test("LOST classifies by the latest operational status and preserves the Sheet reason", () => {
  const source = { ...row, status: "Lost", reason: "Quá hạn tại Hub/SOC" };
  const classify = (status: number) => reconcileLostRow(source, {
    shipment_id: source.shipment,
    tracking: { displayStatus: 11, events: [
      { status, at: time("09:00:00"), station: 4232 },
      { status: 650, at: time("09:45:00"), station: 4232 },
      { status: 11, at: time("10:00:00"), station: 4232 },
      { status: 39, at: time("10:05:00"), station: 4232, rider: "Rider sau LOST" },
    ] }, logs: null,
  });
  for (const [status, expected] of [
    [2, "Rider làm mất đơn"], [40, "Rider pickup chưa bàn giao"], [591, "Rider pickup chưa bàn giao"],
    [10, "Đơn Return mất tại hub"], [67, "Đơn Return mất tại hub"], [72, "Đơn Return mất tại hub"],
    [7, "Lost (Theo Sheet)"], [650, "Lost (Theo Sheet)"],
  ] as const) {
    const classified = classify(status);
    assert.equal(classified.incidentType, expected);
    assert.equal(classified.reason, source.reason);
    assert.notEqual(classified.event?.rider, "Rider sau LOST");
  }
  assert.equal(reconcileLostRow(source).incidentType, "Lost (Theo Sheet)");
  assert.equal(reconcileLostRow({ ...source, status: "Return_FMHub_Returned" }, {
    shipment_id: source.shipment, tracking: { displayStatus: 11, events: [] }, logs: null,
  }).incidentType, "Return_FMHub_Returned (Theo Sheet)");
  assert.equal(reconcileLostRow({ ...source, status: "" }, {
    shipment_id: source.shipment, tracking: { displayStatus: 11, events: [] }, logs: null,
  }).incidentType, "Chưa xác định");
  for (const [status, label, category] of [
    [3, "Cancelled", "Lost (Theo Sheet)"],
    [26, "Return_SOC_Received", "Đơn Return mất tại hub"],
    [73, "Return_FMHub_Returned", "Đơn Return mất tại hub"],
  ] as const) {
    const classified = classify(status);
    assert.equal(classified.operationalStatusBeforeLost, label);
    assert.equal(classified.incidentType, category);
    assert.equal(reconcileLostRow(row, {
      shipment_id: row.shipment, tracking: { displayStatus: status, events: [] }, logs: null,
    }).lastStatus, label);
  }
  const snapshot = prepareLostSnapshot([classify(67)], null, null);
  assert.equal(selectLostPage(snapshot, { ...defaultLostFilters, q: "don return mat tai hub" }).total, 1);
});
