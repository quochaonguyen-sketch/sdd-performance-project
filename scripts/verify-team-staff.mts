import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseStaffCsv } from "../lib/team/import.ts";
import type { Staff } from "../lib/team/model.ts";

const file = process.argv[2];
if (!file) throw new Error("Pass the original CSV path.");
const parsed = parseStaffCsv(fs.readFileSync(file, "utf8"), path.basename(file));
const db = new PrismaClient();
try {
  const staff = await db.$queryRawUnsafe<Staff[]>("select * from public.team_staff");
  const shifts = await db.$queryRawUnsafe<Array<{ staff_id: string; work_date: string; shift: string }>>("select staff_id,work_date::text,shift from public.team_staff_shifts");
  const logs = await db.$queryRawUnsafe<Array<{ entity_id: string; changes: Record<string, { before: unknown; after: unknown }> }>>("select entity_id,changes from public.user_activity_logs where entity_type='team_staff' and event_type='update' order by created_at");
  const actual = new Map(staff.map(p => [p.id, p]));
  let retainedUserEdits = 0;
  for (const expected of parsed.staff) {
    const row = actual.get(expected.id); assert.ok(row, `Missing source row ${expected.source_row}`);
    for (const key of Object.keys(expected) as Array<keyof Staff>) {
      if (JSON.stringify(expected[key]) === JSON.stringify(row[key])) continue;
      const changes = logs.filter(log => log.entity_id === expected.id && log.changes[key]).map(log => log.changes[key]);
      assert.ok(changes.length && JSON.stringify(changes[0].before) === JSON.stringify(expected[key]) && JSON.stringify(changes.at(-1)!.after) === JSON.stringify(row[key]), `Unexplained difference: source row ${expected.source_row}, ${key}`);
      retainedUserEdits++;
    }
  }
  const byDay = new Map(shifts.map(s => [`${s.staff_id}:${s.work_date}`, s.shift]));
  for (const expected of parsed.shifts) assert.equal(byDay.get(`${expected.staff_id}:${expected.work_date}`), expected.shift);
  const current = staff.filter(p => !p.archived && p.status === "Active");
  assert.equal(staff.filter(p => p.id.startsWith("test-")).length, 0);
  const summary = { staff: staff.length, sourceStaff: parsed.staff.length, sourceShifts: parsed.shifts.length, databaseShifts: shifts.length, retainedUserEdits, current: current.length, roles: Object.fromEntries(["SUP", "LEAD", "FTE", "BPO", "UNKNOWN"].map(role => [role, current.filter(p => p.role === role).length])), allSourceShiftsMatch: true, sourceProfileFieldsMatchExceptAuditedEdits: true };
  console.log(JSON.stringify(summary));
} finally { await db.$disconnect(); }
