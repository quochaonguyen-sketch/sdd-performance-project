import test from "node:test";
import assert from "node:assert/strict";
import { inventoryRiders, type RiderInventoryRow } from "../lib/pickup/inventory-riders.ts";
const rows:RiderInventoryRow[]=[
  {area:"KV2",ward:"Phường A",zones:["ZONE-A","ZONE-B"],rider_code:"123872",rider_name:"LÂM TẤN ĐẠT",rider_cot:"COT1",cot1:0,cot2:12,total:12},
  {area:"KV2",ward:"Phường A",zones:["ZONE-A","ZONE-B"],rider_code:"2",rider_name:"Rider COT2",rider_cot:"COT2",cot1:9,cot2:3,total:12},
  {area:"KV2",ward:"Phường A",zones:["ZONE-A","ZONE-B"],rider_code:"unknown",rider_name:"Chưa rõ",rider_cot:"UNKNOWN",cot1:0,cot2:3,total:3},
];
test("COT2 hides the COT1 co-assignee even when their orders were created in COT2",()=>{
  const result=inventoryRiders(rows,"KV2","cot2","");
  assert.deepEqual(result.map(r=>r.id),["2"]);
  assert.equal(result[0].visible,12); // Includes backlog from previous order COT.
  assert.deepEqual(inventoryRiders(rows,"KV2","cot1","").map(r=>r.id),["123872"]);
});
test("unknown rider COT stays unknown, and names with different IDs are not merged",()=>{
  assert.equal(inventoryRiders(rows,"all","all","").length,3);
  assert.equal(inventoryRiders([...rows,{...rows[1],rider_code:"3",rider_name:rows[0].rider_name}],"all","all","").length,4);
});
test("search and area filters preserve rider COT, including Vietnamese uppercase Đ",()=>{
  assert.equal(inventoryRiders(rows,"KV2","cot1","lam tan dat").length,1);
  assert.equal(inventoryRiders(rows,"KV1","cot1","").length,0);
  assert.equal(inventoryRiders(rows,"KV2","cot2","123872").length,0);
});

test("rider zones are deduplicated across wards and searchable",()=>{
  const result=inventoryRiders([rows[0],{...rows[0],ward:"Phường B",zones:["ZONE-B","ZONE-C"],total:2}],"KV2","cot1","");
  assert.deepEqual([...result[0].zones],["ZONE-A","ZONE-B","ZONE-C"]);
  assert.equal(result[0].visible,14);
  assert.equal(inventoryRiders(rows,"KV2","cot2","zone-b").length,1);
});
