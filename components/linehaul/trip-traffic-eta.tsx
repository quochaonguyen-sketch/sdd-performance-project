"use client";
import { useEffect, useRef, useState } from "react";
import { Clock3, LoaderCircle, Sparkles } from "lucide-react";
import type { LinehaulTrip } from "@/lib/linehaul/model";
import { etaUnavailableReason, trafficEtaKey, type TrafficEta } from "@/lib/linehaul/traffic-eta";
import styles from "./linehaul.module.css";

type Result = { key: string; status: "loading" } | { key: string; status: "ready"; data: TrafficEta } | { key: string; status: "error"; error: string };
const at = (stamp: string) => new Date(stamp).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

export function TripTrafficEta({ trip, now }: { trip: LinehaulTrip; now: number }) {
  const [clock, setClock] = useState(() => Date.now());
  const liveNow = Math.max(clock, now);
  const key = trafficEtaKey(trip), issue = etaUnavailableReason(trip, liveNow);
  const [result, setResult] = useState<Result | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), [key]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const current = result?.key === key ? result : null;
  const data = !issue && current?.status === "ready" ? current.data : null;
  const stale = !!data && (liveNow - Date.parse(data.calculatedAt) > 120_000 || Date.parse(data.arrivalAt) < liveNow);

  async function predict() {
    if (issue || current?.status === "loading") return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 25_000);
    setResult({ key, status: "loading" });
    try {
      const response = await fetch(`/api/linehaul/eta?trip_id=${encodeURIComponent(trip.trip_id)}`, { cache: "no-store", signal: controller.signal });
      const body = await response.json() as TrafficEta & { error?: string };
      if (!response.ok) throw Error(body.error || "Chưa tính được ETA theo giao thông.");
      if (body.key !== key) throw Error("GPS hoặc trạng thái xe vừa đổi. Chờ danh sách cập nhật rồi dự đoán lại.");
      if (!controller.signal.aborted) setResult({ key, status: "ready", data: body });
    } catch (error) {
      if (request.current === controller) setResult({ key, status: "error", error: controller.signal.aborted ? "Quá thời gian lấy dữ liệu giao thông. Vui lòng thử lại." : error instanceof Error ? error.message : "Chưa tính được ETA." });
    } finally { window.clearTimeout(timeout); }
  }

  return <section className={styles.trafficEta} aria-label="AI dự đoán giờ tới hub" aria-busy={current?.status === "loading"}>
    <header><div><span><Sparkles size={15} aria-hidden="true" /> TRỢ LÝ LINEHAUL</span><h3>Dự đoán giờ tới hub</h3></div><Clock3 size={20} aria-hidden="true" /></header>
    <p>Đọc GPS gần nhất và tuyến xe tải có xét giao thông khi bạn bấm dự đoán.</p>
    {issue ? <p className={styles.etaNotice} role="status">{issue}</p> : <button type="button" onClick={() => void predict()} disabled={current?.status === "loading"} className={styles.etaButton}>{current?.status === "loading" ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}{current?.status === "loading" ? "Đang đọc giao thông…" : data ? "Cập nhật dự đoán ETA" : "Dự đoán ETA theo giao thông"}</button>}
    {!issue && current?.status === "error" && <p className={styles.etaNotice} role="alert">{current.error}</p>}
    {data && <div className={styles.etaResult}>
      <span>Giờ tới hub dự kiến · giờ Việt Nam</span><strong>{at(data.arrivalAt)}</strong>
      <div className={styles.etaStats}><div><b>{Math.max(0, Math.ceil((Date.parse(data.arrivalAt) - liveNow) / 60_000))} phút</b><small>còn lại tại lúc xem</small></div><div><b>{(data.distanceMeters / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km</b><small>theo tuyến TomTom</small></div><div><b>{data.trafficDelaySeconds === null ? "—" : `${Math.ceil(data.trafficDelaySeconds / 60)} phút`}</b><small>chậm do giao thông theo nguồn</small></div></div>
      {data.staDifferenceMinutes !== null && <p className={styles.etaNotice}>{data.staDifferenceMinutes > 0 ? `Dự kiến trễ ${data.staDifferenceMinutes} phút so STA.` : data.staDifferenceMinutes < 0 ? `Dự kiến sớm ${-data.staDifferenceMinutes} phút so STA.` : "Dự kiến khớp STA tới phút."}</p>}
      {data.spxEtaAt && <small>ETA SPX để đối chiếu: {at(data.spxEtaAt)}</small>}
      {stale && <p className={styles.etaNotice}>Dự đoán đã cũ hoặc mốc ETA đã qua. Cập nhật GPS và dự đoán lại; chưa có nghĩa xe đã tới hub.</p>}
      <small>TomTom · tính lúc {at(data.calculatedAt)}<br />GPS xe: {at(data.gpsAt)}. Kết hợp giao thông hiện tại và mẫu lịch sử, độ phủ có thể khác nhau từng đoạn đường.</small>
      <small>Chưa áp dụng tải trọng/kích thước riêng của xe và thời gian dừng/chờ vào cổng. Tuyến dùng để tính ETA có thể khác đường OSRM đang hiển thị trên bản đồ.</small>
    </div>}
  </section>;
}
