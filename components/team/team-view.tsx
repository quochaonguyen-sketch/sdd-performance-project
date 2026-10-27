"use client";
import { useRememberedState } from "@/components/layout/filter-memory";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Download, Plus, Search, Upload, UsersRound, X } from "lucide-react";
import { addDays, isArchivedStaff, shiftKind, STAFF_ROLES, vietnamToday, type Staff } from "@/lib/team/model";
import styles from "./team.module.css";
import { TeamPlanningView, type TeamPlanningSettings, type WorkloadDay } from "./planning-view";
import { templateCode, type PlanningShift } from "@/lib/team/planning";

type TeamData = { staff: Staff[]; shifts: PlanningShift[]; planning?: TeamPlanningSettings; workload?: WorkloadDay[] | null; bounds: { from: string | null; to: string | null } };
type ImportSummary = { staff: number; shifts: number; from: string; to: string; warnings: string[] };
const ROLES = { SUP: "SUP", LEAD: "LEAD", FTE: "FTE", BPO: "BPO / SBPO", UNKNOWN: "Chưa rõ chức danh" };
const AREAS = ["KV1", "KV2", "KV3", "KV4", "KV5", "KV6", "SPF"];
const areaColors = ["#2563eb", "#059669", "#7c3aed", "#d97706", "#db2777", "#64748b", "#0891b2"];
const dateLabel = (s: string, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" }) => new Date(`${s}T12:00:00Z`).toLocaleDateString("vi-VN", options);
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();
const emptyStaff = (): Staff => ({ id: crypto.randomUUID(), full_name: "", ops_id: "", staff_id: "", email: "", role: "FTE", source_title: "", team: "SDD", status: "Active", gender: "", onboard: "", vendor: "SPX", coverage: "KV1", areas: ["KV1"], archived: false, review_note: "", source_file: "Chỉnh sửa trên web", source_row: null });

export function TeamView({ canEdit }: { canEdit: boolean }) {
  const [tab, setTab] = useState<"directory" | "schedule" | "analysis" | "templates">("directory");
  const [date, setDate] = useRememberedState("team-view:date", vietnamToday());
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [area, setArea] = useRememberedState("team-view:area", "all"), [role, setRole] = useRememberedState("team-view:role", "all"), [status, setStatus] = useRememberedState("team-view:status", "current"), [query, setQuery] = useState("");
  const [data, setData] = useState<TeamData>({ staff: [], shifts: [], bounds: { from: null, to: null } });
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const [staffEdit, setStaffEdit] = useState<Staff | null>(null);
  const [cellEdit, setCellEdit] = useState<{ person: Staff; date: string; value: string; template_id?: string | null } | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null), [preview, setPreview] = useState<ImportSummary | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const range = useMemo(() => {
    if (period === "month") {
      const from = date.slice(0, 7) + "-01";
      const end = new Date(`${from}T12:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
      return { from, to: end.toISOString().slice(0, 10) };
    }
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    const from = addDays(date, -((day + 6) % 7));
    return { from, to: addDays(from, 6) };
  }, [date, period]);
  const days = useMemo(() => {
    const result: string[] = []; for (let day = range.from; day <= range.to; day = addDays(day, 1)) result.push(day); return result;
  }, [range]);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/team?from=${range.from}&to=${range.to}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Không tải được nhân sự.");
      if (id === requestId.current) setData(result);
    } catch (e) { if (id === requestId.current) setError(e instanceof Error ? e.message : "Không tải được dữ liệu."); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [range]);
  const invalidate = useCallback(() => { requestId.current++; }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => { clearTimeout(timer); invalidate(); };
  }, [load, invalidate]);
  const shifts = useMemo(() => new Map(data.shifts.map(row => [`${row.staff_id}:${row.work_date}`, row.shift])), [data.shifts]);
  const current = data.staff.filter(p => !p.archived && p.status.toLowerCase() === "active");
  const filtered = data.staff.filter(p =>
    (status === "all" || status === "current" && !p.archived && p.status.toLowerCase() === "active" || status === "archive" && isArchivedStaff(p) || status === "review" && !!p.review_note)
    && (area === "all" || p.areas.includes(area)) && (role === "all" || p.role === role)
    && (!query || fold(`${p.full_name} ${p.ops_id} ${p.staff_id} ${p.email} ${p.coverage}`).includes(fold(query))));
  const counts = STAFF_ROLES.map(r => ({ role: r, count: current.filter(p => p.role === r).length }));
  const dayKinds = filtered.map(p => shiftKind(shifts.get(`${p.id}:${date}`) ?? ""));

  async function save(action: string, value: unknown) {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, data: value }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setStaffEdit(null); setCellEdit(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Không lưu được dữ liệu."); }
    finally { setSaving(false); }
  }
  async function importCsv(file: File, previewOnly: boolean) {
    setSaving(true); setError("");
    try {
      const form = new FormData(); form.set("file", file); form.set("preview", String(previewOnly));
      const response = await fetch("/api/team/import", { method: "POST", body: form });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      if (previewOnly) { setImportFile(file); setPreview(result); }
      else { setPreview(null); setImportFile(null); await load(); }
    } catch (e) { setError(e instanceof Error ? e.message : "Không nhập được CSV."); }
    finally { setSaving(false); }
  }
  function move(direction: number) {
    if (period === "week") setDate(addDays(date, direction * 7));
    else { const d = new Date(`${date.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + direction); setDate(d.toISOString().slice(0, 10)); }
  }
  function download() {
    const safe = (s: string) => `"${(/^[=+@-]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"`;
    const rows = [["Họ tên", "Chức danh", "OPS ID", "Coverage", ...days], ...filtered.map(p => [p.full_name, ROLES[p.role], p.ops_id, p.coverage, ...days.map(day => shifts.get(`${p.id}:${day}`) ?? "")])];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map(row => row.map(safe).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = `lich-nhan-su-${range.from}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  return <div className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>SDD · ĐỘI NGŨ VẬN HÀNH</p><h1>Nhân sự & lịch FTE</h1><p>SUP, LEAD, FTE và BPO theo khu vực · Danh bạ và lịch làm việc chung</p></div><div className={styles.actions}>
      <button onClick={download} disabled={loading}><Download size={16} />Xuất lịch</button>
      {canEdit && <><input ref={fileInput} type="file" accept=".csv" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void importCsv(file, true); e.target.value = ""; }} /><button disabled={saving} onClick={() => fileInput.current?.click()}><Upload size={16} />Nhập CSV</button><button className={styles.primary} onClick={() => setStaffEdit(emptyStaff())}><Plus size={16} />Thêm nhân sự</button></>}
    </div></header>
    {error && <div role="alert" className={styles.error}>{error}<button onClick={() => void load()}>Tải lại</button></div>}
    <div className={styles.stats}>{counts.filter(c => c.role !== "UNKNOWN" || c.count).map(c => <button key={c.role} onClick={() => setRole(role === c.role ? "all" : c.role)} data-selected={role === c.role}><span>{ROLES[c.role]}</span><strong>{loading ? "…" : c.count}</strong><small>Nhân sự hiện tại</small></button>)}</div>
    <div className={styles.areas}><button onClick={() => setArea("all")} data-active={area === "all"}><UsersRound size={19} /><strong>Tất cả khu vực</strong><span>{current.length} nhân sự</span></button>{AREAS.filter(a => ["KV1", "KV2", "KV3", "KV4", "KV5"].includes(a) || data.staff.some(p => p.areas.includes(a))).map((a) => <button style={{ "--area": areaColors[AREAS.indexOf(a)] } as React.CSSProperties} key={a} data-active={area === a} onClick={() => setArea(area === a ? "all" : a)}><span className={styles.areaDot} /><strong>{a === "KV6" ? "KV6 · theo nguồn" : a}</strong><span>{current.filter(p => p.areas.includes(a)).length} nhân sự</span></button>)}</div>
    <section className={styles.panel}>
      <div className={styles.toolbar}><div className={styles.tabs}><button data-active={tab === "directory"} onClick={() => { setTab("directory"); setRole("all"); }}><UsersRound size={16} />Danh sách</button><button data-active={tab === "schedule"} onClick={() => { setTab("schedule"); setRole("FTE"); }}><CalendarDays size={16} />Lịch FTE</button><button data-active={tab === "analysis"} onClick={() => setTab("analysis")}>Phân tích ca</button><button data-active={tab === "templates"} onClick={() => setTab("templates")}>Ca làm việc</button></div>{(tab === "directory" || tab === "schedule") && <><div className={styles.search}><Search size={16} /><input aria-label="Tìm nhân sự" placeholder="Tên, OPS ID, email…" value={query} onChange={e => setQuery(e.target.value)} /></div><select aria-label="Chức danh" value={role} onChange={e => setRole(e.target.value)}><option value="all">Tất cả chức danh</option>{STAFF_ROLES.map(r => <option key={r} value={r}>{ROLES[r]}</option>)}</select><select aria-label="Trạng thái" value={status} onChange={e => setStatus(e.target.value)}><option value="current">Nhân sự hiện tại</option><option value="archive">Đã nghỉ / nhóm OFF</option><option value="review">Cần kiểm tra</option><option value="all">Tất cả nhân sự</option></select></>}</div>
      <div className={styles.dates}><div className={styles.actions}><button aria-label="Kỳ trước" onClick={() => move(-1)}><ChevronLeft size={16} /></button><button onClick={() => setDate(vietnamToday())}>Hôm nay</button><button aria-label="Kỳ tiếp theo" onClick={() => move(1)}><ChevronRight size={16} /></button><input aria-label="Ngày xem lịch" type="date" value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }} /><select aria-label="Khoảng lịch" value={period} onChange={e => setPeriod(e.target.value as "week" | "month")}><option value="week">Tuần</option><option value="month">Tháng</option></select></div><span>{filtered.length} nhân sự · {dayKinds.filter(k => k === "work").length} làm việc · {dayKinds.filter(k => k === "off" || k === "leave").length} nghỉ · {dayKinds.filter(k => k === "mixed").length} ca kèm nghỉ · {dayKinds.filter(k => k === "empty").length} chưa xếp ca ngày {dateLabel(date)}</span></div>
      {tab === "analysis" || tab === "templates" ? <TeamPlanningView staff={data.staff} shifts={data.shifts} planning={data.planning} workload={data.workload} days={days} date={date} area={area} canEdit={canEdit} mode={tab} onReload={load} onDate={setDate} /> : <><div className={styles.legend}><span data-kind="work">Ca làm việc</span><span data-kind="off">OFF</span><span data-kind="leave">AL / SL / mã nghỉ</span><span data-kind="mixed">Ca kèm mã nghỉ</span><span data-kind="empty">— Chưa xếp ca</span><small>Coverage nhiều KV được tính ở từng khu vực; tổng nhân sự không cộng trùng.</small></div>
      {loading ? <div className={styles.empty} aria-live="polite">Đang tải nhân sự và lịch…</div> : !filtered.length ? <div className={styles.empty}>Không có nhân sự phù hợp bộ lọc.</div> : <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Nhân sự <small>{tab === "schedule" ? `${dateLabel(range.from)} – ${dateLabel(range.to)}` : "Theo khu vực phụ trách"}</small></th>{tab === "directory" ? <><th>Chức danh</th><th>Khu vực</th><th>Liên hệ / Định danh</th><th>Ca ngày {dateLabel(date)}</th><th>Trạng thái</th></> : days.map(day => <th key={day} data-today={day === vietnamToday()}><span>{dateLabel(day, { weekday: "short" })}</span><strong>{dateLabel(day)}</strong></th>)}</tr></thead><tbody>{filtered.map(p => <tr key={p.id}><td><button className={styles.person} disabled={!canEdit} onClick={() => setStaffEdit(p)}><span className={styles.avatar}>{p.full_name.split(" ").filter(Boolean).slice(-2).map(n => n[0]).join("")}</span><span><strong>{p.full_name}</strong><small>{p.ops_id || p.staff_id || "Chưa có mã"} · {tab === "schedule" ? `${ROLES[p.role]} · ${p.coverage || "Chưa có KV"}` : p.team}</small>{p.review_note && <small className={styles.warning} title={p.review_note}>Cần kiểm tra nguồn</small>}</span></button></td>{tab === "directory" ? <><td><span className={styles.role} data-role={p.role}>{ROLES[p.role]}</span>{p.source_title === "SBPO" && <small>SBPO</small>}</td><td><div className={styles.badges}>{p.areas.length ? p.areas.map(a => <span key={a} style={{ color: areaColors[AREAS.indexOf(a)] }}>{a}</span>) : "Chưa có KV"}</div><small>{p.coverage}</small></td><td>{p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : <span>Chưa có email</span>}<small>{p.staff_id || "—"} · {p.vendor || "—"}</small></td><td><ShiftCell value={shifts.get(`${p.id}:${date}`) ?? ""} disabled={!canEdit} onClick={() => setCellEdit({ person: p, date, value: shifts.get(`${p.id}:${date}`) ?? "", template_id: data.shifts.find(r => r.staff_id === p.id && r.work_date === date)?.template_id ?? null })} /></td><td><span className={styles.status} data-archived={isArchivedStaff(p)}>{isArchivedStaff(p) ? "Lưu trữ / đã nghỉ" : p.status === "Active" ? "Đang làm việc" : p.status || "Chưa rõ"}</span><small>Nguồn: {p.status || "trống"}</small></td></> : days.map(day => <td key={day} data-today={day === vietnamToday()}><ShiftCell value={shifts.get(`${p.id}:${day}`) ?? ""} disabled={!canEdit} onClick={() => setCellEdit({ person: p, date: day, value: shifts.get(`${p.id}:${day}`) ?? "", template_id: data.shifts.find(r => r.staff_id === p.id && r.work_date === day)?.template_id ?? null })} /></td>)}</tr>)}</tbody></table></div>}
      </>}<footer className={styles.footer}>Lịch đã nhập: {data.bounds.from ? `${dateLabel(data.bounds.from, { day: "2-digit", month: "2-digit", year: "numeric" })} – ${dateLabel(data.bounds.to!, { day: "2-digit", month: "2-digit", year: "numeric" })}` : "Chưa có dữ liệu"}. {canEdit ? "Bấm nhân sự để sửa hồ sơ; bấm ca để chỉnh lịch. Mọi chỉnh sửa được ghi nhật ký." : "Chỉ admin được chỉnh sửa nhân sự và lịch."} Ô trống không có nghĩa là OFF.</footer>
    </section>
    {cellEdit && <div className={styles.backdrop}><form role="dialog" aria-modal="true" aria-label="Chỉnh ca làm việc" className={styles.modal} onSubmit={e => { e.preventDefault(); void save("shift", { staff_id: cellEdit.person.id, work_date: cellEdit.date, shift: cellEdit.value, template_id: cellEdit.template_id ?? null }); }}><button type="button" className={styles.close} aria-label="Đóng" disabled={saving} onClick={() => setCellEdit(null)}><X size={20} /></button><p className={styles.eyebrow}>LỊCH LÀM VIỆC</p><h2>{cellEdit.person.full_name}</h2><p>{dateLabel(cellEdit.date, { weekday: "long", day: "numeric", month: "numeric", year: "numeric" })} · {cellEdit.person.coverage}</p><label>Chọn ca đã cấu hình<select value={cellEdit.template_id ?? ""} onChange={e => { const template = data.planning?.templates.find(t => t.id === e.target.value); setCellEdit({ ...cellEdit, template_id: template?.id ?? null, value: template ? templateCode(template) : cellEdit.value }); }}><option value="">Nhập thủ công / mã nghỉ</option>{data.planning?.templates.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name} · {templateCode(t)}</option>)}</select></label><label>Ca làm việc hoặc mã nghỉ<input autoFocus list="team-shifts" value={cellEdit.value} onChange={e => setCellEdit({ ...cellEdit, value: e.target.value, template_id: null })} maxLength={100} placeholder="11:00-20:00, OFF, AL…" /></label><datalist id="team-shifts">{["04:00-13:00", "05:00-14:00", "07:00-16:00", "08:00-17:00", "09:00-18:00", "10:00-19:00", "11:00-20:00", "13:00-22:00", "14:00-23:00", "OFF", "AL", "SL", "PH"].map(s => <option key={s} value={s} />)}</datalist><p className={styles.hint}>Để trống để bỏ ca ngày này. Mã có hậu tố, ví dụ 11:00-20:00/AL, được giữ nguyên.</p>{error && <p role="alert" className={styles.warning}>{error}</p>}<button className={styles.primary} disabled={saving}>{saving ? "Đang lưu…" : "Lưu lịch"}</button></form></div>}
    {staffEdit && <div className={styles.backdrop}><form role="dialog" aria-modal="true" aria-label="Hồ sơ nhân sự" className={`${styles.modal} ${styles.wideModal}`} onSubmit={e => { e.preventDefault(); void save("staff", staffEdit); }}><button type="button" className={styles.close} aria-label="Đóng" disabled={saving} onClick={() => setStaffEdit(null)}><X size={20} /></button><p className={styles.eyebrow}>HỒ SƠ NHÂN SỰ</p><h2>{staffEdit.full_name || "Thêm nhân sự"}</h2><div className={styles.formGrid}>{([['full_name', 'Họ và tên'], ['ops_id', 'OPS ID'], ['staff_id', 'Staff ID'], ['email', 'Email'], ['coverage', 'Khu vực (ví dụ KV 1 & 2)'], ['team', 'Team'], ['vendor', 'Vendor / Entity']] as const).map(([key, label]) => <label key={key}>{label}<input value={staffEdit[key]} type={key === "email" ? "email" : "text"} required={key === "full_name"} maxLength={key === "full_name" ? 150 : 100} onChange={e => setStaffEdit({ ...staffEdit, [key]: e.target.value })} /></label>)}<label>Chức danh<select value={staffEdit.role} onChange={e => setStaffEdit({ ...staffEdit, role: e.target.value as Staff["role"] })}>{STAFF_ROLES.map(r => <option key={r} value={r}>{ROLES[r]}</option>)}</select></label><label>Trạng thái<select value={staffEdit.status} onChange={e => setStaffEdit({ ...staffEdit, status: e.target.value })}><option value="Active">Active</option><option value="Inactive">Inactive</option><option value="">Chưa rõ</option></select></label><label className={styles.checkbox}><input type="checkbox" checked={staffEdit.archived} onChange={e => setStaffEdit({ ...staffEdit, archived: e.target.checked })} />Đưa vào nhóm lưu trữ / OFF</label></div>{staffEdit.review_note && <p className={styles.warning}>{staffEdit.review_note}</p>}<label>Ghi chú cần kiểm tra (xóa khi đã xử lý)<input value={staffEdit.review_note} maxLength={500} onChange={e => setStaffEdit({ ...staffEdit, review_note: e.target.value })} /></label><p className={styles.hint}>Hồ sơ này không tự tạo tài khoản đăng nhập hoặc cấp quyền quản lý rider.</p>{error && <p role="alert" className={styles.warning}>{error}</p>}<button className={styles.primary} disabled={saving}>{saving ? "Đang lưu…" : "Lưu nhân sự"}</button></form></div>}
    {preview && importFile && <div className={styles.backdrop}><div role="dialog" aria-modal="true" aria-label="Xem trước nhập CSV" className={styles.modal}><button className={styles.close} aria-label="Đóng" disabled={saving} onClick={() => { setPreview(null); setImportFile(null); }}><X size={20} /></button><p className={styles.eyebrow}>XEM TRƯỚC DỮ LIỆU</p><h2>Nhập danh sách & lịch</h2><p>{importFile.name}</p><p><strong>{preview.staff}</strong> nhân sự · <strong>{preview.shifts}</strong> ô lịch có dữ liệu</p><p>{preview.from} → {preview.to}</p><p className={styles.hint}>Ca có dữ liệu sẽ cập nhật lịch hiện tại. Ô trống và nhân sự không có trong file không bị xóa.</p>{preview.warnings.length > 0 && <details open><summary>{preview.warnings.length} dòng cần kiểm tra</summary><ul>{preview.warnings.map(w => <li key={w}>{w}</li>)}</ul></details>}{error && <p role="alert" className={styles.warning}>{error}</p>}<button className={styles.primary} disabled={saving} onClick={() => void importCsv(importFile, false)}>{saving ? "Đang nhập…" : "Nhập danh sách và lịch"}</button></div></div>}
  </div>;
}

function ShiftCell({ value, disabled, onClick }: { value: string; disabled: boolean; onClick: () => void }) {
  return <button className={styles.shift} data-kind={shiftKind(value)} disabled={disabled} onClick={onClick} title={value || "Chưa xếp ca"}>{value || "—"}</button>;
}
