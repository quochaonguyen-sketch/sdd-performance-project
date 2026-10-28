export type PickupOrderScope = {
  area: string; status: string; cot: "all" | "cot1" | "cot2";
  zone?: string; district?:string; ward?:string; wards?:string[]; rider?: string; riderCot?: string; title: string;
};
export function pickupOrderParams(params: URLSearchParams) {
  const area = (params.get("p_area") ?? "all").trim();
  const status = (params.get("p_status") ?? "").trim();
  const zone = (params.get("p_zone") ?? "").trim();
  const district=(params.get("p_district")??"").trim(),ward=(params.get("p_ward")??"").trim();
  const wards:unknown=JSON.parse(params.get('p_wards')||'[]');
  if(!Array.isArray(wards)||wards.length>200||wards.some(w=>typeof w!=='string'||!w.trim()||w.length>200)||(!district&&wards.length))throw new Error('Danh sách phường không hợp lệ');
  const rider = (params.get("p_rider") ?? "").trim();
  const riderCot = (params.get("p_rider_cot") ?? "").trim();
  const cot = (params.get("p_cot") ?? "all").trim();
  const query = (params.get("q") ?? "").trim();
  const page = Number(params.get("page") ?? "0");
  if (!/^(all|KV[1-5])$/.test(area) || !["Assigned", "Pickup Onhold", "Created"].includes(status)
    || !["all", "cot1", "cot2"].includes(cot) || zone.length > 200 || rider.length > 200 || query.length > 100 || district.length>200 || ward.length>200
    || ((district||ward)&&(!district||area==='all'||zone||rider||riderCot))
    || !Number.isInteger(page) || page < 0 || page > 10000
    || (rider && (!["COT1", "COT2", "UNKNOWN"].includes(riderCot) || cot !== "all"))
    || (!rider && riderCot)) throw new Error("Bộ lọc mã đơn pickup không hợp lệ");
  if(district)return {p_area:area,p_status:status,p_district:district,p_ward:ward,p_wards:wards as string[],p_cot:cot,p_query:query,p_offset:page*100};
  return { p_area: area, p_status: status, p_zone: zone, p_rider: rider, p_rider_cot: riderCot,
    p_cot: cot, p_query: query, p_offset: page * 100 };
}
