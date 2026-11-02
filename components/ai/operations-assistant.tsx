"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, ArrowUpRight, Bike, CalendarDays, Check, ChevronDown, ClipboardCopy, Database, FileText, ListChecks, LoaderCircle, RefreshCcw, Sparkles, Truck, UsersRound } from "lucide-react";
import type { OperationsBriefing, SourceState } from "@/lib/ai/briefing";
import s from "./ai-workspace.module.css";

const states: Record<SourceState, string> = { ready: "Đã tải", stale: "Dữ liệu cũ", missing: "Chưa có dữ liệu", forbidden: "Không có quyền", error: "Lỗi nguồn" };
const format = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("vi-VN");
const time = (value: string | null) => value ? new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "Chưa có thời điểm";

export function OperationsAssistant({ active, mode, onAsk, onNavigate }: { active: boolean; mode: "report" | "tasks"; onAsk: (question: string) => void; onNavigate: () => void }) {
  const [data, setData] = useState<OperationsBriefing | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [copied, setCopied] = useState(false), [copyError, setCopyError] = useState("");
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError(""); setData(null); setCopied(false);
      void fetch("/api/ai/briefing", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]) })
        .then(async response => {
          const result = await response.json();
          if (!response.ok) throw Error(result.error || "Chưa tải được trợ lý vận hành.");
          if (!controller.signal.aborted) setData(result);
        }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Không tải được dữ liệu."); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [active, version]);
  async function copy() {
    if (!data) return;
    try { await navigator.clipboard.writeText(data.report); setCopied(true); setCopyError(""); }
    catch { setCopyError("Chưa sao chép được. Bạn có thể chọn văn bản báo cáo bên dưới để sao chép."); }
  }
  if (!active) return null;
  const readyCount = data?.sources.filter(source => source.state === "ready").length ?? 0;
  const highCount = data?.tasks.filter(task => task.priority === "high").length ?? 0;
  return <div className={s.content}>
    <div className={s.sectionHeader}>
      <div><p className={s.eyebrow}>{mode === "report" ? "BỨC TRANH VẬN HÀNH" : "TỪ DỮ LIỆU ĐẾN HÀNH ĐỘNG"}</p><h3 className={s.heading}>{mode === "report" ? "Một ca làm, mọi thông tin." : "Bắt đầu từ việc quan trọng."}</h3><p className={s.subtitle}>{data ? `${data.day} · Cập nhật ${time(data.generatedAt)}` : "Đang tổng hợp các nguồn theo quyền tài khoản."}</p></div>
      <div className={`${s.actions} ${mode === "report" ? s.reportActions : ""}`}>
        <button className={s.iconButton} onClick={refresh} disabled={loading} aria-label="Tải lại dữ liệu trợ lý" title="Tải lại dữ liệu"><RefreshCcw size={17} aria-hidden="true" /></button>
        {mode === "report" && <button className={`${s.button} ${s.primary}`} disabled={!data || loading} onClick={() => void copy()}>{copied ? <Check size={15} aria-hidden="true" /> : <ClipboardCopy size={15} aria-hidden="true" />}{copied ? "Đã sao chép báo cáo" : "Sao chép báo cáo giao ca"}</button>}
      </div>
    </div>
    {loading && <div className={s.loading} role="status"><div className={s.loadingLabel}><LoaderCircle className="animate-spin" size={18} aria-hidden="true" />Đang đọc dữ liệu vận hành…</div><div className={s.metrics}>{[0,1,2,3].map(i => <div className={s.skeleton} key={i} />)}</div><div className={s.skeleton} style={{minHeight:150}} /></div>}
    {error && <div role="alert" className={s.error}>{error}<div><button onClick={refresh} className={s.button}>Thử lại</button></div></div>}
    {copyError && <p role="alert" className={s.error}>{copyError}</p>}
    {data && <>
      {data.sources.some(source => source.state !== "ready") && <p className={s.notice}><AlertTriangle size={16} aria-hidden="true" /><span><strong>{readyCount}/{data.sources.length} nguồn khả dụng.</strong> Nguồn cũ, thiếu hoặc không được cấp quyền sẽ để trống trong báo cáo.</span></p>}
      {mode === "report" ? <>
        <div className={s.metrics}>
          {([
            {label:"Delivery còn giao", value:data.summary.delivery?.pending, note:"Theo snapshot hôm nay", icon:Truck, metric:data.summary.delivery, tone:"blue"},
            {label:"Pickup chờ lấy", value:data.summary.pickup?.pending, note:"Lượt gán theo rider", icon:Bike, metric:data.summary.pickup, tone:"green"},
            {label:"FTE đi làm hôm nay", value:data.summary.fteToday?.working, note:"Ca làm đầy đủ", icon:UsersRound, metric:null, tone:"blue"},
            {label:"FTE đi làm ngày mai", value:data.summary.fteTomorrow?.working, note:data.nextDay, icon:CalendarDays, metric:null, tone:"blue"},
          ]).map(item => {
            const rate = item.metric && item.metric.assigned > 0 ? Math.min(100, Math.max(0, item.metric.completed / item.metric.assigned * 100)) : null;
            return <div className={s.metric} data-tone={item.tone} key={item.label}><p className={s.metricLabel}>{item.label}<item.icon size={17} aria-hidden="true" /></p><strong className={s.metricValue}>{format(item.value)}</strong><small>{item.note}{rate !== null ? ` · ${rate.toLocaleString("vi-VN",{maximumFractionDigits:1})}% hoàn thành` : ""}</small>{rate !== null && <div className={s.progress} aria-hidden="true"><span style={{width:`${rate}%`}} /></div>}</div>;
          })}
        </div>
        <div className={s.sectionLabel}><h4>Theo từng khu vực</h4><span>Đơn còn lại · FTE ngày mai</span></div>
        <table className={s.areaTable}><caption className="sr-only">Đơn còn lại và FTE ngày mai theo khu vực</caption><thead><tr><th scope="col">Khu vực</th><th scope="col">Delivery</th><th scope="col">Pickup</th><th scope="col">FTE</th></tr></thead><tbody>{data.areas.map(area => <tr key={area.area}><th scope="row"><span className={s.areaName} data-area={area.area}><i className={s.areaDot} aria-hidden="true" />{area.area}</span></th><td>{format(area.delivery?.pending)}</td><td>{format(area.pickup?.pending)}</td><td>{format(area.fteTomorrow?.working)}</td></tr>)}</tbody></table>
        <p className={s.footnote}>Pickup là lượt gán, có thể trùng đơn giữa rider. FTE phụ trách nhiều KV có thể xuất hiện ở nhiều dòng.</p>
        <details className={s.reportPreview} open={copyError ? true : undefined}><summary><FileText size={16} aria-hidden="true" />Bản báo cáo đầy đủ<ChevronDown size={15} aria-hidden="true" /></summary><pre className={s.reportText} aria-label="Nội dung báo cáo giao ca">{data.report}</pre></details>
      </> : <>
        <div className={s.taskSummary}><ListChecks size={24} aria-hidden="true" /><p><strong>{data.tasks.length} gợi ý kiểm tra</strong> · {highCount} ưu tiên cao<small>Điều phối dựa trên tình trạng thực tế và nguồn dữ liệu bên dưới.</small></p></div>
        <div className={s.taskList}>{data.tasks.map((task,i) => <article key={task.id} className={s.task} data-priority={task.priority}><span className={s.taskIndex} aria-hidden="true">{String(i+1).padStart(2,"0")}</span><div><span className={s.badge} data-state={task.priority}>{task.priority === "high" ? "Ưu tiên cao" : "Cần kiểm tra"}</span><h4>{task.title}</h4><p>{task.detail}</p><Link href={task.href} prefetch={false} onClick={onNavigate} className={s.taskLink}>Mở nguồn xử lý<ArrowUpRight size={13} aria-hidden="true" /></Link></div><ArrowUpRight size={16} aria-hidden="true" /></article>)}</div>
        {!data.tasks.length && <p className={s.empty}><Check size={22} aria-hidden="true" /><br />Chưa phát hiện cảnh báo trên các nguồn khả dụng.<br />Tiếp tục đối chiếu với tình hình thực tế.</p>}
        <p className={s.footnote}>Ngưỡng kiểm tra: không giao ≥60 phút · Pickup còn ≥50 lượt gán · nguồn cũ &gt;20 phút. Các gợi ý chưa làm thay đổi dữ liệu.</p>
      </>}
      <div className={s.askAction}><div><p>{mode === "report" ? "Cần hiểu rõ hơn về ca làm?" : "Chưa biết nên xử lý từ đâu?"}</p><small>Hỏi AI, đối chiếu cùng dữ liệu được cấp quyền.</small></div><button className={s.button} onClick={() => onAsk(mode === "report" ? "Tóm tắt tình hình vận hành hôm nay và các điểm cần chú ý." : "Tôi cần ưu tiên xử lý việc gì hôm nay? Giải thích theo từng nguồn.")}><Sparkles size={14} aria-hidden="true" />Hỏi AI<ArrowRight size={14} aria-hidden="true" /></button></div>
      <details className={s.sources}><summary><Database size={15} aria-hidden="true" />Nguồn & thời điểm cập nhật<span className={s.badge} data-state={readyCount === data.sources.length ? "ready" : "stale"}>{readyCount}/{data.sources.length}</span><ChevronDown size={15} aria-hidden="true" /></summary><ul className={s.sourceGrid}>{data.sources.map(source => <li className={s.sourceCard} key={source.id}><strong>{source.label}</strong><span className={s.badge} data-state={source.state}>{states[source.state]}</span><p>{time(source.at)}<br />{source.note}</p>{source.state !== "forbidden" && <Link prefetch={false} href={source.href} onClick={onNavigate}>Xem nguồn<ArrowUpRight size={12} aria-hidden="true" /></Link>}</li>)}</ul></details>
    </>}
  </div>;
}
