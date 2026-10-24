"use client";
import { useMemo, useState } from "react";
import { BarChart3, Clock3, Plus, Settings2, Sparkles, X } from "lucide-react";
import { vietnamToday, type Staff } from "@/lib/team/model";
import { analyzeCoverage, coverageSummary, duration, hourContributors, inPool, parseWorkingShift, PLANNING_AREAS, suggestShiftPlan, targetFor, templateCode, timeLabel, type BreakWindow, type PlanningShift, type ShiftTemplate, type StaffingPool, type StaffingTarget } from "@/lib/team/planning";
import styles from "./planning.module.css";

export type TeamPlanningSettings = { templates: ShiftTemplate[]; targets: StaffingTarget[]; template_version: string; target_version: string };
export type WorkloadDay = { work_date: string; area: string; delivery: number; pickup: number };
type Proposal = ReturnType<typeof suggestShiftPlan> & { template_version: string; target_version: string };
type Props = { staff: Staff[]; shifts: PlanningShift[]; planning?: TeamPlanningSettings; workload?: WorkloadDay[] | null; days: string[]; date: string; area: string; canEdit: boolean; mode: "analysis" | "templates"; onReload: () => Promise<void>; onDate: (day: string) => void };
const n = (v: number) => v.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const dateLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" });
const POOLS = { OPS: "FTE + BPO", FTE: "Chỉ FTE", BPO: "Chỉ BPO" };
const hours = Array.from({ length: 24 }, (_, i) => i);
const emptyTemplate = (): ShiftTemplate => ({ id: "", name: "Ca mới", start_minute: 420, end_minute: 960, fte_breaks: [], bpo_breaks: [], active: true, note: "" });
function breakText(windows: BreakWindow[], start: number) {
  return windows.map(b => `${timeLabel((start+b.start)%1440)}-${timeLabel((start+b.end)%1440)}`).join(", ");
}
function readBreaks(text: string, start: number): BreakWindow[] {
  if (!text.trim()) return [];
  return text.split(",").map(part => {
    const parsed = parseWorkingShift(part.trim());
    // Breaks may be shorter than a working shift, so parse clock fields separately.
    const m = part.trim().match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
    if (!m) throw new Error("Nhập giờ nghỉ dạng 13:00-14:00, 17:00-17:30.");
    const values = m.slice(1).map(Number);
    if (values[0]>23 || values[2]>23 || values[1]>59 || values[3]>59) throw new Error("Giờ nghỉ không hợp lệ.");
    const a = values[0]*60+values[1], z = values[2]*60+values[3];
    const offset = (a-start+1440)%1440;
    return { start: offset, end: offset+(parsed ? parsed.end-parsed.start : duration(a,z)) };
  });
}

