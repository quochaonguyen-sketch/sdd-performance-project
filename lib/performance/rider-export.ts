import * as XLSX from "xlsx";
import { summarizeRiderDaily,type RiderDaily,type DetailRange } from "./rider-detail.ts";

export function riderPerformanceWorkbook(rider:{rider_code:string;full_name:string|null;kv:string|null;cot:string|null},range:DetailRange,daily:RiderDaily[]){
  const headers=["Ngày","Total Delivered","Total Assigned Deli","Total Delivered COT 1","Total Assigned Deli COT 1","Total Delivered COT 2","Total Assigned Deli COT 2","Total Picked","Total Assigned Pick","Total Picked COT 1","Total Assigned Pick COT 1","Total Picked COT 2","Total Assigned Pick COT 2","Convert Pick","Total","% Deli","% Pick quy đổi"];
  const ordered=[...daily].sort((a,b)=>a.date.localeCompare(b.date));
  const summary=summarizeRiderDaily(daily);
  const toValues=(r:Omit<RiderDaily,"date">)=>[r.delivery_delivered,r.delivery_assigned,r.delivery_delivered_cot1,r.delivery_assigned_cot1,r.delivery_delivered_cot2,r.delivery_assigned_cot2,r.pickup_picked,r.pickup_assigned,r.pickup_picked_cot1,r.pickup_assigned_cot1,r.pickup_picked_cot2,r.pickup_assigned_cot2,r.convertedPickup,r.total,r.deliveryShare===null?null:r.deliveryShare/100,r.pickupShare===null?null:r.pickupShare/100];
  const ws=XLSX.utils.aoa_to_sheet([
    ["PERFORMANCE CHI TIẾT RIDER"],
    ["Mã rider",rider.rider_code,"Họ tên",rider.full_name??"","KV",rider.kv??"","COT chính",rider.cot??""],
    ["Từ ngày",range.from,"Đến ngày",range.to,"Ngày có dữ liệu",daily.length],
    ["Convert Pick = Pick / 3 làm tròn lên. Tổng kỳ quy đổi một lần trên tổng Pick, không cộng các số quy đổi đã làm tròn theo ngày."],
    [],headers,...ordered.map(r=>[r.date,...toValues(r)]),["Tổng kỳ",...toValues(summary)],
  ]);
  const first=7,last=6+daily.length,total=last+1;
  for(let i=0;i<ordered.length;i++){
    const r=first+i;
    ws[`N${r}`]={t:"n",f:`ROUNDUP(H${r}/3,0)`,v:ordered[i].convertedPickup};
    ws[`O${r}`]={t:"n",f:`B${r}+N${r}`,v:ordered[i].total};
    if(ordered[i].total>0){ws[`P${r}`]={t:"n",f:`B${r}/O${r}`,v:ordered[i].deliveryShare!/100,z:"0.0%"};ws[`Q${r}`]={t:"n",f:`N${r}/O${r}`,v:ordered[i].pickupShare!/100,z:"0.0%"};}
  }
  if(daily.length){
    for(const col of ["B","C","D","E","F","G","H","I","J","K","L","M"]){const cell=ws[`${col}${total}`];cell.f=`SUM(${col}${first}:${col}${last})`;}
    ws[`N${total}`]={t:"n",f:`ROUNDUP(H${total}/3,0)`,v:summary.convertedPickup};
    ws[`O${total}`]={t:"n",f:`B${total}+N${total}`,v:summary.total};
    if(summary.total){ws[`P${total}`]={t:"n",f:`B${total}/O${total}`,v:summary.deliveryShare!/100,z:"0.0%"};ws[`Q${total}`]={t:"n",f:`N${total}/O${total}`,v:summary.pickupShare!/100,z:"0.0%"};}
  }
  ws["!cols"]=headers.map((_,i)=>({wch:i===0?15:i>=15?18:28}));
  ws["!merges"]=[{s:{r:0,c:0},e:{r:0,c:16}},{s:{r:3,c:0},e:{r:3,c:16}}];
  if(daily.length)ws["!autofilter"]={ref:`A6:Q${last}`};
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Performance");
  return wb;
}
