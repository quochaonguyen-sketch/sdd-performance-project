"use client";

import Link from "next/link";
import { useEffect,useState } from "react";
import { ArrowLeft,Download,RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readDetailRange,detailShift,detailToday,type RiderDaily,type DetailRange,summarizeRiderDaily } from "@/lib/performance/rider-detail";
import styles from "./rider-performance.module.css";

type Profile={rider_code:string;full_name:string|null;kv:string|null;cot:string|null;delivery_district:string|null;delivery_ward:string|null;pickup_district:string|null;pickup_ward:string|null};
type Result={rider:Profile;range:DetailRange;daily:RiderDaily[];summary:ReturnType<typeof summarizeRiderDaily>};
const number=(n:number)=>n.toLocaleString("vi-VN");
const percent=(n:number|null)=>n===null?"—":`${n.toLocaleString("vi-VN",{maximumFractionDigits:1})}%`;
const date=(d:string)=>d.split("-").reverse().join("/");
const shares=(value:number|null)=>{if(value===null)return "—";const first=Math.round(value*10)/10;return `${percent(first)} / ${percent(100-first)}`;};

export function RiderPerformanceView({riderId,initialRange,fromPerformance=false}:{riderId:string;initialRange?:DetailRange;fromPerformance?:boolean}){
  const [range,setRange]=useState(()=>initialRange??readDetailRange(new URLSearchParams()));
  const [from,setFrom]=useState(range.from),[to,setTo]=useState(range.to);
  const [data,setData]=useState<Result|null>(null),[loading,setLoading]=useState(true),[exporting,setExporting]=useState(false),[error,setError]=useState(""),[version,setVersion]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    Promise.resolve().then(async()=>{
      if(controller.signal.aborted)return;
      setLoading(true);setError("");
      try{
        const response=await fetch(`/api/riders/${riderId}/performance?${new URLSearchParams(range)}`,{cache:"no-store",signal:controller.signal});
        const result=await response.json();if(!response.ok||!result.success)throw Error(result.error??"Không tải được Performance");
        if(!controller.signal.aborted)setData(result);
      }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Không tải được dữ liệu");}
      finally{if(!controller.signal.aborted)setLoading(false);}
    });
    return()=>controller.abort();
  },[riderId,range,version]);
  function apply(next:DetailRange){
    try{
      const checked=readDetailRange(new URLSearchParams(next));setFrom(checked.from);setTo(checked.to);setRange(checked);
      const query=new URLSearchParams(checked);if(fromPerformance)query.set("origin","performance");
      window.history.replaceState(null,"",`${window.location.pathname}?${query}`);
    }catch(e){setError(e instanceof Error?e.message:"Ngày không hợp lệ");}
  }
  async function download(){
    if(!data)return;setExporting(true);setError("");
    try{
      const response=await fetch(`/api/riders/${riderId}/performance?${new URLSearchParams({...data.range,export:"xlsx"})}`,{cache:"no-store"});
      if(!response.ok){const result=await response.json();throw Error(result.error??"Không xuất được Excel");}
      const url=URL.createObjectURL(await response.blob());const anchor=document.createElement("a");anchor.href=url;
      anchor.download=`performance-${data.rider.rider_code}-${data.range.from}-${data.range.to}.xlsx`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){setError(e instanceof Error?e.message:"Không xuất được Excel");}finally{setExporting(false);}
  }
  const summary=data?.summary,rows=data?.daily??[],rider=data?.rider;
  return <div className={styles.page}>
    <header className={styles.header}><div><Link className={styles.back} href={fromPerformance?"/performance":"/riders"}><ArrowLeft size={14}/>{fromPerformance?"Performance":"Danh sách rider"}</Link><h1>Performance chi tiết</h1><p>{rider?.full_name??"Đang tải rider…"} · {rider?.rider_code??"—"} · {rider?.kv??"—"} · {rider?.cot??"Chưa có COT"}</p><small>{[rider?.delivery_district,rider?.delivery_ward].filter(Boolean).join(" · ")}</small></div><Button type="button" disabled={loading||exporting||!rows.length||Boolean(error)} onClick={download}><Download size={16}/>{exporting?"Đang xuất…":"Xuất Excel"}</Button></header>
    <form className={styles.filters} onSubmit={event=>{event.preventDefault();apply({from,to});}}><label>Từ ngày<Input type="date" required value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Đến ngày<Input type="date" required value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/></label><Button type="submit" disabled={loading}>Xem dữ liệu</Button><Button type="button" variant="secondary" disabled={loading} onClick={()=>setVersion(v=>v+1)}><RefreshCcw size={15}/>Làm mới</Button><div className={styles.presets}>{[7,30,90].map(days=><button type="button" key={days} disabled={loading} onClick={()=>{const end=detailToday();apply({from:detailShift(end,1-days),to:end});}}>{days} ngày gần nhất</button>)}</div></form>
    {error&&<p className={styles.error} role="alert">{error}</p>}
    <section className={styles.kpis} aria-busy={loading}>{[
      ["Deli đã giao",summary?.delivery_delivered,`${number(summary?.delivery_assigned??0)} được phân`],
      ["Pick đã lấy",summary?.pickup_picked,`${number(summary?.pickup_assigned??0)} được phân`],
      ["Convert Pick",summary?.convertedPickup,"Tổng Pick / 3, làm tròn lên"],
      ["Total",summary?.total,`${percent(summary?.deliveryShare??null)} Deli · ${percent(summary?.pickupShare??null)} Pick quy đổi`]
    ].map(([label,value,note])=><div key={String(label)}><span>{label}</span><strong>{loading?"—":number(Number(value??0))}</strong><small>{note}</small></div>)}</section>
    {rows.length>0&&<Trend rows={rows}/>}
    <section className={styles.ledger} aria-busy={loading}><div className={styles.sectionHeading}><div><h2>Sản lượng theo ngày</h2><p>{data?`${date(data.range.from)} – ${date(data.range.to)} · ${rows.length} ngày có dữ liệu · ${summary?.activeDays??0} ngày hoạt động`:"Đang tải khoảng ngày…"}</p></div>{loading&&<span role="status">Đang tải dữ liệu…</span>}</div><p className={styles.note}>COT chưa phân loại được cộng vào COT chính của rider. Tổng kỳ quy đổi một lần trên tổng Pick; có thể khác tổng các số quy đổi làm tròn từng ngày. Ngày không có bản ghi không được coi là sản lượng bằng 0.</p>
    <div className={styles.tableScroll}><table><thead><tr><th>Ngày</th><th>Deli / Phân</th><th>Pick / Phân</th><th>Convert Pick</th><th>Total</th><th>Tỷ trọng Deli / Pick QĐ</th></tr></thead><tbody>{rows.map(row=><tr key={row.date}><th scope="row">{date(row.date)}</th><td><Production done={row.delivery_delivered} assigned={row.delivery_assigned} c1={row.delivery_delivered_cot1} a1={row.delivery_assigned_cot1} c2={row.delivery_delivered_cot2} a2={row.delivery_assigned_cot2}/></td><td><Production done={row.pickup_picked} assigned={row.pickup_assigned} c1={row.pickup_picked_cot1} a1={row.pickup_assigned_cot1} c2={row.pickup_picked_cot2} a2={row.pickup_assigned_cot2}/></td><td>{number(row.convertedPickup)}</td><td className={styles.total}>{number(row.total)}</td><td>{shares(row.deliveryShare)}</td></tr>)}{!rows.length&&<tr><td colSpan={6} className={styles.empty}>{loading?"Đang tải lịch sử…":"Chưa có dữ liệu trong khoảng ngày đã chọn."}</td></tr>}</tbody>{summary&&rows.length>0&&<tfoot><tr><th>Tổng kỳ</th><td>{number(summary.delivery_delivered)} / {number(summary.delivery_assigned)}</td><td>{number(summary.pickup_picked)} / {number(summary.pickup_assigned)}</td><td>{number(summary.convertedPickup)}</td><td>{number(summary.total)}</td><td>{shares(summary.deliveryShare)}</td></tr></tfoot>}</table></div></section>
  </div>;
}
function Production({done,assigned,c1,a1,c2,a2}:{done:number;assigned:number;c1:number;a1:number;c2:number;a2:number}){
 return <div className={styles.production}><strong>{number(done)} <small>/ {number(assigned)}</small></strong><div>{(a1>0||c1>0)&&<span className={styles.cot1}>COT 1: {number(c1)}/{number(a1)}</span>}{(a2>0||c2>0)&&<span className={styles.cot2}>COT 2: {number(c2)}/{number(a2)}</span>}</div></div>;
}

