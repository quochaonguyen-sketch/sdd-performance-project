"use client";
import {useState} from "react";
import {ArrowDownToLine,Navigation,Package,Truck} from "lucide-react";
import type {LinehaulTrip} from "@/lib/linehaul/model";
import {linehaulSummary,LOAD_STAGE_KEYS,LOAD_STAGES,loadStage,stageOrders,type LoadStage} from "@/lib/linehaul/summary";
import styles from "./linehaul.module.css";

const nf=new Intl.NumberFormat("vi-VN"),icons={unloaded:ArrowDownToLine,incoming:Navigation,loading:Truck,at_hub:Package};
export function LinehaulSummary({trips,day,loading,onSelect}:{trips:LinehaulTrip[];day:string;loading:boolean;onSelect:(id:string)=>void}){
 const [stage,setStage]=useState<LoadStage|"all">("all"),[hour,setHour]=useState<number|null>(null);
 const {groups,hourly,unplaced}=linehaulSummary(trips,day);
 const keys=stage==="all"?LOAD_STAGE_KEYS:[stage];
 const maximum=Math.max(1,...hourly.map(bucket=>keys.reduce((sum,key)=>sum+bucket.orders[key],0)));
 const details=(hour===null?keys.flatMap(key=>groups[key].trips):hourly[hour].trips.filter(trip=>keys.includes(loadStage(trip)!)))
  .sort((a,b)=>(stageOrders(b,loadStage(b)!)??-1)-(stageOrders(a,loadStage(a)!)??-1));
 const tripMax=Math.max(1,...details.map(trip=>stageOrders(trip,loadStage(trip)!)??0));
 return <section className={styles.loadOverview} aria-label="Tổng hợp sản lượng LH">
  <header className={styles.overviewHeading}><div><span className={styles.eyebrow}>SẢN LƯỢNG TRONG NGÀY</span><h2>Hàng về & tiến độ xả tải</h2></div><span>{nf.format(trips.length)} chuyến hôm nay · Đơn vị: đơn hàng</span></header>
  <div className={styles.loadCards}>{LOAD_STAGE_KEYS.map(key=>{
   const group=groups[key],Icon=icons[key],hasKnown=group.trips.length>group.missing;
   return <button type="button" key={key} className={styles.loadCard} data-stage={key} aria-pressed={stage===key} onClick={()=>{setStage(value=>value===key?"all":key);setHour(null);}}>
    <span>{group.label}<Icon size={18} aria-hidden="true"/></span><strong>{loading?"…":group.trips.length&&!hasKnown?"—":`${group.missing?"≥ ":""}${nf.format(group.knownOrders)}`}<small>đơn</small></strong>
    <span>{group.trips.length?`${nf.format(group.trips.length)} chuyến${group.missing?` · ${group.missing} chuyến chưa rõ số đơn`:" · Đã có số đơn"}`:"Chưa có chuyến trong nhóm này"}</span>
    <small>{key==="unloaded"?"Chỉ cộng số đơn khi xác nhận xả đủ tải tại hub":key==="loading"?"Chờ xuất phát · số đơn đã báo tải":key==="incoming"?"Tổng tải các chuyến đang di chuyển về hub":"Xe đã đến, chưa đủ bằng chứng hoàn tất xả"}</small>
   </button>;
  })}</div>
  <div className={styles.loadCharts}>
   <section className={styles.hourlyPanel} aria-label="Biểu đồ sản lượng theo giờ"><header><div><h3>Phân bổ đơn theo giờ</h3><p>Đã xả: giờ xả thực tế · Đang về / lên hàng: giờ đến kế hoạch STA</p></div><button type="button" onClick={()=>{setStage("all");setHour(null);}}>Xem tất cả</button></header>
    <div className={styles.chartLegend}>{LOAD_STAGE_KEYS.map(key=><button type="button" key={key} data-stage={key} aria-pressed={stage==="all"||stage===key} onClick={()=>{setStage(value=>value===key?"all":key);setHour(null);}}><i/>{LOAD_STAGES[key]}</button>)}</div>
    <div className={styles.hourlyScroll}><div className={styles.hourlyChart}>{hourly.map(bucket=>{
     const total=keys.reduce((sum,key)=>sum+bucket.orders[key],0);
     const missing=keys.reduce((sum,key)=>sum+bucket.missing[key],0);
     const count=bucket.trips.filter(trip=>keys.includes(loadStage(trip)!)).length;
     const label=keys.map(key=>`${LOAD_STAGES[key]}: ${nf.format(bucket.orders[key])} đơn đã báo${bucket.missing[key]?` · ${bucket.missing[key]} chuyến chưa rõ số đơn`:""}`).join("; ");
     return <button type="button" key={bucket.hour} className={styles.hourColumn} aria-pressed={hour===bucket.hour} aria-label={`${bucket.hour}:00 · ${label} · ${count} chuyến`} title={`${bucket.hour}:00 · ${label}`} onClick={()=>setHour(value=>value===bucket.hour?null:bucket.hour)}>
      <span className={styles.columnValue}>{total?`${nf.format(total)}${missing?"+?":""}`:missing?"?":""}</span><span className={styles.columnTrack}>{keys.map(key=><span key={key} data-stage={key} style={{height:`${bucket.orders[key]/maximum*100}%`}}/>)}</span><span className={styles.hourLabel}>{String(bucket.hour).padStart(2,"0")}:00</span>
     </button>;
    })}</div></div>
    <p className={styles.chartFootnote}>Bấm cột giờ để xem các chuyến tương ứng. Đã đến hub dùng giờ đến thực tế (ATA).</p>
    {keys.some(key=>unplaced[key]>0)&&<p className={styles.chartWarning}>{keys.filter(key=>unplaced[key]>0).map(key=>`${LOAD_STAGES[key]}: ${unplaced[key]} chuyến chưa có mốc giờ phù hợp`).join(" · ")}. Vẫn tính trong tổng, không tự gán giờ lên biểu đồ.</p>}
   </section>
   <section className={styles.tripChartPanel} aria-label="Chi tiết sản lượng theo chuyến"><header><div><h3>{hour===null?"Chi tiết tải theo chuyến":`Các chuyến tại mốc ${String(hour).padStart(2,"0")}:00`}</h3><p>{stage==="all"?"Tất cả trạng thái":LOAD_STAGES[stage]} · {details.length} chuyến · Bấm để mở chi tiết</p></div></header>
    <div className={styles.tripBars}>{details.map(trip=>{
     const key=loadStage(trip)!,orders=stageOrders(trip,key);
     return <button type="button" key={trip.trip_id} className={styles.tripBar} onClick={()=>onSelect(trip.trip_id)} aria-haspopup="dialog"><span><strong>{trip.plate_number||trip.lt_code}</strong><small>{trip.lt_code} · {LOAD_STAGES[key]}</small></span><b>{orders===null?"Chưa rõ":`${nf.format(orders)} đơn`}</b><span className={styles.tripBarTrack}><i data-stage={key} style={{width:`${orders===null?0:orders/tripMax*100}%`}}/></span></button>;
    })}{!details.length&&<p className={styles.chartEmpty}>{loading?"Đang tải sản lượng…":"Không có chuyến trong phạm vi đang chọn."}</p>}</div>
   </section>
  </div>
  <p className={styles.chartFootnote}>Tổng chỉ tính luồng hàng về hub, không cộng chuyến xuất hub. Số đơn chưa được SPX báo tải không tính thành 0. Chuyến qua hub có thể chở cả đơn đi tiếp; số đơn đã xả chỉ xác nhận được khi đủ dữ liệu. “Đang lên hàng” là nhóm chuyến chờ xuất phát.</p>
 </section>;
}
