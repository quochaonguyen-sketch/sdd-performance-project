"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { calendarDays, shiftCalendarDay, shiftCalendarMonth } from "@/lib/performance/calendar";
import styles from "./wh-date-picker.module.css";

interface WhDateRangePickerProps {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  maxDate?: string;
  onApply: (from: string, to: string) => void;
}

const fmtDate = (d?: string | null) => (d ? d.split("-").reverse().join("/") : "");

const monthLabel = (m: string) =>
  new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${m || "2026-11"}-01T00:00:00Z`)
  );

export function WhDateRangePicker({ from, to, maxDate, onApply }: WhDateRangePickerProps) {
  const pickerRef = useRef<HTMLDetailsElement>(null);
  const today = maxDate || new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const [currentMonth, setCurrentMonth] = useState(() => (to ? to.slice(0, 7) : from ? from.slice(0, 7) : today.slice(0, 7)));
  const [tempFrom, setTempFrom] = useState(from || "");
  const [tempTo, setTempTo] = useState(to || "");
  const [choosingEnd, setChoosingEnd] = useState(false);

  // Sync internal state when external props change
  useEffect(() => {
    setTempFrom(from || "");
    setTempTo(to || "");
    if (to) setCurrentMonth(to.slice(0, 7));
    else if (from) setCurrentMonth(from.slice(0, 7));
  }, [from, to]);

  // Click outside to close
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        pickerRef.current.open = false;
        setChoosingEnd(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  function handleSelectDay(day: string) {
    if (maxDate && day > maxDate) return;

    if (!choosingEnd) {
      setTempFrom(day);
      setTempTo(day);
      setChoosingEnd(true);
    } else {
      if (day < tempFrom) {
        setTempTo(tempFrom);
        setTempFrom(day);
      } else {
        setTempTo(day);
      }
      setChoosingEnd(false);
    }
  }

  function handleApply() {
    onApply(tempFrom, tempTo);
    if (pickerRef.current) pickerRef.current.open = false;
    setChoosingEnd(false);
  }

  function handleQuick(rangeDays: number) {
    const today = maxDate || new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const start = shiftCalendarDay(today, -(rangeDays - 1));
    setTempFrom(start);
    setTempTo(today);
    setChoosingEnd(false);
    onApply(start, today);
    if (pickerRef.current) pickerRef.current.open = false;
  }

  function handleQuickSingle(offsetDays: number) {
    const today = maxDate || new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const day = shiftCalendarDay(today, offsetDays);
    setTempFrom(day);
    setTempTo(day);
    setChoosingEnd(false);
    onApply(day, day);
    if (pickerRef.current) pickerRef.current.open = false;
  }

  const nextMonth = shiftCalendarMonth(currentMonth, 1);
  const triggerLabel =
    !from && !to
      ? "Chọn khoảng ngày"
      : from === to
      ? fmtDate(from)
      : `${fmtDate(from)} – ${fmtDate(to)}`;

  return (
    <div className={styles.pickerWrapper}>
      <details
        ref={pickerRef}
        className={styles.picker}
        onKeyDown={(e) => {
          if (e.key === "Escape" && pickerRef.current) {
            pickerRef.current.open = false;
            setChoosingEnd(false);
          }
        }}
      >
        <summary className={styles.trigger} aria-label="Chọn lịch từ ngày đến ngày">
          <CalendarDays size={15} className={styles.triggerIcon} aria-hidden="true" />
          <span className={styles.triggerText}>{triggerLabel}</span>
          <ChevronDown size={14} className={styles.triggerChevron} aria-hidden="true" />
        </summary>

        <div className={styles.panel} role="region" aria-label="Lịch chọn khoảng ngày">
          {/* Header displaying selected From & To */}
          <div className={styles.selectionRow}>
            <div className={`${styles.selectionBox} ${!choosingEnd ? styles.selectionBoxActive : ""}`}>
              <span>Từ ngày</span>
              <strong>{tempFrom ? fmtDate(tempFrom) : "Chưa chọn"}</strong>
            </div>
            <div className={`${styles.selectionBox} ${choosingEnd ? styles.selectionBoxActive : ""}`}>
              <span>Đến ngày</span>
              <strong>{tempTo ? fmtDate(tempTo) : "Chưa chọn"}</strong>
            </div>
          </div>

          {/* Month Navigation */}
          <div className={styles.calendarNav}>
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => setCurrentMonth((m) => shiftCalendarMonth(m, -1))}
              aria-label="Tháng trước"
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-ink-2, #64748b)" }}>
              Chọn khoảng ngày trên lịch
            </span>
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => setCurrentMonth((m) => shiftCalendarMonth(m, 1))}
              aria-label="Tháng sau"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Dual Month Calendar Grids */}
          <div className={styles.calendarMonths}>
            {[currentMonth, nextMonth].map((m, idx) => {
              const days = calendarDays(m);
              return (
                <section
                  key={m}
                  className={`${styles.monthSection} ${idx > 0 ? styles.secondMonth : ""}`}
                  aria-label={monthLabel(m)}
                >
                  <h3 className={styles.monthTitle}>{monthLabel(m)}</h3>
                  <table className={styles.grid}>
                    <thead>
                      <tr>
                        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day) => (
                          <th scope="col" key={day}>
                            {day}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 6 }, (_, week) => (
                        <tr key={week}>
                          {days.slice(week * 7, week * 7 + 7).map((day, col) => {
                            if (!day) return <td key={col} />;
                            const inRange = Boolean(tempFrom && tempTo && day >= tempFrom && day <= tempTo);
                            const isEndpoint = day === tempFrom || day === tempTo;
                            const isFuture = Boolean(maxDate && day > maxDate);

                            return (
                              <td key={col}>
                                <button
                                  type="button"
                                  disabled={isFuture}
                                  data-in-range={inRange}
                                  data-endpoint={isEndpoint}
                                  className={styles.dayBtn}
                                  onClick={() => handleSelectDay(day)}
                                >
                                  {Number(day.slice(-2))}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              );
            })}
          </div>

          <p className={styles.hint}>
            {choosingEnd
              ? "👉 Bấm chọn ngày kết thúc trên lịch, hoặc bấm Áp dụng."
              : "👉 Bấm ngày bắt đầu, sau đó bấm ngày kết thúc để chọn khoảng ngày."}
          </p>

          {/* Footer Presets and Apply Button */}
          <div className={styles.footer}>
            <div className={styles.quickGroup}>
              <button type="button" className={styles.quickBtn} onClick={() => handleQuick(30)}>
                30 ngày
              </button>
              <button type="button" className={styles.quickBtn} onClick={() => handleQuick(7)}>
                7 ngày
              </button>
              <button type="button" className={styles.quickBtn} onClick={() => handleQuickSingle(0)}>
                Hôm nay
              </button>
              <button type="button" className={styles.quickBtn} onClick={() => handleQuickSingle(-1)}>
                Hôm qua
              </button>
            </div>
            <button type="button" className={styles.applyBtn} onClick={handleApply}>
              Áp dụng
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}
