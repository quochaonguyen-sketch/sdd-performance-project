"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {AlertTriangle,CheckCircle2,ChevronDown,CircleAlert,Clock3,Download,Info,MapPin,PackageOpen,RefreshCw,Search,Smartphone,Truck} from "lucide-react";
import {useReportInitialDataLoading} from "@/components/layout/app-loading-store";
import {AREAS,areaName,compareWhOrders,counts,isUnassigned,isOnhold,remaining,riderOrder,sla,type WhData,type WhOrder,type WhSortOption,type Sla} from "@/lib/wh/model";
import styles from "./wh.module.css";

const fmt=(v:number)=>v.toLocaleString("vi-VN");
const stamp=(v:string|null)=>v?new Date(v).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"—";
const duration=(v:number|null)=>v===null?"—":`${Math.floor(v/60)}h ${String(v%60).padStart(2,"0")}p`;
const age=(r:WhOrder,now:number)=>r.created_at?Math.max(0,Math.floor((now-Date.parse(r.created_at))/60000)):null;
function SlaCell({value}:{value:Sla}){return <span className={styles.sla} data-state={value.state}>{value.state==="Pending"?"—":value.state}{value.minutes!==null&&<small>{duration(value.minutes)}</small>}</span>;}

function OrderList({orders,now}:{orders:WhOrder[];now:number}){
 return <div className={styles.orderScroll} role="region" aria-label="Danh sách đơn WH" tabIndex={0}>
  <div className={styles.orderHeading} aria-hidden="true"><span>Mã đơn</span><span>Rider / Địa bàn</span><span>Trạng thái</span><span>Ontime 4H</span><span>WH · 1H</span><span>SDD · 3H</span><span/></div>
  <ul className={styles.orderList}>
   {orders.map(r=>{
    const fourHour=sla(r,"4h"),left=r.raw_status==="Delivering"?remaining(r,now):null;
    const statusLabel=r.raw_status==="LMhub_received"?"Received":r.raw_status==="SOC_pendingReceive"?"WH Ready":r.raw_status==="Onhold"?"On-Hold":r.raw_status;
    return <li key={r.shipment_id}>
     <details className={styles.orderEntry}>
      <summary className={styles.orderRow} data-ontime={fourHour.state==="On time"?"On time":(fourHour.state==="Late"||(left!==null&&left<=0))?"Late":undefined}>
       <span className={styles.orderIdentity}><span className={styles.orderCellLabel}>Mã đơn</span><strong>{r.shipment_id}</strong><small>Tạo <time dateTime={r.created_at??undefined}>{stamp(r.created_at)}</time>{r.delivered_at&&<> · Giao <time dateTime={r.delivered_at}>{stamp(r.delivered_at)}</time></>}</small></span>
       <span className={styles.orderRider}><span className={styles.orderCellLabel}>Rider / Địa bàn</span><strong>{r.driver_name||"Chưa gán rider"}</strong><small><span className={styles.orderArea}>{r.area==="UNRESOLVED"?"Chưa rõ KV":r.area}</span>{r.district||"Chưa rõ quận"}</small><small>{r.ward||"Chưa rõ phường"}</small></span>
       <span className={styles.orderStatus}><span className={styles.orderCellLabel}>Trạng thái</span><span className={styles.orderStatusBadge} data-status={r.raw_status} title={r.raw_status}>{statusLabel}</span><small>Attempt <strong>{r.attempt??"—"}</strong></small></span>
       <span className={styles.orderSla} data-kind="4h"><span className={styles.orderCellLabel}>Ontime 4H</span>{fourHour.state==="Pending"&&left!==null?<span className={styles.orderCountdown} data-overdue={left<=0}><Clock3 size={13} aria-hidden="true"/>Còn {duration(left)}</span>:<SlaCell value={fourHour}/>}</span>
       <span className={styles.orderSla}><span className={styles.orderCellLabel}>WH · 1H</span><SlaCell value={sla(r,"wh")}/></span>
       <span className={styles.orderSla}><span className={styles.orderCellLabel}>SDD · 3H</span><SlaCell value={sla(r,"sdd")}/></span>
       <span className={styles.orderChevron}><ChevronDown size={16} aria-hidden="true"/><span className={styles.caption}>Mở chi tiết đơn {r.shipment_id}</span></span>
      </summary>
      <div className={styles.orderExpanded}>
       <h3><Clock3 size={14} aria-hidden="true"/>Mốc thời gian</h3>
       <dl className={styles.orderTimeline}>
        {([["Tạo đơn",r.created_at],["SOC pending",r.soc_pending_at],["Received",r.received_at],["Xuất giao",r.delivering_at],["Delivered",r.delivered_at],["On-Hold",r.onhold_at]] as const).map(([label,value])=><div key={label}><dt>{label}</dt><dd><time dateTime={value??undefined}>{stamp(value)}</time></dd></div>)}
       </dl>
       <dl className={styles.orderNotes}>
        <div><dt>Tracking</dt><dd>{r.tracking_number||r.shipment_id}</dd></div>
        <div><dt>Lý do On-Hold</dt><dd>{r.onhold_reason||"Chưa có lý do từ SPX"}</dd></div>
       </dl>
      </div>
     </details>
    </li>;
   })}
  </ul>
  {!orders.length&&<p className={styles.orderEmpty}>Không có đơn phù hợp bộ lọc.</p>}
 </div>;
}

