import test from "node:test";
import assert from "node:assert/strict";
import {
  compareWhOrders,
  getOrderEffectiveNow,
  orderAgeMinutes,
  riderOrder,
  sla,
  statusRank,
  type WhOrder,
  type WhSortOption,
} from "../lib/wh/model.ts";

const now = Date.parse("2026-11-06T10:00:00Z");

function makeOrder(id: string, raw_status: WhOrder["raw_status"], overrides: Partial<WhOrder> = {}): WhOrder {
  return {
    shipment_id: id,
    tracking_number: `TRK_${id}`,
    raw_status,
    area: "KV1",
    district: "Quận 1",
    ward: "Phường Bến Nghé",
    zone: "KV1-01",
    driver_id: "D1",
    driver_name: "Rider 1",
    attempt: 0,
    onhold_reason: "",
    created_at: "2026-11-06T06:00:00Z",
    received_at: "2026-11-06T06:30:00Z",
    delivering_at: raw_status === "Delivering" || raw_status === "Delivered" ? "2026-11-06T07:00:00Z" : null,
    delivered_at: raw_status === "Delivered" ? "2026-11-06T08:00:00Z" : null,
    onhold_at: raw_status === "Onhold" ? "2026-11-06T08:00:00Z" : null,
    soc_pending_at: "2026-11-06T06:15:00Z",
    ...overrides,
  };
}

test("statusRank puts Delivering and Onhold at top, and Delivered at bottom", () => {
  const delivering = makeOrder("1", "Delivering");
  const onhold = makeOrder("2", "Onhold");
  const received = makeOrder("3", "LMhub_received");
  const ready = makeOrder("4", "SOC_pendingReceive");
  const delivered = makeOrder("5", "Delivered");

  assert.equal(statusRank(delivering), 0);
  assert.equal(statusRank(onhold), 1);
  assert.equal(statusRank(received), 2);
  assert.equal(statusRank(ready), 3);
  assert.equal(statusRank(delivered), 4);
});

test("compareWhOrders with sort=status sorts Delivering & Onhold at top, Delivered at bottom", () => {
  const oDelivered1 = makeOrder("D1", "Delivered", { delivered_at: "2026-11-06T08:00:00Z" });
  const oDelivered2 = makeOrder("D2", "Delivered", { delivered_at: "2026-11-06T08:30:00Z" });
  const oDelivering = makeOrder("DL", "Delivering", { created_at: "2026-11-06T07:00:00Z" });
  const oOnhold = makeOrder("OH", "Onhold", { created_at: "2026-11-06T06:30:00Z" });
  const oReceived = makeOrder("RC", "LMhub_received");

  const list = [oDelivered1, oDelivered2, oDelivering, oOnhold, oReceived];
  list.sort((a, b) => compareWhOrders(a, b, "status", now));

  const sortedIds = list.map(o => o.shipment_id);
  // DL (rank 0), OH (rank 1), RC (rank 2), D2 (rank 4, more recent delivered_at), D1 (rank 4)
  assert.deepEqual(sortedIds, ["DL", "OH", "RC", "D2", "D1"]);
});

test("Created, Received (LMhub_received) and SOC_pendingReceive orders are excluded from Chi tiet don & rider", () => {
  const orders = [
    makeOrder("CR1", "Created"),
    makeOrder("RC1", "LMhub_received", { driver_name: "", attempt: 0 }),
    makeOrder("SOC1", "SOC_pendingReceive"),
    makeOrder("DL1", "Delivering"),
    makeOrder("OH1", "Onhold"),
    makeOrder("D1", "Delivered"),
  ];

  const filtered = orders
    .filter(r => riderOrder(r))
    .sort((a, b) => compareWhOrders(a, b, "status", now));

  assert.equal(filtered.length, 3);
  assert.deepEqual(filtered.map(o => o.shipment_id), ["DL1", "OH1", "D1"]);
});

test("compareWhOrders supports other sort options", () => {
  const o1 = makeOrder("1", "Delivering", { created_at: "2026-11-06T06:00:00Z", attempt: 0 });
  const o2 = makeOrder("2", "Delivering", { created_at: "2026-11-06T07:00:00Z", attempt: 2 });

  // created_desc
  const desc = [o1, o2].sort((a, b) => compareWhOrders(a, b, "created_desc", now));
  assert.deepEqual(desc.map(o => o.shipment_id), ["2", "1"]);

  // created_asc
  const asc = [o1, o2].sort((a, b) => compareWhOrders(a, b, "created_asc", now));
  assert.deepEqual(asc.map(o => o.shipment_id), ["1", "2"]);

  // attempt_desc
  const attDesc = [o1, o2].sort((a, b) => compareWhOrders(a, b, "attempt_desc", now));
  assert.deepEqual(attDesc.map(o => o.shipment_id), ["2", "1"]);
});

