import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { paginateOvernightRiders, type RiderNote } from "./riders";
import type { OvernightHoldData, OvernightHoldOrder, OvernightHoldSnapshot } from "./model";

export type OvernightOrderQueryOptions = {
  area?: string;
  cutoff_status?: string;
  current_status?: string;
  has_note?: string;
  q?: string;
  page?: number;
  limit?: number;
  exportAll?: boolean;
};

export async function getOvernightHoldData(
  day: string,
  options: OvernightOrderQueryOptions = {}
): Promise<OvernightHoldData> {
  const db = createAdminClient();
  const {
    area = "all",
    cutoff_status = "all",
    current_status = "all",
    has_note = "all",
    q = "",
    page = 0,
    limit = 50,
    exportAll = false,
  } = options;

  // 1. Fetch recent snapshots for the date selector
  const { data: snapshotList } = await db
    .from("overnight_hold_snapshots")
    .select("cutoff_date,total_orders,resolved_count,captured_at")
    .eq("status", "locked")
    .order("cutoff_date", { ascending: false })
    .limit(30);

  // 2. Fetch specific snapshot for requested day
  const { data: currentSnapshot } = await db
    .from("overnight_hold_snapshots")
    .select("*")
    .eq("cutoff_date", day)
    .maybeSingle();

  // 3. Build orders query
  let query = db
    .from("overnight_hold_orders")
    .select("*", { count: "exact" })
    .eq("cutoff_date", day).eq("is_cutoff_member", true);

  if (area !== "all") {
    query = query.eq("area", area);
  }

  if (cutoff_status !== "all") {
    query = query.eq("cutoff_status", parseInt(cutoff_status, 10));
  }

  if (current_status !== "all") {
    query = query.eq("current_status", current_status);
  }

  if (has_note === "has_note") {
    query = query.neq("note", "");
  } else if (has_note === "no_note") {
    query = query.eq("note", "");
  }

  if (q.trim()) {
    const term = q.trim();
    query = query.or(
      `order_code.ilike.%${term}%,rider_name.ilike.%${term}%,rider_code.ilike.%${term}%,note.ilike.%${term}%,ward.ilike.%${term}%,district.ilike.%${term}%`
    );
  }

  query = query.order("created_at", { ascending: false }).order("order_code", { ascending: true });

  // Read the full matching set before paging riders, never split a rider's orders.
  const orders:OvernightHoldOrder[]=[];
  for(let offset=0;;offset+=1000){
    const {data,error}=await query.range(offset,offset+999);
    if(error)throw new Error("Không tải đủ đơn giữ qua đêm.");
    orders.push(...(data as OvernightHoldOrder[] ?? []));
    if(!data||data.length<1000)break;
  }
  const summaryRows:Array<Pick<OvernightHoldOrder,"cutoff_status"|"current_status"|"note"|"rider_code">>=[];
  for(let offset=0;;offset+=1000){
    const {data,error}=await db.from("overnight_hold_orders")
      .select("cutoff_status,current_status,note,rider_code").eq("cutoff_date",day).eq("is_cutoff_member",true)
      .order("order_code").range(offset,offset+999);
    if(error)throw new Error("Không tải được tổng số đơn giữ qua đêm.");
    summaryRows.push(...(data as typeof summaryRows ?? []));
    if(!data||data.length<1000)break;
  }
  const notes:RiderNote[]=[];
  for(let offset=0;;offset+=1000){
    const {data,error}=await db.from("overnight_hold_rider_notes").select("rider_code,note,updated_by")
      .eq("cutoff_date",day).order("rider_code").range(offset,offset+999);
    if(error)throw new Error("Không tải được ghi chú rider.");
    notes.push(...(data??[]));
    if(!data||data.length<1000)break;
  }
  const grouped=paginateOvernightRiders(orders,notes,page,limit,exportAll);

  let total = 0;
  let delivering = 0;
  let onhold = 0;
  let resolved = 0;
  let hasNotes = 0;
  const riders = new Set<string>();

  if (summaryRows) {
    total = summaryRows.length;
    for (const row of summaryRows) {
      if (row.cutoff_status === 1) delivering++;
      if (row.cutoff_status === 5) onhold++;
      if (row.current_status === "Delivered" || row.current_status === "Returned") resolved++;
      if (row.note && row.note.trim()) hasNotes++;
      if (row.rider_code) riders.add(row.rider_code);
    }
  }

  return {
    snapshot: currentSnapshot?.status === "locked" ? currentSnapshot as OvernightHoldSnapshot : null,
    snapshots: (snapshotList || []).map((s) => ({
      cutoff_date: s.cutoff_date,
      total_orders: s.total_orders,
      resolved_count: s.resolved_count,
      captured_at: s.captured_at,
    })),
    ...grouped,
    total: orders.length,
    pageSize: limit,
    summary: {
      total,
      delivering,
      onhold,
      resolved,
      hasNotes,
      riderCount: riders.size,
    },
  };
}

export async function captureOvernightHold(day: string, actor?: string) {
  const db = createAdminClient();
  const { data, error } = await db.rpc("capture_overnight_hold", {
    p_day: day,
    p_actor: actor ?? null,
  });
  if (error) {
    throw new Error(`Không thể chốt danh sách 23h: ${error.message}`);
  }
  return data;
}

export async function syncOvernightHoldStatus(day: string) {
  const db = createAdminClient();
  const { data, error } = await db.rpc("sync_overnight_hold_status", {
    p_day: day,
  });
  if (error) {
    throw new Error(`Không thể cập nhật trạng thái đơn: ${error.message}`);
  }
  return data;
}

export async function updateOvernightHoldNote(id: string, note: string, actor?: string) {
  const db = createAdminClient();
  const { data, error } = await db.rpc("update_overnight_hold_note", {
    p_id: id,
    p_note: note,
    p_actor: actor ?? null,
  });
  if (error) {
    throw new Error(`Không thể lưu ghi chú: ${error.message}`);
  }
  return data;
}

export async function updateOvernightRiderNote(day:string,riderCode:string,note:string,actor:string){
  const db=createAdminClient();
  const {data:member,error:memberError}=await db.from("overnight_hold_orders").select("id")
    .eq("cutoff_date",day).eq("rider_code",riderCode).eq("is_cutoff_member",true).limit(1).maybeSingle();
  if(memberError||!member)throw new Error("Không tìm thấy rider trong danh sách chốt.");
  const {data,error}=await db.from("overnight_hold_rider_notes").upsert({cutoff_date:day,rider_code:riderCode,
    note,updated_by:actor,updated_at:new Date().toISOString()},{onConflict:"cutoff_date,rider_code"})
    .select("note,updated_by").single();
  if(error)throw new Error("Không lưu được ghi chú xử lý rider.");
  return {success:true,...data};
}
