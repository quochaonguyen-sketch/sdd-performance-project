"use client";

import { useEffect, useRef, useState } from "react";
import { Clock3, LoaderCircle } from "lucide-react";
import type { LinehaulTrip } from "@/lib/linehaul/model";
import { baselineEta, etaUnavailableReason, linehaulEtaKey, type EtaEstimate, type LinehaulEta } from "@/lib/linehaul/traffic-eta";
import styles from "./linehaul.module.css";

type Result =
  | { key: string; status: "loading" }
  | { key: string; status: "ready"; data: LinehaulEta }
  | { key: string; status: "error"; error: string };

const formatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit",
});

function etaSource(estimate: EtaEstimate) {
  return estimate.source === "SPX" ? "ETA từ SPX" : "OSRM · chưa xét tắc đường";
}

export function InlineTripEta({ trip, now, roadDurationSeconds }: {
  trip: LinehaulTrip;
  now: number;
  roadDurationSeconds?: number;
}) {
  const estimate = baselineEta(trip, now, roadDurationSeconds);
  return <div className={styles.inlineEta} role="status">
    {estimate ? <>
      <span>Dự kiến <strong><time dateTime={estimate.arrivalAt}>{formatter.format(new Date(estimate.arrivalAt))}</time></strong></span>
      <small>{etaSource(estimate)}</small>
    </> : <span>{etaUnavailableReason(trip, now) ?? "Chưa có ETA"}</span>}
  </div>;
}

export function TripEta({ trip, now }: { trip: LinehaulTrip; now: number }) {
  const [clock, setClock] = useState(() => Date.now());
  const [result, setResult] = useState<Result | null>(null);
  const request = useRef<AbortController | null>(null);
  const liveNow = Math.max(clock, now);
  const key = linehaulEtaKey(trip);
  const issue = etaUnavailableReason(trip, liveNow);
  const current = result?.key === key ? result : null;
  const loading = current?.status === "loading";
  const data = !issue && current?.status === "ready" && Date.parse(current.data.arrivalAt) > liveNow ? current.data : null;
  const estimate = data ?? baselineEta(trip, liveNow);

  useEffect(() => () => {
    request.current?.abort();
    request.current = null;
  }, [key]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  async function predict() {
    if (issue || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 25_000);
    setResult({ key, status: "loading" });

    try {
      const response = await fetch("/api/linehaul/eta?trip_id=" + encodeURIComponent(trip.trip_id), {
        cache: "no-store", signal: controller.signal,
      });
      const body = await response.json() as LinehaulEta & { error?: string };
      if (!response.ok) throw new Error(body.error || "Chưa tính được ETA.");
      if (body.key !== key) throw new Error("GPS hoặc trạng thái xe vừa đổi. Chờ danh sách cập nhật rồi tính lại.");
      if (!controller.signal.aborted) setResult({ key, status: "ready", data: body });
    } catch (error) {
      if (request.current !== controller) return;
      const message = controller.signal.aborted
        ? "Quá thời gian lấy tuyến đường. Vui lòng thử lại."
        : error instanceof Error ? error.message : "Chưa tính được ETA.";
      setResult({ key, status: "error", error: message });
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) request.current = null;
    }
  }

  return <section className={styles.tripEta} aria-label="Giờ tới hub dự kiến" aria-busy={loading}>
    <header><h3>Giờ tới hub dự kiến</h3><Clock3 size={20} aria-hidden="true"/></header>
    {issue ? <p className={styles.etaNotice} role="status">{issue}</p> : <>
      <button type="button" onClick={() => void predict()} disabled={loading} className={styles.etaButton}>
        {loading ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true"/> : <Clock3 size={15} aria-hidden="true"/>}
        {loading ? "Đang tính ETA…" : estimate ? "Cập nhật ETA" : "Tính ETA"}
      </button>
      {current?.status === "error" && <p className={styles.etaNotice} role="alert">{current.error}</p>}
      {estimate ? <div className={styles.etaResult} role="status">
        <span>{etaSource(estimate)} · giờ Việt Nam</span>
        <strong><time dateTime={estimate.arrivalAt}>{formatter.format(new Date(estimate.arrivalAt))}</time></strong>
        <div className={styles.etaStats}>
          <div><b>{Math.ceil((Date.parse(estimate.arrivalAt) - liveNow) / 60_000)} phút</b><small>còn lại tại lúc xem</small></div>
          {data?.distanceMeters != null && <div><b>{(data.distanceMeters / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km</b><small>theo tuyến OSRM</small></div>}
        </div>
        {data?.staDifferenceMinutes != null && <small>Chênh lệch so với giờ kế hoạch: {data.staDifferenceMinutes > 0 ? "+" : ""}{data.staDifferenceMinutes} phút</small>}
      </div> : current?.status === "ready" && <p className={styles.etaNotice} role="status">ETA đã qua. Cập nhật GPS để tính lại.</p>}
    </>}
  </section>;
}
