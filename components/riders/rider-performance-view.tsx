"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect,useState } from "react";
import { ArrowLeft,CalendarDays,Calculator,Download,Layers3,MapPin,PackageCheck,RefreshCcw,Search,SlidersHorizontal,Truck,UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readDetailRange,riderPerformanceLookup,detailShift,detailToday,type RiderDaily,type DetailRange,summarizeRiderDaily } from "@/lib/performance/rider-detail";
import styles from "./rider-performance.module.css";

type Profile={rider_code:string;full_name:string|null;kv:string|null;cot:string|null;delivery_district:string|null;delivery_ward:string|null;pickup_district:string|null;pickup_ward:string|null};
type Result={rider:Profile;range:DetailRange;daily:RiderDaily[];summary:ReturnType<typeof summarizeRiderDaily>};
const number=(n:number)=>n.toLocaleString("vi-VN");
const percent=(n:number|null)=>n===null?"—":`${n.toLocaleString("vi-VN",{maximumFractionDigits:1})}%`;
const date=(d:string)=>d.split("-").reverse().join("/");
const shares=(value:number|null)=>{if(value===null)return "—";const first=Math.round(value*10)/10;return `${percent(first)} / ${percent(100-first)}`;};

export function RiderPerformanceView({riderId,initialRange,fromPerformance=false}:{riderId:string;initialRange?:DetailRange;fromPerformance?:boolean}){
  const router=useRouter();
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
    <header className={styles.header}><div><Link className={styles.back} href={fromPerformance?"/performance":"/riders"}><ArrowLeft size={16} aria-hidden="true"/>{fromPerformance?"Rider Performance":"Danh sách rider"}</Link><p className={styles.eyebrow}>RIDER OPERATIONS / PROFILE</p><h1>Performance chi tiết</h1><p className={styles.description}>Đối chiếu sản lượng, COT và hiệu suất của từng rider theo ngày.</p></div><Button className={styles.exportButton} type="button" disabled={loading||exporting||!rows.length||Boolean(error)} aria-busy={exporting} onClick={download}><Download size={17} aria-hidden="true"/>{exporting?"Đang xuất…":"Xuất Excel"}</Button></header>
    <section className={styles.profile} aria-label="Hồ sơ rider đang xem"><div className={styles.profileIdentity}><span className={styles.avatar}><UserRound size={26} aria-hidden="true"/></span><div><h2>{rider?(rider.full_name||`Rider ${rider.rider_code}`):(loading?"Đang tải hồ sơ…":"Chưa có dữ liệu hồ sơ")}</h2><div className={styles.profileTags}><span>ID <b>{rider?.rider_code??riderId}</b></span><span>{rider?.kv??"KV —"}</span><span data-cot={(rider?.cot??"").replace(/\s/g,"").toLowerCase().startsWith("cot2")?"2":(rider?.cot??"").replace(/\s/g,"").toLowerCase().startsWith("cot1")?"1":undefined}>{rider?.cot??"Chưa có COT"}</span></div><p><MapPin size={14} aria-hidden="true"/>{[rider?.delivery_district,rider?.delivery_ward].filter(Boolean).join(" · ")||(loading?"Đang tải địa bàn…":"Chưa có thông tin địa bàn")}</p></div></div><div className={styles.rangeSummary}><span><CalendarDays size={15} aria-hidden="true"/>Kỳ đang xem</span><strong>{date(data?.range.from??range.from)} — {date(data?.range.to??range.to)}</strong><small>{loading?"Đang tải lịch sử…":`${rows.length} ngày có dữ liệu · ${summary?.activeDays??0} ngày hoạt động`}</small></div></section>
    <section className={styles.filters} aria-label="Chọn rider và thời gian"><div className={styles.filterHeading}><div><SlidersHorizontal size={17} aria-hidden="true"/><h2>Tra cứu & thời gian</h2></div><span role="status" aria-live="polite">{loading?"Đang tải dữ liệu…":"Dữ liệu theo khoảng ngày đã chọn"}</span></div><div className={styles.controlGrid}>
    <form className={styles.lookupForm} onSubmit={event=>{
      event.preventDefault();
      try{
        const code=riderPerformanceLookup(String(new FormData(event.currentTarget).get("riderCode")??"")).value;
        const query=new URLSearchParams(range);if(fromPerformance)query.set("origin","performance");
        if(code!==riderId&&code!==rider?.rider_code)router.push(`/riders/${encodeURIComponent(code)}/performance?${query}`);
        else setVersion(v=>v+1);
        setError("");
      }catch(e){setError(e instanceof Error?e.message:"ID rider không hợp lệ");}
    }}><label>ID rider<Input key={rider?.rider_code??riderId} name="riderCode" required maxLength={40} defaultValue={rider?.rider_code??(/^[0-9]+$/.test(riderId)?riderId:"")} placeholder="Ví dụ: 158197" aria-label="ID rider cần xem"/></label><Button className={styles.primaryButton} type="submit"><Search size={16} aria-hidden="true"/>Xem rider</Button><small className={styles.switchNote}>Đổi ID sẽ giữ nguyên khoảng ngày đang xem.</small></form>
    <form className={styles.dateForm} onSubmit={event=>{event.preventDefault();apply({from,to});}}><label>Từ ngày<Input type="date" required value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Đến ngày<Input type="date" required value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/></label><Button className={styles.primaryButton} type="submit" disabled={loading}>Xem dữ liệu</Button><Button type="button" variant="secondary" disabled={loading} onClick={()=>setVersion(v=>v+1)}><RefreshCcw size={16} aria-hidden="true" className={loading?styles.spinning:undefined}/>Làm mới</Button><div className={styles.presets}><span>Chọn nhanh</span>{[7,30,90].map(days=><button type="button" key={days} disabled={loading} aria-label={`${days} ngày gần nhất`} aria-pressed={range.to===detailToday()&&range.from===detailShift(detailToday(),1-days)} onClick={()=>{const end=detailToday();apply({from:detailShift(end,1-days),to:end});}}>{days} ngày</button>)}</div></form>
    </div></section>
    {error&&<p className={styles.error} role="alert">{error}</p>}
    <section className={styles.kpis} aria-label="Tổng quan sản lượng rider" aria-busy={loading}>{[
      {label:"Total Delivered",value:summary?.delivery_delivered,note:`${number(summary?.delivery_assigned??0)} Total Assigned Deli`,Icon:Truck},
      {label:"Total Picked",value:summary?.pickup_picked,note:`${number(summary?.pickup_assigned??0)} Total Assigned Pick`,Icon:PackageCheck},
      {label:"Convert Pick",value:summary?.convertedPickup,note:"Total Picked / 3, làm tròn lên",Icon:Calculator},
      {label:"Total",value:summary?.total,note:`${percent(summary?.deliveryShare??null)} Deli · ${percent(summary?.pickupShare??null)} Pick quy đổi`,Icon:Layers3}
    ].map(({label,value,note,Icon})=><div key={label}><div className={styles.cardTop}><span className={styles.metricIcon}><Icon size={19} aria-hidden="true"/></span><span>Tổng trong kỳ</span></div><span className={styles.metricLabel}>{label}</span><strong>{loading?"—":number(value??0)}</strong><small>{loading?"Đang tải sản lượng…":note}</small></div>)}</section>
    <section className={styles.ledger} aria-busy={loading}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>DAILY BREAKDOWN</span><h2>Sản lượng theo ngày</h2><p>{data?`${date(data.range.from)} – ${date(data.range.to)} · ${rows.length} ngày có dữ liệu · ${summary?.activeDays??0} ngày hoạt động`:"Đang tải khoảng ngày…"}</p></div><span className={styles.countBadge}>{loading?"Đang tải dữ liệu…":`${rows.length} ngày`}</span></div><details className={styles.formula}><summary>Cách tính & đối soát COT</summary><p>COT chưa phân loại được cộng vào COT chính của rider. Tổng kỳ quy đổi một lần trên Total Picked; có thể khác tổng các số quy đổi làm tròn từng ngày. Ngày không có bản ghi không được coi là sản lượng bằng 0.</p></details>
    <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Sản lượng rider theo ngày, cuộn ngang để xem các cột"><table><colgroup>{[14,23,23,12,10,18].map((width,index)=><col key={index} style={{width:`${width}%`}}/>)}</colgroup><thead><tr><th>Ngày</th><th className={styles.metricHeading}>Total Delivered<small>/ Total Assigned Deli</small></th><th className={styles.metricHeading}>Total Picked<small>/ Total Assigned Pick</small></th><th className={styles.compactCell}>Convert Pick</th><th className={styles.compactCell}>Total</th><th>Tỷ trọng Deli / Pick QĐ</th></tr></thead><tbody>{rows.map(row=><tr key={row.date}><th scope="row">{date(row.date)}</th><td><Production done={row.delivery_delivered} assigned={row.delivery_assigned} c1={row.delivery_delivered_cot1} a1={row.delivery_assigned_cot1} c2={row.delivery_delivered_cot2} a2={row.delivery_assigned_cot2}/></td><td><Production done={row.pickup_picked} assigned={row.pickup_assigned} c1={row.pickup_picked_cot1} a1={row.pickup_assigned_cot1} c2={row.pickup_picked_cot2} a2={row.pickup_assigned_cot2}/></td><td className={styles.compactCell}><span className={styles.convertedPill}>{number(row.convertedPickup)}</span></td><td className={styles.compactCell}><span className={styles.totalPill}>{number(row.total)}</span></td><td>{shares(row.deliveryShare)}</td></tr>)}{!rows.length&&<tr><td colSpan={6} className={styles.empty}>{loading?"Đang tải lịch sử…":"Chưa có dữ liệu trong khoảng ngày đã chọn."}</td></tr>}</tbody>{summary&&rows.length>0&&<tfoot><tr><th>Tổng kỳ</th><td>{number(summary.delivery_delivered)} / {number(summary.delivery_assigned)}</td><td>{number(summary.pickup_picked)} / {number(summary.pickup_assigned)}</td><td className={styles.compactCell}>{number(summary.convertedPickup)}</td><td className={styles.compactCell}>{number(summary.total)}</td><td>{shares(summary.deliveryShare)}</td></tr></tfoot>}</table></div></section>
    {rows.length>0&&<Trend rows={rows}/>}
  </div>;
}
function Production({done,assigned,c1,a1,c2,a2}:{done:number;assigned:number;c1:number;a1:number;c2:number;a2:number}){
 return <div className={styles.production}><strong>{number(done)} <small>/ {number(assigned)}</small></strong><div>{(a1>0||c1>0)&&<span className={styles.cot1}>COT 1: {number(c1)}/{number(a1)}</span>}{(a2>0||c2>0)&&<span className={styles.cot2}>COT 2: {number(c2)}/{number(a2)}</span>}</div></div>;
}

