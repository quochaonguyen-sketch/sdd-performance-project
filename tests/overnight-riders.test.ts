import test from "node:test";
import assert from "node:assert/strict";
import { groupOvernightRiders, paginateOvernightRiders } from "../lib/overnight-holds/riders.ts";
import type { OvernightHoldOrder } from "../lib/overnight-holds/model.ts";

function order(code:string,status="Onhold",id=code):OvernightHoldOrder {
 return {id, rider_code:code,rider_name:"Cùng tên",current_status:status,area:"Khu vực 1"} as OvernightHoldOrder;
}
test("groups by cutoff rider ID, prioritizes remaining orders and conservatively counts unknown statuses",()=>{
 const groups=groupOvernightRiders([order('A','Delivered'),order('A','Returned'),order('B'),order('B','Unknown'),order('C')]);
 assert.deepEqual(groups.map(r=>[r.code,r.total,r.remaining,r.resolved]),[['B',2,2,0],['C',1,1,0],['A',2,0,2]]);
});
test("rider pagination retains all orders even when a rider exceeds the old 50-order page",()=>{
 const orders=Array.from({length:120},(_,i)=>order('A','Onhold',String(i))).concat([order('B')]);
 const first=paginateOvernightRiders(orders,[{rider_code:'A',note:'Liên hệ trước 8h',updated_by:'Dispatcher'}],0,1);
 assert.equal(first.orders.length,120);assert.equal(first.totalRiders,2);assert.equal(first.riders[0].note,'Liên hệ trước 8h');
 assert.equal(first.riders[0].remaining,120);
 const last=paginateOvernightRiders(orders,[],99,1);assert.equal(last.page,1);assert.equal(last.orders[0].rider_code,'B');
 const exported=paginateOvernightRiders(orders,[],0,1,true);assert.equal(exported.orders.length,121);assert.equal(exported.riders.length,2);
});
test("empty groups and cleared rider notes stay empty",()=>{
 assert.deepEqual(paginateOvernightRiders([],[],0,20),{riders:[],orders:[],totalRiders:0,page:0});
 assert.equal(groupOvernightRiders([order('A')],[{rider_code:'A',note:'',updated_by:'Dispatcher'}])[0].note,'');
});
