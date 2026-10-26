import { performanceConversion } from "./conversion.ts";
import { allocateCotRemainder } from "./cot-allocation.ts";

export const detailCounters=["delivery_assigned","delivery_delivered","pickup_assigned","pickup_picked","delivery_assigned_cot1","delivery_delivered_cot1","delivery_assigned_cot2","delivery_delivered_cot2","pickup_assigned_cot1","pickup_picked_cot1","pickup_assigned_cot2","pickup_picked_cot2"] as const;
export type DetailCounts=Record<typeof detailCounters[number],number>;
export type DetailSource={report_date:string;cot?:string|null}&Partial<Record<typeof detailCounters[number],number|null>>;
export type RiderDaily=DetailCounts&ReturnType<typeof performanceConversion>&{date:string};
export type DetailRange={from:string;to:string};
export function detailToday(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).format(new Date());}
export function detailShift(day:string,days:number){const d=new Date(`${day}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function validDay(day:string){return /^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day;}
export function readDetailRange(query:URLSearchParams):DetailRange {
  const from=query.get("from"),to=query.get("to");
  if(from!==null||to!==null){
    if(!from||!to||!validDay(from)||!validDay(to)||from>to)throw new Error("Khoảng từ ngày–đến ngày không hợp lệ.");
    if((Date.parse(to)-Date.parse(from))/86400000>3660)throw new Error("Chọn khoảng tối đa 10 năm mỗi lần.");
    return {from,to};
  }
  const n=Number(query.get("days")??45),days=Number.isFinite(n)?Math.max(7,Math.min(180,Math.trunc(n))):45;
  const end=detailToday();return {from:detailShift(end,-days+1),to:end};
}
const emptyCounts=()=>Object.fromEntries(detailCounters.map(key=>[key,0])) as DetailCounts;
export function buildRiderDaily(source:DetailSource[],primaryCot:string|null):RiderDaily[]{
  const grouped=new Map<string,DetailCounts>();
  const dayCots=new Map<string,string>();
  for(const row of source){const day=row.report_date.slice(0,10),counts=grouped.get(day)??emptyCounts();for(const key of detailCounters)counts[key]+=Number(row[key]??0);grouped.set(day,counts);if(row.cot?.trim()&&!dayCots.has(day))dayCots.set(day,row.cot);}
  return [...grouped].map(([date,counts])=>{
    for(const [assigned,completed,a1,c1,a2,c2] of [
      ["delivery_assigned","delivery_delivered","delivery_assigned_cot1","delivery_delivered_cot1","delivery_assigned_cot2","delivery_delivered_cot2"],
      ["pickup_assigned","pickup_picked","pickup_assigned_cot1","pickup_picked_cot1","pickup_assigned_cot2","pickup_picked_cot2"]
    ] as const){
      const split=allocateCotRemainder({assigned:counts[assigned],completed:counts[completed],a1:counts[a1],c1:counts[c1],a2:counts[a2],c2:counts[c2]},primaryCot?.trim()||dayCots.get(date));
      counts[a1]=split.a1;counts[c1]=split.c1;counts[a2]=split.a2;counts[c2]=split.c2;
    }
    return {date,...counts,...performanceConversion(counts.delivery_delivered,counts.pickup_picked)};
  }).sort((a,b)=>b.date.localeCompare(a.date));
}
export function summarizeRiderDaily(rows:RiderDaily[]){
  const totals=emptyCounts();for(const row of rows)for(const key of detailCounters)totals[key]+=row[key];
  return {...totals,...performanceConversion(totals.delivery_delivered,totals.pickup_picked),recordedDays:rows.length,activeDays:rows.filter(r=>r.delivery_assigned+r.pickup_assigned>0).length};
}
