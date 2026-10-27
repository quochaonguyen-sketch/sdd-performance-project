"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Play, Square, Server, RefreshCw, ArrowUpRight, Clock3, Database, Loader2, CheckCircle2, CircleAlert, Layers3, History } from "lucide-react";
import { DATA_SOURCES, vietnamDay, type DataSourceId } from "@/lib/data-sources/catalog";
import { SourceSchedule, type SourceScheduleSetting } from "./source-schedule";
import { SpxSession } from "./spx-session";
import "./data-sources.css";

type Job={id:string;source_id:DataSourceId;report_date:string;status:string;phase:string;message:string;requested_at:string;started_at:string|null;finished_at:string|null;events:{at:string;message:string}[]};
type Setting=SourceScheduleSetting;
type Worker={id:string;hostname:string;concurrency:number;last_seen_at:string};
type State={sources:typeof DATA_SOURCES[number][];settings:Setting[];jobs:Job[];workers:Worker[];serverTime:string};
const active=(j:Job)=>["QUEUED","RUNNING","CANCEL_REQUESTED"].includes(j.status);
const labels:Record<string,string>={QUEUED:"Chờ máy chủ",RUNNING:"Đang chạy",CANCEL_REQUESTED:"Đang yêu cầu dừng",SUCCEEDED:"Thành công",FAILED:"Thất bại",CANCELLED:"Đã dừng"};
const time=(value:string|null)=>value?new Date(value).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"}):"—";

