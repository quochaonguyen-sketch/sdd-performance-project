import test from "node:test";
import assert from "node:assert/strict";
import { arrivingSoon,eventOnDay,gpsIsStale,inTodayHistory,sortTrips,type LinehaulTrip } from "../lib/linehaul/model.ts";
const now=Date.parse('2026-10-27T10:00:00+07:00');
const trip={lt_code:'LT-A',phase:'en_route',hub_eta:'2026-10-27T10:20:00+07:00',gps_at:'2026-10-27T09:59:00+07:00'} as LinehaulTrip;
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
