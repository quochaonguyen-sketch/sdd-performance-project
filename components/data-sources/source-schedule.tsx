"use client";
import { useState } from "react";
import { CalendarClock, ChevronDown, Clock3, Save } from "lucide-react";
import type { DATA_SOURCES } from "@/lib/data-sources/catalog";

export type SourceScheduleSetting = {
  source_id:string; auto_enabled:boolean; interval_seconds:number; next_run_at:string|null;
  schedule_mode?:"interval"|"daily"; daily_time?:string; day_offset?:number;
  window_start?:string; window_end?:string;
};
export type ScheduleDraft = {enabled:boolean;mode:"interval"|"daily";interval:number;time:string;offset:number;start:string;end:string};
type Props = {source:typeof DATA_SOURCES[number];setting?:SourceScheduleSetting;disabled:boolean;saving:boolean;onSave:(draft:ScheduleDraft)=>Promise<void>};
const intervals=[300,600,900,1800,3600,7200,86400];
function storedDraft(source:Props["source"], setting:Props["setting"]):ScheduleDraft {
  return {enabled:setting?.auto_enabled??false,mode:setting?.schedule_mode??"interval",interval:setting?.interval_seconds??source.interval,time:setting?.daily_time?.slice(0,5)??"06:00",offset:source.dated?setting?.day_offset??0:0,start:setting?.window_start?.slice(0,5)??(source.id==="onhold_daily"?"00:00":"08:00"),end:setting?.window_end?.slice(0,5)??"00:00"};
}
export function SourceSchedule(props:Props) {
  const stored=storedDraft(props.source,props.setting);
  // Polling next_run_at must not erase a partially edited time. Reset only when saved configuration changes.
  return <ScheduleForm key={`${props.source.id}:${JSON.stringify(stored)}`} {...props} initial={stored}/>;
}
function ScheduleForm({source,setting,disabled,saving,onSave,initial}:Props&{initial:ScheduleDraft}) {
  const [draft,setDraft]=useState(initial);
  const dirty=JSON.stringify(draft)!==JSON.stringify(initial);
  const next=setting?.next_run_at?new Date(setting.next_run_at).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"}):null;
  const frequency=initial.mode==="daily"?`Hằng ngày · ${initial.time}`:`Mỗi ${initial.interval%3600===0?`${initial.interval/3600} giờ`:`${initial.interval/60} phút`}`;
  return <details className="ds-schedule">
    <summary className="ds-schedule-summary">
      <span className="ds-schedule-icon"><CalendarClock size={18} aria-hidden="true"/></span>
      <span className="ds-schedule-copy"><strong>Lịch tự động <span className={`ds-auto-state ${initial.enabled?"is-on":""}`}>{initial.enabled?"Đang bật":"Đang tắt"}</span></strong><span>{initial.enabled?frequency:"Chưa bật lịch cho nguồn này"}</span></span>
      <ChevronDown size={16} className="ds-schedule-chevron" aria-hidden="true"/>
    </summary>
    <div className="ds-next-run"><Clock3 size={13} aria-hidden="true"/><span>{setting?.auto_enabled&&next?`Lượt tiếp: ${next}`:"Mở để thiết lập lịch chạy"}</span></div>
    <form onSubmit={event=>{event.preventDefault();void onSave(draft);}} className="ds-schedule-form">
    <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200"><CalendarClock size={16} aria-hidden="true"/>Lịch tự động</span><label className="ds-enable-toggle"><input type="checkbox" role="switch" aria-label={`Bật lịch ${source.name}`} checked={draft.enabled} disabled={disabled} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/>{draft.enabled?"Bật":"Tắt"}</label></div>
    <label className="block space-y-1 text-xs text-slate-600 dark:text-slate-300"><span>Kiểu lịch</span><select aria-label={`Kiểu lịch ${source.name}`} value={draft.mode} disabled={disabled} onChange={e=>setDraft({...draft,mode:e.target.value as ScheduleDraft["mode"]})} className="min-h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 dark:bg-slate-900 dark:text-slate-100"><option value="interval">Theo chu kỳ</option><option value="daily">Giờ cố định mỗi ngày</option></select></label>
    {draft.mode==="daily"?<div className="flex items-end gap-3"><label className="flex-1 space-y-1 text-xs text-slate-600 dark:text-slate-300"><span>Giờ chạy hằng ngày</span><input type="time" required step={60} aria-label={`Giờ chạy hằng ngày ${source.name}`} value={draft.time} disabled={disabled} onChange={e=>setDraft({...draft,time:e.target.value})} className="min-h-10 w-full rounded-lg border bg-white px-3 py-2 text-base font-semibold text-slate-800 dark:bg-slate-900 dark:text-slate-100"/></label><span className="pb-3 text-xs text-slate-500">Giờ Việt Nam · UTC+7</span></div>:<label className="block space-y-1 text-xs text-slate-600 dark:text-slate-300"><span>Chu kỳ</span><select aria-label={`Chu kỳ ${source.name}`} value={draft.interval} disabled={disabled} onChange={e=>setDraft({...draft,interval:Number(e.target.value)})} className="min-h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 dark:bg-slate-900 dark:text-slate-100">{[...intervals,...(intervals.includes(draft.interval)?[]:[draft.interval])].map(n=><option key={n} value={n}>{n%3600===0?`${n/3600} giờ`:n%60===0?`${n/60} phút`:`${n} giây`}</option>)}</select></label>}
    {source.dated&&<label className="block space-y-1 text-xs text-slate-600 dark:text-slate-300"><span>Dữ liệu chạy theo lịch</span><select aria-label={`Ngày dữ liệu theo lịch ${source.name}`} value={draft.offset} disabled={disabled} onChange={e=>setDraft({...draft,offset:Number(e.target.value)})} className="min-h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 dark:bg-slate-900 dark:text-slate-100"><option value={0}>Ngày hiện tại</option><option value={1}>Ngày hôm trước</option></select></label>}
    {draft.mode==="interval"&&<div className="space-y-2"><p className="text-xs text-slate-600">Khung giờ chạy · giờ Việt Nam</p><div className="grid grid-cols-2 gap-3">{(["start","end"] as const).map(field=><label key={field} className="space-y-1 text-xs text-slate-600"><span>{field==="start"?"Bắt đầu":"Kết thúc"}</span><input type="time" required step={60} aria-label={`${field==="start"?"Bắt đầu":"Kết thúc"} khung giờ ${source.name}`} value={draft[field]} disabled={disabled} onChange={e=>setDraft({...draft,[field]:e.target.value})} className="min-h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm dark:bg-slate-900"/></label>)}</div></div>}
    <p className="text-xs leading-relaxed text-slate-500">{draft.mode==="daily"?"Chạy một lần mỗi ngày theo giờ đã chọn.":`${draft.start===draft.end?"Chạy cả ngày":`Chạy từ ${draft.start} đến trước ${draft.end}${draft.start>draft.end?" ngày hôm sau":""}`}. Ngoài khung giờ, lượt đang chạy vẫn được hoàn tất.`}</p>
    <div className="rounded-lg border bg-white/70 p-2.5 text-xs leading-relaxed text-slate-600 dark:bg-slate-900 dark:text-slate-300"><span className="mb-1 flex items-center gap-1.5 font-semibold"><Clock3 size={13} aria-hidden="true"/>Lượt chạy tiếp theo</span>{setting?.auto_enabled&&next?`${next} · giờ Việt Nam`:"Chưa bật lịch tự động"}</div>
    <div className="flex min-h-10 items-center justify-between gap-2"><span className={`text-xs ${dirty?"text-amber-700 dark:text-amber-300":"text-slate-500"}`}>{dirty?"Có thay đổi chưa lưu":"Đã lưu cấu hình"}</span><div className="flex items-center gap-2">{dirty&&<button type="button" disabled={disabled} onClick={()=>setDraft(initial)} className="min-h-9 rounded-lg px-2 text-xs text-slate-600 disabled:opacity-40">Hủy</button>}<button type="submit" aria-label={`Lưu lịch ${source.name}`} disabled={disabled||!dirty||!draft.time} className="flex min-h-9 items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Save size={13} aria-hidden="true"/>{saving&&dirty?"Đang lưu…":"Lưu lịch"}</button></div></div>
  </form></details>;
}
