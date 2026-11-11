import { gpsIsStale, type LinehaulTrip } from "./model.ts";
import { roadRouteKey, validPoint } from "./road-route.ts";

export class LinehaulEtaError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 409) {
    super(message); this.code = code; this.status = status;
  }
}
export type EtaEstimate = { arrivalAt: string; source: "SPX" | "OSRM" };
export type LinehaulEta = EtaEstimate & {
  key: string;
  gpsAt: string;
  distanceMeters: number | null;
  staDifferenceMinutes: number | null;
};

export function linehaulEtaKey(trip: LinehaulTrip) {
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
  if (!Number.isFinite(at) || now - at > 10 * 60_000 || at > now + 60_000) throw new LinehaulEtaError("snapshot_stale", "Snapshot LH thiếu hoặc quá 10 phút. Hãy đồng bộ lại LH trước khi dự đoán.");
}
const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const stamp = (value: unknown): value is string => typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

export function baselineEta(trip: LinehaulTrip, now: number, roadDurationSeconds?: number): EtaEstimate | null {
  if (etaUnavailableReason(trip, now)) return null;
  if (stamp(trip.hub_eta) && Date.parse(trip.hub_eta) > now) {
    return { arrivalAt: trip.hub_eta, source: "SPX" };
  }
  if (!nonnegative(roadDurationSeconds)) return null;
  // Keep this estimate anchored to the GPS fix as the clock advances.
  const arrival = new Date(Date.parse(trip.gps_at!) + roadDurationSeconds * 1000);
  if (!Number.isFinite(arrival.getTime()) || arrival.getTime() <= now) return null;
  return { arrivalAt: arrival.toISOString(), source: "OSRM" };
}
