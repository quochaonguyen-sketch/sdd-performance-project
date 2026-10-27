import * as XLSX from "xlsx";
import type { PerformanceFilters,PerformanceRow } from "./driver-performance";
import { allocateCotRemainder } from "./cot-allocation.ts";
import { performanceConversion } from "./conversion.ts";

/** Rider totals or rider/day rows, using the table's rounding and COT rules. */
export function performanceListWorkbook(filters:PerformanceFilters,rows:PerformanceRow[],mode:"summary"|"daily"="summary"){
  const headers=["Mã rider","Tên rider","KV","COT chính","Quận giao","Phường giao","Quận pickup","Total Delivered","Total Assigned Deli","Total Delivered COT 1","Total Assigned Deli COT 1","Total Delivered COT 2","Total Assigned Deli COT 2","Total Picked","Total Assigned Pick","Total Picked COT 1","Total Assigned Pick COT 1","Total Picked COT 2","Total Assigned Pick COT 2","Convert Pick","Total","% Deli","% Pick quy đổi"];
  const values=rows.map(row=>{
    const d=allocateCotRemainder({assigned:row.delivery_assigned,completed:row.delivery_delivered,a1:row.delivery_assigned_cot1,c1:row.delivery_delivered_cot1,a2:row.delivery_assigned_cot2,c2:row.delivery_delivered_cot2},row.cot);
    const p=allocateCotRemainder({assigned:row.pickup_assigned,completed:row.pickup_picked,a1:row.pickup_assigned_cot1,c1:row.pickup_picked_cot1,a2:row.pickup_assigned_cot2,c2:row.pickup_picked_cot2},row.cot);
    const c=performanceConversion(d.completed,p.completed);
    return [row.driver_id,row.rider_name??row.driver_name??"",row.kv??"",row.cot??"",row.delivery_district??"",row.delivery_ward??"",row.pickup_district??"",d.completed,d.assigned,d.c1,d.a1,d.c2,d.a2,p.completed,p.assigned,p.c1,p.a1,p.c2,p.a2,c.convertedPickup,c.total,c.deliveryShare===null?null:c.deliveryShare/100,c.pickupShare===null?null:c.pickupShare/100];
  });
  const total=Array.from({length:14},(_,i)=>values.reduce((sum,row)=>sum+Number(row[i+7]??0),0));
  const ws=XLSX.utils.aoa_to_sheet([
    ["RIDER PERFORMANCE"],
    ["Từ ngày",filters.start,"Đến ngày",filters.end,"Số rider",rows.length],
    ["Khu",filters.kv,"Quận giao",filters.district,"Phường",filters.ward,"COT",filters.cot],
    ["Từ khóa",filters.q,"Sắp xếp",filters.sort,"Thứ tự",filters.dir],
    ["Convert Pick = ROUNDUP(Pick/3,0) trên tổng Pick của từng rider trong kỳ. Dòng tổng cộng các giá trị quy đổi của từng rider."],
    [],headers,...values,["Tổng cộng","","","","","","",...total],
  ]);
  const first=8,last=7+rows.length,totalRow=last+1;
  for(let i=0;i<values.length;i++){
    const r=first+i;
    ws[`T${r}`]={t:"n",f:`ROUNDUP(N${r}/3,0)`,v:Number(values[i][19])};
    ws[`U${r}`]={t:"n",f:`H${r}+T${r}`,v:Number(values[i][20])};
    if(Number(values[i][20])>0){ws[`V${r}`]={t:"n",f:`H${r}/U${r}`,v:Number(values[i][21]),z:"0.0%"};ws[`W${r}`]={t:"n",f:`T${r}/U${r}`,v:Number(values[i][22]),z:"0.0%"};}
  }
  for(let i=7;i<=20;i++){
    const col=XLSX.utils.encode_col(i);
    ws[`${col}${totalRow}`]={t:"n",...(rows.length?{f:`SUM(${col}${first}:${col}${last})`}:{}),v:total[i-7]};
  }
  for(const col of ["V","W"]){delete ws[`${col}${totalRow}`];}
  if(total[13]>0){ws[`V${totalRow}`]={t:"n",f:`H${totalRow}/U${totalRow}`,v:total[0]/total[13],z:"0.0%"};ws[`W${totalRow}`]={t:"n",f:`T${totalRow}/U${totalRow}`,v:total[12]/total[13],z:"0.0%"};}
  ws["!cols"]=headers.map((_,i)=>({wch:i===1?28:i<7?18:28}));
  ws["!merges"]=[{s:{r:0,c:0},e:{r:0,c:22}},{s:{r:4,c:0},e:{r:4,c:22}}];
  if(rows.length)ws["!autofilter"]={ref:`A7:W${last}`};
  const wb=XLSX.utils.book_new();
  if(mode==="daily"){
    // Build the existing formulas first, then shift their references one column for the date.
    const daily:XLSX.WorkSheet={};
    for(const [address,cell] of Object.entries(ws)){
      if(address.startsWith("!"))continue;
      const position=XLSX.utils.decode_cell(address);
      const shifted={...cell};
      if(shifted.f)shifted.f=shifted.f.replace(/\b([A-Z]+)(\d+)\b/g,(_:string,col:string,row:string)=>`${XLSX.utils.encode_col(XLSX.utils.decode_col(col)+1)}${row}`);
      daily[XLSX.utils.encode_cell({r:position.r,c:position.c+1})]=shifted;
    }
    daily.A7={t:"s",v:"Ngày"};
    rows.forEach((row,i)=>{daily[`A${i+8}`]={t:"s",v:row.report_date};});
    daily.A1={t:"s",v:"RIDER PERFORMANCE · CHI TIẾT THEO NGÀY"};
    delete daily.B1;
    daily.B2={t:"s",v:"Từ ngày"};daily.F2={t:"s",v:"Số dòng rider/ngày"};
    daily.B5={t:"s",v:"Mỗi dòng là một rider/ngày có dữ liệu. Convert Pick làm tròn lên riêng từng ngày, nên tổng quy đổi có thể khác bảng tổng hợp cả kỳ."};
    daily['!ref']=`A1:X${totalRow}`;
    daily['!cols']=[{wch:14},...ws['!cols']!];
    daily['!merges']=[{s:{r:0,c:0},e:{r:0,c:23}},{s:{r:4,c:1},e:{r:4,c:23}}];
    if(rows.length)daily['!autofilter']={ref:`A7:X${last}`};
    XLSX.utils.book_append_sheet(wb,daily,"Theo ngay");
  }else XLSX.utils.book_append_sheet(wb,ws,"Performance");
  return wb;
}
