"use client";

import { useId, useState } from "react";
import { hourlyChanges, hourlyValue, niceBacklogMax, type BacklogCot, type BacklogHourlyDay, type BacklogSource } from "@/lib/dashboard/backlog-history";
import styles from "./backlog-history.module.css";

const colors = { pickup: "#059669", delivery: "#2563eb" };
const labels = { pickup: "Pickup", delivery: "Delivery" };
const fmt = (n: number | null) => n === null ? "—" : n.toLocaleString("vi-VN");
const hour = (h: number) => `${String(h).padStart(2,"0")}h`;
const W=1280, H=430, L=78, R=28, T=34, B=48, PW=W-L-R, PH=H-T-B;

export function BacklogTrendChart({ daily, active, cot, area, selected, onSelect, large=false }: {
  daily: Partial<Record<BacklogSource,BacklogHourlyDay>>; active: BacklogSource; cot: BacklogCot; area: string;
  selected: number | null; onSelect: (hour:number)=>void; large?: boolean;
}) {
  const [hovered,setHovered]=useState<number|null>(null);
  const id=useId().replaceAll(":","");
  const max=niceBacklogMax(Object.values(daily).flatMap(day=>day?.hours.map(p=>hourlyValue(p,cot,area))??[]));
  const x=(h:number)=>L+PW*(h+.5)/24;
  const y=(value:number)=>T+PH-(value/max)*PH;
  const focus=hovered??selected;
  const points=(["pickup","delivery"] as const).map(source=>({ source, values:Array.from({length:24},(_,h)=>hourlyValue(daily[source]?.hours[h],cot,area)) }));
  const hasData=points.some(series=>series.values.some(value=>value!==null));
  return <div className={`${styles.trendCanvas}${large?` ${styles.trendLarge}`:""}`}>
    <div className={styles.chartReadout} aria-live="polite"><span>{focus===null?"Di chuột hoặc chọn một giờ":`${hour(focus)} · chốt lúc ${String(focus).padStart(2,"0")}:50`}</span>{focus!==null&&points.map(({source,values})=><strong key={source} style={{color:colors[source]}}>{labels[source]} <b>{fmt(values[focus])}</b></strong>)}</div>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Biểu đồ tồn Pickup và Delivery theo 24 giờ; giờ thiếu dữ liệu được để trống">
      <defs>{points.map(({source})=><linearGradient key={source} id={`${id}-${source}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colors[source]} stopOpacity=".16"/><stop offset="100%" stopColor={colors[source]} stopOpacity=".015"/></linearGradient>)}</defs>
      {Array.from({length:6},(_,i)=>{const value=max*i/5;return <g key={i}><line x1={L} x2={W-R} y1={y(value)} y2={y(value)} className={styles.gridLine}/><text x={L-14} y={y(value)+4} textAnchor="end" className={styles.axisLabel}>{fmt(value)}</text></g>;})}
      <text x={L} y={18} className={styles.axisLabel}>ĐƠN TỒN</text>
      {focus!==null&&<rect x={x(focus)-PW/48} y={T} width={PW/24} height={PH} className={styles.focusBand}/>}
      {points.map(({source,values})=><g key={source} opacity={active===source?1:.7}>
        {values.map((value,h)=>{
          const previous=values[h-1];
          if(value===null||previous==null)return null;
          const final=daily[source]?.hours[h].is_final&&daily[source]?.hours[h-1].is_final;
          return <g key={h}><path d={`M ${x(h-1)} ${y(previous)} L ${x(h)} ${y(value)} L ${x(h)} ${y(0)} L ${x(h-1)} ${y(0)} Z`} fill={`url(#${id}-${source})`}/><path d={`M ${x(h-1)} ${y(previous)} L ${x(h)} ${y(value)}`} fill="none" stroke={colors[source]} strokeWidth={active===source?3.5:2.5} strokeDasharray={final?undefined:"6 5"} strokeLinecap="round"/></g>;
        })}
        {values.map((value,h)=>value!==null&&<circle key={h} cx={x(h)} cy={y(value)} r={focus===h?7:4.5} stroke={colors[source]} strokeWidth="2.5" fill={daily[source]?.hours[h].is_final?colors[source]:"var(--color-paper)"}/>)}
      </g>)}
      {Array.from({length:24},(_,h)=><g key={h} role="button" tabIndex={0} aria-label={`Chọn ${hour(h)}: Pickup ${fmt(points[0].values[h])}, Delivery ${fmt(points[1].values[h])}`} onMouseEnter={()=>setHovered(h)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(h)} onBlur={()=>setHovered(null)} onClick={()=>onSelect(h)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onSelect(h);}}} className={styles.chartHit}>
        <rect x={x(h)-PW/48} y={T} width={PW/24} height={PH} fill="transparent"/>
        <text x={x(h)} y={H-18} textAnchor="middle" className={styles.axisLabel}>{String(h).padStart(2,"0")}</text>
      </g>)}
      {!hasData&&<text x={W/2} y={H/2} textAnchor="middle" className={styles.emptyChart}>Chưa có dữ liệu cho ngày này · hệ thống chốt mỗi giờ lúc :50</text>}
    </svg>
  </div>;
}

export function BacklogDeltaChart({ day, cot, area, onSelect }: { day?: BacklogHourlyDay; cot: BacklogCot; area:string; onSelect:(h:number)=>void }) {
  const rows=hourlyChanges(day?.hours??[],cot,area);
  const max=niceBacklogMax(rows.map(row=>row.delta===null?null:Math.abs(row.delta)));
  const mid=142, scale=92/max;
  return <div className={styles.deltaCanvas}><svg viewBox={`0 0 ${W} 288`} role="img" aria-label="Biến động tồn so với giờ liền trước; không tính khi thiếu một trong hai giờ">
    {[-1,0,1].map(sign=><g key={sign}><line x1={L} x2={W-R} y1={mid-sign*92} y2={mid-sign*92} className={styles.gridLine}/><text x={L-14} y={mid-sign*92+4} textAnchor="end" className={styles.axisLabel}>{sign>0?"+":""}{fmt(sign*max)}</text></g>)}
    {Array.from({length:24},(_,h)=>{const delta=rows[h]?.delta??null;const x=L+PW*(h+.5)/24;return <g key={h}>
      {delta!==null&&<rect x={x-13} y={delta>=0?mid-delta*scale:mid} width={26} height={Math.max(2,Math.abs(delta)*scale)} rx="4" fill={delta>0?"#d97706":"#059669"}><title>{hour(h)}: {delta>0?"+":""}{fmt(delta)} đơn so với {hour(h-1)}</title></rect>}
      {delta===null&&<circle cx={x} cy={mid} r="2" fill="var(--color-rule)"/>}
      <text x={x} y={267} textAnchor="middle" className={styles.axisLabel}>{String(h).padStart(2,"0")}</text>
      <rect x={x-PW/48} y={30} width={PW/24} height={220} fill="transparent" role="button" tabIndex={0} aria-label={`${hour(h)}: ${delta===null?"Chưa đủ hai giờ":`${delta>0?"+":""}${fmt(delta)} đơn`}`} onClick={()=>onSelect(h)} onKeyDown={event=>{if(event.key==="Enter")onSelect(h);}} className={styles.chartHit}/>
    </g>;})}
  </svg></div>;
}
