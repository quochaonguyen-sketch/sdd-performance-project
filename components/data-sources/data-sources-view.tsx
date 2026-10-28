"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Play, Square, Server, RefreshCw, ArrowUpRight, Clock3, Database, Loader2, CheckCircle2, CircleAlert, Layers3, History, Search, KeyRound, ChevronDown } from "lucide-react";
import { DATA_SOURCES, vietnamDay, type DataSourceId } from "@/lib/data-sources/catalog";
import { jobDurationMs, sourceFailureRate } from "@/lib/data-sources/metrics";
import { SourceSchedule, type SourceScheduleSetting } from "./source-schedule";
import { SpxSession } from "./spx-session";
import "./data-sources.css";

type Job={id:string;source_id:DataSourceId;report_date:string;status:string;phase:string;message:string;requested_at:string;started_at:string|null;finished_at:string|null;events:{at:string;message:string}[]};
type Setting=SourceScheduleSetting;
type Worker={id:string;hostname:string;concurrency:number;last_seen_at:string};
type State={sources:Array<typeof DATA_SOURCES[number]&{canControl:boolean}>;settings:Setting[];jobs:Job[];workers:Worker[];serverTime:string;canControl:boolean};
const active=(j:Job)=>["QUEUED","RUNNING","CANCEL_REQUESTED"].includes(j.status);
const labels:Record<string,string>={QUEUED:"Chờ máy chủ",RUNNING:"Đang chạy",CANCEL_REQUESTED:"Đang yêu cầu dừng",SUCCEEDED:"Thành công",FAILED:"Thất bại",CANCELLED:"Đã dừng"};
const time=(value:string|null)=>value?new Date(value).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"}):"—";
const duration=(value:number|null)=>value===null?"—":`${value.toLocaleString("vi-VN")} ms`;
const percent=new Intl.NumberFormat("vi-VN",{maximumFractionDigits:1});
const fold=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase();