export function WhDashboard(){
 const [data,setData]=useState<WhData|null>(null),[error,setError]=useState(""),[message,setMessage]=useState(""),[loading,setLoading]=useState(true),[syncing,setSyncing]=useState(false);
 const [area,setArea]=useState("all"),[query,setQuery]=useState(""),[status,setStatus]=useState("all"),[sort,setSort]=useState<WhSortOption>("status"),[page,setPage]=useState(1),[now,setNow]=useState(0);
 const inFlight=useRef(false),request=useRef<AbortController|null>(null);
 useReportInitialDataLoading("wh-dashboard",loading&&!data);
 const load=useCallback(async()=>{
  if(inFlight.current)return;inFlight.current=true;const controller=new AbortController();request.current=controller;
  try{const response=await fetch("/api/wh-dashboard",{cache:"no-store",signal:controller.signal}),body=await response.json();if(!response.ok)throw new Error(body.error||"Chưa tải được WH.");if(!controller.signal.aborted){setData(body);setError("");setNow(Date.now());}}
  catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Chưa tải được WH.");}
  finally{inFlight.current=false;if(!controller.signal.aborted)setLoading(false);}
 },[]);
 useEffect(()=>{const first=setTimeout(()=>void load(),0),timer=setInterval(()=>{if(!document.hidden)void load();},30000),clock=setInterval(()=>setNow(Date.now()),30000);return()=>{clearTimeout(first);clearInterval(timer);clearInterval(clock);request.current?.abort();};},[load]);
 async function sync(){
  if(syncing)return;setSyncing(true);setMessage("");
  try{const response=await fetch("/api/wh-dashboard",{method:"POST"}),body=await response.json();if(!response.ok)throw new Error(body.error);setMessage(body.deduplicated?"WH đang chờ hoặc đang chạy; dashboard tự cập nhật khi hoàn tất.":"Đã xếp hàng lấy dữ liệu WH. Worker sẽ cập nhật dashboard khi hoàn tất.");}
  catch(e){setError(e instanceof Error?e.message:"Không gửi được lệnh.");}finally{setSyncing(false);}
 }
 const currentDay=new Date(now+7*3600000).toISOString().slice(0,10),expired=!!data&&now>0&&data.day!==currentDay;
 const rows=expired?[]:data?.orders??[],scope=rows.filter(r=>area==="all"||r.area===area),c=counts(scope,data?.day??""),term=query.trim().toLocaleLowerCase("vi");
 const matches=(r:WhOrder)=>!term||[r.shipment_id,r.tracking_number,r.driver_name,r.district,r.ward,r.zone].join(" ").toLocaleLowerCase("vi").includes(term);
 const filtered=scope.filter(r=>riderOrder(r)&&matches(r)&&(status==="all"||status==="onhold"&&isOnhold(r)||status==="late"&&sla(r,"4h").state==="Late"||r.raw_status===status)).sort((a,b)=>compareWhOrders(a,b,sort,now));
 const pages=Math.max(1,Math.ceil(filtered.length/50)),activePage=Math.min(page,pages),visible=filtered.slice((activePage-1)*50,activePage*50);
 const waiting=scope.filter(r=>["LMhub_received","Created","SOC_pendingReceive"].includes(r.raw_status)&&matches(r)).sort((a,b)=>(a.attempt??-1)-(b.attempt??-1)||(a.created_at??"").localeCompare(b.created_at??""));
 const pending=scope.filter(r=>r.raw_status==="SOC_pendingReceive"&&matches(r));
 function download(){
  const cell=(v:unknown)=>{let text=String(v??"");if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  const lines=[["Shipment","Tracking","KV","District","Ward","Rider","Status","Attempt","Created","Received","Delivering","Delivered","Onhold","SOC pending","4H","WH","SDD"],...filtered.map(r=>[r.shipment_id,r.tracking_number,areaName(r.area),r.district,r.ward,r.driver_name,r.raw_status,r.attempt,stamp(r.created_at),stamp(r.received_at),stamp(r.delivering_at),stamp(r.delivered_at),stamp(r.onhold_at),stamp(r.soc_pending_at),sla(r,"4h").state,sla(r,"wh").state,sla(r,"sdd").state])];
  const url=URL.createObjectURL(new Blob(['\ufeff'+lines.map(line=>line.map(cell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"})),link=document.createElement("a");link.href=url;link.download=`WH-${data?.day??"today"}.csv`;link.click();URL.revokeObjectURL(url);
 }
 return <div className={styles.page}>
  <header className={`ops-page-header ${styles.header}`}><div><p className={styles.eyebrow}><Smartphone size={16} aria-hidden="true"/>WH / HIGH VALUE</p><h1>iPhone Report Dashboard</h1><p>Hub 4232 · Ngày {data?.day.split("-").reverse().join("/")??"—"} · Cập nhật <time dateTime={data?.snapshotAt??undefined}>{stamp(data?.snapshotAt??null)}</time></p></div><div className={styles.actions}><Link href="/data-sources">Nguồn dữ liệu</Link><button onClick={()=>void load()} disabled={loading}><RefreshCw size={16} aria-hidden="true"/>Làm mới</button>{data?.canRefresh&&<button className={styles.primary} onClick={()=>void sync()} disabled={syncing}><RefreshCw size={16} aria-hidden="true"/>{syncing?"Đang gửi…":"Lấy dữ liệu WH"}</button>}</div></header>
  {error&&<p role="alert" className={styles.error}>{error}{data&&" Dữ liệu bên dưới là lần đọc thành công gần nhất."}</p>}{message&&<p role="status" className={styles.notice}>{message}</p>}
  {loading&&!data&&<p role="status">Đang tải dashboard WH…</p>}
  {data&&!data.snapshotAt&&<p className={styles.notice}>Chưa có dữ liệu hôm nay. Chạy nguồn WH / iPhone trong Nguồn dữ liệu.</p>}
  {expired&&<p role="status" className={styles.notice}>Đã sang ngày mới. Đang chờ dữ liệu WH hôm nay.</p>}
  {data?.snapshotAt&&!expired&&now-Date.parse(data.snapshotAt)>10*60000&&<p className={styles.notice}>Dữ liệu đã hơn 10 phút chưa cập nhật. Kiểm tra lịch và kết nối worker.</p>}
  <section className={styles.summary} aria-label="Tổng quan WH">
   <div className={styles.summaryGrid}>
    <article className={styles.summaryCard} aria-labelledby="wh-volume-title">
     <h2 id="wh-volume-title"><PackageOpen size={16} aria-hidden="true"/>Tổng quan đơn</h2>
     <dl className={styles.summaryMetrics}>
      <div><dt>Total</dt><dd className={styles.summaryTotal}>{fmt(c.total)}</dd></div>
      <div><dt>Received D0</dt><dd>{fmt(c.received)}</dd></div>
     </dl>
     <dl className={styles.summaryMinor}>
      <div><dt>Created</dt><dd>{fmt(c.created)}</dd></div>
      <div><dt>WH Ready</dt><dd>{fmt(c.ready)}</dd></div>
      <div><dt>Backlog</dt><dd>{fmt(c.backlog)}</dd></div>
     </dl>
    </article>
    <article className={styles.summaryCard} aria-labelledby="wh-delivery-title">
     <h2 id="wh-delivery-title"><Truck size={16} aria-hidden="true"/>Tiến độ giao</h2>
     <dl className={styles.summaryMetrics}>
      <div><dt>Delivered</dt><dd className={styles.summarySuccess}>{fmt(c.delivered)}</dd></div>
      <div><dt>Delivering</dt><dd className={styles.summaryActive}>{fmt(c.delivering)}</dd></div>
     </dl>
     <div className={styles.summaryCompletion}>
      <div><span>Success Rate</span><strong>{c.rate.toFixed(1)}%</strong></div>
      <progress max={100} value={c.rate} aria-label="Tỷ lệ giao thành công"/>
     </div>
    </article>
    <article className={styles.summaryCard} aria-labelledby="wh-attention-title">
     <h2 id="wh-attention-title"><CircleAlert size={16} aria-hidden="true"/>Cần theo dõi</h2>
     <dl className={styles.summaryMetrics}>
      <div><dt>Unassigned</dt><dd className={styles.summaryDanger}>{fmt(c.unassigned)}</dd></div>
      <div><dt>On-Hold</dt><dd className={styles.summaryWarning}>{fmt(c.onhold)}</dd></div>
     </dl>
     <div className={styles.summarySla}>
      <span>SLA 4H</span>
      <dl><div className={styles.summaryLate}><dt>Late</dt><dd>{fmt(c.late)}</dd></div><div className={styles.summaryOntime}><dt>On time</dt><dd>{fmt(c.ontime)}</dd></div></dl>
     </div>
    </article>
   </div>
  </section>
  <section className={styles.panel}>
   <div className={styles.panelHead}>
    <div className={styles.panelTitleGroup}>
     <div className={styles.panelIconWrapper}>
      <MapPin size={17} aria-hidden="true"/>
     </div>
     <div>
      <div className={styles.panelHeadingRow}>
       <h2 className={styles.panelTitle}>Orders by area</h2>
       <span className={styles.panelBadge}>
        {area==="all"?`${AREAS.length} khu vực`:areaName(area)}
       </span>
      </div>
      <p className={styles.panelSubtitle}>Thống kê tiến độ giao, tồn đọng và SLA theo từng khu vực quản lý</p>
     </div>
    </div>
   </div>
   <div className={styles.scroll}>
    <table aria-label="Bảng đơn WH theo từng khu vực">
     <caption className={styles.caption}>Đơn WH theo địa bàn hiện tại</caption>
     <thead>
      <tr>
       <th scope="col">Khu vực</th>
       <th scope="col" className={styles.colRight}>Total</th>
       <th scope="col" className={styles.colRight}>Backlog</th>
       <th scope="col" className={styles.colRight}>Received D0</th>
       <th scope="col" className={styles.colRight}>Delivering</th>
       <th scope="col" className={styles.colRight}>Delivered</th>
       <th scope="col" className={styles.colCenter}>Success Rate</th>
       <th scope="col" className={styles.colRight}>Unassigned</th>
       <th scope="col" className={styles.colRight}>On-Hold</th>
       <th scope="col" className={styles.colRight}>Riders</th>
       <th scope="col" className={styles.colRight}>Late 4H</th>
       <th scope="col" className={styles.colRight}>On time 4H</th>
      </tr>
     </thead>
     <tbody>
      {AREAS.filter(a=>area==="all"||a===area).map(a=>{
       const n=counts(scope.filter(r=>r.area===a),data?.day??"");
       return <tr key={a}>
        <th scope="row">
         <span className={styles.areaPill} data-area={a}>
          <span className={styles.areaDot} aria-hidden="true"/>
          {areaName(a)}
         </span>
        </th>
        <td className={`${styles.colRight} ${styles.cellTotal}`}>{fmt(n.total)}</td>
        <td className={styles.colRight}>
         {n.areaBacklog>0?<span className={styles.badgeWarning}>{fmt(n.areaBacklog)}</span>:<span className={styles.cellMuted}>0</span>}
        </td>
        <td className={`${styles.colRight} ${styles.cellNum}`}>{fmt(n.received)}</td>
        <td className={styles.colRight}>
         {n.delivering>0?<span className={styles.badgeInfo}>{fmt(n.delivering)}</span>:<span className={styles.cellMuted}>0</span>}
        </td>
        <td className={styles.colRight}>
         {n.delivered>0?<span className={styles.badgeSuccess}>{fmt(n.delivered)}</span>:<span className={styles.cellMuted}>0</span>}
        </td>
        <td className={styles.colCenter}>
         <div className={styles.rateCell}>
          <span className={styles.rateValue} data-high={n.rate>=80} data-low={n.rate===0}>{n.rate.toFixed(1)}%</span>
          <div className={styles.rateBarTrack} aria-hidden="true"><div className={styles.rateBarFill} style={{width:`${Math.min(100,Math.max(0,n.rate))}%`}}/></div>
         </div>
        </td>
        <td className={styles.colRight}>
         {n.unassigned>0?<span className={styles.badgeAttention}>{fmt(n.unassigned)}</span>:<span className={styles.cellMuted}>0</span>}
        </td>
        <td className={styles.colRight}>
         {n.onhold>0?<span className={styles.badgeWarning}>{fmt(n.onhold)}</span>:<span className={styles.cellMuted}>0</span>}
        </td>
        <td className={`${styles.colRight} ${styles.cellNum}`}>{fmt(n.riders)}</td>
        <td className={styles.colRight}>
         {n.late>0?<span className={styles.badgeDanger}><AlertTriangle size={11} aria-hidden="true"/>{fmt(n.late)}</span>:<span className={styles.cellMuted}>0</span>}
        </td>
        <td className={styles.colRight}>
         {n.ontime>0?<span className={styles.badgeSuccessLight}>{fmt(n.ontime)}</span>:<span className={styles.cellMuted}>0</span>}
        </td>
       </tr>;
      })}
     </tbody>
     {area==="all"&&(
      <tfoot>
       <tr className={styles.totalRow}>
        <th scope="row">Tổng cộng</th>
        <td className={`${styles.colRight} ${styles.cellTotal}`}>{fmt(c.total)}</td>
        <td className={styles.colRight}>
         {c.backlog>0?<span className={styles.badgeWarning}>{fmt(c.backlog)}</span>:<span className={styles.cellMuted}>0</span>}
        </td>
        <td className={`${styles.colRight} ${styles.cellNum}`}>{fmt(c.received)}</td>
        <td className={styles.colRight}>
         {c.delivering>0?<span className={styles.badgeInfo}>{fmt(c.delivering)}</span>:<span className={styles.cellMuted}>0</span>}
        </td>
        <td className={styles.colRight}>
         {c.delivered>0?<span className={styles.badgeSuccess}>{fmt(c.delivered)}</span>:<span className={styles.cellMuted}>0</span>}
        </td>
        <td className={styles.colCenter}>
         <div className={styles.rateCell}>
          <span className={styles.rateValue} data-high={c.rate>=80} data-low={c.rate===0}>{c.rate.toFixed(1)}%</span>
          <div className={styles.rateBarTrack} aria-hidden="true"><div className={styles.rateBarFill} style={{width:`${Math.min(100,Math.max(0,c.rate))}%`}}/></div>
         </div>
        </td>
        <td className={styles.colRight}>
         {c.unassigned>0?<span className={styles.badgeAttention}>{fmt(c.unassigned)}</span>:<span className={styles.cellMuted}>0</span>}
        </td>
        <td className={styles.colRight}>
         {c.onhold>0?<span className={styles.badgeWarning}>{fmt(c.onhold)}</span>:<span className={styles.cellMuted}>0</span>}
        </td>
        <td className={`${styles.colRight} ${styles.cellNum}`}>{fmt(c.riders)}</td>
        <td className={styles.colRight}>
         {c.late>0?<span className={styles.badgeDanger}><AlertTriangle size={11} aria-hidden="true"/>{fmt(c.late)}</span>:<span className={styles.cellMuted}>0</span>}
        </td>
        <td className={styles.colRight}>
         {c.ontime>0?<span className={styles.badgeSuccessLight}>{fmt(c.ontime)}</span>:<span className={styles.cellMuted}>0</span>}
        </td>
       </tr>
      </tfoot>
     )}
    </table>
   </div>
   <div className={styles.panelFootnote}>
    <Info size={14} aria-hidden="true" className={styles.footnoteIcon}/>
    <div className={styles.footnoteText}>
     <span><strong>Quy tắc tính Sheet gốc:</strong> Backlog tổng = Total − Created − WH Ready − Received D0; Backlog từng KV = Total − Created − Received D0.</span>
     <span className={styles.footnoteMuted}>Bộ lọc tìm kiếm phía trên tự động đồng bộ cho danh sách và CSV xuất ra.</span>
    </div>
   </div>
  </section>
  <div className={styles.split}>
   <section className={styles.panel}>
    <div className={styles.panelHead}>
     <div className={styles.panelTitleGroup}>
      <div className={styles.panelIconWrapper} data-tone="warning">
       <Clock3 size={17} aria-hidden="true"/>
      </div>
      <div>
       <div className={styles.panelHeadingRow}>
        <h2 className={styles.panelTitle}>Chờ xuất giao</h2>
        <span className={styles.counterBadge} data-alert={waiting.length>0}>
         {waiting.length}
        </span>
       </div>
       <p className={styles.panelSubtitle}>Đơn lưu Hub chưa gán hoặc chưa xuất giao tới rider</p>
      </div>
     </div>
    </div>
    <div className={styles.queueInfoBanner}>
     <Info size={13} aria-hidden="true"/>
     <span>LMhub_received, Created và SOC pending như danh sách Unassigned trên Sheet; KPI Unassigned chỉ đếm đơn chưa gán thực sự.</span>
    </div>
    <div className={`${styles.scroll} ${styles.tableScroll}`} tabIndex={0} role="region" aria-label="Bảng đơn chờ xuất giao">
     <table>
      <thead>
       <tr>
        <th scope="col">Mã đơn</th>
        <th scope="col">KV / Quận</th>
        <th scope="col" className={styles.colRight}>Aging</th>
        <th scope="col">Nhận hàng</th>
        <th scope="col" className={styles.colCenter}>Attempt</th>
        <th scope="col" className={styles.colRight}>Còn lại 4H</th>
       </tr>
      </thead>
      <tbody>
       {waiting.slice(0,50).map(r=>{
        const orderAge=age(r,now);
        const rem=remaining(r,now);
        return <tr key={r.shipment_id}>
         <th scope="row"><span className={styles.shipmentCode}>{r.shipment_id}</span></th>
         <td>
          <div className={styles.areaDistrictCol}>
           <span className={styles.areaMiniPill} data-area={r.area}>{r.area==="UNRESOLVED"?"Chưa rõ KV":r.area}</span>
           <span className={styles.districtName}>{r.district||"Chưa rõ quận"}</span>
          </div>
         </td>
         <td className={styles.colRight}>
          <span className={orderAge!==null&&orderAge>=720?styles.agingCritical:orderAge!==null&&orderAge>=240?styles.agingWarning:styles.agingNormal}>
           {duration(orderAge)}
          </span>
         </td>
         <td>{r.received_at?<span className={styles.statusPillReceived}>Received</span>:<span className={styles.statusPillUnreceived}>Chưa nhận</span>}</td>
         <td className={styles.colCenter}>{(r.attempt??0)>0?<span className={styles.attemptBadgeWarning}>Attempt {r.attempt}</span>:<span className={styles.attemptBadge}>{r.attempt??"—"}</span>}</td>
         <td className={styles.colRight}>
          {rem===null?<span className={styles.cellMuted}>—</span>:rem<=0?<span className={styles.slaOverdue}><AlertTriangle size={11} aria-hidden="true"/>{duration(rem)}</span>:rem<=60?<span className={styles.slaUrgent}><Clock3 size={11} aria-hidden="true"/>{duration(rem)}</span>:<span className={styles.slaNormal}><Clock3 size={11} aria-hidden="true"/>{duration(rem)}</span>}
         </td>
        </tr>;
       })}
       {!waiting.length&&<tr><td colSpan={6}><div className={styles.tableEmpty}><CheckCircle2 size={24} className={styles.emptySuccessIcon} aria-hidden="true"/><p>Không có đơn chờ xuất giao</p><small>Tất cả đơn đã được xử lý hoặc gán rider thành công</small></div></td></tr>}
      </tbody>
     </table>
    </div>
    {waiting.length>50&&<div className={styles.tableFooterNote}>Hiển thị 50 đơn ưu tiên nhất; xem danh sách đầy đủ bên dưới hoặc xuất CSV.</div>}
   </section>
   <section className={styles.panel}>
    <div className={styles.panelHead}>
     <div className={styles.panelTitleGroup}>
      <div className={styles.panelIconWrapper} data-tone="info">
       <Truck size={17} aria-hidden="true"/>
      </div>
      <div>
       <div className={styles.panelHeadingRow}>
        <h2 className={styles.panelTitle}>SOC pending receive</h2>
        <span className={styles.counterBadge} data-alert={pending.length>0}>
         {pending.length}
        </span>
       </div>
       <p className={styles.panelSubtitle}>Đơn đang chuyển từ SOC tới Hub, đang chờ quét nhận</p>
      </div>
     </div>
    </div>
    <div className={`${styles.scroll} ${styles.tableScroll}`} tabIndex={0} role="region" aria-label="Bảng đơn SOC pending receive">
     <table>
      <thead>
       <tr>
        <th scope="col">Mã đơn</th>
        <th scope="col">Khu vực</th>
        <th scope="col">Tạo đơn</th>
        <th scope="col" className={styles.colRight}>Aging</th>
       </tr>
      </thead>
      <tbody>
       {pending.slice(0,50).map(r=>{
        const orderAge=age(r,now)??0;
        const isOverdue=orderAge>=60;
        return <tr key={r.shipment_id}>
         <th scope="row"><span className={styles.shipmentCode}>{r.shipment_id}</span></th>
         <td><span className={styles.areaMiniPill} data-area={r.area}>{areaName(r.area)}</span></td>
         <td><time dateTime={r.created_at??undefined} className={styles.timeText}>{stamp(r.created_at)}</time></td>
         <td className={styles.colRight}>
          {isOverdue?<span className={styles.agingCritical} data-overdue="true"><AlertTriangle size={11} aria-hidden="true"/>{duration(orderAge)}</span>:<span className={styles.agingNormal}>{duration(orderAge)}</span>}
         </td>
        </tr>;
       })}
       {!pending.length&&<tr><td colSpan={4}><div className={styles.tableEmpty}><CheckCircle2 size={24} className={styles.emptySuccessIcon} aria-hidden="true"/><p>Không có đơn SOC pending receive</p><small>Không có kiện hàng nào đang tắc ở luồng chuyển tiếp SOC</small></div></td></tr>}
      </tbody>
     </table>
    </div>
    {pending.length>50&&<div className={styles.tableFooterNote}>Hiển thị 50 đơn đầu; lọc SOC_pendingReceive bên dưới để xem đủ.</div>}
   </section>
  </div>
  <section className={`${styles.panel} ${styles.ordersPanel}`}>
    <div className={styles.orderToolbar}>
     <div className={styles.orderToolbarHead}>
      <div>
       <h2>Chi tiết đơn &amp; rider <span>{fmt(filtered.length)}</span></h2>
       <p>Mở một đơn để xem mốc thời gian và lý do On-Hold.</p>
      </div>
      <button onClick={download} disabled={!filtered.length} className={styles.exportBtn}>
       <Download size={15} aria-hidden="true"/>Xuất CSV
      </button>
     </div>
     <div className={styles.orderFilterRow}>
      <label className={styles.search}>
       <span>Tìm đơn / rider / địa bàn</span>
       <div>
        <Search size={15} aria-hidden="true"/>
        <input value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder="Mã đơn, tên rider, quận, phường…"/>
       </div>
      </label>
      <div className={styles.orderFilterSelects}>
       <label>
        <span>Khu vực</span>
        <select value={area} onChange={e=>{setArea(e.target.value);setPage(1);}}>
         <option value="all">Tất cả khu vực</option>
         {AREAS.map(a=><option key={a} value={a}>{areaName(a)}</option>)}
        </select>
       </label>
       <label>
        <span>Trạng thái</span>
        <select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}>
         {[["all","Tất cả"],["Delivering","Delivering"],["onhold","On-Hold"],["Delivered","Delivered"],["late","Late 4H"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
       </label>
       <label>
        <span>Sắp xếp</span>
        <select value={sort} onChange={e=>{setSort(e.target.value as WhSortOption);setPage(1);}}>
         <option value="status">Trạng thái (Delivering / On-Hold trước)</option>
         <option value="remaining_asc">Hạn 4H: Gấp nhất trước</option>
         <option value="created_desc">Tạo đơn: Mới nhất trước</option>
         <option value="created_asc">Tạo đơn: Cũ nhất trước</option>
         <option value="attempt_desc">Attempt: Nhiều nhất trước</option>
        </select>
       </label>
      </div>
     </div>
    </div>
   <OrderList orders={visible} now={now}/>
   <div className={styles.pagination}><span>Trang {activePage} / {pages} · {filtered.length} đơn thuộc bảng SLA rider</span><button disabled={activePage===1} onClick={()=>setPage(activePage-1)}>Trước</button><button disabled={activePage===pages} onClick={()=>setPage(activePage+1)}>Sau</button></div>
  </section>
  <details className={styles.rules}><summary>Quy tắc tính từ Google Sheet</summary><p>WH Ready = SOC_pendingReceive. On-Hold gồm Onhold và LMhub_received đã có delivering_time. SLA chỉ đánh giá bảng rider (Onhold / Delivering / Delivered). Attempt 0 lấy delivered_time, Attempt 1 lấy onhold_time, lớn hơn 1 cần kiểm tra lại; thiếu Attempt hiển thị N/A. Ontime 4H: tối đa 4 giờ từ tạo đơn; WH: SOC pending − tạo đơn tối đa 60 phút sau làm tròn; SDD: tối đa 3 giờ từ SOC pending. Còn lại 4H tính từ tạo đơn, chỉ khi Attempt = 0. Múi giờ Việt Nam. Snapshot giữ đơn chưa giao và đơn giao hôm nay.</p></details>
 </div>;
}