export function TeamPlanningView(props: Props) {
  const { staff, shifts, date, days, area, mode, canEdit, workload, onReload, onDate } = props;
  const templates = useMemo(()=>props.planning?.templates ?? [],[props.planning]);
  const targets = useMemo(()=>props.planning?.targets ?? [],[props.planning]);
  const [pool, setPool] = useState<StaffingPool>("OPS");
  const [metric, setMetric] = useState<"gap" | "coverage">("gap");
  const [restHours, setRestHours] = useState(11), [maxMoves, setMaxMoves] = useState(8);
  const [proposal, setProposal] = useState<Proposal | null>(null), [previewPlan, setPreviewPlan] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [detail, setDetail] = useState<{ day: string; hour: number; area: string } | null>(null);
  const [editTemplate, setEditTemplate] = useState<{ value: ShiftTemplate; fte: string; bpo: string } | null>(null);
  const [editTarget, setEditTarget] = useState<{ area: string; scope: "date" | "weekday" | "week"; values: number[]; fillStart: number; fillEnd: number; fillValue: number } | null>(null);
  const [appliedSource, setAppliedSource] = useState<{ shifts: PlanningShift[]; planning: Props["planning"]; staff: Staff[] } | null>(null);
  const currentProposal = appliedSource?.shifts === shifts && appliedSource?.planning === props.planning && appliedSource?.staff === staff && proposal?.day === date && proposal?.area === area && proposal?.pool === pool && proposal?.restHours === restHours && proposal?.maxMoves === maxMoves ? proposal : null;
  const rows = previewPlan && currentProposal ? currentProposal.simulated : shifts;
  const areas = useMemo(()=>area === "all" ? PLANNING_AREAS : [area],[area]);
  const cells = useMemo(() => analyzeCoverage(staff,rows,templates,targets,days,pool,areas), [staff,rows,templates,targets,days,pool,areas]);
  const summary = coverageSummary(cells);
  const personCount = staff.filter(p=>inPool(p,pool) && p.areas.some(a=>areas.includes(a))).length;
  const uncertain = shifts.filter(r=>days.includes(r.work_date) && staff.some(p=>p.id===r.staff_id && inPool(p,pool) && p.areas.some(a=>areas.includes(a))) && !parseWorkingShift(r.shift) && !["OFF","AL","SL","PH","NPL","HL","KL","ML","CL"].includes(r.shift.toUpperCase())).length;
  const noBreak = shifts.filter(r=>days.includes(r.work_date) && parseWorkingShift(r.shift) && staff.some(p=>p.id===r.staff_id && inPool(p,pool)) && !templates.some(t=>(t.id===r.template_id || templateCode(t)===r.shift) && (staff.find(p=>p.id===r.staff_id)?.role==="BPO"?t.bpo_breaks:t.fte_breaks).length)).length;
  const byAreaDay = useMemo(() => analyzeCoverage(staff,rows,templates,targets,[date],pool,[...new Set([...PLANNING_AREAS,...staff.flatMap(p=>p.areas)])]), [staff,rows,templates,targets,date,pool]);

  async function request(action: string, data?: unknown, config?: unknown) {
    const response = await fetch("/api/team/planning", { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify({ action, data, config, proposal: currentProposal ? { changes: currentProposal.changes, template_version: currentProposal.template_version, target_version: currentProposal.target_version } : undefined }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Không xử lý được yêu cầu.");
    return result;
  }
  async function suggest() {
    setBusy(true); setError(""); setMessage("");
    try { const result = await request("suggest",undefined,{ day:date,area,pool,restHours,maxMoves }); setProposal(result); setAppliedSource({ shifts,planning:props.planning,staff }); setPreviewPlan(true); }
    catch(e) { setError(e instanceof Error ? e.message : "Không tạo được gợi ý."); }
    finally { setBusy(false); }
  }
  async function apply() {
    setBusy(true); setError("");
    try { const result=await request("apply",undefined,{ day:date,area,pool,restHours,maxMoves }); setProposal(null); setPreviewPlan(false); setMessage(`Đã cập nhật ${result.applied} ca, kèm nhật ký chỉnh sửa.`); await onReload(); }
    catch(e) { setError(e instanceof Error ? e.message : "Không áp dụng được phương án."); }
    finally { setBusy(false); }
  }
  async function saveTemplate() {
    if (!editTemplate) return;
    setBusy(true); setError("");
    try { const value = editTemplate.value; await request("template",{ ...value,id:value.id||undefined,fte_breaks:readBreaks(editTemplate.fte,value.start_minute),bpo_breaks:readBreaks(editTemplate.bpo,value.start_minute) }); setEditTemplate(null); setProposal(null); await onReload(); }
    catch(e) { setError(e instanceof Error ? e.message : "Không lưu được ca."); }
    finally { setBusy(false); }
  }
  async function saveTargets() {
    if (!editTarget) return;
    setBusy(true); setError("");
    try {
      const keys = editTarget.scope === "date" ? [date] : editTarget.scope === "weekday" ? [String(new Date(`${date}T12:00:00Z`).getUTCDay())] : ["0","1","2","3","4","5","6"];
      await request("targets",keys.flatMap(day_key=>editTarget.values.map((required,hour)=>({ area:editTarget.area,pool,day_key,hour,required }))));
      setEditTarget(null); setProposal(null); setMessage("Đã lưu định biên. Quy tắc theo ngày được ưu tiên hơn quy tắc theo thứ."); await onReload();
    } catch(e) { setError(e instanceof Error ? e.message : "Không lưu được định biên."); }
    finally { setBusy(false); }
  }
  function openTarget(targetArea: string) { setEditTarget({ area:targetArea,scope:"date",values:hours.map(h=>targetFor(targets,targetArea,pool,date,h)),fillStart:7,fillEnd:23,fillValue:1 }); }
  function heatButton(day: string, hour: number, targetArea: string, available: number, required: number, shortage = Math.max(0,required-available), surplus = Math.max(0,available-required)) {
    const kind = metric === "coverage" ? "coverage" : required===0 && available===0 ? "empty" : shortage > .01 ? "short" : surplus > .01 ? "surplus" : "balanced";
    const text = metric === "coverage" ? n(available) : shortage>.01 ? `-${n(shortage)}` : surplus>.01 ? `+${n(surplus)}` : "✓";
    return <button data-kind={kind} style={metric==="coverage" ? { backgroundColor:`rgba(37,99,235,${Math.min(.85,.06+available*.08)})`,color:available>5?"white":"#1e40af" } : undefined} title={`${day} · ${hour}:00–${hour+1}:00 · ${targetArea}: có ${n(available)} / cần ${n(required)}; thiếu ${n(shortage)}, vượt ${n(surplus)} người quy đổi theo từng KV`} onClick={()=>setDetail({day,hour,area:targetArea})}>{required===0&&available===0 ? "—" : text}</button>;
  }
  return <div className={styles.root}>
    {error && <div role="alert" className={styles.error}>{error}</div>}{message && <div role="status" className={styles.success}>{message}</div>}
    {mode === "templates" ? <>
      <div className={styles.heading}><div><h2><Clock3 size={19}/>Danh mục ca làm việc</h2><p>Ca và giờ nghỉ dùng cho mô phỏng độ phủ. Có thể tạo nhiều đợt nghỉ cho cùng giờ làm.</p></div>{canEdit && <button className={styles.primary} onClick={()=>setEditTemplate({value:emptyTemplate(),fte:"",bpo:""})}><Plus size={16}/>Thêm ca</button>}</div>
      <div className={styles.templateGrid}>{templates.map(t=><article key={t.id} data-active={t.active}><span className={styles.tag}>{t.active?"Đang sử dụng":"Ngừng chọn mới"}</span><h3>{t.name}</h3><strong className={styles.bigTime}>{templateCode(t)}</strong><p>{duration(t.start_minute,t.end_minute)/60} giờ khung ca {t.end_minute<=t.start_minute?"· qua ngày sau":""}</p><dl><dt>Nghỉ FTE</dt><dd>{breakText(t.fte_breaks,t.start_minute)||"Chưa cấu hình"}</dd><dt>Nghỉ BPO</dt><dd>{breakText(t.bpo_breaks,t.start_minute)||"Chưa cấu hình"}</dd></dl><p>{t.note}</p>{canEdit&&<button onClick={()=>setEditTemplate({value:t,fte:breakText(t.fte_breaks,t.start_minute),bpo:breakText(t.bpo_breaks,t.start_minute)})}>Sửa ca / giờ nghỉ</button>}</article>)}</div>
    </> : <>
      <div className={styles.heading}><div><h2><BarChart3 size={19}/>Phân tích độ phủ & phân bổ ca</h2><p>{personCount} nhân sự hiện tại trong phạm vi · chia đều người phụ trách nhiều KV · tính theo giờ Việt Nam</p></div><div className={styles.controls}><select aria-label="Nhóm phân tích" value={pool} onChange={e=>setPool(e.target.value as StaffingPool)}>{Object.entries(POOLS).map(([v,label])=><option value={v} key={v}>{label}</option>)}</select><select aria-label="Chế độ bản đồ" value={metric} onChange={e=>setMetric(e.target.value as "gap"|"coverage")}><option value="gap">Thiếu / dư so định biên</option><option value="coverage">Số người quy đổi</option></select>{canEdit && <button onClick={()=>openTarget(area==="all"?"KV1":area)}><Settings2 size={15}/>Định biên</button>}</div></div>
      <div className={styles.kpis}><article><span>Năng lực theo lịch</span><strong>{n(summary.availableHours)}</strong><small>nhân-giờ sau khi trừ nghỉ đã cấu hình</small></article><article><span>Nhu cầu theo định biên</span><strong>{n(summary.requiredHours)}</strong><small>nhân-giờ trong kỳ đang xem</small></article><article data-tone="red"><span>Còn thiếu</span><strong>{n(summary.deficitHours)}</strong><small>nhân-giờ dưới mức yêu cầu</small></article><article data-tone="blue"><span>Vượt định biên</span><strong>{n(summary.surplusHours)}</strong><small>có thể cân nhắc điều phối</small></article></div>
      <p className={styles.notice}>Đây là mô phỏng theo lịch và nhân sự hiện tại, không phải chấm công. Định biên chưa cấu hình dùng mức thử 1 người/KV/giờ từ 07–23h; bạn có thể chỉnh theo ngày hoặc theo thứ. {noBreak>0?`${noBreak} ô ca chưa có giờ nghỉ cấu hình, hiện chưa trừ nghỉ. `:""}{uncertain>0?`${uncertain} ô ca kèm mã nghỉ / chưa rõ giờ không được tính năng lực.`:""}</p>
      <div className={styles.heatHead}><h3>Ngày × Giờ · {area==="all"?"KV1–KV5":area}</h3><div className={styles.legend}><span data-kind="short">Thiếu</span><span data-kind="balanced">Đủ</span><span data-kind="surplus">Vượt</span><small>Bấm ô để xem nhân sự</small></div></div>
      <div className={styles.heatScroll}><table className={styles.heat}><thead><tr><th>Ngày</th>{hours.map(h=><th key={h}>{String(h).padStart(2,"0")}:00</th>)}</tr></thead><tbody>{days.map(day=><tr key={day} data-selected={date===day}><th><button onClick={()=>onDate(day)}>{dateLabel(day)}</button></th>{hours.map(h=>{const relevant=cells.filter(c=>c.day===day&&c.hour===h);return <td key={h}>{heatButton(day,h,area,relevant.reduce((s,c)=>s+c.available,0),relevant.reduce((s,c)=>s+c.required,0),relevant.reduce((s,c)=>s+c.deficit,0),relevant.reduce((s,c)=>s+c.surplus,0))}</td>;})}</tr>)}</tbody></table></div>
      <div className={styles.heatHead}><h3>Khu vực × Giờ · {dateLabel(date)}</h3><small>Nhu cầu và người được chia theo đúng Coverage</small></div>
      <div className={styles.heatScroll}><table className={styles.heat}><thead><tr><th>Khu vực</th>{hours.map(h=><th key={h}>{String(h).padStart(2,"0")}:00</th>)}</tr></thead><tbody>{(area==="all"?PLANNING_AREAS:[area]).map(a=><tr key={a}><th><button onClick={()=>canEdit&&openTarget(a)}>{a}</button></th>{hours.map(h=>{const c=byAreaDay.find(c=>c.area===a&&c.hour===h)!;return <td key={h}>{heatButton(date,h,a,c.available,c.required)}</td>;})}</tr>)}</tbody></table></div>
      <div className={styles.planner}>
        <div><h3><Sparkles size={18}/>Gợi ý điều chỉnh ca ngày {dateLabel(date)}</h3><p>Giữ ngày OFF/phép, không tự điền ô trống; chỉ đổi ca cùng thời lượng. Tính tác động ở tất cả KV và ngày liền kề. Đây là phương án cải thiện theo định biên, chưa phải lịch tối ưu tuyệt đối.</p></div>
        <div className={styles.controls}><label>Nghỉ tối thiểu giữa ca (giờ)<input aria-label="Giờ nghỉ tối thiểu" type="number" min={0} max={24} value={restHours} onChange={e=>setRestHours(Math.max(0,Math.min(24,Number(e.target.value))))}/></label><label>Đổi tối đa<input aria-label="Số ca đổi tối đa" type="number" min={1} max={20} value={maxMoves} onChange={e=>setMaxMoves(Math.max(1,Math.min(20,Number(e.target.value))))}/></label><button className={styles.primary} disabled={busy} onClick={()=>void suggest()}><Sparkles size={15}/>{busy?"Đang tính…":"Tạo gợi ý"}</button></div>
        {currentProposal && <div className={styles.proposal}>
          <div className={styles.result}><strong>{currentProposal.changes.length} ca đề xuất đổi</strong><span>Thiếu ngày chọn: {n(currentProposal.targetDayBefore.deficitHours)} → {n(currentProposal.targetDayAfter.deficitHours)} nhân-giờ</span><span>Thiếu toàn KV và ngày liền kề: {n(currentProposal.before.deficitHours)} → {n(currentProposal.after.deficitHours)}</span><label><input type="checkbox" checked={previewPlan} onChange={e=>setPreviewPlan(e.target.checked)}/>Xem bản đồ dự kiến</label></div>
          {currentProposal.changes.length ? <><div className={styles.heatScroll}><table className={styles.planTable}><thead><tr><th>Nhân sự</th><th>Khu vực</th><th>Ca hiện tại</th><th>Đề xuất</th></tr></thead><tbody>{currentProposal.changes.map(c=><tr key={c.staff_id}><td>{c.full_name}</td><td>{c.coverage}</td><td>{c.from_shift}</td><td><strong>{c.to_shift}</strong><small>{templates.find(t=>t.id===c.template_id)?.name}</small></td></tr>)}</tbody></table></div>{canEdit&&<button className={styles.primary} disabled={busy||date<vietnamToday()} onClick={()=>void apply()}>Áp dụng {currentProposal.changes.length} thay đổi</button>}{date<vietnamToday()&&<p>Ngày quá khứ chỉ được dùng phân tích; không tự áp dụng phương án.</p>}</> : <p>Chưa tìm được thay đổi phù hợp giúp cải thiện thêm. Nếu vẫn thiếu người, cần bổ sung nhân sự/định biên, cấu hình giờ nghỉ hoặc xác nhận lịch ở các ô trống.</p>}
        </div>}
      </div>
      <div className={styles.workload}><h3>Sản lượng tham chiếu theo ngày</h3><p>Đơn Delivery/Pickup đã đồng bộ; chưa có phân bố đơn đầy đủ theo giờ, nên không nội suy thành nhu cầu từng giờ.</p><div className={styles.dailyBars}>{days.map(day=>{const selected=workload?.filter(w=>w.work_date===day&&areas.includes(w.area));const delivery=selected?.reduce((s,w)=>s+Number(w.delivery),0), pickup=selected?.reduce((s,w)=>s+Number(w.pickup),0);return <div key={day}><span>{dateLabel(day)}</span><strong>{selected?.length?n((delivery??0)+(pickup??0)):"—"}</strong><small>{selected?.length?`Deli ${n(delivery??0)} · Pick ${n(pickup??0)}`:"Chưa có dữ liệu"}</small></div>;})}</div></div>
    </>}
    {detail && <div className={styles.backdrop}><div role="dialog" aria-modal="true" aria-label="Nhân sự theo giờ" className={styles.modal}><button className={styles.close} aria-label="Đóng" onClick={()=>setDetail(null)}><X size={20}/></button><h2>{dateLabel(detail.day)} · {detail.hour}:00–{detail.hour+1}:00</h2><p>{detail.area==="all"?"KV1–KV5":detail.area} · {POOLS[pool]} · {previewPlan&&currentProposal?"Phương án dự kiến":"Theo lịch hiện tại"}</p>{hourContributors(staff,rows,templates,detail.day,detail.hour,pool,detail.area==="all"?PLANNING_AREAS:[detail.area]).map(p=><div className={styles.personRow} key={p.id}><span><strong>{p.name}</strong><small>{p.role} · {p.coverage} · {p.shift}</small></span><b>{n(p.contribution)}</b></div>)}<p>Giá trị là phần giờ có mặt, chia theo số KV phụ trách; 0,5 có thể là nửa giờ làm hoặc chia đôi Coverage.</p></div></div>}
    {editTemplate && <div className={styles.backdrop}><form role="dialog" aria-modal="true" aria-label="Cấu hình ca làm việc" className={styles.modal} onSubmit={e=>{e.preventDefault();void saveTemplate();}}><button type="button" className={styles.close} aria-label="Đóng" disabled={busy} onClick={()=>setEditTemplate(null)}><X size={20}/></button><h2>Cấu hình ca làm việc</h2><label>Tên ca<input required value={editTemplate.value.name} onChange={e=>setEditTemplate({...editTemplate,value:{...editTemplate.value,name:e.target.value}})}/></label><div className={styles.formGrid}>{(["start_minute","end_minute"] as const).map((field,i)=><label key={field}>{i?"Kết thúc":"Bắt đầu"}<input type="time" required value={timeLabel(editTemplate.value[field]===1440?0:editTemplate.value[field])} onChange={e=>{const [h,m]=e.target.value.split(":").map(Number);setEditTemplate({...editTemplate,value:{...editTemplate.value,[field]:h*60+m}});}}/></label>)}</div><label>Nghỉ FTE<input value={editTemplate.fte} placeholder="13:00-14:00" onChange={e=>setEditTemplate({...editTemplate,fte:e.target.value})}/></label><label>Nghỉ BPO<input value={editTemplate.bpo} placeholder="14:30-15:30" onChange={e=>setEditTemplate({...editTemplate,bpo:e.target.value})}/></label><p>Để trống nếu chưa xác định giờ nghỉ. Nhiều khoảng nghỉ cách nhau bằng dấu phẩy. Ca kết thúc trước giờ bắt đầu được tính qua ngày sau.</p><label>Ghi chú<input value={editTemplate.value.note} onChange={e=>setEditTemplate({...editTemplate,value:{...editTemplate.value,note:e.target.value}})}/></label><label className={styles.check}><input type="checkbox" checked={editTemplate.value.active} onChange={e=>setEditTemplate({...editTemplate,value:{...editTemplate.value,active:e.target.checked}})}/>Cho phép chọn khi xếp ca</label>{error&&<p role="alert" className={styles.error}>{error}</p>}<button className={styles.primary} disabled={busy}>{busy?"Đang lưu…":"Lưu ca làm việc"}</button></form></div>}
    {editTarget && <div className={styles.backdrop}><form role="dialog" aria-modal="true" aria-label="Cấu hình định biên" className={`${styles.modal} ${styles.wide}`} onSubmit={e=>{e.preventDefault();void saveTargets();}}><button type="button" className={styles.close} aria-label="Đóng" disabled={busy} onClick={()=>setEditTarget(null)}><X size={20}/></button><h2>Định biên · {POOLS[pool]}</h2><div className={styles.formGrid}><label>Khu vực<select value={editTarget.area} onChange={e=>setEditTarget({...editTarget,area:e.target.value,values:hours.map(h=>targetFor(targets,e.target.value,pool,date,h))})}>{[...new Set([...PLANNING_AREAS,area!=="all"?area:""])].filter(Boolean).map(a=><option key={a}>{a}</option>)}</select></label><label>Áp dụng cho<select value={editTarget.scope} onChange={e=>setEditTarget({...editTarget,scope:e.target.value as "date"|"weekday"|"week"})}><option value="date">Riêng ngày {date}</option><option value="weekday">Cùng thứ, lặp hàng tuần</option><option value="week">Tất cả các thứ hàng tuần</option></select></label></div><div className={styles.fill}><label>Từ giờ<input type="number" min={0} max={23} value={editTarget.fillStart} onChange={e=>setEditTarget({...editTarget,fillStart:Number(e.target.value)})}/></label><label>Đến giờ<input type="number" min={1} max={24} value={editTarget.fillEnd} onChange={e=>setEditTarget({...editTarget,fillEnd:Number(e.target.value)})}/></label><label>Số người<input type="number" min={0} max={100} step={.25} value={editTarget.fillValue} onChange={e=>setEditTarget({...editTarget,fillValue:Number(e.target.value)})}/></label><button type="button" onClick={()=>setEditTarget({...editTarget,values:editTarget.values.map((v,h)=>h>=editTarget.fillStart&&h<editTarget.fillEnd?editTarget.fillValue:v)})}>Điền khung giờ</button></div><div className={styles.targetGrid}>{hours.map(h=><label key={h}>{String(h).padStart(2,"0")}:00<input type="number" min={0} max={100} step={.25} required value={editTarget.values[h]} onChange={e=>setEditTarget({...editTarget,values:editTarget.values.map((v,i)=>i===h?Number(e.target.value):v)})}/></label>)}</div><p>Đơn vị: người quy đổi có mặt trong mỗi giờ. Quy tắc riêng theo ngày ưu tiên hơn theo thứ. Định biên này chỉ áp dụng cho nhóm {POOLS[pool]} đang chọn.</p>{error&&<p role="alert" className={styles.error}>{error}</p>}<button className={styles.primary} disabled={busy}>{busy?"Đang lưu…":"Lưu định biên"}</button></form></div>}
  </div>;
}
