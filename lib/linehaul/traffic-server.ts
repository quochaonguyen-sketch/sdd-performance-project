import "server-only";
import type { LinehaulTrip } from "./model";
import { getRoadRoute } from "./routing-server";
import { baselineEta, etaUnavailableReason, linehaulEtaKey, LinehaulEtaError, type LinehaulEta } from "./traffic-eta";

export async function getLinehaulEta(trip: LinehaulTrip): Promise<LinehaulEta> {
  const now = Date.now();
  const issue = etaUnavailableReason(trip, now);
  if (issue) throw new LinehaulEtaError("trip_not_ready", issue);

  let estimate = baselineEta(trip, now);
  let distanceMeters = null;
  if (!estimate) {
    const route = await getRoadRoute(trip).catch(() => {
      throw new LinehaulEtaError("route_unavailable", "Chưa lấy được tuyến đường để tính ETA. Vui lòng thử lại.", 502);
    });
    estimate = baselineEta(trip, Date.now(), route.durationSeconds);
    distanceMeters = route.distanceMeters;
  }
  if (!estimate) {
    throw new LinehaulEtaError("eta_unavailable", "Chưa có ETA còn hiệu lực. Cần cập nhật GPS hoặc thời gian tuyến đường.");
  }

  const sta = Date.parse(trip.hub_sta ?? "");
  return {
    ...estimate,
    key: linehaulEtaKey(trip),
    gpsAt: trip.gps_at!,
    distanceMeters,
    staDifferenceMinutes: Number.isFinite(sta) ? Math.round((Date.parse(estimate.arrivalAt) - sta) / 60_000) : null,
  };
}
