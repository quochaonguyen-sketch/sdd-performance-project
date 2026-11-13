"use client";

import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Send } from "lucide-react";
import { calendarDays, shiftCalendarMonth } from "@/lib/performance/calendar";
import { offShifts, offTypes } from "@/lib/off-registration/model";
import styles from "./off-registration.module.css";

const weekdays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const monthFormat = new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric", timeZone: "UTC" });
const formatDay = (day: string) => day.split("-").reverse().join("/");
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
type Receipt = { id: string; rider: string; dates: string[] };

export function OffRegistrationForm({ today, lastDay }: { today: string; lastDay: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const attempt = useRef<{ body: string; id: string } | null>(null);
  const busy = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    if (dates.length === 0) { setError("Chọn ít nhất một ngày OFF trên lịch."); return; }
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const payload = { ...fields, dates };
    const body = JSON.stringify(payload);
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      if (attempt.current?.body !== body) {
        attempt.current = { body, id: crypto.randomUUID() };
      }
      const response = await fetch("/api/public/off-requests", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({ ...payload, id: attempt.current.id }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Chưa xác nhận được yêu cầu. Vui lòng thử lại.");
      setReceipt(data as Receipt);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Chưa xác nhận được yêu cầu. Vui lòng thử lại.");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  function toggleDate(day: string) {
    if (!dates.includes(day) && dates.length >= 31) { setError("Mỗi lần đăng ký tối đa 31 ngày."); return; }
    setError("");
    setDates(current => current.includes(day) ? current.filter(date => date !== day) : [...current, day].sort());
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <div className={styles.brand}><CalendarDays size={19} aria-hidden="true" /> SDD Operations</div>
      <h1>Đăng ký lịch OFF</h1>
      <p>Chọn ngày nghỉ và gửi yêu cầu để quản lý hub duyệt.</p>
    </header>
    {receipt ? <section className={styles.receipt} role="status">
      <CheckCircle2 size={28} aria-hidden="true" />
      <h2>Đã gửi yêu cầu</h2>
      <p>{receipt.rider} · Chờ quản lý duyệt</p>
      <p>{receipt.dates.map(formatDay).join(", ")}</p>
      <p>Mã yêu cầu <strong>{receipt.id}</strong></p>
      <button type="button" className={styles.primary} onClick={() => { setReceipt(null); setDates([]); attempt.current = null; }}>Đăng ký tiếp</button>
    </section> : <form method="post" onSubmit={submit} className={styles.form}>
      <div hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <fieldset disabled={loading} className={styles.fields}>
        <legend>Thông tin đăng ký</legend>
        <div className={styles.identity}>
          <label>Mã rider<input name="riderCode" required maxLength={30} autoCapitalize="characters" spellCheck={false} pattern="[a-zA-Z0-9\-]{2,30}" /></label>
          <label>Họ tên rider<input name="riderName" required maxLength={120} autoComplete="name" /></label>
        </div>
        <label>Email liên hệ<input type="email" name="email" required maxLength={254} autoComplete="email" /></label>
        <div className={styles.identity}>
          <label>Loại OFF<select name="type">{Object.entries(offTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Ca nghỉ<select name="shift">{Object.entries(offShifts).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        </div>
        <label>Lý do <span className={styles.optional}>Không bắt buộc</span><textarea name="reason" rows={3} maxLength={500} /></label>
      </fieldset>
      <fieldset disabled={loading} className={styles.calendar}>
        <legend>Ngày OFF</legend>
        <div className={styles.month}>
          <button type="button" aria-label="Tháng trước" disabled={month <= today.slice(0, 7)} onClick={() => setMonth(shiftCalendarMonth(month, -1))}><ChevronLeft size={20} aria-hidden="true" /></button>
          <strong aria-live="polite">{monthFormat.format(new Date(`${month}-01T00:00:00Z`))}</strong>
          <button type="button" aria-label="Tháng sau" disabled={month >= lastDay.slice(0, 7)} onClick={() => setMonth(shiftCalendarMonth(month, 1))}><ChevronRight size={20} aria-hidden="true" /></button>
        </div>
        <div className={styles.days}>
          {weekdays.map(day => <span key={day} aria-hidden="true">{day}</span>)}
          {calendarDays(month).map((day, index) => day ? <button type="button" key={day} disabled={day < today || day > lastDay}
            aria-label={formatDay(day)} aria-pressed={dates.includes(day)} onClick={() => toggleDate(day)}>{Number(day.slice(-2))}</button> : <span key={index} />)}
        </div>
        <p className={styles.selection} aria-live="polite">{dates.length ? `${dates.length} ngày đã chọn` : "Có thể chọn nhiều ngày."}</p>
        {dates.length > 0 && <p className={styles.selectedDates}>{dates.map(formatDay).join(", ")}</p>}
      </fieldset>
      <footer className={styles.actions}>
        {error && <p role="alert">{error}</p>}
        <button type="submit" className={styles.primary} disabled={!ready || loading}><Send size={17} aria-hidden="true" /> {loading ? "Đang gửi…" : "Gửi yêu cầu"}</button>
      </footer>
    </form>}
  </main>;
}
