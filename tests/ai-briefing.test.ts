import test from "node:test";
import assert from "node:assert/strict";
import { buildBriefing, snapshotState, type BriefingInput } from "../lib/ai/briefing.ts";
import { briefingAccess, canReadLegacyAiContext } from "../lib/ai/source-access.ts";
import { defaultPageAccess } from "../lib/auth/page-access.ts";
import { normalizePermissions } from "../lib/auth/permissions.ts";
import type { CurrentUserContext } from "../lib/auth/current-user.ts";
import type { Staff } from "../lib/team/model.ts";

const day = "2026-11-02", now = "2026-11-02T03:00:00Z";
function input(): BriefingInput {
  const person = (id: string, role = "FTE", archived = false) => ({ id, role, archived, status: "Active", areas: ["KV1", "KV3"] }) as Staff;
  return { day, now,
    sources: ["riders", "delivery", "pickup", "team"].map(id => ({ id, label: id, state: "ready", at: now, href: id === "riders" ? "/riders" : `/${id}`, note: "Test source" })),
    profiles: [{ rider_code: "12345", full_name: "Rider Test", kv: "KV3", status: "active", delivery_district: "D1", delivery_ward: null }],
    delivery: [{ driver_id: "12345", driver_name: null, total_assigned: 100, delivered: 20, idle_delivery_seconds: 3600 }],
    pickup: [{ id: "12345", name: "Rider Test", area: "KV3", cot: "COT1", routes: [], groups: [], assignments: [], routeSource: "none", metrics: { assigned: 100, picked: 10, onhold: 40 } },
      { id: "no-metrics", name: "Missing", area: "KV1", cot: "COT1", routes: [], groups: [], assignments: [], routeSource: "none", metrics: null }],
    team: { staff: [person("working"), person("off"), person("mixed"), person("blank"), person("unknown"), person("archived", "FTE", true), person("bpo", "BPO")],
      shifts: [{ staff_id: "working", work_date: day, shift: "08:00-17:00" }, { staff_id: "off", work_date: day, shift: "OFF" }, { staff_id: "mixed", work_date: day, shift: "08:00-12:00/AL" }, { staff_id: "unknown", work_date: day, shift: "UNRECOGNIZED" }] },
  };
}

test("briefing uses exact pending formulas, keeps missing metrics unknown and never counts shared FTE twice globally", () => {
  const data = buildBriefing(input(), "KV3 rider nào còn nhiều đơn nhất?");
  assert.deepEqual(data.summary.delivery, { assigned: 100, completed: 20, pending: 80 });
  assert.deepEqual(data.summary.pickup, { assigned: 100, completed: 10, pending: 50 });
  assert.equal(data.summary.pickupOnhold, 40); assert.equal(data.summary.pickupWithoutMetrics, 1);
  assert.deepEqual(data.summary.fteToday, { date: day, total: 5, working: 1, off: 1, mixed: 1, unknown: 2 });
  assert.equal(data.summary.fteTomorrow?.unknown, 5);
  assert.equal(data.areas.find(a => a.area === "KV1")?.fteToday?.total, 5);
  assert.equal(data.areas.find(a => a.area === "KV3")?.fteToday?.total, 5);
  assert.ok(data.tasks.some(t => t.id === "idle:KV3")); assert.ok(data.tasks.some(t => t.id === "pickup:KV3"));
  assert.ok(data.tasks.some(t => t.id === "coverage:KV3"));
  assert.ok(data.report.includes("chờ lấy 50")); assert.ok(data.report.includes("Onhold 40"));
});

test("stale, failed and forbidden sources never contribute numbers, identities or operational recommendations", () => {
  for (const state of ["stale", "error", "forbidden", "missing"] as const) {
    const source = input(); source.sources.forEach(s => { s.state = state; });
    const data = buildBriefing(source, "Rider Test");
    assert.equal(data.summary.delivery, null); assert.equal(data.summary.pickup, null); assert.equal(data.summary.fteToday, null);
    assert.equal(data.rankings.delivery, null); assert.deepEqual(data.matchedRiders.pickup, []);
    assert.ok(data.tasks.every(t => t.id.startsWith("source:")));
    assert.ok(!JSON.stringify(data).includes("Rider Test"));
    if (state === "forbidden") assert.equal(data.tasks.length, 0);
  }
});

test("rankings are top five per area while totals use all rows; matched identities are explicitly limited", () => {
  const source = input();
  source.profiles = Array.from({ length: 12 }, (_, i) => ({ ...source.profiles![0], rider_code: String(10000 + i) }));
  source.delivery = source.profiles.map(p => ({ driver_id: p.rider_code, driver_name: null, total_assigned: 10, delivered: 0, idle_delivery_seconds: 0 }));
  const data = buildBriefing(source, "Rider Test");
  assert.equal(data.rankings.delivery?.length, 5); assert.equal(data.summary.delivery?.assigned, 120);
  assert.equal(data.matchedRiders.delivery.length, 12); assert.equal(data.rankings.limitPerArea, 5);
});

test("snapshot validity rejects old days, invalid dates, future stamps and data older than twenty minutes", () => {
  assert.equal(snapshotState(now, day, now), "ready");
  assert.equal(snapshotState("2026-11-02T02:40:00Z", day, now), "ready");
  assert.equal(snapshotState("2026-11-02T02:39:59Z", day, now), "stale");
  assert.equal(snapshotState("2026-11-02T03:02:00Z", day, now), "stale");
  assert.equal(snapshotState("2026-11-01T15:00:00Z", day, now), "stale");
  assert.equal(snapshotState("invalid", day, now), "missing");
});

export function deniedContext(): CurrentUserContext {
  const page_access = defaultPageAccess("member");
  for (const key of Object.keys(page_access) as Array<keyof typeof page_access>) page_access[key] = false;
  return { user: { id: "test", email: "test@spxexpress.com" }, profile: { full_name: null, role: "member", permissions: normalizePermissions({}, "member"), rider_edit_areas: [], page_access } };
}
test("AI source access follows each page and pickup permission; legacy combined reads require every source", () => {
  const context = deniedContext();
  assert.deepEqual(briefingAccess(context), { riders: false, delivery: false, pickup: false, team: false });
  context.profile.page_access!.team = true; assert.equal(briefingAccess(context).team, true);
  context.profile.page_access!.pickup_realtime = true; assert.equal(briefingAccess(context).pickup, false);
  context.profile.permissions.manage_pickup = true; assert.equal(briefingAccess(context).pickup, true);
  assert.equal(canReadLegacyAiContext(context, "Ai OFF?"), false);
  context.profile.page_access!.riders = true; context.profile.page_access!.delivery_realtime = true;
  assert.equal(canReadLegacyAiContext(context, "Ai OFF?"), true);
  assert.equal(canReadLegacyAiContext(context, "Delivery hôm nay"), false);
  context.profile.role = "admin"; assert.equal(canReadLegacyAiContext(context, "Delivery hôm nay"), true);
});
