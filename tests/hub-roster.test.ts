import test from "node:test";
import assert from "node:assert/strict";
import { summarizeHubRoster } from "../lib/dashboard/hub-roster.ts";
const header = ["station_id", "event_date_iso", "shift_date_iso", "shift", "planned_people", "actual_people", "actual_fte", "actual_os", "actual_bpo"];
const row = (shift: string, date = "2026-10-29") => ["4232", date, date, shift, "5", "7", "4", "2", "1"];
test("current shifts include start and exclude end, daily counts remain separate", () => {
  const data = summarizeHubRoster([header,row("07:00-16:00"),row("16:00-23:00"),["999", "bad"]], ["4232"],new Date("2026-10-29T16:00:00+07:00"));
  assert.equal(data.active?.actual_people,7);
  assert.equal(data.daily.actual_people,14);
  assert.deepEqual(data.activeShifts.map(r=>r.shift),["16:00-23:00"]);
});
test("overnight shifts use previous start day; old roster is unavailable rather than zero", () => {
  const grid=[header,row("22:00-06:00","2026-10-28")];
  assert.equal(summarizeHubRoster(grid,["4232"],new Date("2026-10-29T02:00:00+07:00")).active?.actual_fte,4);
  assert.equal(summarizeHubRoster(grid,["4232"],new Date("2026-10-29T08:00:00+07:00")).active,null);
});
test("duplicate shifts, invalid dates/counts are rejected; blanks remain unavailable", () => {
  assert.throws(()=>summarizeHubRoster([header,row("07:00-16:00"),row("07:00-16:00")],["4232"]),/Trùng/);
  assert.throws(()=>summarizeHubRoster([header,row("07:00-16:00","2026-02-30")],["4232"]),/ngày/);
  const r=row("07:00-16:00");r[6]="";
  assert.equal(summarizeHubRoster([header,r],["4232"],new Date("2026-10-29T08:00:00+07:00")).active?.actual_fte,null);
  r[6]="-1";assert.throws(()=>summarizeHubRoster([header,r],["4232"]),/không hợp lệ/);
});

test("roster dates and timestamps accept Google serials without shifting local ca boundaries",()=>{
 const values: unknown[]=[...row("16:00-23:00"),46324.5];values[1]=46324;values[2]=46324;
 const data=summarizeHubRoster([[...header,"fetched_at"],values],["4232"],new Date("2026-10-29T17:00:00+07:00"));
 assert.equal(data.date,"2026-10-29");assert.equal(data.active?.actual_fte,4);
 assert.equal(data.fetchedAt,"2026-10-29 12:00:00");
});