function Trend({rows}:{rows:RiderDaily[]}){
 const recent=rows.slice(0,60).reverse(),max=Math.max(1,...recent.flatMap(r=>[r.delivery_delivered,r.convertedPickup]));
 return <section className={styles.ledger}><div className={styles.sectionHeading}><div><h2>Diễn biến sản lượng</h2><p>{recent.length} ngày có dữ liệu gần nhất trong khoảng chọn · Xanh dương: Deli · Xanh lục: Pick quy đổi</p></div></div><div className={styles.chart} role="img" aria-label="Biểu đồ so sánh Deli và Pick quy đổi; số liệu chi tiết nằm trong bảng theo ngày" style={{gridTemplateColumns:`repeat(${recent.length},minmax(8px,1fr))`}}>{recent.map((r,i)=><div key={r.date} className={styles.chartDay} title={`${date(r.date)}: Deli ${number(r.delivery_delivered)}, Pick quy đổi ${number(r.convertedPickup)}`}><div><span style={{height:`${Math.max(r.delivery_delivered?2:0,r.delivery_delivered/max*140)}px`}}/><span style={{height:`${Math.max(r.convertedPickup?2:0,r.convertedPickup/max*140)}px`}}/></div><small>{i%Math.ceil(recent.length/8)===0?date(r.date).slice(0,5):""}</small></div>)}</div></section>;
}
