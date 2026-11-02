import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { addDays } from "../lib/team/model.ts";

function loader(failShifts = false, failStaff = false) {
  let release!: () => void, shiftStarted = false;
  const planning = new Promise(resolve => { release = () => resolve({ templates: [], targets: [] }); });
  const ranges: number[][] = [], dates: string[] = [];
  const staff = [{ id: "staff-a", full_name: "Test" }];
  const shifts = Array.from({ length: 1001 }, (_, i) => ({ staff_id: `s${i}`, work_date: "2026-10-01", shift: "OFF" }));
  const db = {
    from(table: string) {
      let columns = "";
      const query = {
        select(value: string) { columns = value; return query; },
        order() { return query; },
        gte(_key: string, value: string) { dates.push(value); return query; },
        lte(_key: string, value: string) { dates.push(value); return query; },
        limit() { return Promise.resolve({ data: table === "team_staff" ? staff : [{ work_date: "2026-10-01" }], error: failStaff && table === "team_staff" ? Error("offline") : null }); },
        range(from: number, to: number) {
          assert.match(columns, /template_id/); shiftStarted = true; ranges.push([from, to]);
          return Promise.resolve({ data: shifts.slice(from, to + 1), error: failShifts ? Error("offline") : null });
        },
      };
      return query;
    },
    rpc: async () => ({ error: Error("unavailable"), data: null }),
  };
  const exports: { loadTeam?: (from: string, to: string) => Promise<{ staff: unknown[]; shifts: unknown[]; workload: unknown }> } = {};
  const code = ts.transpileModule(readFileSync("lib/team/server.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, { exports, require: (name: string) => {
    if (name === "server-only") return {};
    if (name === "@/lib/supabase/admin") return { createAdminClient: () => db };
    if (name === "./model") return { addDays };
    if (name === "./planning-server") return { loadPlanningSettings: () => planning };
    throw Error(name);
  } });
  return { run: () => exports.loadTeam!("2026-10-01", "2026-10-31"), release, ranges, dates, shifts, staff, started: () => shiftStarted };
}

test("team shift pages start before planning completes and retain all rows and expanded dates", async () => {
  const f = loader(), pending = f.run();
  assert.equal(f.started(), true, "independent shift reads must not wait for planning/metadata");
  f.release(); const result = await pending;
  assert.deepEqual(Array.from(result.shifts), f.shifts);
  assert.deepEqual(result.staff, f.staff);
  assert.deepEqual(f.ranges, [[0, 999], [1000, 1999]]);
  assert.deepEqual(f.dates, ["2026-09-30", "2026-11-01", "2026-09-30", "2026-11-01"]);
  assert.equal(result.workload, null, "workload fallback remains optional");
});

test("failed team reads reject rather than return a partial calendar", async () => {
  for (const [shifts, staff] of [[true, false], [false, true]]) {
    const f = loader(shifts, staff); f.release();
    await assert.rejects(f.run(), /Không tải được/);
  }
});
