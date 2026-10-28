"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setPerformanceDates, type PerformanceFilters } from "@/lib/performance/filters";
import { calendarDays, shiftCalendarDay, shiftCalendarMonth } from "@/lib/performance/calendar";
import styles from "./performance-filters.module.css";

type UpdateParams = (mutator: (params: URLSearchParams) => void) => void;
const label = (day: string) => day.split("-").reverse().join("/");
const monthLabel = (month: string) => new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
const dayLabel = (day: string) => new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
export function PerformanceDatePicker({ filters, updateParams }: { filters: PerformanceFilters; updateParams: UpdateParams }) {
  const picker = useRef<HTMLDetailsElement>(null);
  const [month, setMonth] = useState(filters.start.slice(0, 7));
  const [from, setFrom] = useState(filters.start), [to, setTo] = useState(filters.end);
  const [choosingEnd, setChoosingEnd] = useState(false), [focused, setFocused] = useState(filters.start), [error, setError] = useState("");
  useEffect(() => {
    const close = (event: PointerEvent) => { if (event.target instanceof Node && !picker.current?.contains(event.target) && picker.current) picker.current.open = false; };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  function select(day: string) {
    if (!choosingEnd) { setFrom(day); setTo(day); setChoosingEnd(true); }
    else { setFrom(day < from ? day : from); setTo(day < from ? from : day); setChoosingEnd(false); }
    setFocused(day); setError("");
  }
  function focusDay(day: string) {
    setFocused(day);
    if (day.slice(0, 7) !== month) setMonth(day.slice(0, 7));
    requestAnimationFrame(() => picker.current?.querySelector<HTMLButtonElement>(`button[data-day="${day}"]`)?.focus());
  }
  function quick(period: "week" | "month") {
    updateParams(params => { params.set("period", period); params.set("date", filters.date); params.set("page", "1"); for (const key of ["start", "end", "preset", "mode"]) params.delete(key); });
    if (picker.current) picker.current.open = false;
  }
  function navigate(amount: number) {
    const next = shiftCalendarMonth(month, amount);
    setMonth(next); setFocused(`${next}-01`);
  }
  return <div className={styles.datePickerField}><span className="perf-field-label">Ngày hoặc khoảng ngày</span>
    <details ref={picker} className={styles.datePicker} onKeyDown={event => { if (event.key === "Escape" && picker.current) { picker.current.open = false; picker.current.querySelector("summary")?.focus(); } }}>
      <summary aria-label="Chọn ngày hoặc khoảng ngày thống kê"><CalendarDays size={17} aria-hidden="true"/><span>{filters.start === filters.end ? label(filters.start) : `${label(filters.start)} → ${label(filters.end)}`}</span><ChevronDown size={15} aria-hidden="true"/></summary>
      <form className={styles.datePickerPanel} onSubmit={event => {
        event.preventDefault();
        try { updateParams(params => setPerformanceDates(params, from, to)); setError(""); if (picker.current) picker.current.open = false; }
        catch (caught) { setError(caught instanceof Error ? caught.message : "Khoảng ngày không hợp lệ."); }
      }}>
        <div className={styles.calendarSelection} aria-live="polite"><span>Từ ngày<strong>{label(from)}</strong></span><span>Đến ngày<strong>{label(to)}</strong></span></div>
        <div className={styles.calendarNavigation}><button type="button" aria-label="Tháng trước" onClick={() => navigate(-1)}><ChevronLeft size={18}/></button><span>Chọn trên lịch</span><button type="button" aria-label="Tháng sau" onClick={() => navigate(1)}><ChevronRight size={18}/></button></div>
        <div className={styles.calendarMonths}>
          {[month, shiftCalendarMonth(month, 1)].map((displayMonth, index) => {
            const days = calendarDays(displayMonth);
            return <section key={displayMonth} className={index ? styles.secondMonth : undefined} aria-label={monthLabel(displayMonth)}><h3>{monthLabel(displayMonth)}</h3>
              <table className={styles.calendarGrid} role="grid" aria-label={monthLabel(displayMonth)}><thead><tr>{["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map(day => <th scope="col" key={day}>{day}</th>)}</tr></thead>
                <tbody>{Array.from({ length: 6 }, (_, week) => <tr key={week}>{days.slice(week * 7, week * 7 + 7).map((day, column) => <td key={column} aria-selected={day ? day >= from && day <= to : undefined}>
                  {day && <button type="button" data-day={day} data-in-range={day >= from && day <= to} data-endpoint={day === from || day === to} tabIndex={day === focused ? 0 : -1} aria-label={dayLabel(day)} onClick={() => select(day)} onKeyDown={event => {
                    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
                    if (event.key in offsets) { event.preventDefault(); focusDay(shiftCalendarDay(day, offsets[event.key])); }
                    else if (event.key === "Home" || event.key === "End") { event.preventDefault(); focusDay(shiftCalendarDay(day, (event.key === "Home" ? 0 : 6) - (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7)); }
                  }}>{Number(day.slice(-2))}</button>}
                </td>)}</tr>)}</tbody>
              </table>
            </section>;
          })}
        </div>
        <p className={styles.calendarHint} role="status">{choosingEnd ? "Chọn ngày kết thúc trên lịch, hoặc Áp dụng để xem một ngày." : "Bấm ngày bắt đầu, rồi bấm ngày kết thúc. Có thể chọn qua tháng khác."}</p>
        <div className={styles.dateQuick}><button type="button" onClick={() => quick("week")}>7 ngày</button><button type="button" onClick={() => quick("month")}>Trong tháng</button><Button type="submit">Áp dụng</Button></div>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </form>
    </details>
  </div>;
}
