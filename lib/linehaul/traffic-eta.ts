import { gpsIsStale, type LinehaulTrip } from "./model.ts";
import { roadRouteKey, validPoint } from "./road-route.ts";

export class TrafficEtaError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 409) {
    super(message); this.code = code; this.status = status;
  }
}
export type TrafficEta = {
  key: string; provider: "TomTom"; calculatedAt: string; gpsAt: string;
  departureAt: string; arrivalAt: string; distanceMeters: number; travelSeconds: number;
  trafficDelaySeconds: number | null; noTrafficSeconds: number | null;
  staDifferenceMinutes: number | null; spxEtaAt: string | null;
  truckDimensionsApplied: false;
};
export function trafficEtaKey(trip: LinehaulTrip) {
  return [roadRouteKey(trip), trip.phase, trip.direction, trip.source, trip.hub_ata, trip.hub_atd, trip.hub_unloaded_at, trip.location_error, trip.hub_sta, trip.hub_eta].join("|");
}
export function etaUnavailableReason(trip: LinehaulTrip, now: number): string | null {
  if (trip.direction === "outbound") return "Xe đang xuất hub; không dự đoán giờ quay về hub này.";
  if (trip.hub_ata || trip.hub_atd || trip.hub_unloaded_at || trip.source === "history" || trip.source === "dashboard" || !["waiting", "en_route"].includes(trip.phase)) return "Chuyến đã có mốc đến/rời hub hoặc kết thúc; không dự đoán ETA inbound.";
  if (trip.phase === "waiting") return "Xe chưa xác nhận xuất phát; chưa đủ cơ sở tính giờ tới hub.";
  if (!validPoint(trip.lat, trip.lng) || !validPoint(trip.hub_lat, trip.hub_lng)) return "Chưa có đủ GPS xe và tọa độ hub để dự đoán.";
  if (gpsIsStale(trip, now)) return "GPS thiếu, quá 15 phút hoặc sai thời gian. Cần cập nhật vị trí trước khi dự đoán.";
  if (trip.location_error) return "Nguồn đang báo lỗi cập nhật GPS. Cần xác minh lại vị trí xe trước khi dự đoán.";
  return null;
}
export function assertEtaSnapshot(snapshotAt: string | null, now: number) {
  const at = Date.parse(snapshotAt ?? "");
  if (!Number.isFinite(at) || now - at > 10 * 60_000 || at > now + 60_000) throw new TrafficEtaError("snapshot_stale", "Snapshot LH thiếu hoặc quá 10 phút. Hãy đồng bộ lại LH trước khi dự đoán.");
}
const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const stamp = (value: unknown) => typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

export function parseTomTomEta(body: unknown, trip: LinehaulTrip, requestedAt: number): TrafficEta {
  const summary = (body as { routes?: { summary?: Record<string, unknown> }[] } | null)?.routes?.[0]?.summary;
  if (!summary || !nonnegative(summary.lengthInMeters) || !nonnegative(summary.travelTimeInSeconds) || !stamp(summary.departureTime) || !stamp(summary.arrivalTime)) throw new TrafficEtaError("provider_response", "Nguồn giao thông chưa trả đủ dữ liệu để tính ETA.", 502);
  const departureAt = summary.departureTime as string, arrivalAt = summary.arrivalTime as string;
  if (Math.abs(Date.parse(departureAt) - requestedAt) > 120_000 || Math.abs((Date.parse(arrivalAt) - Date.parse(departureAt)) / 1000 - summary.travelTimeInSeconds) > 2) throw new TrafficEtaError("provider_response", "Mốc thời gian từ nguồn giao thông không khớp; chưa sử dụng dự đoán này.", 502);
  const sta = Date.parse(trip.hub_sta ?? "");
  return {
    key: trafficEtaKey(trip), provider: "TomTom", calculatedAt: new Date(requestedAt).toISOString(), gpsAt: trip.gps_at!,
    departureAt, arrivalAt, distanceMeters: summary.lengthInMeters, travelSeconds: summary.travelTimeInSeconds,
    trafficDelaySeconds: nonnegative(summary.trafficDelayInSeconds) && summary.trafficDelayInSeconds <= summary.travelTimeInSeconds ? summary.trafficDelayInSeconds : null,
    noTrafficSeconds: nonnegative(summary.noTrafficTravelTimeInSeconds) ? summary.noTrafficTravelTimeInSeconds : null,
    staDifferenceMinutes: Number.isFinite(sta) ? Math.round((Date.parse(arrivalAt) - sta) / 60_000) : null,
    spxEtaAt: stamp(trip.hub_eta) ? trip.hub_eta : null, truckDimensionsApplied: false,
  };
}
