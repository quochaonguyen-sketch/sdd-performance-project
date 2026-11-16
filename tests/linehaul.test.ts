import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { arrivingSoon,eventOnDay,gpsIsStale,inTodayHistory,linehaulTripKey,parseLinehaulDay,parseLinehaulRange,sortTrips,type LinehaulTrip } from "../lib/linehaul/model.ts";
import { linehaulWorkbook } from "../lib/linehaul/export.ts";
const now=Date.parse('2026-10-27T10:00:00+07:00');
const trip={lt_code:'LT-A',phase:'en_route',hub_eta:'2026-10-27T10:20:00+07:00',gps_at:'2026-10-27T09:59:00+07:00'} as LinehaulTrip;
test('requested snapshot date defaults to today and accepts only valid days up to today',()=>{
 const today="2026-11-16";
 assert.equal(parseLinehaulDay(null,today),today);
 assert.equal(parseLinehaulDay("2026-11-15",today),"2026-11-15");
 assert.equal(parseLinehaulDay("2024-02-29",today),"2024-02-29");
 for(const invalid of ["", "2026-2-1", "2026-02-29", "2026-04-31", "2026-11-17", "0000-01-01"]){
  assert.equal(parseLinehaulDay(invalid,today),null);
 }
});
test('a history range includes both dates and keeps separate keys for daily copies of a trip',()=>{
 const today="2026-11-16";
 const parse=(query:string)=>parseLinehaulRange(new URLSearchParams(query),today);
 assert.deepEqual(parse(""),{from:today,to:today});
 assert.deepEqual(parse("date=2026-11-15"),{from:"2026-11-15",to:"2026-11-15"});
 assert.deepEqual(parse("from=2026-11-12&to=2026-11-16"),{from:"2026-11-12",to:today});
 for(const invalid of ["from=2026-11-11","to=2026-11-16","from=2026-11-15&to=2026-11-14","from=2026-11-14&to=2026-11-17"]){
  assert.equal(parse(invalid),null);
 }
 const tripOnDay={trip_id:"87",trip_day:today};
 assert.notEqual(linehaulTripKey(tripOnDay),linehaulTripKey({...tripOnDay,trip_day:"2026-11-15"}));
});
test("Excel export keeps separate operating days, numeric quantities and Vietnam timestamps",()=>{
 const rows=[
  {...trip,trip_day:"2026-10-26",trip_id:"87",orders:0,bags:null,hub_ata:"2026-10-25T18:05:00Z"},
  {...trip,trip_day:"2026-10-27",trip_id:"87",orders:42,bags:5,driver_name:"=Mã tài xế"},
 ];
 const workbook=linehaulWorkbook(rows);
 const xlsx=XLSX.write(workbook,{type:"buffer",bookType:"xlsx"});
 const sheet=XLSX.read(xlsx,{type:"buffer"}).Sheets.Linehaul;
 assert.equal(sheet.A1.v,"Ngày vận hành");
 assert.equal(sheet.A2.v,"2026-10-26");
 assert.equal(sheet.A3.v,"2026-10-27");
 assert.equal(sheet.J2.v,0);
 assert.equal(sheet.J3.t,"n");
 assert.equal(sheet.J3.v,42);
 assert.equal(sheet.K2,undefined);
 assert.equal(sheet.R2.v,"2026-10-26 01:05:00");
 assert.equal(sheet.E3.t,"s");
 assert.equal(sheet.E3.f,undefined);
});
test('arrival preparation requires a current SPX ETA and an approaching vehicle',()=>{
 assert.equal(arrivingSoon(trip,now),true);
 assert.equal(arrivingSoon({...trip,hub_eta:'2026-10-27T09:50:00+07:00'},now),false);
 assert.equal(arrivingSoon({...trip,phase:'departed'},now),false);
 assert.equal(arrivingSoon({...trip,hub_eta:null},now),false);
});
test('missing and old GPS never appear fresh',()=>{
 assert.equal(gpsIsStale(trip,now),false);assert.equal(gpsIsStale({...trip,gps_at:null},now),true);
 assert.equal(gpsIsStale({...trip,gps_at:'2026-10-27T09:00:00+07:00'},now),true);
});
test('sort prioritizes incoming vehicles by ETA without mutating source data',()=>{
 const rows=[{...trip,phase:'departed',lt_code:'DONE'},{...trip,lt_code:'B',hub_eta:'2026-10-27T10:10:00+07:00'},trip] as LinehaulTrip[];
 assert.deepEqual(sortTrips(rows).map(row=>row.lt_code),['B','LT-A','DONE']);assert.equal(rows[0].lt_code,'DONE');
});
test('history uses actual Vietnamese arrival/unload date, never only scheduled ETA',()=>{
 assert.equal(inTodayHistory({...trip,hub_ata:'2026-10-26T18:00:00Z'},'2026-10-27'),true);
 assert.equal(inTodayHistory({...trip,hub_unloaded_at:'2026-10-27T17:00:00Z'},'2026-10-27'),false);
 assert.equal(inTodayHistory({...trip,hub_ata:null,hub_unloaded_at:null},'2026-10-27'),false);
 assert.equal(eventOnDay('invalid','2026-10-27'),false);
});
test('completed trips show the most recently unloaded vehicle first',()=>{
 const rows=[{...trip,phase:'unloaded',lt_code:'OLD',hub_unloaded_at:'2026-10-27T08:00:00+07:00'},
 {...trip,phase:'unloaded',lt_code:'NEW',hub_unloaded_at:'2026-10-27T09:00:00+07:00'}] as LinehaulTrip[];
 assert.deepEqual(sortTrips(rows).map(row=>row.lt_code),['NEW','OLD']);
});
test('dashboard rows sort by actual arrival and do not require a fabricated unload time',()=>{
 const rows=[{...trip,source:'dashboard',phase:'at_hub',lt_code:'OLD',hub_ata:'2026-10-27T08:00:00+07:00'},
 {...trip,source:'dashboard',phase:'at_hub',lt_code:'NEW',hub_ata:'2026-10-27T09:00:00+07:00'}] as LinehaulTrip[];
 assert.deepEqual(sortTrips(rows).map(row=>row.lt_code),['NEW','OLD']);
});
test('unloading phase sorts before at_hub and after en_route',()=>{
 const rows=[{...trip,phase:'at_hub',lt_code:'AT_HUB'},
 {...trip,phase:'unloading',lt_code:'UNLOADING'},
 {...trip,phase:'en_route',lt_code:'EN_ROUTE'}] as LinehaulTrip[];
 assert.deepEqual(sortTrips(rows).map(r=>r.lt_code),['EN_ROUTE','UNLOADING','AT_HUB']);
});
