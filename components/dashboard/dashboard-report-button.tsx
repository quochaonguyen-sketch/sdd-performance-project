"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Dialog } from "radix-ui";
import { FileText, Download, Printer, RefreshCw, X, ArrowUpRight, ScanLine, Expand } from "lucide-react";
import { buildDailyReport, type DailyReport, type ReportHub } from "@/lib/dashboard/daily-report";
import type { OperationsOverview } from "@/lib/dashboard/operations-overview";
import type { LinehaulData } from "@/lib/linehaul/model";
import type { OHData } from "@/lib/onhold/model";
import { drawDailyReport } from "./daily-report-canvas";
import s from "./dashboard-report.module.css";

export function DashboardReportButton() {
  const [open,setOpen]=useState(false),[loading,setLoading]=useState(false);
  const [report,setReport]=useState<DailyReport|null>(null),[error,setError]=useState<string|null>(null);
  const [preview,setPreview]=useState<{url:string;width:number;height:number}|null>(null);
  const [fit,setFit]=useState(true);
  const imageUrl=useRef<string|null>(null);
  useEffect(()=>()=>{if(imageUrl.current)URL.revokeObjectURL(imageUrl.current);},[]);
  async function load(force=false){
    if(imageUrl.current){URL.revokeObjectURL(imageUrl.current);imageUrl.current=null;}
    setLoading(true);setError(null);setPreview(null);setReport(null);
    const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).format(new Date());
    const issues:string[]=[];
    async function read<T>(url:string,label:string):Promise<T|null>{try{const response=await fetch(url,{cache:"no-store",headers:force?{"x-dashboard-refresh":"1"}:undefined,signal:AbortSignal.timeout(45000)});const payload=await response.json();if(!response.ok)throw Error(label+": không đọc được nguồn");return payload;}catch{issues.push(`${label}: chưa tải được dữ liệu.`);return null;}}
    try{
      const [hub,operations,lh,oh]=await Promise.all([read<ReportHub>("/api/dashboard/hub-sheet","Hub / FC / Roster"),read<OperationsOverview>("/api/dashboard/operations","Delivery"),read<LinehaulData>("/api/linehaul","LH"),read<OHData>(`/api/onhold?from=${day}&to=${day}`,"Onhold")]);
      const result=buildDailyReport(day,hub,operations,lh,oh,issues);
      const canvas=document.createElement("canvas"),size=drawDailyReport(canvas,result);
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error("Không tạo được ảnh PNG")),"image/png"));
      imageUrl.current=URL.createObjectURL(blob);
      setPreview({url:imageUrl.current,...size});setReport(result);
    }catch(e){setError(e instanceof Error?e.message:"Không tạo được báo cáo");}finally{setLoading(false);}
  }
  function print(){if(!preview)return;const popup=window.open("","_blank");if(!popup){setError("Trình duyệt đang chặn cửa sổ in. Bạn có thể tải ảnh PNG.");return;}popup.document.write(`<!doctype html><html><head><title>Báo cáo SDD ${report?.day}</title><style>@page{size:A4 landscape;margin:8mm}body{margin:0}img{width:100%;height:auto}</style></head><body><img src="${preview.url}" onload="window.print()" alt="Báo cáo vận hành SDD"></body></html>`);popup.document.close();}
  const n=(value:number|null|undefined)=>value?.toLocaleString("vi-VN")??"—";
  const summary=report?[{label:"Total Inbound",value:report.metrics[2].actual},{label:"Outbound Volume",value:report.metrics[3].actual},{label:"Pending Outbound",value:report.metrics[4].actual},{label:"Rider có Assigned",value:report.staff.find(r=>r.label==="Rider")?.value}]:[];
  return <Dialog.Root open={open} onOpenChange={value=>{setOpen(value);if(value)void load();}}>
    <section className={s.launcher} aria-label="Báo cáo vận hành hằng ngày"><div className={s.launcherIcon}><FileText size={24} aria-hidden="true" /></div><div className={s.launcherCopy}><span>BÁO CÁO HẰNG NGÀY</span><h2>Báo cáo vận hành SDD</h2><p>Nhân sự · Sản lượng · Onhold · Tồn theo quận &amp; COT</p></div><Dialog.Trigger asChild><button type="button" className={s.launchButton}>Mở báo cáo <ArrowUpRight size={18} aria-hidden="true" /></button></Dialog.Trigger></section>
    <Dialog.Portal><Dialog.Overlay className={s.overlay}/><Dialog.Content className={s.modal}>
      <header className={s.header}><div className={s.titleIcon}><FileText size={24} aria-hidden="true" /></div><div className={s.titleCopy}><span className={s.eyebrow}>SDD · DAILY OPERATIONS REPORT</span><Dialog.Title>Báo cáo vận hành</Dialog.Title><Dialog.Description>COT 1 &amp; COT 2 · KV1–KV5{report?" · "+report.day.split("-").reverse().join("/"):""}</Dialog.Description></div><Dialog.Close asChild><button type="button" aria-label="Đóng báo cáo"><X size={20}/></button></Dialog.Close></header>
      {!!summary.length&&<dl className={s.summary}>{summary.map(item=><div key={item.label}><dt>{item.label}</dt><dd>{n(item.value)}</dd></div>)}</dl>}
      {!!report&&<div className={s.staffDay} aria-label="Nhân sự cả ngày"><span>NHÂN SỰ CẢ NGÀY</span>{report.staff.slice(0,3).map(item=><span key={item.label}>{item.label}<b>{n(item.value)}</b></span>)}<small>Tổng HC: <b>{n(report.staff.find(item=>item.label==="Tổng HC")?.value)}</b></small></div>}
      <div className={s.toolbar}><div className={s.toolbarGroup}><button type="button" disabled={loading} onClick={()=>void load(true)}><RefreshCw size={16} aria-hidden="true" className={loading?s.spin:undefined}/>{loading?"Đang tổng hợp…":"Cập nhật"}</button>{preview&&<button type="button" onClick={()=>setFit(v=>!v)} aria-pressed={!fit}><Expand size={16} aria-hidden="true" />{fit?"Phóng to":"Vừa khung"}</button>}</div><div className={s.toolbarGroup}>{preview&&<><button type="button" onClick={print}><Printer size={16} aria-hidden="true" />In / PDF</button><a href={preview.url} download={"SDD-report-"+report?.day+".png"}><Download size={16} aria-hidden="true" />Tải ảnh PNG</a></>}</div></div>
      {error&&<p className={s.error} role="alert">{error}</p>}
      {!!report?.issues.length&&<details className={s.issues}><summary>{report.issues.length} lưu ý về dữ liệu</summary><ul>{report.issues.map(issue=><li key={issue}>{issue}</li>)}</ul></details>}
      <div className={s.preview} data-fit={fit}>{loading?<div className={s.loading} role="status"><ScanLine size={36} aria-hidden="true" /><strong>Đang tổng hợp báo cáo hôm nay</strong><p>Đối chiếu Hub, LH, Assigned Delivery, OH và roster…</p></div>:preview?<Image src={preview.url} width={preview.width} height={preview.height} unoptimized alt={"Báo cáo SDD ngày "+report?.day+": nhân sự, inbound, outbound, Onhold và tồn theo quận"} />:<p>Chưa có bản báo cáo. Bấm cập nhật để thử lại.</p>}</div>
      <details className={s.notes}><summary>Công thức và phạm vi dữ liệu</summary><p>Outbound = Assigned Delivery; Non-attempt = tồn LMHub_Received; Pending Outbound = Non-attempt + tổng OH hôm nay. WH Inbound = LH đã xả hôm nay; MP Inbound = Total Inbound − WH Inbound.</p><p>HC rider đếm Driver ID duy nhất có Assigned Delivery &gt; 0 hôm nay, trong KV1–KV5. COT và KV cũng theo nhóm này. FTE = tổng actual FTE cả ngày − 10 LEAD/SUP (tối thiểu 0). OS/BPO lấy tổng actual cả ngày. Tổng HC = Rider có Assigned hôm nay + tổng nhân sự actual cả ngày − số FTE đã loại. Ô “—” là thiếu dữ liệu; các nguồn có thể khác mốc cập nhật.</p></details>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
