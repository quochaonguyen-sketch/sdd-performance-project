import assert from "node:assert/strict";
import test from "node:test";
import { matchChurnedRiders, parseChurnedRiderIds } from "../lib/dashboard/rider-churn.ts";
import { reconcileRiderChurn } from "../lib/riders/churn-reconciliation.ts";

test("matches churned riders by exact ID, preserving leading zeros and sheet row positions", () => {
  const ids = [["Rider ID"], [" 000123 "], [], [124], ["125"], ["126"], ["126"], ["127"], ["127"], ["128"]];
  const statuses = [["Status \n(Active / Churned)"], ["Churned"], ["Active"], [" churned "], ["Active"], ["Churned"], ["Active"], ["Churned"], ["Churned"], ["Churned"]];
  const roster = ["123", "124", "125", "126", "127", "999"].map(riderCode => ({ riderCode }));
  const churnedIds = parseChurnedRiderIds(ids, statuses);

  assert.deepEqual(churnedIds, ["000123", "124", "127", "128"]);
  assert.deepEqual(matchChurnedRiders(churnedIds, roster).map(row => row.riderCode), ["124", "127"]);
  assert.deepEqual(matchChurnedRiders(churnedIds, [{ riderCode: " 000123 " }]), [{ riderCode: " 000123 " }]);
});

test("rejects an unreadable sheet instead of reporting an empty match", () => {
  assert.throws(() => parseChurnedRiderIds([["#REF!"]], []), /thiếu tiêu đề/);
  assert.throws(() => parseChurnedRiderIds([["Rider ID"]], [["Churn Date"]]), /thiếu tiêu đề/);
});

test("deactivates only reviewed and still-churned IDs in editable areas, and audits each change once", async () => {
  const roster = [
    { id: "a", riderCode: "000124", kv: "KV1", status: "active" },
    { id: "b", riderCode: "125", kv: "KV2", status: "active" },
    { id: "c", riderCode: "126", kv: "KV1", status: "active" },
    { id: "d", riderCode: "127", kv: "KV1", status: "active" },
    { id: "e", riderCode: "128", kv: "KV1", status: "inactive" },
  ];
  type Scope = { kv: { in: string[] }; status?: string; riderCode?: { in: string[] } };
  const scoped = (where: Scope) => roster.filter(row => where.kv.in.includes(row.kv)
    && (!where.status || row.status === where.status) && (!where.riderCode || where.riderCode.in.includes(row.riderCode)));
  const audited: string[] = [];
  const tx = {
    rider: {
      findMany: async ({ where }: { where: Scope }) => scoped(where),
      updateManyAndReturn: async ({ where, data }: { where: Scope; data: { status: string } }) => {
        const updated = scoped(where);
        for (const row of updated) row.status = data.status;
        return updated;
      },
    },
    activityLog: {
      createMany: async ({ data }: { data: { entityId: string }[] }) => audited.push(...data.map(row => row.entityId)),
    },
  };
  const db = { $transaction: async (run: (client: typeof tx) => Promise<unknown>) => run(tx) } as unknown as Parameters<typeof reconcileRiderChurn>[0];
  const run = () => reconcileRiderChurn(db, ["000124", "125", "127", "128"], ["000124", "125", "126", "128"], ["KV1"], "actor");

  const first = await run();
  assert.equal(first.updated, 1);
  assert.deepEqual(roster.map(row => row.status), ["inactive", "active", "active", "active", "inactive"]);
  assert.deepEqual(first.report.rows.filter(row => row.canDeactivate).map(row => row.riderId), ["127"]);
  assert.equal((await run()).updated, 0);
  assert.deepEqual(audited, ["a"]);
});
