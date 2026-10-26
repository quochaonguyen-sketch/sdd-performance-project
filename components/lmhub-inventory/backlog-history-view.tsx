"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compareBacklog, hourlyChanges, hourlyValue, vietnamDay, type BacklogCot, type BacklogDetail, type BacklogHourlyDay, type BacklogLevel, type BacklogSource } from "@/lib/dashboard/backlog-history";
import { BacklogDeltaChart, BacklogTrendChart } from "./backlog-hourly-charts";
import styles from "./backlog-history.module.css";

const fmt = (n: number | null | undefined) => n == null ? "—" : n.toLocaleString("vi-VN");
const hh = (h: number) => `${String(h).padStart(2,"0")}h`;
const stamp = (s: string) => new Intl.DateTimeFormat("vi-VN", { timeZone:"Asia/Ho_Chi_Minh", hour:"2-digit", minute:"2-digit", second:"2-digit" }).format(new Date(s));
const names = { pickup:"Pickup", delivery:"Delivery" };
const statuses: Record<string,string> = { CAPTURED:"Đã chốt", PROVISIONAL:"Tạm tính", FUTURE:"Chưa đến giờ", PENDING:"Chờ chốt", QUEUED:"Đang lấy nguồn", MISSED:"Lỡ mốc chốt", FAILED:"Lấy nguồn lỗi" };
type Option = { id:string; label:string; hour:number };
function options(day?: BacklogHourlyDay): Option[] {
  return [...(day?.hours.filter(p=>p.snapshot_id).map(p=>({id:p.snapshot_id!,hour:p.hour,label:`${hh(p.hour)} · ${p.is_final?"Đã chốt":"Tạm tính"} · nguồn ${stamp(p.source_snapshot_at!)}`}))??[]),
    ...(day?.checkpoints.filter(p=>p.status==="CAPTURED"&&p.snapshot_id).map(p=>({id:p.snapshot_id!,hour:Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit"}).format(new Date(p.scheduled_for))),label:`Mốc riêng ${stamp(p.scheduled_for)}`}))??[])];
}
async function read<T>(params: Record<string,string>, signal:AbortSignal):Promise<T> {
  const response=await fetch(`/api/backlog-history?${new URLSearchParams(params)}`,{signal,cache:"no-store"});
  const payload=await response.json();
  if(!response.ok)throw new Error(payload.error??"Không tải được lịch sử tồn");
  return payload;
}

export function BacklogHistoryView({ initialSource="pickup" }: {initialSource?:BacklogSource}) {
  const [source,setSource]=useState<BacklogSource>(initialSource),[day,setDay]=useState(vietnamDay),[baseline,setBaseline]=useState(vietnamDay);
  const [daily,setDaily]=useState<Partial<Record<BacklogSource,BacklogHourlyDay>>>({}),[baselineData,setBaselineData]=useState<BacklogHourlyDay>();
  const [area,setArea]=useState(""),[cot,setCot]=useState<BacklogCot>("orders"),[level,setLevel]=useState<BacklogLevel>("ward");
  const [selection,setSelection]=useState({before:"auto",after:"auto"});
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
  const observed=current?.hours.filter(p=>p.snapshot_id)??[],latest=observed.at(-1);
  const changes=hourlyChanges(current?.hours??[],cot,area),lastChange=latest?changes.find(p=>p.hour===latest.hour):undefined;
  const peak=observed.length?Math.max(...observed.map(p=>hourlyValue(p,cot,area)??0)):null;
  const heatMax=Math.max(1,...(current?.hours.flatMap(p=>p.areas.map(r=>r[cot]))??[]));
  function selectHour(h:number){const point=current?.hours[h];if(point?.snapshot_id)setSelection({before:"auto",after:point.snapshot_id});}
  function reset(){setSelection({before:"auto",after:"auto"});}
  return <div className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>OPERATIONS INTELLIGENCE · UTC+7</p><h1>Backlog theo giờ</h1><p>11:50 lấy nguồn, chốt đại diện cho giờ 11. So sánh diễn biến tồn xuyên suốt ngày.</p></div><button disabled={loading} onClick={()=>setVersion(v=>v+1)}>{loading?"Đang cập nhật…":"↻ Làm mới"}</button></header>
    <div className={styles.toolbar}><div className={styles.tabs}>{(["pickup","delivery"] as const).map(s=><button key={s} data-active={source===s} onClick={()=>{setSource(s);reset();}}>{names[s]} Backlog</button>)}</div><label>Ngày phân tích<input type="date" value={day} onChange={e=>{if(e.target.value){setDay(e.target.value);setBaseline(e.target.value);reset();}}}/></label><label>Khu vực<select value={area} onChange={e=>setArea(e.target.value)}><option value="">Tất cả khu vực</option>{[1,2,3,4,5].map(n=><option key={n}>KV{n}</option>)}</select></label><label>COT<select value={cot} onChange={e=>setCot(e.target.value as BacklogCot)}><option value="orders">Tất cả COT</option><option value="cot1">COT 1</option><option value="cot2">COT 2</option><option value="other">Chưa rõ COT</option></select></label></div>
    {error&&<p className={styles.error} role="alert">{error}</p>}
    <div className={styles.kpis}><div><span>Tồn {names[source]} gần nhất</span><strong>{fmt(hourlyValue(latest,cot,area))}</strong><small>{latest?`${hh(latest.hour)} · ${statuses[latest.status]}`:"Chưa có snapshot"}</small></div><div><span>So với giờ liền trước</span><strong data-direction={(lastChange?.delta??0)>0?"up":"down"}>{lastChange?.delta!=null&&lastChange.delta>0?"+":""}{fmt(lastChange?.delta)}</strong><small>{lastChange?.percent!=null?`${lastChange.percent>0?"+":""}${lastChange.percent.toFixed(1)}% so với giờ trước`:"Cần dữ liệu của hai giờ liên tiếp"}</small></div><div><span>Đỉnh tồn quan sát trong ngày</span><strong>{fmt(peak)}</strong><small>Theo khu vực và COT đang chọn</small></div><div><span>Khung giờ đã chốt</span><strong>{observed.filter(p=>p.is_final).length}<em> / 24</em></strong><small>{observed.filter(p=>!p.is_final).length} khung giờ có dữ liệu tạm tính</small></div></div>
    <section className={styles.panel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>XU HƯỚNG TRONG NGÀY</p><h2>Diễn biến tồn theo từng giờ</h2></div><button onClick={()=>dialog.current?.showModal()}>⛶ Phóng to</button></div><div className={styles.legend}><span style={{color:"#059669"}}>● Pickup</span><span style={{color:"#2563eb"}}>● Delivery</span><span>● Đã chốt</span><span>○ / nét đứt: tạm tính</span><span>— Thiếu dữ liệu: để trống</span></div><BacklogTrendChart daily={chartDaily} active={source} cot={cot} area={area} selected={selectedHour} onSelect={selectHour}/><p className={styles.note}>Bấm một giờ để chọn mốc B ở bảng đối chiếu. Snapshot chốt được giữ cố định; dữ liệu đọc sau đó không thay thế mốc đã chốt.</p></section>
    <section className={styles.panel}><div className={styles.panelHeading}><div><h2>24 khung giờ · {names[source]}</h2><p>Mỗi giờ chốt một lần lúc :50. Số liệu là đơn đang tồn.</p></div></div><div className={styles.hours}>{Array.from({length:24},(_,h)=>{const p=current?.hours[h];return <button key={h} disabled={!p?.snapshot_id} data-selected={selectedHour===h} data-final={p?.is_final} onClick={()=>selectHour(h)} title={p?.source_snapshot_at?`Nguồn ${stamp(p.source_snapshot_at)}`:"Chưa có nguồn"}><span>{hh(h)}</span><strong>{fmt(hourlyValue(p,cot,area))}</strong><small>{statuses[p?.status??"PENDING"]}</small></button>;})}</div></section>
    <section className={styles.panel}><div className={styles.panelHeading}><div><h2>Biến động so với giờ liền trước</h2><p>Màu cam: tồn tăng · Màu xanh: tồn giảm · Chỉ tính khi có cả hai giờ liên tiếp.</p></div></div><BacklogDeltaChart day={current} cot={cot} area={area} onSelect={selectHour}/></section>
    <section className={styles.panel}><div className={styles.panelHeading}><div><h2>Bản đồ nhiệt theo khu vực</h2><p>Ô đậm hơn biểu thị tồn cao hơn. Bấm ô để lọc khu vực và chọn giờ đối chiếu.</p></div></div><div className={styles.heatScroll}><div className={styles.heatmap}><b>KV / Giờ</b>{Array.from({length:24},(_,h)=><span key={h}>{hh(h)}</span>)}{[1,2,3,4,5].map(n=><HeatRow key={n} name={`KV${n}`} day={current} cot={cot} max={heatMax} onSelect={h=>{setArea(`KV${n}`);selectHour(h);}}/>)}</div></div></section>
    <section className={styles.panel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>ĐỐI CHIẾU CHI TIẾT</p><h2>{names[source]} · Khu vực / Quận / Phường</h2></div></div><div className={styles.selectors}><label>Ngày của mốc A<input type="date" value={baseline} onChange={e=>{if(e.target.value){setBaseline(e.target.value);setSelection(s=>({...s,before:"auto"}));}}}/></label><label>Mốc A<select value={beforeId} onChange={e=>setSelection(s=>({...s,before:e.target.value}))}><option value="" disabled>Chưa có dữ liệu</option>{beforeOptions.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label><label>Mốc B · {day}<select value={afterId} onChange={e=>setSelection(s=>({...s,after:e.target.value}))}><option value="" disabled>Chưa có dữ liệu</option>{afterOptions.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label><label>Gộp theo<select value={level} onChange={e=>setLevel(e.target.value as BacklogLevel)}><option value="area">Khu vực</option><option value="district">Khu vực / Quận</option><option value="ward">Khu vực / Quận / Phường</option></select></label></div>
    {before&&after?<><div className={styles.comparison}><div>Mốc A<strong>{fmt(totals.before)}</strong></div><span>→</span><div>Mốc B<strong>{fmt(totals.after)}</strong></div><div>Chênh lệch B − A<strong data-direction={totals.after>totals.before?"up":"down"}>{totals.after>totals.before?"+":""}{fmt(totals.after-totals.before)}</strong></div></div>{beforeId===afterId&&<p className={styles.note}>Hai mốc đang cùng một snapshot; chọn giờ hoặc ngày khác để so sánh.</p>}<div className={styles.tableWrap}><table><thead><tr><th>Khu vực</th>{level!=="area"&&<th>Quận</th>}{level==="ward"&&<th>Phường</th>}<th>Mốc A</th><th>Mốc B</th><th>Chênh lệch</th><th>Thay đổi %</th></tr></thead><tbody>{rows.map(r=><tr key={JSON.stringify([r.area,r.district,r.ward])}><td>{r.area}</td>{level!=="area"&&<td>{r.district||"Chưa xác định"}</td>}{level==="ward"&&<td>{r.ward||"Chưa xác định"}</td>}<td>{fmt(r.before)}</td><td>{fmt(r.after)}</td><td data-direction={r.delta>0?"up":r.delta<0?"down":"flat"}>{r.delta>0?"+":""}{fmt(r.delta)}</td><td>{r.percent===null?"—":`${r.percent>0?"+":""}${r.percent.toFixed(1)}%`}</td></tr>)}{!rows.length&&<tr><td colSpan={7}>Không có tồn ở các mốc và bộ lọc đã chọn.</td></tr>}</tbody></table></div></>:<p className={styles.note}>{beforeId&&afterId?"Đang tải pivot hai mốc…":"Chọn ngày có snapshot để đối chiếu. Lịch sử bắt đầu từ khi tính năng được bật."}</p>}</section>
    <details className={styles.panel}><summary>Mốc riêng 16:00 và 16:30 · {names[source]}</summary><p className={styles.note}>Giữ độc lập với mốc chốt cuối giờ; có thể chọn trong danh sách A/B khi đã chụp thành công.</p>{current?.checkpoints.map(p=><p key={p.scheduled_for}>{stamp(p.scheduled_for)} · {statuses[p.status]??p.status} · {p.message}</p>)}<p className={styles.note}>Worker cần đang hoạt động. Mốc :50 phải đọc xong trước giờ kế tiếp; nếu trễ sẽ ghi lỡ mốc, không gán dữ liệu giờ sau vào giờ trước.</p></details>
    <dialog ref={dialog} className={styles.dialog}><div className={styles.panelHeading}><h2>Backlog theo giờ · {day}</h2><button onClick={()=>dialog.current?.close()}>Đóng ✕</button></div><BacklogTrendChart daily={chartDaily} active={source} cot={cot} area={area} selected={selectedHour} onSelect={selectHour} large/></dialog>
  </div>;
}
function HeatRow({name,day,cot,max,onSelect}:{name:string;day?:BacklogHourlyDay;cot:BacklogCot;max:number;onSelect:(h:number)=>void}) {
  return <><b>{name}</b>{Array.from({length:24},(_,h)=>{const p=day?.hours[h],value=hourlyValue(p,cot,name);return <button key={h} disabled={value===null} style={value===null?undefined:{background:`rgba(37,99,235,${.06+.76*value/max})`,color:value/max>.5?"#fff":"var(--color-ink)"}} title={`${name} · ${hh(h)} · ${fmt(value)} đơn · ${statuses[p?.status??"PENDING"]}`} onClick={()=>onSelect(h)}>{fmt(value)}</button>;})}</>;
}
