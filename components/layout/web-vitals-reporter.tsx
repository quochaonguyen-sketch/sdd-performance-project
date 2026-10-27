"use client";

import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";
import type { VitalSample } from "@/lib/metrics/web-vitals";
import { metricPath } from "@/lib/metrics/paths";

const buffer = new Map<string, VitalSample>();
let timer: ReturnType<typeof setTimeout> | undefined;
function flush() {
  clearTimeout(timer);
  if (!buffer.size) return;
  const samples = Array.from(buffer.values()); buffer.clear();
  const body = JSON.stringify({ samples });
  if (!navigator.sendBeacon?.("/api/web-vitals", new Blob([body], { type: "application/json" }))) void fetch("/api/web-vitals", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
}
function report(metric: { id: string; name: string; value: number; rating: string }) {
  if (process.env.NODE_ENV !== "production") return;
  if (!["LCP", "INP", "CLS", "FCP", "TTFB"].includes(metric.name)) return;
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const sample = { metric_id: metric.id, name: metric.name, value: metric.value, rating: metric.rating, path: metricPath(navigation?.name ?? location.href), device: innerWidth <= 768 ? "mobile" : "desktop" } as VitalSample;
  buffer.set(`${sample.metric_id}:${sample.name}`, sample);
  // CLS/INP may finalize after the visibility listener has already flushed the batch.
  if (document.visibilityState === "hidden") { flush(); return; }
  clearTimeout(timer);
  timer = setTimeout(flush, 2000);
}
export function WebVitalsReporter() {
  useReportWebVitals(report);
  useEffect(() => {
    const visibility = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", flush); };
  }, []);
  return null;
}
