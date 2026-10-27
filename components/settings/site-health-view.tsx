"use client";
import { useCallback, useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { vitalRating, type VitalSummary } from "@/lib/metrics/web-vitals";
import styles from "@/components/feedback/feedback.module.css";

const labels = { good: "Tốt", "needs-improvement": "Cần cải thiện", poor: "Chậm" };
export function SiteHealthView() {
  const [rows, setRows] = useState<VitalSummary[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch("/api/web-vitals", { cache: "no-store", signal });
      const data = await response.json(); if (!response.ok) throw Error(data.error);
      if (!signal?.aborted) { setRows(data.summary); setError(""); }
    } catch { if (!signal?.aborted) setError("Không tải được số liệu. Vui lòng thử lại."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void load(controller.signal), 0); return () => { clearTimeout(timer); controller.abort(); }; }, [load]);
  return <div className={styles.page}><header className={styles.header}><div><span className={styles.eyebrow}>HIỆU NĂNG THỰC TẾ</span><h1>Sức khỏe website</h1><p>Số liệu 7 ngày gần nhất từ các lượt tải bản production đã đăng nhập. Không thu số liệu từ dev server.</p></div><button onClick={() => void load()} disabled={loading}><RefreshCcw size={16} aria-hidden="true" />{loading ? "Đang tải…" : "Làm mới"}</button></header>
    <section className={styles.panel}><h2>Trải nghiệm theo trang & thiết bị</h2><p className={styles.muted}>P75 là mức mà 75% lượt đo có kết quả bằng hoặc tốt hơn. LCP ≤ 2,5 giây, INP ≤ 200 ms, CLS ≤ 0,1 được đánh giá tốt. Các chỉ số gắn với lượt tải toàn trang; chưa đại diện riêng cho mỗi lần chuyển trang nội bộ.</p>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      {loading ? <p role="status">Đang tải số liệu…</p> : !rows.length ? <div className={styles.empty}><h3>Chưa có số liệu</h3><p>Dùng website rồi quay lại đây. INP chỉ xuất hiện khi có tương tác; chưa có dữ liệu không đồng nghĩa bằng 0.</p></div> : <div className={styles.metricsTable}><table><thead><tr><th>Trang</th><th>Thiết bị</th><th>Chỉ số</th><th>P75</th><th>Số mẫu</th><th>Đánh giá</th></tr></thead><tbody>{rows.map(row => <tr key={`${row.path}:${row.device}:${row.name}`}><td>{row.path}</td><td>{row.device === "mobile" ? "Mobile" : "Desktop"}</td><td>{row.name}</td><td>{row.name === "CLS" ? Number(row.p75).toFixed(3) : `${Math.round(row.p75)} ms`}</td><td>{row.samples}{Number(row.samples) < 20 ? " · ít mẫu" : ""}</td><td><span className={styles.badge} data-rating={vitalRating(row.name, row.p75)}>{labels[vitalRating(row.name, row.p75)]}</span></td></tr>)}</tbody></table></div>}
    </section></div>;
}