export function DataSourcesView(){
  const [state,setState]=useState<State|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [busy,setBusy]=useState<string|null>(null),[dates,setDates]=useState<Record<string,string>>({}),[selected,setSelected]=useState<string|null>(null);
  const [query,setQuery]=useState(''),[filter,setFilter]=useState<'all'|'running'|'failed'>('all'),[sessionLoaded,setSessionLoaded]=useState(false);
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
  const latestJob=(id:DataSourceId)=>state?.jobs.find(j=>j.source_id===id&&active(j))??state?.jobs.find(j=>j.source_id===id);
  const counts={all:state?.sources.length??0,running:state?.sources.filter(s=>{const job=latestJob(s.id);return job&&active(job);}).length??0,failed:state?.sources.filter(s=>latestJob(s.id)?.status==='FAILED').length??0};
  const sources=state?.sources.filter(source=>{
    const job=latestJob(source.id);
    return (!query.trim()||fold(`${source.name} ${source.description} ${source.id}`).includes(fold(query.trim())))&&(filter==='all'||filter==='running'&&job&&active(job)||filter==='failed'&&job?.status==='FAILED');
  })??[];
  return <div className="data-sources-page space-y-6 p-4 md:p-7">
    <header className="ds-page-heading"><div><span className="ds-eyebrow"><Database size={14} aria-hidden="true"/> VẬN HÀNH DỮ LIỆU</span><h1>Điều khiển nguồn dữ liệu</h1><p>Theo dõi đồng bộ, hiệu suất và lịch chạy trong một màn hình.</p></div><button type="button" onClick={()=>void load()} className="ds-refresh"><RefreshCw size={15} aria-hidden="true"/>Làm mới</button></header>
    <div className="ds-worker-strip" data-connected={!!workers.length}><Server size={18} aria-hidden="true"/><div><strong>{workers.length?"Máy chủ đang kết nối":"Chưa có worker kết nối"}</strong><p>{workers.length?workers.map(w=>`${w.hostname} · ${w.concurrency} nguồn song song`).join(" | "):"Lệnh sẽ xếp hàng. Bật run_sources_worker.cmd trên máy chủ để nhận lệnh."}</p></div><span>{state?.jobs.filter(active).length??0} chờ / chạy · cập nhật mỗi 5 giây</span></div>
    {error&&<div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}{notice&&<div role="status" className="rounded-xl bg-blue-50 p-4 text-blue-700">{notice}</div>}
    {!state&&!error&&<p className="flex gap-2"><Loader2 className="animate-spin" size={18}/>Đang tải nguồn dữ liệu…</p>}
    {state?.canControl&&<details className="ds-session-panel" onToggle={event=>{if(event.currentTarget.open)setSessionLoaded(true);}}><summary><KeyRound size={16} aria-hidden="true"/><span>Phiên kết nối SPX<small>Cookie và tài khoản dùng chung cho các nguồn</small></span><ChevronDown size={15} aria-hidden="true"/></summary>{sessionLoaded&&<SpxSession/>}</details>}
    <div className="ds-section-heading"><div><h2>Các nguồn đồng bộ <span>{state?.sources.length??"—"}</span></h2></div><p>Trạng thái gần nhất · ms mỗi lượt · tỷ lệ thất bại</p></div>
    <div className="ds-source-toolbar"><div className="ds-status-filters" role="group" aria-label="Lọc trạng thái nguồn">{([['all','Tất cả'],['running','Chờ / chạy'],['failed','Thất bại']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}<span>{counts[value]}</span></button>)}</div><label className="ds-source-search"><Search size={16} aria-hidden="true"/><input type="search" aria-label="Tìm nguồn dữ liệu" placeholder="Tìm nguồn dữ liệu…" value={query} onChange={event=>setQuery(event.target.value)}/></label></div>
    {state&&!sources.length&&<div className="ds-empty"><p>Không có nguồn khớp bộ lọc.</p><button type="button" onClick={()=>{setQuery('');setFilter('all');}}>Đặt lại bộ lọc</button></div>}
    <div className="ds-source-grid">{state&&sources.map(source=>{
      const setting=state.settings.find(s=>s.source_id===source.id),job=state.jobs.find(j=>j.source_id===source.id&&active(j))??state.jobs.find(j=>j.source_id===source.id),running=job&&active(job);
      const tone=job?.status==="FAILED"?"error":running?"running":job?.status==="SUCCEEDED"?"success":"idle";
      const StatusIcon=tone==="success"?CheckCircle2:tone==="error"?CircleAlert:running?Loader2:Clock3;
      const elapsed=jobDurationMs(job,state.serverTime),failures=sourceFailureRate(state.jobs,source.id);
      return <section key={source.id} className="ds-source-card" style={{"--source-accent":source.color} as React.CSSProperties} aria-label={source.name}>
        <div className="ds-card-main">
          <div className="ds-card-heading"><span className="ds-source-icon"><Layers3 size={18} aria-hidden="true"/></span><div className="ds-source-title"><h3>{source.name}</h3><p className="ds-source-description" title={source.description}>{source.description}</p></div><Link href={source.href} aria-label={`Mở ${source.name}`} className="ds-open-link"><ArrowUpRight size={17} aria-hidden="true"/></Link></div>
          <div className="ds-status-cell"><div className={`ds-job-status is-${tone}`}><StatusIcon size={15} className={running?"animate-spin":undefined} aria-hidden="true"/><strong>{job?labels[job.status]:"Sẵn sàng"}{job?.phase==="publishing"&&" · Đang ghi"}</strong><span>{job?.finished_at?time(job.finished_at):running?"Đang xử lý":""}</span></div>
          <p className="ds-job-message">{job?.message??"Chưa có lượt chạy. Bắt đầu khi bạn sẵn sàng."}</p>
          <div className="ds-job-history">{job?<button type="button" onClick={()=>setSelected(job.id)}><History size={14} aria-hidden="true"/>Nhật ký</button>:<span>Chưa có nhật ký</span>}</div></div>
          <dl className="ds-source-metrics">
            <div><dt>{running?"Đã chạy":"Thời gian chạy"}</dt><dd>{duration(elapsed)}</dd></div>
            <div><dt>Tỷ lệ fail</dt><dd className={failures.failed?"ds-metric-error":undefined}>{failures.percent===null?"—":`${percent.format(failures.percent)}%`}</dd></div>
            <div className="ds-metrics-sample"><dt>Thất bại / lượt hoàn tất</dt><dd>{failures.failed}/{failures.total}</dd></div>
          </dl>
          <div className="ds-run-controls">
            {source.dated?<label className="ds-run-date"><span>Ngày dữ liệu</span><input aria-label={`Ngày ${source.name}`} type="date" max={vietnamDay()} value={dates[source.id]??vietnamDay()} onChange={e=>setDates({...dates,[source.id]:e.target.value})}/></label>:<p className="ds-run-date ds-live-note"><span className="ds-live-dot"/>Dữ liệu hiện tại</p>}
            <div className="ds-run-actions"><button type="button" disabled={!source.canControl||!!busy||!!running} onClick={()=>void command(source.id,"run")} className="ds-run-button"><Play size={15} aria-hidden="true"/>{busy===source.id?"Đang gửi…":"Chạy ngay"}</button><button type="button" disabled={!source.canControl||!!busy||!running||job?.status==="CANCEL_REQUESTED"} onClick={()=>void command(source.id,"stop")} className="ds-stop-button"><Square size={13} aria-hidden="true"/>Dừng</button></div>
          </div>
        </div><SourceSchedule source={source} setting={setting} disabled={!source.canControl||!!busy} saving={busy===source.id} onSave={draft=>command(source.id,"auto",draft)}/>
      </section>;
    })}</div>
    <p className="ds-metrics-note">Thời gian chạy từ lúc worker bắt đầu đến khi kết thúc, không gồm thời gian xếp hàng; lượt đang chạy cập nhật mỗi 5 giây. Tỷ lệ fail tính riêng từng nguồn trong 100 lượt lịch sử gần nhất: thất bại / (thành công + thất bại), không tính lượt đã dừng. Chưa có dữ liệu hiển thị —.</p>
    <p className="flex items-start gap-2 text-sm text-slate-500"><Clock3 size={17} className="shrink-0"/>Dừng tác vụ và tắt lịch tự động là hai thao tác riêng. Nếu tác vụ đang ghi dữ liệu, worker hoàn tất lượt ghi trước khi dừng. Lịch theo giờ cố định dùng giờ Việt Nam (UTC+7). Ngày dữ liệu theo lựa chọn trong lịch; ô ngày phía trên dùng cho chạy một lần.</p>
    {detail&&<section className="rounded-2xl border bg-white p-5"><div className="flex justify-between"><h2 className="font-semibold">Nhật ký · {DATA_SOURCES.find(s=>s.id===detail.source_id)?.name} · {detail.report_date}</h2><button onClick={()=>setSelected(null)} className="text-sm text-slate-500">Đóng</button></div><ol className="mt-4 space-y-3">{detail.events.map((event,i)=><li key={i} className="flex gap-4 text-sm"><span className="text-slate-400">{time(event.at)}</span><span>{event.message}</span></li>)}</ol></section>}
    <section className="overflow-hidden rounded-2xl border bg-white"><h2 className="border-b p-5 font-semibold">Lịch sử chạy gần đây</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{["Nguồn","Ngày dữ liệu","Nhận lệnh","Kết thúc","Thời gian chạy","Trạng thái",""].map((h,i)=><th key={i} className="px-5 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{state?.jobs.slice(0,20).map(j=><tr key={j.id} className="border-t"><td className="px-5 py-3 font-medium">{DATA_SOURCES.find(s=>s.id===j.source_id)?.name}</td><td className="px-5 py-3">{j.report_date}</td><td className="px-5 py-3 text-slate-500">{time(j.requested_at)}</td><td className="px-5 py-3 text-slate-500">{time(j.finished_at)}</td><td className="px-5 py-3 whitespace-nowrap tabular-nums">{duration(jobDurationMs(j,state!.serverTime))}</td><td className={`px-5 py-3 ${j.status==="FAILED"?"text-red-600":j.status==="SUCCEEDED"?"text-emerald-600":"text-slate-600"}`}>{labels[j.status]}</td><td className="px-5 py-3"><button onClick={()=>setSelected(j.id)} className="text-blue-600">Chi tiết</button></td></tr>)}</tbody></table>{state&&!state.jobs.length&&<p className="p-6 text-center text-sm text-slate-400">Chưa có lịch sử. Chọn nguồn và bấm Chạy một lần.</p>}</div></section>
  </div>;
}
