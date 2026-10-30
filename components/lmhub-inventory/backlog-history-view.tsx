"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, ChevronDown, Clock3, History, Layers3, Maximize2, RefreshCcw, X } from "lucide-react";
import { readJsonResponse } from "@/lib/http/json-response";
import { compareBacklog, hourlyChanges, hourlyValue, sortBacklogRows, vietnamDay, type BacklogCot, type BacklogDetail, type BacklogHourlyDay, type BacklogLevel, type BacklogSort, type BacklogSource } from "@/lib/dashboard/backlog-history";
import { BacklogDeltaChart, BacklogTrendChart } from "./backlog-hourly-charts";
import styles from "./backlog-history.module.css";

const fmt = (n: number | null | undefined) => n == null ? "—" : n.toLocaleString("vi-VN");
const hh = (h: number) => `${String(h).padStart(2,"0")}h`;
const stamp = (s: string | null | undefined) => s && Number.isFinite(Date.parse(s)) ? new Intl.DateTimeFormat("vi-VN", { timeZone:"Asia/Ho_Chi_Minh", hour:"2-digit", minute:"2-digit", second:"2-digit" }).format(new Date(s)) : "—";
const names = { pickup:"Pickup", delivery:"Delivery" };
const statuses: Record<string,string> = { CAPTURED:"Đã chốt", PROVISIONAL:"Tạm tính", FUTURE:"Chưa đến giờ", PENDING:"Chờ chốt", QUEUED:"Đang lấy nguồn", MISSED:"Lỡ mốc chốt", FAILED:"Lấy nguồn lỗi" };
type Option = { id:string; label:string; hour:number };
function options(day?: BacklogHourlyDay): Option[] {
  return [...(day?.hours.filter(p=>p.snapshot_id).map(p=>({id:p.snapshot_id!,hour:p.hour,label:`${hh(p.hour)} · ${p.is_final?"Đã chốt":"Tạm tính"} · nguồn ${stamp(p.source_snapshot_at!)}`}))??[]),
    ...(day?.checkpoints.filter(p=>p.status==="CAPTURED"&&p.snapshot_id).map(p=>({id:p.snapshot_id!,hour:Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit"}).format(new Date(p.scheduled_for))),label:`Mốc riêng ${stamp(p.scheduled_for)}`}))??[])];
}
async function read<T>(params: Record<string,string>, signal:AbortSignal):Promise<T> {
  const response=await fetch(`/api/backlog-history?${new URLSearchParams(params)}`,{signal,cache:"no-store"});
  const payload=await readJsonResponse(response,"Lịch sử tồn");
  if(!response.ok)throw new Error(payload.error??"Không tải được lịch sử tồn");
  return payload;
}

export function BacklogHistoryView({ initialSource="pickup" }: {initialSource?:BacklogSource}) {
  const [source,setSource]=useState<BacklogSource>(initialSource),[day,setDay]=useState(vietnamDay),[baseline,setBaseline]=useState(vietnamDay);
  const [daily,setDaily]=useState<Partial<Record<BacklogSource,BacklogHourlyDay>>>({}),[baselineData,setBaselineData]=useState<BacklogHourlyDay>();
  const [area,setArea]=useState(""),[cot,setCot]=useState<BacklogCot>("orders"),[level,setLevel]=useState<BacklogLevel>("ward");
  const [selection,setSelection]=useState({before:"auto",after:"auto"});
  const [sort,setSort]=useState<BacklogSort>("change");
  const [details,setDetails]=useState<Record<string,BacklogDetail>>({});
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[version,setVersion]=useState(0);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==="visible")setVersion(v=>v+1);},60000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{
    const controller=new AbortController();
    Promise.resolve().then(()=>{
      if(controller.signal.aborted)return [];
      setLoading(true);setError("");
      return Promise.all((["pickup","delivery"] as const).map(async s=>[s,await read<BacklogHourlyDay>({source:s,day,mode:"hourly"},controller.signal)] as const));
    })
      .then(results=>{if(!controller.signal.aborted)setDaily(Object.fromEntries(results));})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[day,version]);
  useEffect(()=>{
    if(baseline===day)return;
    const controller=new AbortController();
    read<BacklogHourlyDay>({source,day:baseline,mode:"hourly"},controller.signal).then(value=>{if(!controller.signal.aborted)setBaselineData(value);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[source,baseline,day,version]);
  const current=daily[source]?.day===day?daily[source]:undefined;
  const chartDaily=useMemo(()=>Object.fromEntries(Object.entries(daily).filter(([,value])=>value.day===day)),[daily,day]);
  const beforeDay=baseline===day?current:baselineData?.day===baseline&&baselineData.source===source?baselineData:undefined;
  const afterOptions=options(current),beforeOptions=options(beforeDay);
  const defaultAfter=current?.hours.filter(p=>p.snapshot_id).at(-1)?.snapshot_id;
  const afterId=afterOptions.some(p=>p.id===selection.after)?selection.after:defaultAfter??"";
  const selectedHour=afterOptions.find(p=>p.id===afterId)?.hour??null;
  const baselineHours=beforeDay?.hours.filter(p=>p.snapshot_id)??[];
  const defaultBefore=baseline===day?baselineHours.filter(p=>p.hour<(selectedHour??24)).at(-1):baselineHours.find(p=>p.hour===selectedHour)??baselineHours.at(-1);
  const beforeId=beforeOptions.some(p=>p.id===selection.before)?selection.before:defaultBefore?.snapshot_id??beforeOptions[0]?.id??"";
  useEffect(()=>{
    const controller=new AbortController();
    Promise.all([...new Set([beforeId,afterId].filter(Boolean))].map(async id=>[id,await read<BacklogDetail>({source,snapshot:id},controller.signal)] as const))
      .then(entries=>{if(!controller.signal.aborted)setDetails(previous=>Object.fromEntries([...Object.entries(previous).filter(([id])=>!entries.some(([key])=>key===id)).slice(-5),...entries]));})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[source,beforeId,afterId]);
  const before=details[beforeId],after=details[afterId];
  const rows=useMemo(()=>before&&after?compareBacklog(before.rows,after.rows,level,cot,area):[],[before,after,level,cot,area]);
  const totals=rows.reduce((a,r)=>({before:a.before+r.before,after:a.after+r.after}),{before:0,after:0});
  const sortedRows=useMemo(()=>sortBacklogRows(rows,sort),[rows,sort]);
  const observed=current?.hours.filter(p=>p.snapshot_id)??[],latest=observed.at(-1);
  const changes=hourlyChanges(current?.hours??[],cot,area),lastChange=latest?changes.find(p=>p.hour===latest.hour):undefined;
  const peak=observed.length?Math.max(...observed.map(p=>hourlyValue(p,cot,area)??0)):null;
  const heatMax=Math.max(1,...(current?.hours.flatMap(p=>p.areas.map(r=>r[cot]))??[]));
  function selectHour(h:number){const point=current?.hours[h];if(point?.snapshot_id)setSelection({before:"auto",after:point.snapshot_id});}
  function reset(){setSelection({before:"auto",after:"auto"});}
  return <div className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>SDD OPERATIONS / HISTORY</p><h1>Backlog History</h1><p>Đối chiếu các mốc tồn. Nhận diện địa bàn tăng tồn và theo dõi tiến độ xử lý.</p></div>
      <div className={styles.headerActions}><Link href={source==="pickup"?"/lmhub-inventory":"/inventory-delivery"}>Xem tồn hiện tại<ArrowUpRight size={15} aria-hidden="true"/></Link><button type="button" disabled={loading} onClick={()=>setVersion(v=>v+1)}><RefreshCcw size={15} aria-hidden="true" className={loading?styles.spinning:undefined}/>{loading?"Đang tải…":"Làm mới"}</button></div>
    </header>
    <div className={styles.toolbar}>
      <span className={styles.filterTitle}><History size={17} aria-hidden="true"/>Phạm vi phân tích</span>
      <label>Ngày phân tích<input type="date" max={vietnamDay()} value={day} onChange={e=>{if(e.target.value){setDay(e.target.value);setBaseline(e.target.value);reset();}}}/></label>
      <label>Khu vực<select value={area} onChange={e=>setArea(e.target.value)}><option value="">Tất cả KV1–KV5</option>{[1,2,3,4,5].map(n=><option key={n}>KV{n}</option>)}</select></label>
      <label>COT<select value={cot} onChange={e=>setCot(e.target.value as BacklogCot)}><option value="orders">Tất cả COT</option><option value="cot1">COT 1</option><option value="cot2">COT 2</option><option value="other">Chưa rõ COT</option></select></label>
      <span className={styles.autoStatus}><i/>Tự cập nhật mỗi phút · UTC+7</span>
    </div>
    {error&&<p className={styles.error} role="alert">{error}</p>}
    <div className={styles.sources} role="group" aria-label="Chọn nguồn lịch sử tồn">
      {(["pickup","delivery"] as const).map(kind=>{
        const report=chartDaily[kind],point=report?.hours.filter(p=>p.snapshot_id).at(-1);
        return <button type="button" key={kind} data-source={kind} aria-pressed={source===kind} onClick={()=>{setSource(kind);reset();}}>
          <span className={styles.sourceIcon}><Layers3 size={20} aria-hidden="true"/></span>
          <span className={styles.sourceCopy}><span>{names[kind]} Backlog</span><small>{point?`${hh(point.hour)} · ${statuses[point.status]??point.status}`:loading?"Đang đọc mốc chốt…":"Chưa có mốc trong ngày"}</small></span>
          <strong>{fmt(hourlyValue(point,cot,area))}<small>đơn</small></strong>{source===kind?<CheckCircle2 size={18} aria-hidden="true"/>:<ArrowRight size={18} aria-hidden="true"/>}
        </button>;
      })}
    </div>
    <div className={styles.kpis}>
      <div><span><Layers3 size={15} aria-hidden="true"/>Tồn {names[source]} gần nhất</span><strong>{fmt(hourlyValue(latest,cot,area))}</strong><small>{latest?`${hh(latest.hour)} · Nguồn ${stamp(latest.source_snapshot_at)}`:"Chưa có snapshot"}</small></div>
      <div><span><ArrowDownRight size={15} aria-hidden="true"/>So với giờ liền trước</span><strong data-direction={(lastChange?.delta??0)>0?"up":(lastChange?.delta??0)<0?"down":"flat"}>{lastChange?.delta!=null&&lastChange.delta>0?"+":""}{fmt(lastChange?.delta)}</strong><small>{lastChange?.percent!=null?`${lastChange.percent>0?"+":""}${lastChange.percent.toLocaleString("vi-VN",{maximumFractionDigits:1})}% so với giờ trước`:"Cần hai giờ liên tiếp có dữ liệu"}</small></div>
      <div><span><ArrowUpRight size={15} aria-hidden="true"/>Đỉnh tồn trong ngày</span><strong>{fmt(peak)}</strong><small>{area||"Tất cả khu vực"} · Theo COT đang chọn</small></div>
      <div><span><Clock3 size={15} aria-hidden="true"/>Khung giờ đã chốt</span><strong>{current?observed.filter(p=>p.is_final).length:"—"}<em> / 24</em></strong><small>{observed.filter(p=>!p.is_final).length} mốc tạm tính · Tách riêng mốc đã chốt</small></div>
    </div>
    <section className={styles.panel} aria-label="Xu hướng tồn và bộ chọn giờ">
      <div className={styles.panelHeading}><div><p className={styles.eyebrow}>01 / DIỄN BIẾN TRONG NGÀY</p><h2>Tồn thay đổi như thế nào?</h2></div><button type="button" onClick={()=>dialog.current?.showModal()}><Maximize2 size={15} aria-hidden="true"/>Phóng to</button></div>
      <div className={styles.legend}><span className={styles.pickupLegend}><i/>Pickup</span><span className={styles.deliveryLegend}><i/>Delivery</span><span>Đường liền: đã chốt</span><span>Nét đứt: tạm tính</span><span>Khoảng trống: thiếu dữ liệu</span></div>
      <BacklogTrendChart daily={chartDaily} active={source} cot={cot} area={area} selected={selectedHour} onSelect={selectHour}/>
      <div className={styles.timelineHeading}><h3>Chọn giờ để đối chiếu</h3><span>{selectedHour!==null?`Mốc B đang chọn: ${hh(selectedHour)}`:"Chọn một mốc có dữ liệu"} · {names[source]}</span></div>
      <div className={styles.hours}>{Array.from({length:24},(_,h)=>{const point=current?.hours[h];return <button type="button" key={h} disabled={!point?.snapshot_id} aria-pressed={selectedHour===h} aria-label={`${hh(h)} · ${fmt(hourlyValue(point,cot,area))} đơn · ${statuses[point?.status??"PENDING"]}`} data-selected={selectedHour===h} data-final={point?.is_final} onClick={()=>selectHour(h)} title={point?.source_snapshot_at?`Nguồn ${stamp(point.source_snapshot_at)}`:"Chưa có nguồn"}><span>{hh(h)}</span><strong>{fmt(hourlyValue(point,cot,area))}</strong><small>{statuses[point?.status??"PENDING"]}</small></button>;})}</div>
      <p className={styles.note}>Chốt mỗi giờ lúc :50. Chọn một giờ làm mốc B; mốc A mặc định là mốc có dữ liệu gần nhất trước đó. Mốc đã chốt được giữ cố định.</p>
    </section>
    <section className={styles.panel} aria-label="Đối chiếu hai mốc tồn">
      <div className={styles.panelHeading}><div><p className={styles.eyebrow}>02 / ĐỐI CHIẾU ĐỊA BÀN</p><h2>{names[source]} · Biến động giữa hai mốc</h2></div><div className={styles.presets}><button type="button" onClick={()=>{setBaseline(day);reset();}}>Hai mốc giờ gần nhất</button><button type="button" onClick={()=>{setBaseline(new Date(Date.parse(day)-86400000).toISOString().slice(0,10));reset();}}>Đối chiếu hôm trước</button></div></div>
      <div className={styles.selectors}>
        <label>Ngày của mốc A<input type="date" max={vietnamDay()} value={baseline} onChange={e=>{if(e.target.value){setBaseline(e.target.value);setSelection(s=>({...s,before:"auto"}));}}}/></label>
        <label>Mốc A<select value={beforeId} onChange={e=>setSelection(s=>({...s,before:e.target.value}))}><option value="" disabled>Chưa có dữ liệu</option>{beforeOptions.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        <label>Mốc B · {day}<select value={afterId} onChange={e=>setSelection(s=>({...s,after:e.target.value}))}><option value="" disabled>Chưa có dữ liệu</option>{afterOptions.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        <label>Gộp theo<select value={level} onChange={e=>setLevel(e.target.value as BacklogLevel)}><option value="area">Khu vực</option><option value="district">Khu vực / Quận</option><option value="ward">Khu vực / Quận / Phường</option></select></label>
      </div>
      {before&&after?<>
        <div className={styles.comparison}><div><span className={styles.marker}>A</span>Mốc trước<strong>{fmt(totals.before)}<small>đơn</small></strong></div><ArrowRight size={20} aria-hidden="true"/><div><span className={styles.marker}>B</span>Mốc sau<strong>{fmt(totals.after)}<small>đơn</small></strong></div><div>Chênh lệch B − A<strong data-direction={totals.after>totals.before?"up":totals.after<totals.before?"down":"flat"}>{totals.after>totals.before?"+":""}{fmt(totals.after-totals.before)}<small>đơn</small></strong></div></div>
        {beforeId===afterId&&<p className={styles.note}>Hai mốc đang cùng một snapshot; chọn giờ hoặc ngày khác để so sánh.</p>}
        <div className={styles.tableHeading}><span>{fmt(rows.length)} địa bàn · {area||"KV1–KV5"}</span><label>Sắp xếp<select value={sort} onChange={e=>setSort(e.target.value as BacklogSort)} aria-label="Sắp xếp biến động"><option value="change">Biến động lớn nhất</option><option value="rising">Tăng tồn nhiều nhất</option><option value="falling">Giảm tồn nhiều nhất</option><option value="area">Theo địa bàn</option></select></label></div>
        <div className={styles.tableWrap}><table><thead><tr><th scope="col">Khu vực</th>{level!=="area"&&<th scope="col">Quận</th>}{level==="ward"&&<th scope="col">Phường</th>}<th scope="col">Mốc A</th><th scope="col">Mốc B</th><th scope="col">Chênh lệch</th><th scope="col">Thay đổi %</th></tr></thead><tbody>{sortedRows.map(r=><tr key={JSON.stringify([r.area,r.district,r.ward])}><td><span className={styles.areaBadge}>{r.area}</span></td>{level!=="area"&&<td>{r.district||"Chưa xác định"}</td>}{level==="ward"&&<td>{r.ward||"Chưa xác định"}</td>}<td>{fmt(r.before)}</td><td>{fmt(r.after)}</td><td data-direction={r.delta>0?"up":r.delta<0?"down":"flat"}>{r.delta>0?<ArrowUpRight size={13} aria-hidden="true"/>:r.delta<0?<ArrowDownRight size={13} aria-hidden="true"/>:null}{r.delta>0?"+":""}{fmt(r.delta)}</td><td>{r.percent===null?"—":`${r.percent>0?"+":""}${r.percent.toLocaleString("vi-VN",{maximumFractionDigits:1})}%`}</td></tr>)}{!rows.length&&<tr><td colSpan={level==="area"?5:level==="district"?6:7}>Không có tồn ở các mốc và bộ lọc đã chọn.</td></tr>}</tbody></table></div>
      </>:<div className={styles.empty}><History size={25} aria-hidden="true"/><strong>{beforeId&&afterId?"Đang tải dữ liệu hai mốc…":"Chưa đủ mốc để đối chiếu"}</strong><p>Chọn ngày có snapshot và hai mốc A/B. Lịch sử bắt đầu từ khi tính năng được bật.</p></div>}
    </section>
    <details className={`${styles.panel} ${styles.advanced}`}>
      <summary><span><p className={styles.eyebrow}>03 / PHÂN TÍCH SÂU</p><strong>Biến động từng giờ &amp; bản đồ nhiệt</strong><small>Xác định giờ tăng tồn và khu vực tập trung nhiều đơn</small></span><ChevronDown size={18} aria-hidden="true"/></summary>
      <div className={styles.advancedBody}><h3>Biến động so với giờ liền trước</h3><p className={styles.note}>Cam: tồn tăng · Xanh: tồn giảm · Chỉ tính khi có đủ hai giờ liên tiếp.</p><BacklogDeltaChart day={current} cot={cot} area={area} onSelect={selectHour}/>
      <div className={styles.timelineHeading}><h3>Bản đồ nhiệt theo khu vực</h3><span>Bấm ô để chọn KV và giờ đối chiếu</span></div><div className={styles.heatScroll}><div className={styles.heatmap}><b>KV / Giờ</b>{Array.from({length:24},(_,h)=><span key={h}>{hh(h)}</span>)}{[1,2,3,4,5].map(n=><HeatRow key={n} name={`KV${n}`} day={current} cot={cot} max={heatMax} onSelect={h=>{setArea(`KV${n}`);selectHour(h);}}/>)}</div></div></div>
    </details>
    <details className={`${styles.panel} ${styles.checkpoints}`}><summary><Clock3 size={17} aria-hidden="true"/>Mốc riêng 16:00 / 16:30 &amp; quy tắc chốt</summary><p className={styles.note}>Giữ độc lập với mốc chốt cuối giờ; có thể chọn trong danh sách A/B khi đã chụp thành công.</p>{current?.checkpoints.map(p=><div className={styles.checkpoint} key={p.scheduled_for}><strong>{stamp(p.scheduled_for)}</strong><span>{statuses[p.status]??p.status}</span><small>{p.message}</small></div>)}<p className={styles.note}>Worker cần hoạt động. Mốc :50 phải đọc xong trước giờ kế tiếp; nếu trễ sẽ ghi lỡ mốc, không gán dữ liệu giờ sau vào giờ trước.</p></details>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="backlog-chart-title"><div className={styles.panelHeading}><h2 id="backlog-chart-title">Backlog theo giờ · {day}</h2><button type="button" onClick={()=>dialog.current?.close()}><X size={16} aria-hidden="true"/>Đóng</button></div><BacklogTrendChart daily={chartDaily} active={source} cot={cot} area={area} selected={selectedHour} onSelect={selectHour} large/></dialog>
  </div>;
}

function HeatRow({name,day,cot,max,onSelect}:{name:string;day?:BacklogHourlyDay;cot:BacklogCot;max:number;onSelect:(h:number)=>void}) {
  return <><b>{name}</b>{Array.from({length:24},(_,h)=>{const p=day?.hours[h],value=hourlyValue(p,cot,name);return <button key={h} disabled={value===null} style={value===null?undefined:{background:`color-mix(in srgb,var(--color-accent) ${Math.round(5+24*value/max)}%,var(--color-paper))`,color:"var(--color-ink)"}} aria-label={`${name} · ${hh(h)} · ${fmt(value)} đơn · ${statuses[p?.status??"PENDING"]}`} title={`${name} · ${hh(h)} · ${fmt(value)} đơn · ${statuses[p?.status??"PENDING"]}`} onClick={()=>onSelect(h)}>{fmt(value)}</button>;})}</>;
}
