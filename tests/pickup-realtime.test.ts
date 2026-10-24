import test from "node:test";
import assert from "node:assert/strict";
import { buildPickupRealtime, filterRiders, readAllPages } from "../lib/pickup/realtime.ts";
const profiles = Array.from({length:5}, (_,i) => ({rider_code:String(i+1),name:`Rider ${i+1}`,kv:`KV${i+1}`,cot:"COT 1",status:"active"}));
const live = [{driver_id:"5",area:"KV5",assigned_orders:30,total_pickup_quantity:20,onhold_orders:2,zones:"BT_A; BT_B"}];
const filters = {area:"all",route:"all",ward:"all",cot:"all",coverage:"all",query:""};
test("all five roster areas survive a KV5-only realtime snapshot without invented zeroes", () => {
  const {riders} = buildPickupRealtime(profiles, live, [], []);
  assert.equal(riders.length,5);
  assert.deepEqual(new Set(riders.map(r=>r.area)),new Set(["KV1","KV2","KV3","KV4","KV5"]));
  assert.equal(riders.filter(r=>r.metrics===null).length,4);
  assert.equal(riders.find(r=>r.id==="5")?.metrics?.picked,20);
  assert.equal(filterRiders(riders,{...filters,area:"KV1"}).length,1);
  assert.equal(filterRiders(riders,{...filters,coverage:"missing"}).length,4);
});
test("roster area wins over stale realtime area and inactive activity is retained",()=>{
  const {riders} = buildPickupRealtime([...profiles,{rider_code:"6",kv:"KV1",status:"inactive"},{rider_code:"7",kv:"KV1",status:"inactive"}], [...live,{driver_id:"1",area:"KV5"},{driver_id:"6",area:"KV1"}],[],[]);
  assert.equal(riders.find(r=>r.id==="1")?.area,"KV1");
  assert.ok(riders.some(r=>r.id==="6"));assert.ok(!riders.some(r=>r.id==="7"));
});
test("ward and zone filters use exact group metrics; incomplete groups never show full totals",()=>{
  const {riders} = buildPickupRealtime(profiles,live,[{driver_id:"5",khu_vuc:"BT_A",ward:"Phường A",ward_area:"KV2",assigned_orders:9,picked_orders:6,onhold_orders:1},{driver_id:"5",khu_vuc:"BT_B",ward:"Phường B",ward_area:"KV3",assigned_orders:21,picked_orders:14,onhold_orders:1}],[]);
  const scoped=filterRiders(riders,{...filters,ward:"Phường A"});
  assert.equal(scoped.length,1);assert.deepEqual(scoped[0].metrics,{assigned:9,picked:6,onhold:1});
  assert.equal(filterRiders(riders,{...filters,route:"BT_B"})[0].metrics?.assigned,21);
  const incomplete=buildPickupRealtime(profiles,live,[],[]).riders;
  assert.equal(filterRiders(incomplete,{...filters,route:"BT_A"})[0].metrics,null);
});
test("numeric strings, uppercase Đ, and explicit out-of-scope wards are handled",()=>{
  const result=buildPickupRealtime([{...profiles[0],name:"LÂM TẤN ĐẠT"}],[{driver_id:"1",assigned_orders:"12",total_pickup_quantity:"7"}],[],[{area:"KV6",route_area:"KV1",assign_orders:100},{area:null,route_area:"KV2",assign_orders:"20"}]);
  assert.equal(filterRiders(result.riders,{...filters,query:"lam tan dat"}).length,1);
  assert.equal(result.riders[0].metrics?.assigned,12);
  assert.equal(result.summary.length,1);assert.equal(result.summary[0].assigned,20);
});
test("pagination reads beyond both 1000 rows and exact page boundaries, and fails on partial errors",async()=>{
  const source=Array.from({length:1500},(_,i)=>i),calls:number[]=[];
  const rows=await readAllPages(async(from,to)=>{calls.push(from);return {data:source.slice(from,to+1),error:null};});
  assert.equal(rows.length,1500);assert.deepEqual(calls,[0,500,1000,1500]);
  await assert.rejects(readAllPages(async from=>({data:from===0?source.slice(0,500):null,error:from?{message:"page failed"}:null})),/page failed/);
});
test("inventory supplies routes for KV1–KV4 by rider ID, without changing COT or inventing realtime totals",()=>{
  const inventory=profiles.map((p,i)=>({rider_code:p.rider_code,area:p.kv,ward:`Phường ${i+1}`,zones:[`ZONE-${i+1}`,"Chưa có mã zone"]}));
  const {riders}=buildPickupRealtime(profiles,live,[],[],[...inventory,...inventory]);
  for(let i=1;i<=4;i++) {
    const rider=riders.find(r=>r.id===String(i))!;
    assert.deepEqual(rider.routes,[`ZONE-${i}`]);assert.equal(rider.routeSource,"inventory");
    assert.equal(rider.cot,"COT1");assert.equal(rider.metrics,null);
    assert.equal(rider.assignments.length,1);
  }
  const scoped=filterRiders(riders,{...filters,area:"KV2",ward:"Phường 2",route:"ZONE-2",cot:"COT1"});
  assert.equal(scoped.length,1);assert.equal(scoped[0].id,"2");assert.equal(scoped[0].metrics,null);
  assert.equal(filterRiders(riders,{...filters,query:"zone-3"})[0].id,"3");
  assert.equal(filterRiders(riders,{...filters,route:"ZONE-2",cot:"COT2"}).length,0);
  assert.deepEqual(riders.find(r=>r.id==="5")!.routes,["BT_A","BT_B"]);
  assert.equal(riders.find(r=>r.id==="5")!.routeSource,"realtime");
});
test("route fallback does not match similar names or invent assignments for unrelated IDs",()=>{
  const {riders}=buildPickupRealtime([{...profiles[0],name:"Same name"},{...profiles[1],name:"Same name"}],[],[],[],[
    {rider_code:"1",zones:["ZONE-A"],ward:"Phường A",area:"KV1"},
    {rider_code:"unknown-id",rider_name:"Same name",zones:["ZONE-B"]},
  ]);
  assert.deepEqual(riders.find(r=>r.id==="1")!.routes,["ZONE-A"]);
  assert.deepEqual(riders.find(r=>r.id==="2")!.routes,[]);
  assert.equal(riders.find(r=>r.id==="2")!.routeSource,"none");
});