test("sla 4h marks duration < 4h as On time and > 4h as Late, using delivered_at for delivered orders", () => {
  const ontimeOrder = makeOrder("ONT", "Delivered", {
    created_at: "2026-11-06T06:00:00Z",
    delivered_at: "2026-11-06T09:30:00Z", // 3h 30m (< 4h)
    attempt: 0,
  });
  assert.equal(sla(ontimeOrder, "4h").state, "On time");
  assert.equal(sla(ontimeOrder, "4h").minutes, 210);

  const lateOrder = makeOrder("LATE", "Delivered", {
    created_at: "2026-11-06T06:00:00Z",
    delivered_at: "2026-11-06T10:15:00Z", // 4h 15m (> 4h)
    attempt: 0,
  });
  assert.equal(sla(lateOrder, "4h").state, "Late");
  assert.equal(sla(lateOrder, "4h").minutes, 255);

  const deliveredAttempt1 = makeOrder("ATT1", "Delivered", {
    created_at: "2026-11-06T06:00:00Z",
    delivered_at: "2026-11-06T08:45:00Z", // 2h 45m (< 4h)
    onhold_at: "2026-11-06T07:30:00Z",
    attempt: 1,
  });
  assert.equal(sla(deliveredAttempt1, "4h").state, "On time");
  assert.equal(sla(deliveredAttempt1, "4h").minutes, 165);

  const deliveredAttempt2Late = makeOrder("ATT2_LATE", "Delivered", {
    created_at: "2026-11-06T06:00:00Z",
    delivered_at: "2026-11-06T12:00:00Z", // 6h (> 4h)
    onhold_at: "2026-11-06T08:00:00Z",
    attempt: 2,
  });
  assert.equal(sla(deliveredAttempt2Late, "4h").state, "Late");
  assert.equal(sla(deliveredAttempt2Late, "4h").minutes, 360);

  const deliveredAttempt2Ontime = makeOrder("ATT2_ONT", "Delivered", {
    created_at: "2026-11-06T06:00:00Z",
    delivered_at: "2026-11-06T09:15:00Z", // 3h 15m (< 4h)
    onhold_at: "2026-11-06T07:30:00Z",
    attempt: 2,
  });
  assert.equal(sla(deliveredAttempt2Ontime, "4h").state, "On time");
  assert.equal(sla(deliveredAttempt2Ontime, "4h").minutes, 195);
});

test("sla 4h does not count onhold_at: onhold orders without delivered_at return Pending", () => {
  const onholdOrder = makeOrder("OH", "Onhold", {
    created_at: "2026-11-06T06:00:00Z",
    onhold_at: "2026-11-06T08:00:00Z",
    delivered_at: null,
    attempt: 1,
  });
  assert.equal(sla(onholdOrder, "4h").state, "Pending");
  assert.equal(sla(onholdOrder, "4h").minutes, null);
  assert.equal(sla(onholdOrder, "sdd").state, "Pending");
});

test("getOrderEffectiveNow and orderAgeMinutes prevent absurd aging on historical mock orders", () => {
  // Mock order created on 2026-10-11 at 11:03 VN (04:03:27 UTC) like VN26615486537X
  const historicalOrder = makeOrder("VN26615486537X", "LMhub_received", {
    created_at: "2026-10-11T04:03:27.000Z",
    received_at: "2026-10-11T05:05:27.000Z",
    delivered_at: null,
  });

  // Current wall-clock is today: 2026-11-09 16:30 VN
  const todayNow = Date.parse("2026-11-09T09:30:00.000Z");

  const effNow = getOrderEffectiveNow(historicalOrder, todayNow);
  // Should be capped to 2026-10-11 18:00 VN (11:00 UTC)
  assert.equal(new Date(effNow).toISOString(), "2026-10-11T11:00:00.000Z");

  const age = orderAgeMinutes(historicalOrder, todayNow);
  // (11:00:00 - 04:03:27) / 60 = 416 minutes (~6h 56m)
  assert.equal(age, 416);
  // Definitely NOT 708 hours (42,480 minutes)!
  assert.ok(age! < 600);
});

test("getOrderEffectiveNow uses live now for today orders and delivered_at for delivered orders", () => {
  const todayOrder = makeOrder("TODAY_1", "Delivering", {
    created_at: "2026-11-09T02:00:00.000Z",
    delivered_at: null,
  });
  const todayNow = Date.parse("2026-11-09T05:00:00.000Z");
  assert.equal(getOrderEffectiveNow(todayOrder, todayNow), todayNow);
  assert.equal(orderAgeMinutes(todayOrder, todayNow), 180);

  const deliveredOrder = makeOrder("DELIV_1", "Delivered", {
    created_at: "2026-10-11T02:00:00.000Z",
    delivered_at: "2026-10-11T04:30:00.000Z",
  });
  assert.equal(orderAgeMinutes(deliveredOrder, todayNow), 150);
});

test("sla sdd marks duration <= 3h (180m) from soc_pending_at to delivered_at as On time, > 3h as Late", () => {
  const ontimeOrder = makeOrder("SDD_ONT", "Delivered", {
    created_at: "2026-11-06T05:00:00Z",
    soc_pending_at: "2026-11-06T06:00:00Z",
    delivered_at: "2026-11-06T08:50:00Z", // 2h 50m from soc_pending_at (<= 3h)
    attempt: 0,
  });
  assert.equal(sla(ontimeOrder, "sdd").state, "On time");
  assert.equal(sla(ontimeOrder, "sdd").minutes, 170);

  const lateOrder = makeOrder("SDD_LATE", "Delivered", {
    created_at: "2026-11-06T05:00:00Z",
    soc_pending_at: "2026-11-06T06:00:00Z",
    delivered_at: "2026-11-06T09:15:00Z", // 3h 15m from soc_pending_at (> 3h)
    attempt: 0,
  });
  assert.equal(sla(lateOrder, "sdd").state, "Late");
  assert.equal(sla(lateOrder, "sdd").minutes, 195);
});
