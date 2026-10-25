import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { RETURN_SELLER_AREAS } from "./scope";
import type { ReturnWorkspaceData, ReturnWorkspaceRow } from "./workspace";

/** One read model for the single return page. It never reads manual assignment tables. */
export async function getReturnWorkspace(): Promise<ReturnWorkspaceData> {
  const db = createAdminClient();
  async function head() {
    const {data,error}=await db.from("return_order_snapshots").select("snapshot_id,snapshot_at").order("snapshot_at",{ascending:false}).limit(1).maybeSingle();
    if(error) throw new Error("Không đọc được phiên dữ liệu hàng trả.");
    return data;
  }
  for(let attempt=0;attempt<2;attempt++) {
    const first=await head();
    if(!first) return {rows:[],snapshotAt:null,readAt:Date.now()};
    const rows:ReturnWorkspaceRow[]=[];
    for(let offset=0;;offset+=1000) {
      const {data,error}=await db.from("return_order_snapshots")
        .select("shipment_id,sls_tracking_number,shopee_order_sn,order_status,seller_area,seller_district,seller_ward,seller_new_ward,return_zone,pickup_point_id,return_driver_id,return_driver_name,current_station_name,create_time,receive_time,current_station_received_time,delivering_time")
        .eq("snapshot_id",first.snapshot_id).in("seller_area",RETURN_SELLER_AREAS).in("order_status",[10,67,72])
        .order("shipment_id").range(offset,offset+999).returns<ReturnWorkspaceRow[]>();
      if(error) throw new Error("Không tải đủ danh sách hàng trả. Vui lòng thử lại.");
      rows.push(...(data??[]));
      if(!data||data.length<1000) break;
    }
    if((await head())?.snapshot_id===first.snapshot_id) return {rows,snapshotAt:first.snapshot_at,readAt:Date.now()};
  }
  throw new Error("Dữ liệu hàng trả đang cập nhật. Vui lòng làm mới sau vài giây.");
}
