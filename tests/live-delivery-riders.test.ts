import test from "node:test";
import assert from "node:assert/strict";
import { enrichDeliveryRiders,buildDistrictDetails,buildKvAggregates,UNKNOWN_DELIVERY,type RealtimeRider,type RiderProfile } from "../lib/dashboard/live-delivery-riders.ts";
import { readAllPages } from "../lib/pickup/realtime.ts";

const row=(id:string,assigned=10):RealtimeRider=>({id,driver_id:id,driver_name:`Source ${id}`,total_assigned:assigned,delivered:2,delivering:7,failed:1,zone_id:null,first_delivery_at:null,idle_delivery_seconds:10,snapshot_id:"s",snapshot_at:"2026-10-29T10:00:00Z"});
const profile=(id:string,kv:string|null,district:string|null):RiderProfile=>({rider_code:id,full_name:`Registry ${id}`,kv,delivery_district:district,delivery_ward:null,cot:null});

test("every source rider survives enrichment, including unregistered, zero-assigned and extra areas",()=>{
 const source=[row("1"),row("2",0),{...row("3"),driver_name:null},row("4")];
 const riders=enrichDeliveryRiders(source,[profile("1","KV1","Quận 1"),profile("2","KV6",null),profile("99","KV2","Quận 1")]);
 assert.equal(riders.length,source.length);
 assert.deepEqual(riders.map(r=>r.driver_id),["1","2","3","4"]);
 assert.equal(riders[0].name,"Registry 1");assert.equal(riders[1].kv,"KV6");assert.equal(riders[1].total_assigned,0);
 for(const field of ["name","kv","district","ward","cot"] as const)assert.equal(riders[2][field],UNKNOWN_DELIVERY);
 assert.equal(riders[3].name,"Source 4");
 assert.equal(riders.reduce((n,r)=>n+r.total_assigned,0),source.reduce((n,r)=>n+r.total_assigned,0));
});

test("districts are grouped within KV; unknown districts never fall back into KV5",()=>{
 const riders=enrichDeliveryRiders([row("1"),row("2"),row("3"),row("4")],[profile("1","KV1","Quận 1"),profile("2","KV4","Quận 1"),profile("3","KV1",null)]);
 const districts=buildDistrictDetails(riders);
 assert.equal(districts.length,4);assert.equal(new Set(districts.map(d=>d.key)).size,4);
 const buckets=buildKvAggregates(districts).kvs;
 assert.equal(buckets.find(a=>a.kv===UNKNOWN_DELIVERY)?.detail?.riders.length,1);
 assert.equal(buckets.find(a=>a.kv==="KV1")?.detail?.riders.length,2);
 assert.equal(buckets.find(a=>a.kv==="KV5")?.detail,null);
 assert.equal(buckets.reduce((n,a)=>n+(a.detail?.riders.length??0),0),riders.length);
 assert.equal(buckets.reduce((n,a)=>n+(a.detail?.totalAssigned??0),0),40);
});

test("pagination loads beyond 1,000 and area totals include every unmatched rider",async()=>{
 const source=Array.from({length:1207},(_,i)=>row(String(i),i));
 let pages=0;
 const loaded=await readAllPages<RealtimeRider>((from,to)=>{pages++;return Promise.resolve({data:source.slice(from,to+1),error:null});});
 assert.equal(pages,3);assert.equal(loaded.length,1207);
 const riders=enrichDeliveryRiders(loaded,[]);
 const unknown=buildKvAggregates(buildDistrictDetails(riders)).kvs.find(a=>a.kv===UNKNOWN_DELIVERY)!.detail!;
 assert.equal(unknown.riders.length,1207);
 assert.equal(unknown.totalAssigned,source.reduce((n,r)=>n+r.total_assigned,0));
});