export function DataSourcesView(){
  const [state,setState]=useState<State|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [busy,setBusy]=useState<string|null>(null),[dates,setDates]=useState<Record<string,string>>({}),[selected,setSelected]=useState<string|null>(null);
  const load=useCallback(async(signal?:AbortSignal)=>{
    try{const response=await fetch("/api/data-sources",{cache:"no-store",signal});const body=await response.json();if(!response.ok)throw new Error(body.error);setState(body);setError("");}
    catch(e){if(!(e instanceof Error&&e.name==="AbortError"))setError(e instanceof Error?e.message:"Không tải được dữ liệu");}
  },[]);
  useEffect(()=>{const controller=new AbortController();const initial=setTimeout(()=>void load(controller.signal),0);const interval=setInterval(()=>{if(!document.hidden)void load(controller.signal);},5000);return()=>{controller.abort();clearTimeout(initial);clearInterval(interval);};},[load]);
  async function command(source:DataSourceId,action:string,extra:object={}){
    if(busy)return;setBusy(source);setNotice("");
    try{const response=await fetch("/api/data-sources",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source,action,day:dates[source]??vietnamDay(),...extra})});const body=await response.json();if(!response.ok)throw new Error(body.error);setNotice(body.message);await load();}
    catch(e){setError(e instanceof Error?e.message:"Không gửi được lệnh");}finally{setBusy(null);}
  }
  const workers=error?[]:state?.workers.filter(w=>Date.parse(state.serverTime)-Date.parse(w.last_seen_at)<45000)??[];
  const detail=state?.jobs.find(j=>j.id===selected);
  return <div className="data-sources-page space-y-6 p-4 md:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-sm text-slate-500"><Database size={16}/> TRUNG TÂM DỮ LIỆU</div><h1 className="text-3xl font-bold tracking-tight">Điều khiển nguồn dữ liệu</h1><p className="mt-2 text-sm text-slate-500">Chọn nguồn trên web · Máy chủ chạy nền · Cập nhật trạng thái mỗi 5 giây</p></div><button onClick={()=>void load()} className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm"><RefreshCw size={16}/> Làm mới</button></div>
    <div className={`rounded-2xl border p-5 ${workers.length?"border-emerald-200 bg-emerald-50":"border-amber-200 bg-amber-50"}`}><div className="flex items-center gap-3"><Server size={24}/><div><p className="font-semibold">{workers.length?"Máy chủ đang kết nối":"Chưa có worker kết nối"}</p><p className="mt-1 text-sm">{workers.length?workers.map(w=>`${w.hostname} · tối đa ${w.concurrency} nguồn song song`).join(" | "):"Lệnh chạy sẽ xếp hàng. Bật run_sources_worker.cmd trong sdd-web-data trên máy chủ để nhận lệnh."}</p></div><span className="ml-auto rounded-full bg-white/70 px-3 py-1 text-sm">{state?.jobs.filter(active).length??0} tác vụ đang chờ / chạy</span></div></div>
    {error&&<div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}{notice&&<div role="status" className="rounded-xl bg-blue-50 p-4 text-blue-700">{notice}</div>}
    {!state&&!error&&<p className="flex gap-2"><Loader2 className="animate-spin" size={18}/>Đang tải nguồn dữ liệu…</p>}
    <SpxSession />
    <div className="ds-section-heading"><div><span className="ds-section-kicker">VẬN HÀNH DỮ LIỆU</span><h2>Các nguồn đồng bộ <span>{state?.sources.length??"—"}</span></h2></div><p>Chạy thủ công hoặc mở từng nguồn để chỉnh lịch.</p></div>
    <div className="ds-source-grid">{state?.sources.map(source=>{
      const setting=state.settings.find(s=>s.source_id===source.id),job=state.jobs.find(j=>j.source_id===source.id&&active(j))??state.jobs.find(j=>j.source_id===source.id),running=job&&active(job);
      const tone=job?.status==="FAILED"?"error":running?"running":job?.status==="SUCCEEDED"?"success":"idle";
      const StatusIcon=tone==="success"?CheckCircle2:tone==="error"?CircleAlert:running?Loader2:Clock3;
      return <section key={source.id} className="ds-source-card" style={{"--source-accent":source.color} as React.CSSProperties} aria-label={source.name}>
        <div className="ds-card-main">
          <div className="ds-card-heading"><span className="ds-source-icon"><Layers3 size={18} aria-hidden="true"/></span><div className="ds-source-title"><h3>{source.name}</h3><p className="ds-source-description" title={source.description}>{source.description}</p></div><Link href={source.href} aria-label={`Mở ${source.name}`} className="ds-open-link"><ArrowUpRight size={17} aria-hidden="true"/></Link></div>
          <div className="ds-status-cell"><div className={`ds-job-status is-${tone}`}><StatusIcon size={15} className={running?"animate-spin":undefined} aria-hidden="true"/><strong>{job?labels[job.status]:"Sẵn sàng"}{job?.phase==="publishing"&&" · Đang ghi"}</strong><span>{job?.finished_at?time(job.finished_at):running?"Đang xử lý":""}</span></div>
          <p className="ds-job-message">{job?.message??"Chưa có lượt chạy. Bắt đầu khi bạn sẵn sàng."}</p>
          <div className="ds-job-history">{job?<button type="button" onClick={()=>setSelected(job.id)}><History size={14} aria-hidden="true"/>Nhật ký</button>:<span>Chưa có nhật ký</span>}</div></div>
          <div className="ds-run-controls">
            {source.dated?<label className="ds-run-date"><span>Ngày dữ liệu</span><input aria-label={`Ngày ${source.name}`} type="date" max={vietnamDay()} value={dates[source.id]??vietnamDay()} onChange={e=>setDates({...dates,[source.id]:e.target.value})}/></label>:<p className="ds-run-date ds-live-note"><span className="ds-live-dot"/>Dữ liệu hiện tại</p>}
            <div className="ds-run-actions"><button type="button" disabled={!!busy||!!running} onClick={()=>void command(source.id,"run")} className="ds-run-button"><Play size={15} aria-hidden="true"/>{busy===source.id?"Đang gửi…":"Chạy ngay"}</button><button type="button" disabled={!!busy||!running||job?.status==="CANCEL_REQUESTED"} onClick={()=>void command(source.id,"stop")} className="ds-stop-button"><Square size={13} aria-hidden="true"/>Dừng</button></div>
          </div>
        </div><SourceSchedule source={source} setting={setting} disabled={!!busy} saving={busy===source.id} onSave={draft=>command(source.id,"auto",draft)}/>
      </section>;
    })}</div>
    <p className="flex items-start gap-2 text-sm text-slate-500"><Clock3 size={17} className="shrink-0"/>Dừng tác vụ và tắt lịch tự động là hai thao tác riêng. Nếu tác vụ đang ghi dữ liệu, worker hoàn tất lượt ghi trước khi dừng. Lịch theo giờ cố định dùng giờ Việt Nam (UTC+7). Ngày dữ liệu theo lựa chọn trong lịch; ô ngày phía trên dùng cho chạy một lần.</p>
    {detail&&<section className="rounded-2xl border bg-white p-5"><div className="flex justify-between"><h2 className="font-semibold">Nhật ký · {DATA_SOURCES.find(s=>s.id===detail.source_id)?.name} · {detail.report_date}</h2><button onClick={()=>setSelected(null)} className="text-sm text-slate-500">Đóng</button></div><ol className="mt-4 space-y-3">{detail.events.map((event,i)=><li key={i} className="flex gap-4 text-sm"><span className="text-slate-400">{time(event.at)}</span><span>{event.message}</span></li>)}</ol></section>}
    <section className="overflow-hidden rounded-2xl border bg-white"><h2 className="border-b p-5 font-semibold">Lịch sử chạy gần đây</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{["Nguồn","Ngày dữ liệu","Nhận lệnh","Kết thúc","Trạng thái",""].map((h,i)=><th key={i} className="px-5 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{state?.jobs.slice(0,20).map(j=><tr key={j.id} className="border-t"><td className="px-5 py-3 font-medium">{DATA_SOURCES.find(s=>s.id===j.source_id)?.name}</td><td className="px-5 py-3">{j.report_date}</td><td className="px-5 py-3 text-slate-500">{time(j.requested_at)}</td><td className="px-5 py-3 text-slate-500">{time(j.finished_at)}</td><td className={`px-5 py-3 ${j.status==="FAILED"?"text-red-600":j.status==="SUCCEEDED"?"text-emerald-600":"text-slate-600"}`}>{labels[j.status]}</td><td className="px-5 py-3"><button onClick={()=>setSelected(j.id)} className="text-blue-600">Chi tiết</button></td></tr>)}</tbody></table>{state&&!state.jobs.length&&<p className="p-6 text-center text-sm text-slate-400">Chưa có lịch sử. Chọn nguồn và bấm Chạy một lần.</p>}</div></section>
  </div>;
}
