export type PickupOrderScope = {
  area: string; status: string; cot: "all" | "cot1" | "cot2";
  zone?: string; rider?: string; riderCot?: string; title: string;
};
export function pickupOrderParams(params: URLSearchParams) {
  const area = (params.get("p_area") ?? "all").trim();
  const status = (params.get("p_status") ?? "").trim();
  const zone = (params.get("p_zone") ?? "").trim();
  const rider = (params.get("p_rider") ?? "").trim();
  const riderCot = (params.get("p_rider_cot") ?? "").trim();
  const cot = (params.get("p_cot") ?? "all").trim();
  const query = (params.get("q") ?? "").trim();
  const page = Number(params.get("page") ?? "0");
  if (!/^(all|KV[1-5])$/.test(area) || !["Assigned", "Pickup Onhold", "Created"].includes(status)
    || !["all", "cot1", "cot2"].includes(cot) || zone.length > 200 || rider.length > 200 || query.length > 100
    || !Number.isInteger(page) || page < 0 || page > 10000
    || (rider && (!["COT1", "COT2", "UNKNOWN"].includes(riderCot) || cot !== "all"))
    || (!rider && riderCot)) throw new Error("Bộ lọc mã đơn pickup không hợp lệ");
  return { p_area: area, p_status: status, p_zone: zone, p_rider: rider, p_rider_cot: riderCot,
    p_cot: cot, p_query: query, p_offset: page * 100 };
}
