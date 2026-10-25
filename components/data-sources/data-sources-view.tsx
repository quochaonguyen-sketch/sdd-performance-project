"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Play, Square, Server, RefreshCw, ArrowUpRight, Clock3, Database, Loader2 } from "lucide-react";
import { DATA_SOURCES, vietnamDay, type DataSourceId } from "@/lib/data-sources/catalog";
import { SourceSchedule, type SourceScheduleSetting } from "./source-schedule";
import { SpxSession } from "./spx-session";

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
  return <div className="space-y-6 p-4 md:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-sm text-slate-500"><Database size={16}/> TRUNG TÂM DỮ LIỆU</div><h1 className="text-3xl font-bold tracking-tight">Điều khiển nguồn dữ liệu</h1><p className="mt-2 text-sm text-slate-500">Chọn nguồn trên web · Máy chủ chạy nền · Cập nhật trạng thái mỗi 5 giây</p></div><button onClick={()=>void load()} className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm"><RefreshCw size={16}/> Làm mới</button></div>
    <div className={`rounded-2xl border p-5 ${workers.length?"border-emerald-200 bg-emerald-50":"border-amber-200 bg-amber-50"}`}><div className="flex items-center gap-3"><Server size={24}/><div><p className="font-semibold">{workers.length?"Máy chủ đang kết nối":"Chưa có worker kết nối"}</p><p className="mt-1 text-sm">{workers.length?workers.map(w=>`${w.hostname} · tối đa ${w.concurrency} nguồn song song`).join(" | "):"Lệnh chạy sẽ xếp hàng. Bật run_sources_worker.cmd trong sdd-web-data trên máy chủ để nhận lệnh."}</p></div><span className="ml-auto rounded-full bg-white/70 px-3 py-1 text-sm">{state?.jobs.filter(active).length??0} tác vụ đang chờ / chạy</span></div></div>
    {error&&<div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}{notice&&<div role="status" className="rounded-xl bg-blue-50 p-4 text-blue-700">{notice}</div>}
    {!state&&!error&&<p className="flex gap-2"><Loader2 className="animate-spin" size={18}/>Đang tải nguồn dữ liệu…</p>}
    <SpxSession />
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{state?.sources.map(source=>{
      const setting=state.settings.find(s=>s.source_id===source.id),job=state.jobs.find(j=>j.source_id===source.id&&active(j))??state.jobs.find(j=>j.source_id===source.id),running=job&&active(job);
      return <section key={source.id} className="flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md" style={{borderTop:`4px solid ${source.color}`}}>
        <div className="flex-1 p-5"><div className="flex justify-between gap-2"><h2 className="text-lg font-bold" style={{color:source.color}}>{source.name}</h2><Link href={source.href} aria-label={`Mở ${source.name}`} className="rounded-full bg-slate-50 p-2"><ArrowUpRight size={16}/></Link></div><p className="mt-1 min-h-10 text-sm text-slate-500">{source.description}</p>
        <div className="my-4 rounded-xl bg-slate-50 p-3"><p className={`flex items-center gap-2 text-sm font-semibold ${job?.status==="FAILED"?"text-red-600":"text-slate-700"}`}>{running&&<Loader2 size={14} className="animate-spin"/>}{job?labels[job.status]:"Chưa có lượt chạy"}{job?.phase==="publishing"&&" · Đang ghi"}</p><p className="mt-1 min-h-9 text-xs text-slate-500">{job?.message??"Sẵn sàng nhận lệnh từ web"}</p>{job&&<button onClick={()=>setSelected(job.id)} className="mt-2 text-xs text-blue-600 underline">Xem nhật ký lượt chạy</button>}</div>
        {source.dated&&<label className="mb-3 flex items-center justify-between text-sm text-slate-600">Ngày chạy một lần<input aria-label={`Ngày ${source.name}`} type="date" max={vietnamDay()} value={dates[source.id]??vietnamDay()} onChange={e=>setDates({...dates,[source.id]:e.target.value})} className="rounded-lg border px-2 py-1"/></label>}
        <div className="flex gap-2"><button disabled={!!busy||!!running} onClick={()=>void command(source.id,"run")} className="flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40" style={{background:source.color}}><Play size={15}/> {busy===source.id?"Đang gửi…":"Chạy một lần"}</button><button disabled={!!busy||!running||job?.status==="CANCEL_REQUESTED"} onClick={()=>void command(source.id,"stop")} className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm disabled:opacity-35"><Square size={14}/>Dừng</button></div>
        </div><SourceSchedule source={source} setting={setting} disabled={!!busy} saving={busy===source.id} onSave={draft=>command(source.id,"auto",draft)}/>
      </section>;
    })}</div>
    <p className="flex items-start gap-2 text-sm text-slate-500"><Clock3 size={17} className="shrink-0"/>Dừng tác vụ và tắt lịch tự động là hai thao tác riêng. Nếu tác vụ đang ghi dữ liệu, worker hoàn tất lượt ghi trước khi dừng. Lịch theo giờ cố định dùng giờ Việt Nam (UTC+7). Ngày dữ liệu theo lựa chọn trong lịch; ô ngày phía trên dùng cho chạy một lần.</p>
    {detail&&<section className="rounded-2xl border bg-white p-5"><div className="flex justify-between"><h2 className="font-semibold">Nhật ký · {DATA_SOURCES.find(s=>s.id===detail.source_id)?.name} · {detail.report_date}</h2><button onClick={()=>setSelected(null)} className="text-sm text-slate-500">Đóng</button></div><ol className="mt-4 space-y-3">{detail.events.map((event,i)=><li key={i} className="flex gap-4 text-sm"><span className="text-slate-400">{time(event.at)}</span><span>{event.message}</span></li>)}</ol></section>}
    <section className="overflow-hidden rounded-2xl border bg-white"><h2 className="border-b p-5 font-semibold">Lịch sử chạy gần đây</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{["Nguồn","Ngày dữ liệu","Nhận lệnh","Kết thúc","Trạng thái",""].map((h,i)=><th key={i} className="px-5 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{state?.jobs.slice(0,20).map(j=><tr key={j.id} className="border-t"><td className="px-5 py-3 font-medium">{DATA_SOURCES.find(s=>s.id===j.source_id)?.name}</td><td className="px-5 py-3">{j.report_date}</td><td className="px-5 py-3 text-slate-500">{time(j.requested_at)}</td><td className="px-5 py-3 text-slate-500">{time(j.finished_at)}</td><td className={`px-5 py-3 ${j.status==="FAILED"?"text-red-600":j.status==="SUCCEEDED"?"text-emerald-600":"text-slate-600"}`}>{labels[j.status]}</td><td className="px-5 py-3"><button onClick={()=>setSelected(j.id)} className="text-blue-600">Chi tiết</button></td></tr>)}</tbody></table>{state&&!state.jobs.length&&<p className="p-6 text-center text-sm text-slate-400">Chưa có lịch sử. Chọn nguồn và bấm Chạy một lần.</p>}</div></section>
  </div>;
}
