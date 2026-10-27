"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Boxes, CheckCircle2, Clock3, MapPin, Navigation, Package, RefreshCw, Search, Truck } from "lucide-react";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { arrivingSoon, gpsIsStale, inTodayHistory, LH_PHASES, sortTrips, type LinehaulData, type LinehaulTrip } from "@/lib/linehaul/model";
import styles from "./linehaul.module.css";

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
 const current=filtered.find(trip=>trip.trip_id===selected)??filtered[0]??null;
 const incoming=all.filter(trip=>trip.phase==="en_route"),soon=all.filter(trip=>arrivingSoon(trip,now));
 const known=incoming.filter(trip=>trip.orders!==null);
 const stale=!!data?.snapshotAt&&now-Date.parse(data.snapshotAt)>10*60000;
 return <div className={styles.page}>
  <header className={styles.header}><div><span className={styles.eyebrow}><Truck size={15}/> SDD OPERATIONS / LINEHAUL</span><h1>Quản lý LH<span>Hôm nay</span></h1><p>Theo dõi xe về hub. Chủ động chuẩn bị người xuất / xả tải.</p></div><div className={styles.headerActions}><div><small>Ngày vận hành · giờ Việt Nam</small><strong>{data?.day.split("-").reverse().join("/")??"Đang tải…"}</strong></div>{data?.canRefresh?<button type="button" onClick={()=>void sync()} disabled={syncing}><RefreshCw size={15}/>{syncing?"Đang gửi…":"Đồng bộ SPX"}</button>:null}<button type="button" onClick={()=>void load()} aria-label="Đọc lại dữ liệu web"><RefreshCw size={16}/></button></div></header>
  <div className={styles.sourceStatus} data-stale={stale}><span><span className={styles.statusDot}/>{!data?.snapshotAt?"Chưa có snapshot hôm nay":stale?"Dữ liệu cần cập nhật":"Đã đồng bộ từ SPX"} · {time(data?.snapshotAt??null)}</span><span>Hôm nay · đã gán tài xế · hub 4232 · cập nhật mỗi 5 phút</span></div>
  {error?<p className={styles.error} role="alert">{error}</p>:null}{message?<p className={styles.notice} role="status">{message}</p>:null}
  <section className={styles.metrics} aria-label="Tổng quan tải về"><Metric label="Chuyến LH hôm nay" value={all.length} detail="Đã gán tài xế · không trùng mã LT" icon={<Truck size={18}/>}/><Metric label="Đang về hub" value={incoming.length} detail="Theo trạng thái thực tế tại các trạm" icon={<Navigation size={18}/>}/><Metric label="ETA trong 30 phút" value={soon.length} detail="Ưu tiên chuẩn bị người xả tải" icon={<Clock3 size={18}/>}/><Metric label="Xe đã về / xả" value={history.length} detail="Dashboard SPX · giờ đến thực tế tại hub" icon={<CheckCircle2 size={18}/>}/><Metric label="Đơn đã báo trên xe về" value={incoming.length>0&&known.length===0?null:known.reduce((sum,t)=>sum+t.orders!,0)} detail={known.length<incoming.length?`${incoming.length-known.length} chuyến chưa báo số đơn`:"Số đơn đã xếp xe theo SPX"} icon={<Package size={18}/>}/></section>
  <div className={styles.viewSwitch} role="group" aria-label="Chọn danh sách LH"><button type="button" aria-pressed={view==="active"} onClick={()=>{setView("active");setPhase("all");setSelected(null);}}>Đang điều phối <span>{active.length}</span></button><button type="button" aria-pressed={view==="history"} onClick={()=>{setView("history");setPhase("all");setSelected(null);}}>Đã về / xả hôm nay <span>{history.length}</span></button></div>
  <section className={styles.workspace}><div className={styles.list}>
   <header className={styles.listHeader}><div><span className={styles.eyebrow}>{view==="history"?"LỊCH SỬ THỰC TẾ TẠI HUB":"ĐIỀU PHỐI XUẤT / XẢ TẢI"}</span><h2>{view==="history"?"Xe đã về / xả trong ngày":"Danh sách chuyến"}</h2></div><span>{number(filtered.length)} chuyến</span></header>
   <div className={styles.filters}><label><Search size={15}/><input value={query} onChange={event=>setQuery(event.target.value)} aria-label="Tìm mã LT, biển số, tài xế" placeholder="Tìm LT, biển số, tài xế…"/></label><select aria-label="Lọc trạng thái xe" value={phase} onChange={event=>setPhase(event.target.value)}><option value="all">Tất cả trạng thái</option>{Object.entries(LH_PHASES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><select aria-label="Lọc chiều chuyến" value={direction} onChange={event=>setDirection(event.target.value)}><option value="all">Tất cả chiều</option><option value="inbound">Xe vào hub</option><option value="outbound">Xe xuất hub</option><option value="stopover">Xe qua hub</option></select></div>
   <div className={styles.tableScroll}><table><thead><tr><th>Chuyến / tài xế</th><th>{view==="history"?"Tải / đã xả":"Tải đã xếp xe"}</th><th>Trạng thái tại hub</th><th>{view==="history"?"Đến / xả thực tế":"ETA / thực tế"}</th></tr></thead><tbody>{loading&&!data?<tr><td colSpan={4} className={styles.empty}>Đang đọc chuyến LH hôm nay…</td></tr>:!filtered.length?<tr><td colSpan={4} className={styles.empty}>Chưa có chuyến phù hợp. {data?.snapshotAt?"Đổi bộ lọc để xem thêm.":"Đồng bộ SPX để lấy danh sách hôm nay."}</td></tr>:filtered.map(trip=><tr key={trip.trip_id} data-selected={current?.trip_id===trip.trip_id}>
    <td><button type="button" className={styles.selectTrip} onClick={()=>setSelected(trip.trip_id)} aria-pressed={current?.trip_id===trip.trip_id}><strong>{trip.lt_code}</strong><span>{trip.plate_number||"Chưa có biển số"} · {trip.vehicle||"Chưa rõ loại xe"}</span><small>{trip.driver_name||"Chưa có tên tài xế"}</small></button></td>
    <td><strong>{number(trip.orders)} <small>đơn</small></strong><span className={styles.cargo}><Boxes size={13}/>{number(trip.bags)} bao · {number(trip.loose)} xá</span>{view==="history"?<small>{trip.source==="dashboard"?`Tổng ${number(trip.load_total)} kiện TO`:`Đã xả: ${number(trip.unloaded_units)} kiện TO`}</small>:null}{trip.pack_unknown?<small title={trip.pack_description}>Có kiện khác: {trip.pack_unknown}</small>:null}</td>
    <td><span className={styles.phase} data-phase={trip.phase}>{LH_PHASES[trip.phase]}</span><small className={styles.direction}>{trip.direction==="outbound"?<ArrowUpFromLine size={12}/>:<ArrowDownToLine size={12}/>} {trip.direction==="outbound"?"Xuất hub":trip.direction==="stopover"?"Qua hub":"Xe vào hub"}</small></td>
    <td>{view==="history"?<><strong>{time(trip.hub_ata)}</strong><small>Đến hub</small><small>{trip.source==="dashboard"?"Giờ xả: API không cung cấp":`Xả xong: ${time(trip.hub_unloaded_at??null)}`}</small></>:<><strong>{time(trip.hub_atd??trip.hub_ata??trip.hub_eta)}</strong><small>{trip.hub_atd?"Đã rời":trip.hub_ata?"Đã đến":trip.hub_eta?"ETA từ SPX":"Chưa có ETA"}</small></>}{arrivingSoon(trip,now)?<span className={styles.prepare}>Chuẩn bị xả tải</span>:trip.phase==="en_route"&&trip.hub_eta&&Date.parse(trip.hub_eta)<now?<span className={styles.prepare}>ETA đã qua · kiểm tra xe</span>:null}</td>
   </tr>)}</tbody></table></div><footer className={styles.legend}>“—” là chưa có dữ liệu tải, không phải 0 đơn. Bao / xá tách từ Pack type SPX; NA = hàng xá.</footer>
  </div><aside className={styles.detail} aria-label="Vị trí và thông tin xe">{current?<TripDetail trip={current} now={now}/>:<div className={styles.empty}><MapPin size={28}/><p>Chọn một chuyến để xem vị trí xe.</p></div>}</aside></section>
 </div>;
}

function Metric({label,value,detail,icon}:{label:string;value:number|null;detail:string;icon:React.ReactNode}){
 return <article><span>{label}{icon}</span><strong>{number(value)}</strong><small>{detail}</small></article>;
}

function TripDetail({trip,now}:{trip:LinehaulTrip;now:number}){
 const stale=gpsIsStale(trip,now);
 const history=trip.source==="history"||trip.source==="dashboard"||trip.phase==="unloaded";
 return <><header className={styles.detailHeader}><span className={styles.eyebrow}>{history?"MỐC THỰC TẾ TẠI SDD HUB":"VỊ TRÍ XE / GPS SPX"}</span><h2>{trip.plate_number||trip.lt_code}</h2><p>{trip.lt_code} · {trip.vehicle||"Chưa rõ loại xe"}</p></header>
  {history?<div className={styles.completed}><CheckCircle2 size={30}/><strong>{trip.hub_unloaded_at?"Đã hoàn tất xả tải":trip.source==="dashboard"?"Đã đến hub · Dashboard":"Đã về hub"}</strong><span>Đến {time(trip.hub_ata)}{trip.source==="dashboard"?" · Chưa có mốc giờ xả":` · Xả xong ${time(trip.hub_unloaded_at??null)}`}</span><small>Ghi nhận thực tế từ SPX tại hub 4232</small></div>:<><div className={styles.map}><Map key={trip.trip_id} trip={trip} now={now}/></div>
  <div className={styles.gpsStatus} data-stale={stale||!!trip.location_error}>{trip.location_error?<span>{trip.location_error} </span>:null}{trip.gps_at?`${stale?"GPS cũ":"GPS gần nhất"} · ${new Date(trip.gps_at).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}`:"SPX chưa có GPS xe cho chuyến này."}</div></>}
  <div className={styles.route}><div><span className={styles.routeDot}/><span><small>Điểm đi</small><strong>{trip.origin}</strong></span></div><div><MapPin size={15}/><span><small>Điểm đến</small><strong>{trip.destination}</strong></span></div></div>
  <dl className={styles.facts}><div><dt>Tài xế</dt><dd>{trip.driver_name||"—"}</dd></div><div><dt>ETA tại SDD hub</dt><dd>{time(trip.hub_eta)}</dd></div><div><dt>Giờ đến kế hoạch (STA)</dt><dd>{time(trip.hub_sta)}</dd></div><div><dt>Thực tế đến / rời hub</dt><dd>{time(trip.hub_ata)} / {time(trip.hub_atd)}</dd></div><div><dt>Rời kho xuất phát</dt><dd>{time(trip.origin_atd??null)}</dd></div><div><dt>Hoàn tất xả tải</dt><dd>{trip.source==="dashboard"?"API không cung cấp":time(trip.hub_unloaded_at??null)}</dd></div>{trip.source==="dashboard"?<div><dt>Tổng kiện (dashboard)</dt><dd>{number(trip.load_total)} kiện TO</dd></div>:<><div><dt>Dự kiến xả tại hub</dt><dd>{number(trip.expected_unload)} kiện TO</dd></div><div><dt>Đã xả tại hub</dt><dd>{number(trip.unloaded_units)} kiện TO</dd></div></>}</dl>
  <div className={styles.pack}><small>Pack type từ SPX</small><p>{trip.pack_description||"Chưa báo tải"}</p></div>
  <p className={styles.legend}>{history?"Dashboard cung cấp số đơn, tổng kiện TO, bao và Other (xá). ATA là giờ đến hub; API không trả giờ hoàn tất xả. Không dùng ATD rời kho làm giờ rời SDD hub.":"ETA do SPX cung cấp. Vị trí là lần GPS gần nhất, không phải vị trí được nội suy hoặc tuyến đường dự đoán."}</p>
 </>;
}
