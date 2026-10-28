import test from "node:test";
import assert from "node:assert/strict";
import { pickupOrderParams } from "../lib/pickup/inventory-orders.ts";
test("zone details preserve area, order COT and literal query",()=>{
  const result=pickupOrderParams(new URLSearchParams({p_area:"KV2",p_status:"Assigned",p_zone:"BTH_P1301_SDD",p_cot:"cot2",q:"SPX_01%",page:"2"}));
  assert.equal(result.p_zone,"BTH_P1301_SDD");assert.equal(result.p_cot,"cot2");assert.equal(result.p_offset,200);assert.equal(result.p_query,"SPX_01%");
});
test("geographic detail scopes area, district and ward without mixing rider or zone filters",()=>{
 const result=pickupOrderParams(new URLSearchParams({p_area:'KV2',p_status:'Assigned',p_district:'Quận 7',p_ward:'Phường Phú Thuận',p_cot:'cot2',page:'1'}));
 assert.equal(result.p_district,'Quận 7');assert.equal(result.p_ward,'Phường Phú Thuận');assert.equal(result.p_cot,'cot2');assert.equal(result.p_offset,100);assert.ok(!('p_zone' in result));
 const district=pickupOrderParams(new URLSearchParams({p_area:'KV2',p_status:'Assigned',p_district:'Quận 7'}));assert.equal(district.p_ward,'');
 const filtered=pickupOrderParams(new URLSearchParams({p_area:'KV2',p_status:'Assigned',p_district:'Quận 7',p_wards:JSON.stringify(['Phường Phú Thuận'])}));assert.deepEqual(filtered.p_wards,['Phường Phú Thuận']);
 for(const p_wards of ['null','{}','[1]','[""]','not-json'])assert.throws(()=>pickupOrderParams(new URLSearchParams({p_area:'KV2',p_status:'Assigned',p_district:'Quận 7',p_wards})));
 const invalid:Array<Record<string,string>>=[{p_area:'all'},{p_zone:'Z1'},{p_district:'',p_ward:'Phường 1'},{p_district:'x'.repeat(201)},{p_rider:'123',p_rider_cot:'COT1'}];
 for(const patch of invalid)assert.throws(()=>pickupOrderParams(new URLSearchParams({p_area:'KV2',p_status:'Assigned',p_district:'Quận 7',...patch})));
});
test("rider detail uses roster COT and includes backlog from either order COT",()=>{
  const result=pickupOrderParams(new URLSearchParams({p_status:"Assigned",p_rider:"123872",p_rider_cot:"COT1"}));
  assert.equal(result.p_cot,"all");assert.equal(result.p_rider_cot,"COT1");assert.equal(result.p_area,"all");
  assert.throws(()=>pickupOrderParams(new URLSearchParams({p_status:"Assigned",p_rider:"123872",p_rider_cot:"COT1",p_cot:"cot2"})));
});
test("invalid status, area, oversized query and unbounded pagination are rejected",()=>{
  const invalid: Record<string,string>[] = [{p_area:"KV6"},{p_status:"anything"},{page:"-1"},{page:"1.5"},{page:"10001"},{q:"x".repeat(101)},{p_rider:"1"}];
  for(const patch of invalid){
    assert.throws(()=>pickupOrderParams(new URLSearchParams({p_status:"Assigned",...patch})));
  }
});
