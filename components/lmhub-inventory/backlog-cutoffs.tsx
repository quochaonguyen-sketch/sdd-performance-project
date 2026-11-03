"use client";
import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { BACKLOG_CUTOFFS, remainingBacklogWards, type BacklogCheckpoint, type BacklogCot, type BacklogDetail, type BacklogSource } from "@/lib/dashboard/backlog-history";
import styles from "./backlog-history.module.css";

const time = (at: string) => new Date(at).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });
const fmt = (n: number) => n.toLocaleString("vi-VN");
const status: Record<string, string> = { PENDING: "Chờ giờ chốt", QUEUED: "Đang lấy nguồn mới", FAILED: "Lấy nguồn thất bại", MISSED: "Lỡ mốc, không có snapshot hợp lệ" };

export function BacklogCutoffs({ source, day, checkpoints, area, cot, onCompare }: {
  source: BacklogSource; day: string; checkpoints?: BacklogCheckpoint[]; area: string; cot: BacklogCot;
  onCompare: (before: string, after: string) => void;
}) {
  const hours: readonly string[] = BACKLOG_CUTOFFS[source];
  const slots = hours.map(hour => checkpoints?.find(p => time(p.scheduled_for) === hour));
  const [selection, setSelection] = useState("");
  const selected = hours.find(hour => selection === `${source}|${day}|${hour}`)
    ?? hours.filter((_, i) => slots[i]?.status === "CAPTURED").at(-1) ?? hours[0];
  const point = slots[hours.indexOf(selected)];
  const id = point?.status === "CAPTURED" ? point.snapshot_id : null;
  const key = `${source}|${day}|${id}`;
  const [result, setResult] = useState<{ key: string; detail?: BacklogDetail; error?: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    fetch(`/api/backlog-history?${new URLSearchParams({ source, snapshot: id })}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const body = await response.json(); if (!response.ok) throw Error(body.error ?? "Chưa đọc được snapshot."); return body as BacklogDetail; })
      .then(detail => { if (!controller.signal.aborted) setResult({ key, detail }); })
      .catch(e => { if (!controller.signal.aborted) setResult({ key, error: e instanceof Error ? e.message : "Chưa đọc được snapshot." }); });
    return () => controller.abort();
  }, [id, source, key]);
  const detail = result?.key === key ? result.detail : undefined;
  const rows = detail ? remainingBacklogWards(detail.rows, cot, area) : [];
  const first = slots[0], second = slots[1];
  return <section className={`${styles.panel} ${styles.cutoffs}`} aria-label="Phường còn tồn tại mốc chốt">
    <div className={styles.panelHeading}><div><p className={styles.eyebrow}>SNAPSHOT THEO GIỜ CHỐT</p><h2>Phường còn tồn · {source === "delivery" ? "Delivery" : "Pickup"}</h2></div><span>{day} · {area || "KV1–KV5"}</span></div>
    <p className={styles.note}>Chọn mốc để xem phường còn hàng. {source === "pickup" ? "Chỉ tính Assigned chưa lấy, không gồm OH." : "Tồn Delivery theo nguồn backlog."} Số liệu giữ cố định theo địa bàn lúc chốt.</p>
    <div className={styles.cutoffButtons}>{hours.map((hour, index) => <button type="button" key={hour} aria-pressed={selected === hour} onClick={() => setSelection(`${source}|${day}|${hour}`)}><Clock3 size={16} aria-hidden="true"/><strong>{hour}</strong><span>{slots[index]?.status === "CAPTURED" ? "Đã lưu snapshot" : status[slots[index]?.status ?? ""] ?? "Chưa có mốc trong ngày"}</span></button>)}</div>
    {first?.status === "CAPTURED" && second?.status === "CAPTURED" && first.snapshot_id && second.snapshot_id && <button type="button" className={styles.cutoffCompare} onClick={() => onCompare(first.snapshot_id!, second.snapshot_id!)}>Đối chiếu {hours[0]} → {hours[1]} theo phường</button>}
    {detail ? <><p className={styles.note}>Mốc hẹn {selected} · bắt đầu đọc {time(detail.snapshot.source_started_at ?? detail.snapshot.source_snapshot_at)} · nguồn hoàn tất {time(detail.snapshot.source_snapshot_at)} · {fmt(rows.length)} phường còn tồn · {fmt(rows.reduce((n, row) => n + row.after, 0))} đơn</p>
      <div className={styles.tableWrap}><table><thead><tr><th>KV</th><th>Quận</th><th>Phường còn tồn</th><th>Số đơn</th></tr></thead><tbody>{rows.map(row => <tr key={JSON.stringify([row.area, row.district, row.ward])}><td>{row.area}</td><td>{row.district}</td><td>{row.ward}</td><td>{fmt(row.after)}</td></tr>)}{!rows.length && <tr><td colSpan={4}>Không còn tồn trong snapshot và bộ lọc này.</td></tr>}</tbody></table></div>
    </> : <p className={styles.note} role="status">{result?.key === key && result.error ? result.error : id ? "Đang tải phường còn tồn…" : checkpoints ? status[point?.status ?? ""] ?? "Chưa có snapshot tại mốc này." : "Đang đọc lịch chốt…"}</p>}
    <p className={styles.note}>Giờ Việt Nam. Lượt đọc phải bắt đầu sau mốc hẹn và hoàn tất trong 15 phút; quá hạn sẽ báo lỡ mốc. Thiếu snapshot không tính thành 0. So sánh số tồn theo phường, không xác nhận cùng một đơn còn tồn qua hai mốc.</p>
  </section>;
}
