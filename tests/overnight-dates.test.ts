import test from "node:test";
import assert from "node:assert/strict";
import { overnightCutoffDay } from "../lib/overnight-holds/dates.ts";

test("morning opens yesterday's delivery cohort and 23h opens today's cutoff",()=>{
 assert.equal(overnightCutoffDay(new Date('2026-10-27T08:00:00+07:00')),'2026-10-26');
 assert.equal(overnightCutoffDay(new Date('2026-10-27T22:59:59+07:00')),'2026-10-26');
 assert.equal(overnightCutoffDay(new Date('2026-10-27T23:00:00+07:00')),'2026-10-27');
 assert.equal(overnightCutoffDay(new Date('2026-11-01T00:00:00+07:00')),'2026-10-31');
});
