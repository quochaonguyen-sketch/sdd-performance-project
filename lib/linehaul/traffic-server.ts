import "server-only";
import { TtlCache } from "@/lib/cache/ttl-cache";
import type { LinehaulTrip } from "./model";
import { etaUnavailableReason, parseTomTomEta, TrafficEtaError, trafficEtaKey, type TrafficEta } from "./traffic-eta";

const cache = new TtlCache<TrafficEta>(60_000, 128);
let active = 0;

export async function getTrafficEta(trip: LinehaulTrip): Promise<TrafficEta> {
  const issue = etaUnavailableReason(trip, Date.now());
  if (issue) throw new TrafficEtaError("trip_not_ready", issue);
  const apiKey = process.env.TOMTOM_API_KEY?.trim();
  if (!apiKey) throw new TrafficEtaError("traffic_not_configured", "Chưa kết nối nguồn giao thông TomTom. Quản trị cần cấu hình dịch vụ trước khi dùng dự đoán ETA.", 503);
  const key = trafficEtaKey(trip);
  // shortcut: cache/concurrency are process-local; add a shared quota when running multiple web instances.
  return (await cache.load(key, async () => {
    if (active >= 4) throw new TrafficEtaError("busy", "Đang có nhiều yêu cầu giao thông. Thử lại sau vài giây.", 429);
    active++;
    try {
      const requestedAt = Date.now();
      const url = new URL(`https://api.tomtom.com/routing/1/calculateRoute/${trip.lat},${trip.lng}:${trip.hub_lat},${trip.hub_lng}/json`);
      url.search = new URLSearchParams({ key: apiKey, travelMode: "truck", vehicleCommercial: "true", traffic: "true", departAt: "now", routeType: "fastest", maxAlternatives: "0", routeRepresentation: "summaryOnly", computeTravelTimeFor: "all" }).toString();
      // Send only two coordinates and routing options, never driver identity, plate, trip ID or SPX cookies.
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new TrafficEtaError(response.status === 429 ? "provider_limit" : "provider_unavailable", response.status === 429 ? "Nguồn giao thông đang giới hạn lượt tra cứu. Vui lòng thử lại sau." : "Chưa lấy được dữ liệu giao thông TomTom. Kiểm tra kết nối hoặc cấu hình dịch vụ.", response.status === 429 ? 429 : 502);
      return parseTomTomEta(await response.json(), trip, requestedAt);
    } catch (error) {
      if (error instanceof TrafficEtaError) throw error;
      throw new TrafficEtaError("provider_unavailable", "Nguồn giao thông chưa phản hồi hoặc trả dữ liệu lỗi. Chưa có ETA mới.", 502);
    } finally { active--; }
  })).value;
}
