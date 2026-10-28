import test from "node:test";
import assert from "node:assert/strict";
import { calendarDays, shiftCalendarDay, shiftCalendarMonth } from "../lib/performance/calendar.ts";
test("calendar starts on Monday and keeps six complete week rows",()=>{
 const days=calendarDays("2026-10");assert.equal(days.length,42);assert.equal(days.filter(Boolean).length,31);assert.equal(days[3],"2026-10-01");assert.equal(days[33],"2026-10-31");
 assert.equal(calendarDays("2026-11")[6],"2026-11-01");
});
test("month and keyboard day navigation cross year and leap-day boundaries",()=>{
 assert.equal(shiftCalendarMonth("2026-12",1),"2027-01");assert.equal(shiftCalendarMonth("2026-01",-1),"2025-12");
 assert.equal(calendarDays("2024-02").filter(Boolean).length,29);assert.equal(calendarDays("2026-02").filter(Boolean).length,28);
 assert.equal(shiftCalendarDay("2024-02-28",1),"2024-02-29");assert.equal(shiftCalendarDay("2026-03-01",-1),"2026-02-28");assert.equal(shiftCalendarDay("2026-12-31",1),"2027-01-01");
});
