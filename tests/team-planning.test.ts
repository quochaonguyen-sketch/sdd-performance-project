import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCoverage, coverageSummary, hourContributors, parseWorkingShift, suggestShiftPlan, targetFor, validBreaks, type PlanningStaff, type ShiftTemplate } from "../lib/team/planning.ts";
const today = "2026-10-25", version = "2026-10-24T01:00:00.000Z";
function person(id: string,areas=["KV1"]): PlanningStaff { return { id,full_name:id,role:"FTE",areas,archived:false,status:"Active",updated_at:version,ops_id:"",staff_id:"",email:"",source_title:"FTE",team:"SDD",gender:"",onboard:"",vendor:"SPX",coverage:areas.join(" & "),review_note:"",source_file:"test",source_row:null }; }
function template(id: string,start=420,end=960): ShiftTemplate { return { id,name:id,start_minute:start,end_minute:end,fte_breaks:[{start:240,end:300}],bpo_breaks:[{start:240,end:300}],active:true,note:"" }; }
const shift = (id: string,value: string,day=today) => ({ staff_id:id,shift:value,work_date:day,updated_at:version });
test("shared coverage conserves person-hours across areas and excludes breaks",()=>{
  const p=person("a",["KV1","KV2"]), t={...template("day",540,1080),fte_breaks:[{start:240,end:300}]};
  const cells=analyzeCoverage([p],[shift("a","09:00-18:00")],[t],[],[today],"OPS",["KV1","KV2"]);
  assert.equal(coverageSummary(cells).availableHours,8);
  assert.equal(cells.find(c=>c.area==="KV1"&&c.hour===9)?.available,.5);
  assert.equal(cells.find(c=>c.area==="KV1"&&c.hour===13)?.available,0);
});
test("BPO half-hour break intersects both buckets; mixed leave contributes no invented capacity",()=>{
  const p={...person("a"),role:"BPO" as const}, t={...template("day",660,1200),bpo_breaks:[{start:210,end:270}]};
  const cells=analyzeCoverage([p],[shift("a","11:00-20:00")],[t],[],[today],"OPS",["KV1"]);
  assert.equal(cells.find(c=>c.hour===14)?.available,.5);assert.equal(cells.find(c=>c.hour===15)?.available,.5);
  assert.equal(coverageSummary(cells).availableHours,8);
  assert.equal(coverageSummary(analyzeCoverage([p],[shift("a","11:00-20:00/AL")],[t],[],[today],"OPS")).availableHours,0);
});
test("overnight carry-in is counted on next day, with midnight break and half-open endpoints",()=>{
  const t={...template("night",1320,420),fte_breaks:[{start:240,end:300}]};
  const cells=analyzeCoverage([person("a")],[shift("a","22:00-07:00","2026-10-24")],[t],[],[today],"OPS",["KV1"]);
  assert.equal(coverageSummary(cells).availableHours,6);assert.equal(cells[2].available,0);assert.equal(cells[7].available,0);
});
test("specific day target overrides weekday, zero and pool isolation are preserved",()=>{
  const rows=[{area:"KV1",pool:"OPS" as const,day_key:"0",hour:8,required:3},{area:"KV1",pool:"OPS" as const,day_key:today,hour:8,required:0}];
  assert.equal(targetFor(rows,"KV1","OPS",today,8),0);assert.equal(targetFor(rows,"KV1","FTE",today,8),1);
  assert.equal(targetFor(rows,"KV6","OPS",today,8),0);
});
test("planner improves deficit, keeps shift duration and never assigns OFF, mixed or blank cells",()=>{
  const people=[person("a"),person("b"),person("off"),person("mixed"),person("blank")];
  const rows=[shift("a","13:00-22:00"),shift("b","13:00-22:00"),shift("off","OFF"),shift("mixed","11:00-20:00/AL")];
  const plan=suggestShiftPlan(people,rows,[template("early"),template("late",780,1320)],[],today,"OPS","KV1",11,8);
  assert.ok(plan.changes.length>0);assert.ok(plan.after.deficitHours<plan.before.deficitHours);assert.ok(plan.afterScore<plan.beforeScore);
  for(const c of plan.changes){assert.ok(["a","b"].includes(c.staff_id));assert.equal(parseWorkingShift(c.to_shift)!.end-parseWorkingShift(c.to_shift)!.start,540);}
});
test("planner respects previous/next rest, inactive people and unknown adjacent working times",()=>{
  const people=[person("a"),person("b")], templates=[template("early"),template("late",780,1320)];
  const rows=[shift("a","13:00-22:00"),shift("b","13:00-22:00"),shift("a","14:00-23:00","2026-10-24"),shift("b","Support TL/02","2026-10-24")];
  assert.equal(suggestShiftPlan(people,rows,templates,[],today,"OPS","KV1",11).changes.length,0);
  people[0].status="Inactive";
  assert.equal(hourContributors(people,rows,templates,today,14,"OPS",["KV1"]).some(p=>p.id==="a"),false);
});
test("invalid clock times and break overlaps are rejected",()=>{
  assert.equal(parseWorkingShift("99:00-17:00"),null);assert.equal(parseWorkingShift("07:60-16:00"),null);assert.equal(parseWorkingShift("07:00-07:00"),null);
  assert.equal(validBreaks([{start:0,end:61}],60),false);assert.equal(validBreaks([{start:100,end:150},{start:140,end:180}],540),false);
});
test("planner cannot invent working hours by choosing templates with unknown or shorter breaks",()=>{
  const templates=[template("late",780,1320),{...template("early"),fte_breaks:[]},{...template("shorter",480,1020),fte_breaks:[{start:240,end:270}]}];
  const result=suggestShiftPlan([person("a"),person("b")],[shift("a","13:00-22:00"),shift("b","13:00-22:00")],templates,[],today,"OPS");
  assert.equal(result.changes.length,0);
});
