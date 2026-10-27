"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Download, Layers3, Table2, X } from "lucide-react";
import type { PerformanceFilters } from "@/lib/performance/filters";
import styles from "./performance-export-dialog.module.css";

export type PerformanceExportMode = "summary" | "daily" | "both";

export function PerformanceExportDialog({open,filters,exporting,error,onClose,onExport}:{
 open:boolean;filters:PerformanceFilters;exporting:boolean;error:string|null;
 onClose:()=>void;onExport:(mode:PerformanceExportMode)=>void;
}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [mode,setMode]=useState<PerformanceExportMode>("both");
 useEffect(()=>{if(open&&!dialog.current?.open)dialog.current?.showModal();else if(!open&&dialog.current?.open)dialog.current.close();},[open]);
 return <dialog ref={dialog} className={styles.dialog} aria-labelledby="performance-export-title" onCancel={event=>{event.preventDefault();if(!exporting)onClose();}} onClose={onClose}>
  <header><span className={styles.icon}><Download size={21}/></span><div><p>RIDER PERFORMANCE</p><h2 id="performance-export-title">Xuất báo cáo Excel</h2></div><button type="button" aria-label="Đóng bảng xuất Excel" onClick={onClose} disabled={exporting}><X size={19}/></button></header>
  <div className={styles.scope}><span>Khoảng dữ liệu đang chọn</span><strong>{filters.start.split("-").reverse().join("/")} — {filters.end.split("-").reverse().join("/")}</strong><p>{[filters.kv==="all"?"KV1–KV5":filters.kv,...[filters.district,filters.ward,filters.cot].filter(value=>value!=="all"),filters.q?`Tìm: ${filters.q}`:""].filter(Boolean).join(" · ")}</p></div>
  <fieldset disabled={exporting}><legend>Chọn nội dung xuất</legend>
   {([
    {value:"summary",label:"Tổng hợp cả kỳ",description:"Một dòng mỗi rider, cộng toàn bộ sản lượng trong khoảng ngày.",Icon:Table2},
    {value:"daily",label:"Chi tiết từng ngày",description:"Một dòng mỗi rider/ngày, có cột ngày để lọc và đối chiếu.",Icon:CalendarDays},
    {value:"both",label:"Cả hai báo cáo",description:"Một file Excel, gồm sheet tổng hợp và sheet chi tiết theo ngày.",Icon:Layers3},
   ] as const).map(option=><label key={option.value} className={styles.option} data-selected={mode===option.value}><input type="radio" name="performance-export-mode" value={option.value} checked={mode===option.value} onChange={()=>setMode(option.value)}/><option.Icon size={19}/><span><strong>{option.label}</strong><small>{option.description}</small></span></label>)}
  </fieldset>
  <p className={styles.help}>Xuất toàn bộ rider khớp bộ lọc, bao gồm các trang chưa mở. Số Pick quy đổi được làm tròn theo từng kỳ hoặc từng ngày tương ứng.</p>
  {error?<p className={styles.error} role="alert">{error}</p>:null}
  <footer><button type="button" className={styles.cancel} onClick={onClose} disabled={exporting}>Hủy</button><button type="button" className={styles.download} onClick={()=>onExport(mode)} disabled={exporting} aria-busy={exporting}><Download size={16}/>{exporting?"Đang tạo file…":"Tải file Excel"}</button></footer>
 </dialog>;
}