function Trend({rows}:{rows:RiderDaily[]}){
 const recent=rows.slice(0,60).reverse(),max=Math.max(1,...recent.flatMap(r=>[r.delivery_delivered,r.convertedPickup]));
 return <section className={styles.ledger}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>PERFORMANCE TREND</span><h2>Diễn biến sản lượng</h2><p>{recent.length} ngày có dữ liệu gần nhất trong khoảng chọn · Tối đa 60 ngày</p></div><div className={styles.legend}><span><i aria-hidden="true"/>Total Delivered</span><span><i aria-hidden="true"/>Convert Pick</span></div></div><div className={styles.chartFrame}><div className={styles.chartScale} aria-hidden="true"><span>{number(max)}</span><span>{number(max/2)}</span><span>0</span></div><div className={styles.chart} role="img" aria-label="Biểu đồ so sánh Total Delivered và Convert Pick; số liệu chi tiết nằm trong bảng theo ngày" style={{gridTemplateColumns:`repeat(${recent.length},minmax(8px,1fr))`}}>{recent.map((r,i)=><div key={r.date} className={styles.chartDay} title={`${date(r.date)}: Total Delivered ${number(r.delivery_delivered)}, Convert Pick ${number(r.convertedPickup)}`}><div><span style={{height:`${Math.max(r.delivery_delivered?2:0,r.delivery_delivered/max*140)}px`}}/><span style={{height:`${Math.max(r.convertedPickup?2:0,r.convertedPickup/max*140)}px`}}/></div><small>{i%Math.ceil(recent.length/8)===0?date(r.date).slice(0,5):""}</small></div>)}</div></div></section>;
}
