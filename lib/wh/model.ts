export type WhStatus="Created"|"LMhub_received"|"Delivering"|"Delivered"|"Onhold"|"SOC_pendingReceive";
export type WhOrder={shipment_id:string;tracking_number:string;raw_status:WhStatus;area:string;district:string;ward:string;zone:string;driver_id:string;driver_name:string;attempt:number|null;onhold_reason:string;created_at:string|null;received_at:string|null;delivering_at:string|null;delivered_at:string|null;onhold_at:string|null;soc_pending_at:string|null};
export type WhData={day:string;snapshotAt:string|null;orders:WhOrder[];canRefresh:boolean};
export const AREAS=["KV1","KV2","KV3","KV4","KV5","UNRESOLVED"];
export const areaName=(area:string)=>area==="UNRESOLVED"?"Chưa rõ KV":area.replace("KV","Khu vực ");
export const vnDay=(stamp:string)=>new Date(Date.parse(stamp)+7*3600000).toISOString().slice(0,10);
export const riderOrder=(r:WhOrder)=>["Onhold","Delivering","Delivered"].includes(r.raw_status);
export const isUnassigned=(r:WhOrder)=>r.raw_status==="LMhub_received"&&!r.delivering_at&&!r.driver_name;
export const isOnhold=(r:WhOrder)=>r.raw_status==="Onhold"||(r.raw_status==="LMhub_received"&&!!r.delivering_at);
export type Sla={state:"Late"|"On time"|"Need recheck"|"N/A"|"Pending";minutes:number|null};
function elapsed(start:string|null,end:string|null,limit:number):Sla{
 if(!start||!end)return {state:"Pending",minutes:null};
 const duration=(Date.parse(end)-Date.parse(start))/60000;
 if(!Number.isFinite(duration))return {state:"N/A",minutes:null};
 return {state:duration>limit?"Late":"On time",minutes:Math.round(duration)};
}
export function sla(r:WhOrder,kind:"4h"|"wh"|"sdd"):Sla{
 if(!riderOrder(r))return {state:"Pending",minutes:null};
 if(kind==="wh"){
  const result=elapsed(r.created_at,r.soc_pending_at,60);
  // The Sheet WH column compares ROUND(minutes), while 4H/SDD compare exact durations.
  return result.minutes===null?result:{...result,state:result.minutes<=60?"On time":"Late"};
 }
 if(!r.delivered_at)return {state:"Pending",minutes:null};
 if(r.attempt===null)return {state:"N/A",minutes:null};
 if(r.attempt>1)return {state:"Need recheck",minutes:null};
 return elapsed(kind==="4h"?r.created_at:r.soc_pending_at,r.delivered_at,kind==="4h"?240:180);
}
export function remaining(r:WhOrder,now:number){
 return r.attempt===0&&r.created_at?Math.max(0,Math.floor((Date.parse(r.created_at)+4*3600000-now)/60000)):null;
}
export function counts(rows:WhOrder[],day:string){
 const count=(fn:(r:WhOrder)=>boolean)=>rows.filter(fn).length;
 const total=rows.length,created=count(r=>r.raw_status==="Created"),ready=count(r=>r.raw_status==="SOC_pendingReceive"),received=count(r=>!!r.received_at&&vnDay(r.received_at)===day),delivered=count(r=>r.raw_status==="Delivered");
 return {total,created,ready,received,backlog:total-created-ready-received,areaBacklog:total-created-received,
  delivering:count(r=>r.raw_status==="Delivering"),delivered,riders:new Set(rows.map(r=>r.driver_name).filter(Boolean)).size,
  rate:total?100*delivered/total:0,unassigned:count(isUnassigned),onhold:count(isOnhold),
  late:count(r=>sla(r,"4h").state==="Late"),ontime:count(r=>sla(r,"4h").state==="On time")};
}
export type WhSortOption="status"|"remaining_asc"|"created_desc"|"created_asc"|"attempt_desc";
export function statusRank(r:WhOrder):number{
 if(r.raw_status==="Delivering")return 0;
 if(r.raw_status==="Onhold"||isOnhold(r))return 1;
 if(r.raw_status==="LMhub_received")return 2;
 if(r.raw_status==="SOC_pendingReceive")return 3;
 if(r.raw_status==="Delivered")return 4;
 return 5;
}
export function compareWhOrders(a:WhOrder,b:WhOrder,sort:WhSortOption,now:number):number{
 if(sort==="status"){
  const rankA=statusRank(a),rankB=statusRank(b);
  if(rankA!==rankB)return rankA-rankB;
  if(rankA===0){
   const remA=remaining(a,now)??Infinity,remB=remaining(b,now)??Infinity;
   if(remA!==remB)return remA-remB;
  }
  if(rankA===4){
   const delComp=(b.delivered_at??"").localeCompare(a.delivered_at??"");
   if(delComp!==0)return delComp;
  }
  return (a.created_at??"").localeCompare(b.created_at??"");
 }
 if(sort==="remaining_asc"){
  const remA=remaining(a,now)??Infinity,remB=remaining(b,now)??Infinity;
  if(remA!==remB)return remA-remB;
  return (a.created_at??"").localeCompare(b.created_at??"");
 }
 if(sort==="created_desc")return (b.created_at??"").localeCompare(a.created_at??"");
 if(sort==="created_asc")return (a.created_at??"").localeCompare(b.created_at??"");
 if(sort==="attempt_desc")return (b.attempt??-1)-(a.attempt??-1)||(a.created_at??"").localeCompare(b.created_at??"");
 return 0;
}
