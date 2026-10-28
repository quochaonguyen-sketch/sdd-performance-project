"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Boxes, CheckCircle2, Clock3, MapPin, Navigation, Package, RefreshCw, Search, Truck, X } from "lucide-react";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { gpsIsStale, inTodayHistory, LH_PHASES, sortTrips, type LinehaulData, type LinehaulTrip } from "@/lib/linehaul/model";
import styles from "./linehaul.module.css";
import { TripRoadDistance } from "./trip-road-distance";

const Map=dynamic(()=>import("./linehaul-map"),{ssr:false,loading:()=> <p className={styles.mapLoading}>Đang mở bản đồ…</p>});
const number=(value:number|null)=>value===null?"—":value.toLocaleString("vi-VN");
const time=(value:string|null)=>value?new Date(value).toLocaleTimeString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit"}):"—";

export function LinehaulView(){
 const [data,setData]=useState<LinehaulData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [query,setQuery]=useState(""),[phase,setPhase]=useState("all"),[direction,setDirection]=useState("all"),[selected,setSelected]=useState<string|null>(null);
 const [syncing,setSyncing]=useState(false),[message,setMessage]=useState(""),[now,setNow]=useState(0);
 const request=useRef<AbortController|null>(null),inFlight=useRef(false);
 const [view,setView]=useState<"active"|"history">("active");
 useReportInitialDataLoading("linehaul",loading&&!data);
 const load=useCallback(async()=>{
  if(inFlight.current)return;inFlight.current=true;
  const controller=new AbortController();request.current=controller;
  try{
   const response=await fetch("/api/linehaul",{cache:"no-store",signal:controller.signal}),body=await response.json();
   if(!response.ok)throw new Error(body.error||"Chưa tải được LH.");
   if(!controller.signal.aborted){setData(body);setError("");setNow(Date.now());}
  }catch(caught){if(!controller.signal.aborted)setError(caught instanceof Error?caught.message:"Chưa tải được LH.");}
  finally{inFlight.current=false;if(!controller.signal.aborted)setLoading(false);}
 },[]);
 useEffect(()=>{
  const first=setTimeout(()=>void load(),0),timer=setInterval(()=>{if(!document.hidden)void load();},30000);
  return()=>{clearTimeout(first);clearInterval(timer);request.current?.abort();};
 },[load]);
 async function sync(){
  if(syncing)return;setSyncing(true);setMessage("");
  try{
   const response=await fetch("/api/linehaul",{method:"POST"}),body=await response.json();
   if(!response.ok)throw new Error(body.error||"Không gửi được lệnh.");
   setMessage(body.deduplicated?"LH đang có lượt chạy. Danh sách sẽ tự cập nhật khi hoàn tất.":"Đã gửi lệnh cho worker. Danh sách tự cập nhật sau khi đọc SPX xong.");
  }catch(caught){setError(caught instanceof Error?caught.message:"Không đồng bộ được LH.");}
  finally{setSyncing(false);}
 }
 const all=sortTrips(data?.trips??[]),term=query.trim().toLocaleLowerCase("vi");
 const history=all.filter(trip=>inTodayHistory(trip,data?.day??""));
 const active=all.filter(trip=>trip.source!=="history"&&trip.source!=="dashboard"&&trip.phase!=="unloaded");
 const scope=view==="history"?history:active;
 const filtered=scope.filter(trip=>(phase==="all"||trip.phase===phase)&&(direction==="all"||trip.direction===direction)&&(!term||[trip.lt_code,trip.plate_number,trip.driver_name,trip.origin,trip.destination].join(" ").toLocaleLowerCase("vi").includes(term)));
 const current=scope.find(trip=>trip.trip_id===selected)??null;
 const incoming=all.filter(trip=>trip.phase==="en_route");
 const known=incoming.filter(trip=>trip.orders!==null);
 const hasActualTime=filtered.some(trip=>trip.hub_ata||trip.hub_atd||trip.hub_unloaded_at||trip.origin_atd);
 const hasCargo=filtered.some(trip=>trip.orders!==null||trip.bags!==null||trip.loose!==null||trip.pack_unknown||(view==="history"&&(trip.load_total!==null||trip.unloaded_units!==null)));
 const stale=!!data?.snapshotAt&&now-Date.parse(data.snapshotAt)>10*60000;
 return <div className={styles.page}>
  <header className={styles.header}><div><span className={styles.eyebrow}><Truck size={15}/> SDD OPERATIONS / LINEHAUL</span><h1>Quản lý LH<span>Hôm nay</span></h1><p>Theo dõi xe về hub. Chủ động chuẩn bị người xuất / xả tải.</p></div><div className={styles.headerActions}><div><small>Ngày vận hành · giờ Việt Nam</small><strong>{data?.day.split("-").reverse().join("/")??"Đang tải…"}</strong></div>{data?.canRefresh?<button type="button" onClick={()=>void sync()} disabled={syncing}><RefreshCw size={15}/>{syncing?"Đang gửi…":"Đồng bộ SPX"}</button>:null}<button type="button" onClick={()=>void load()} aria-label="Đọc lại dữ liệu web"><RefreshCw size={16}/></button></div></header>
  <div className={styles.sourceStatus} data-stale={stale}><span><span className={styles.statusDot}/>{!data?.snapshotAt?"Chưa có snapshot hôm nay":stale?"Dữ liệu cần cập nhật":"Đã đồng bộ từ SPX"}{data?.snapshotAt?` · ${time(data.snapshotAt)}`:""}</span><span>Hôm nay · đã gán tài xế · hub 4232 · cập nhật mỗi 5 phút</span></div>
  {error?<p className={styles.error} role="alert">{error}</p>:null}{message?<p className={styles.notice} role="status">{message}</p>:null}
  <section className={styles.metrics} aria-label="Tổng quan tải về"><Metric label="Chuyến LH hôm nay" value={all.length} detail="Đã gán tài xế" icon={<Truck size={18}/>}/><Metric label="Đang về hub" value={incoming.length} detail="Theo trạng thái tại trạm" icon={<Navigation size={18}/>}/><Metric label="Xe đã về hub" value={history.length} detail="Ghi nhận đến trong hôm nay" icon={<CheckCircle2 size={18}/>}/>{(known.length>0||incoming.length===0)&&<Metric label="Đơn trên xe đang về" value={known.reduce((sum,t)=>sum+t.orders!,0)} detail={known.length<incoming.length?`Từ ${known.length}/${incoming.length} chuyến đã báo tải`:"Số đơn đã xếp xe"} icon={<Package size={18}/>}/>}</section>
  <div className={styles.viewSwitch} role="group" aria-label="Chọn danh sách LH"><button type="button" aria-pressed={view==="active"} onClick={()=>{setView("active");setPhase("all");setSelected(null);}}>Đang điều phối <span>{active.length}</span></button><button type="button" aria-pressed={view==="history"} onClick={()=>{setView("history");setPhase("all");setSelected(null);}}>Đã về / xả hôm nay <span>{history.length}</span></button></div>
  <section className={styles.workspace}><div className={styles.list}>
   <header className={styles.listHeader}><div><span className={styles.eyebrow}>{view==="history"?"LỊCH SỬ THỰC TẾ TẠI HUB":"ĐIỀU PHỐI XUẤT / XẢ TẢI"}</span><h2>{view==="history"?"Xe đã về / xả trong ngày":"Danh sách chuyến"}</h2></div><span>{number(filtered.length)} chuyến</span></header>
   <div className={styles.filters}><label><Search size={15}/><input value={query} onChange={event=>setQuery(event.target.value)} aria-label="Tìm mã LT, biển số, tài xế" placeholder="Tìm LT, biển số, tài xế…"/></label><select aria-label="Lọc trạng thái xe" value={phase} onChange={event=>setPhase(event.target.value)}><option value="all">Tất cả trạng thái</option>{Object.entries(LH_PHASES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><select aria-label="Lọc chiều chuyến" value={direction} onChange={event=>setDirection(event.target.value)}><option value="all">Tất cả chiều</option><option value="inbound">Xe vào hub</option><option value="outbound">Xe xuất hub</option><option value="stopover">Xe qua hub</option></select></div>
   <div className={styles.tableScroll}><table><thead><tr><th>Chuyến / tài xế</th>{hasCargo&&<th>Tải trên xe</th>}<th>Trạng thái tại hub</th>{view==="active"&&<th>GPS gần nhất</th>}{hasActualTime&&<th>Mốc thực tế</th>}</tr></thead><tbody>{loading&&!data?<tr><td colSpan={2+Number(hasCargo)+Number(hasActualTime)+Number(view==="active")} className={styles.empty}>Đang đọc chuyến LH hôm nay…</td></tr>:!filtered.length?<tr><td colSpan={2+Number(hasCargo)+Number(hasActualTime)+Number(view==="active")} className={styles.empty}>Chưa có chuyến phù hợp. {data?.snapshotAt?"Đổi bộ lọc để xem thêm.":"Đồng bộ SPX để lấy danh sách hôm nay."}</td></tr>:filtered.map(trip=><tr key={trip.trip_id} data-selected={current?.trip_id===trip.trip_id} onClick={event=>{event.currentTarget.querySelector("button")?.focus();setSelected(trip.trip_id);}}>
    <td><button type="button" className={styles.selectTrip} onClick={()=>setSelected(trip.trip_id)} aria-haspopup="dialog" aria-expanded={current?.trip_id===trip.trip_id}><strong>{trip.lt_code}</strong>{(trip.plate_number||trip.vehicle)&&<span>{[trip.plate_number,trip.vehicle].filter(Boolean).join(" · ")}</span>}{trip.driver_name&&<small>{trip.driver_name}</small>}</button></td>
    {hasCargo&&<td>{trip.orders!==null&&<strong>{number(trip.orders)} <small>đơn</small></strong>}{(trip.bags!==null||trip.loose!==null)&&<span className={styles.cargo}><Boxes size={13}/>{[trip.bags!==null?`${number(trip.bags)} bao`:null,trip.loose!==null?`${number(trip.loose)} xá`:null].filter(Boolean).join(" · ")}</span>}{view==="history"&&trip.source==="dashboard"&&trip.load_total!==null?<small>Tổng {number(trip.load_total)} kiện TO</small>:view==="history"&&trip.unloaded_units!==null?<small>Đã xả: {number(trip.unloaded_units)} kiện TO</small>:null}{trip.pack_unknown?<small title={trip.pack_description}>Kiện khác: {trip.pack_unknown}</small>:null}</td>}
    <td><span className={styles.phase} data-phase={trip.phase}>{LH_PHASES[trip.phase]}</span><small className={styles.direction}>{trip.direction==="outbound"?<ArrowUpFromLine size={12}/>:<ArrowDownToLine size={12}/>} {trip.direction==="outbound"?"Xuất hub":trip.direction==="stopover"?"Qua hub":"Xe vào hub"}</small>{view==="active"&&<TripRoadDistance trip={trip} now={now}/>}</td>
    {view==="active"&&<td><GpsTimestamp trip={trip} now={now}/></td>}
    {hasActualTime&&<td>{trip.hub_ata&&<><strong>{time(trip.hub_ata)}</strong><small>Đến hub</small></>}{trip.hub_unloaded_at&&<small>Xả xong: {time(trip.hub_unloaded_at)}</small>}{trip.hub_atd&&<small>Rời hub: {time(trip.hub_atd)}</small>}{!trip.hub_ata&&trip.origin_atd&&<><strong>{time(trip.origin_atd)}</strong><small>Rời kho xuất phát</small></>}</td>}
   </tr>)}</tbody></table></div><footer className={styles.legend}>Bao / xá theo dữ liệu SPX · NA, Other = hàng xá. Bấm chuyến để xem chi tiết và bản đồ.</footer>
  </div></section>
  {current&&<TripDialog trip={current} now={now} onClose={()=>setSelected(null)}/>}
 </div>;
}

function Metric({label,value,detail,icon}:{label:string;value:number|null;detail:string;icon:React.ReactNode}){
 return <article><span>{label}{icon}</span><strong>{number(value)}</strong><small>{detail}</small></article>;
}

function GpsTimestamp({trip,now}:{trip:LinehaulTrip;now:number}){
 if(!trip.gps_at||!Number.isFinite(Date.parse(trip.gps_at)))return <span className={styles.gpsTimestamp}>Chưa có thời gian GPS</span>;
 return <span className={styles.gpsTimestamp} data-stale={gpsIsStale(trip,now)}><time dateTime={trip.gps_at}>{new Date(trip.gps_at).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}</time>{gpsIsStale(trip,now)&&<small>GPS cũ</small>}</span>;
}

function TripDialog({trip,now,onClose}:{trip:LinehaulTrip;now:number;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const element=dialog.current;
  if(element&&!element.open)element.showModal();
  const overflow=document.body.style.overflow;document.body.style.overflow="hidden";
  // Strict Mode replays effects; closing here emits onClose and clears the selected trip.
  return()=>{document.body.style.overflow=overflow;};
 },[]);
 const hasMap=trip.source!=="history"&&trip.source!=="dashboard"&&trip.phase!=="unloaded"&&trip.lat!==null&&trip.lng!==null;
 return <dialog ref={dialog} className={`${styles.detail} ${styles.tripDialog}`} aria-modal="true" aria-labelledby="linehaul-trip-title" onClose={onClose} onClick={event=>{
  if(event.target===event.currentTarget){const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.currentTarget.close();}
 }}>
  <header className={styles.dialogHeader}><h2 id="linehaul-trip-title">Chi tiết chuyến {trip.lt_code}</h2><button type="button" autoFocus aria-label="Đóng chi tiết chuyến" onClick={()=>dialog.current?.close()}><X size={20}/></button></header>
  <div className={styles.tripContent} data-map={hasMap}><TripDetail trip={trip} now={now}/></div>
 </dialog>;
}

function TripDetail({trip,now}:{trip:LinehaulTrip;now:number}){
 const stale=gpsIsStale(trip,now);
 const history=trip.source==="history"||trip.source==="dashboard"||trip.phase==="unloaded";
 const hasGps=trip.lat!==null&&trip.lng!==null;
 const milestones=[
  {label:"Rời kho xuất phát",value:trip.origin_atd},
  {label:"Đến hub",value:trip.hub_ata},
  {label:"Hoàn tất xả tải",value:trip.hub_unloaded_at},
  {label:"Rời hub",value:trip.hub_atd},
 ].filter(item=>item.value);
 const cargo=[{label:"Đơn hàng",value:trip.orders},{label:"Bao",value:trip.bags},{label:"Hàng xá",value:trip.loose}].filter(item=>item.value!==null);
 return <><header className={styles.detailHeader}><span className={styles.eyebrow}>CHI TIẾT CHUYẾN</span><div className={styles.vehicleTitle}><h2>{trip.plate_number||trip.lt_code}</h2>{trip.vehicle&&<span>{trip.vehicle}</span>}</div><p>{trip.lt_code}</p><span className={styles.phase} data-phase={trip.phase}>{LH_PHASES[trip.phase]}</span></header>
  {history&&<div className={styles.completed}><CheckCircle2 size={22}/><div><strong>{trip.hub_unloaded_at?"Đã hoàn tất xả tải":"Đã đến hub"}</strong>{trip.hub_ata&&<span>Ghi nhận lúc {time(trip.hub_ata)}</span>}</div></div>}
  {cargo.length>0&&<section className={styles.cargoSummary} aria-label="Sản lượng chuyến">{cargo.map(item=><div key={item.label}><strong>{number(item.value)}</strong><span>{item.label}</span></div>)}</section>}
  {(trip.origin||trip.destination)&&<div className={styles.route}>{trip.origin&&<div><span className={styles.routeDot}/><span><small>Điểm đi</small><strong>{trip.origin}</strong></span></div>}{trip.destination&&<div><MapPin size={15}/><span><small>Điểm đến</small><strong>{trip.destination}</strong></span></div>}</div>}
  <dl className={styles.facts}>
   {trip.driver_name&&<div><dt>Tài xế</dt><dd>{trip.driver_name}</dd></div>}
   {trip.hub_sta&&<div><dt>Giờ đến kế hoạch (STA)</dt><dd>{time(trip.hub_sta)}</dd></div>}
   {trip.load_total!==null&&<div><dt>Tổng kiện</dt><dd>{number(trip.load_total)} kiện TO</dd></div>}
   {trip.expected_unload!==null&&<div><dt>Dự kiến xả tại hub</dt><dd>{number(trip.expected_unload)} kiện TO</dd></div>}
   {trip.unloaded_units!==null&&<div><dt>Đã xả tại hub</dt><dd>{number(trip.unloaded_units)} kiện TO</dd></div>}
  </dl>
  {milestones.length>0&&<section className={styles.milestones}><h3><Clock3 size={15}/> Mốc vận hành thực tế</h3><ol>{milestones.map(item=><li key={item.label}><span>{item.label}</span><time dateTime={item.value!}>{time(item.value!)}</time></li>)}</ol></section>}
  {!history&&hasGps&&<section className={styles.location}><h3><Navigation size={15}/> Vị trí xe</h3><div className={styles.map}><Map key={trip.trip_id} trip={trip} now={now}/></div><div className={styles.gpsStatus} data-stale={stale}><span>GPS gần nhất · </span><GpsTimestamp trip={trip} now={now}/></div></section>}
  {!history&&trip.location_error&&<p className={styles.error} role="status">Không cập nhật được vị trí xe: {trip.location_error}</p>}
  {trip.pack_description&&<details className={styles.pack}><summary>Chi tiết đóng gói từ SPX</summary><p>{trip.pack_description}</p></details>}
 </>;
}
