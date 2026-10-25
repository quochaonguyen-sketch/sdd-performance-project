export type ReturnWorkspaceRow = {
  shipment_id: string; sls_tracking_number: string; shopee_order_sn: string;
  order_status: number; seller_area: string; seller_district: string; seller_ward: string; seller_new_ward: string;
  return_zone: string; pickup_point_id: string; return_driver_id: string; return_driver_name: string;
  current_station_name: string; create_time: string | null; receive_time: string | null;
  current_station_received_time: string | null; delivering_time: string | null;
};
export type ReturnWorkspaceData = { rows: ReturnWorkspaceRow[]; snapshotAt: string | null; readAt?: number };
export type ReturnWorkspaceFilters = { query: string; area: string; status: string; district: string; rider: string; overdue: boolean; sort: string };
export const RETURN_AREAS = ["KV1", "KV2", "KV3", "KV4", "KV5"] as const;
export const EMPTY_RETURN_FILTERS: ReturnWorkspaceFilters = { query: "", area: "all", status: "all", district: "all", rider: "all", overdue: false, sort: "oldest" };
export function returnArea(value: string) {
  const match = String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().match(/^(?:KV|Khu vuc)\s*([1-5])$/i);
  return match ? `KV${match[1]}` : "unknown";
}
export function hubTime(row: ReturnWorkspaceRow) { return row.current_station_received_time || row.receive_time; }
export function returnAge(row: ReturnWorkspaceRow, now: number) {
  const time = Date.parse(hubTime(row) || "");
  return Number.isFinite(time) ? Math.max(0, (now - time) / 86_400_000) : null;
}
export function filterReturnRows(rows: ReturnWorkspaceRow[], filters: ReturnWorkspaceFilters, now: number) {
  const clean = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g,"d").toLowerCase();
  const query = clean(filters.query.trim());
  return rows.filter(row =>
    (filters.area === "all" || returnArea(row.seller_area) === filters.area) &&
    (filters.status === "all" || (filters.status === "returning" ? row.order_status === 72 : [10,67].includes(row.order_status))) &&
    (filters.district === "all" || row.seller_district === filters.district) &&
    (filters.rider === "all" || (row.order_status === 72 && row.return_driver_id === filters.rider)) &&
    (!filters.overdue || (returnAge(row, now) ?? 0) > 5) &&
    (!query || clean([row.shipment_id,row.sls_tracking_number,row.shopee_order_sn,row.return_zone,row.pickup_point_id,row.seller_district,row.seller_ward,row.seller_new_ward,row.order_status===72?row.return_driver_id:"",row.order_status===72?row.return_driver_name:""].join(" ")).includes(query))
  ).sort((a,b) => {
    if (filters.sort === "area") return returnArea(a.seller_area).localeCompare(returnArea(b.seller_area)) || a.seller_district.localeCompare(b.seller_district,"vi") || a.shipment_id.localeCompare(b.shipment_id);
    const aa = Date.parse(hubTime(a) || ""), bb = Date.parse(hubTime(b) || "");
    if (!Number.isFinite(aa)) return Number.isFinite(bb) ? 1 : a.shipment_id.localeCompare(b.shipment_id);
    if (!Number.isFinite(bb)) return -1;
    return (filters.sort === "newest" ? bb-aa : aa-bb) || a.shipment_id.localeCompare(b.shipment_id);
  });
}
export function summarizeReturns(rows: ReturnWorkspaceRow[], now: number) {
  const areas = Object.fromEntries(RETURN_AREAS.map(area => [area,{ total:0, waiting:0, returning:0 }])) as Record<string,{ total:number; waiting:number; returning:number }>;
  let waiting=0,returning=0,overdue=0,unknown=0;
  const riders = new Map<string,{id:string;name:string;total:number}>();
  for (const row of rows) {
    const area=returnArea(row.seller_area), inReturn=row.order_status===72;
    if (inReturn) returning++; else waiting++;
    if ((returnAge(row,now)??0)>5) overdue++;
    if (areas[area]) { areas[area].total++; areas[area][inReturn?"returning":"waiting"]++; } else unknown++;
    // Only SPX's current returning driver is a confirmed rider; manual assignments are not read here.
    if (inReturn && row.return_driver_id) {
      const existing=riders.get(row.return_driver_id);
      if(existing) existing.total++; else riders.set(row.return_driver_id,{id:row.return_driver_id,name:row.return_driver_name||row.return_driver_id,total:1});
    }
  }
  return {total:rows.length,waiting,returning,overdue,unknown,areas,riders:[...riders.values()].sort((a,b)=>b.total-a.total)};
}
export function returnCsv(rows: ReturnWorkspaceRow[]) {
  const cell=(value:unknown)=>{
    const text=String(value??"");
    return `"${(/^[\s]*[=+@-]/.test(text)?"'":"")+text.replace(/"/g,'""')}"`;
  };
  return "\uFEFF"+[["Mã đơn","Trạng thái","Khu vực","Quận","Phường","Mã tuyến","Mã rider đang trả","Tên rider đang trả","Nhập hub"],...rows.map(r=>[r.shipment_id,r.order_status===72?"Đang trả":"Chờ trả",r.seller_area,r.seller_district,r.seller_new_ward||r.seller_ward,r.return_zone,r.order_status===72?r.return_driver_id:"",r.order_status===72?r.return_driver_name:"",hubTime(r)||""])].map(row=>row.map(cell).join(",")).join("\r\n");
}
