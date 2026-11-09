export type WhStatus="Created"|"LMhub_received"|"Delivering"|"Delivered"|"Onhold"|"SOC_pendingReceive";
export type WhOrder={shipment_id:string;tracking_number:string;raw_status:WhStatus;area:string;district:string;ward:string;zone:string;driver_id:string;driver_name:string;attempt:number|null;onhold_reason:string;created_at:string|null;received_at:string|null;delivering_at:string|null;delivered_at:string|null;onhold_at:string|null;soc_pending_at:string|null};
export type DateFilterMode = "day" | "week" | "range" | "month";
export type WhDailySummary = {
  date: string;
  total: number;
  delivered: number;
  delivering: number;
  onhold: number;
  unassigned: number;
  ontime: number;
  late: number;
  ontimeRate: number;
  lateRate: number;
  rate: number;
  nearLate?: number;
};
export type WhData = {
  day: string;
  from?: string;
  to?: string;
  mode?: DateFilterMode;
  snapshotAt: string | null;
  orders: WhOrder[];
  canRefresh: boolean;
  availableDates?: string[];
  dailyBreakdown?: WhDailySummary[];
};
export const AREAS=["KV1","KV2","KV3","KV4","KV5","UNRESOLVED"];
export const areaName=(area:string)=>area==="UNRESOLVED"?"Chưa rõ KV":area.replace("KV","Khu vực ");
export const vnDay = (stamp: string | null | undefined) => {
  if (!stamp) return "";
  const parsed = Date.parse(stamp);
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed + 7 * 3600000).toISOString().slice(0, 10);
};
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
 return elapsed(kind==="4h"?r.created_at:r.soc_pending_at,r.delivered_at,kind==="4h"?240:180);
}
export function remaining(r:WhOrder,now:number):number|null{
 if(!r.created_at)return null;
 return Math.floor((Date.parse(r.created_at)+4*3600000-now)/60000);
}
export function isNearLate(r:WhOrder,now:number,thresholdMinutes=60):boolean{
 if(r.raw_status==="Delivered"||!r.created_at)return false;
 const rem=Math.floor((Date.parse(r.created_at)+4*3600000-now)/60000);
 return rem>0&&rem<=thresholdMinutes;
}
export function isOverdue(r:WhOrder,now:number):boolean{
 if(r.raw_status==="Delivered"||!r.created_at)return false;
 const rem=Math.floor((Date.parse(r.created_at)+4*3600000-now)/60000);
 return rem<=0;
}
export function counts(rows: WhOrder[], day: string, now: number = Date.now()) {
  let created = 0;
  let ready = 0;
  let received = 0;
  let delivered = 0;
  let delivering = 0;
  let unassigned = 0;
  let onhold = 0;
  let late = 0;
  let ontime = 0;
  let nearLate = 0;
  const ridersSet = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const status = r.raw_status;

    if (status === "Created") created++;
    else if (status === "SOC_pendingReceive") ready++;
    else if (status === "Delivered") delivered++;
    else if (status === "Delivering") delivering++;

    if (r.received_at) {
      const recDay = vnDay(r.received_at);
      const inDay = !day
        ? true
        : day.includes("..")
        ? (() => {
            const [from, to] = day.split("..");
            return recDay >= from && recDay <= to;
          })()
        : recDay === day;
      if (inDay) received++;
    }

    if (r.driver_name) {
      ridersSet.add(r.driver_name);
    }

    if (isUnassigned(r)) unassigned++;
    if (isOnhold(r)) onhold++;

    if (riderOrder(r)) {
      const fourH = sla(r, "4h");
      if (fourH.state === "Late") late++;
      else if (fourH.state === "On time") ontime++;
      if (isNearLate(r, now)) nearLate++;
    }
  }

  const total = rows.length;
  const slaTotal = ontime + late;
  const ontimeRate = slaTotal > 0 ? (100 * ontime) / slaTotal : 0;
  const lateRate = slaTotal > 0 ? (100 * late) / slaTotal : 0;

  return {
    total,
    created,
    ready,
    received,
    backlog: total - created - ready - received,
    areaBacklog: total - created - received,
    delivering,
    delivered,
    riders: ridersSet.size,
    rate: total ? (100 * delivered) / total : 0,
    unassigned,
    onhold,
    late,
    ontime,
    slaTotal,
    ontimeRate,
    lateRate,
    nearLate,
  };
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
const fastStrCmp = (x?: string | null, y?: string | null) => {
 const a = x ?? "", b = y ?? "";
 return a === b ? 0 : a > b ? 1 : -1;
};
export function compareWhOrders(a:WhOrder,b:WhOrder,sort:WhSortOption,now:number):number{
 if(sort==="status"){
  const rankA=statusRank(a),rankB=statusRank(b);
  if(rankA!==rankB)return rankA-rankB;
  if(rankA===0){
   const remA=remaining(a,now)??Infinity,remB=remaining(b,now)??Infinity;
   if(remA!==remB)return remA-remB;
  }
  if(rankA===4){
   const delComp=fastStrCmp(b.delivered_at,a.delivered_at);
   if(delComp!==0)return delComp;
  }
  return fastStrCmp(a.created_at,b.created_at);
 }
 if(sort==="remaining_asc"){
  const remA=remaining(a,now)??Infinity,remB=remaining(b,now)??Infinity;
  if(remA!==remB)return remA-remB;
  return fastStrCmp(a.created_at,b.created_at);
 }
 if(sort==="created_desc")return fastStrCmp(b.created_at,a.created_at);
 if(sort==="created_asc")return fastStrCmp(a.created_at,b.created_at);
 if(sort==="attempt_desc")return (b.attempt??-1)-(a.attempt??-1)||fastStrCmp(a.created_at,b.created_at);
 return 0;
}

export function parseYmd(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getMondayOfWeek(dateStr: string): string {
  const date = parseYmd(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return toYmd(date);
}

export function getSundayOfWeek(dateStr: string): string {
  const monday = parseYmd(getMondayOfWeek(dateStr));
  monday.setDate(monday.getDate() + 6);
  return toYmd(monday);
}

export function getMonthRange(monthStr: string): { from: string; to: string } {
  const [year, month] = monthStr.split("-").map(Number);
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDate = new Date(year, month, 0).getDate();
  const lastDay = `${year}-${String(month).padStart(2, "0")}-${String(lastDate).padStart(2, "0")}`;
  return { from: firstDay, to: lastDay };
}

export function formatVnDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}
