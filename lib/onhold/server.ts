import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ohRange, type OHData, type OHOrdersResult } from "./model";
import { vietnamDay } from "@/lib/data-sources/catalog";

export async function getOHPivot(from: string, to: string): Promise<OHData> {
  ohRange(from, to, vietnamDay());
  const { data, error } = await createAdminClient().rpc("read_onhold_pivot", { p_from: from, p_to: to });
  if (error || !data) throw new Error("Không đọc được pivot OH.");
  return data as OHData;
}

export type OrderQueryOptions = {
  area?: string;
  status?: string;
  reason?: string;
  district?: string;
  ward?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

export async function getOHOrders(day: string, options: OrderQueryOptions = {}): Promise<OHOrdersResult> {
  const {
    area = "all",
    status = "all",
    reason = "all",
    district = "all",
    ward = "all",
    q = "",
    limit = 100,
    offset = 0,
  } = options;

  const { data, error } = await createAdminClient().rpc("read_onhold_orders", {
    p_day: day,
    p_area: area,
    p_status: status,
    p_reason: reason,
    p_district: district,
    p_ward: ward,
    p_q: q,
    p_limit: limit,
    p_offset: offset,
  });

  if (error || !data) {
    throw new Error("Không tải được danh sách mã đơn OH.");
  }

  return data as OHOrdersResult;
}

export async function exportOHOrders(day: string, options: OrderQueryOptions = {}): Promise<OHOrdersResult> {
  const {
    area = "all",
    status = "all",
    reason = "all",
    district = "all",
    ward = "all",
    q = "",
  } = options;

  const { data, error } = await createAdminClient().rpc("export_onhold_orders", {
    p_day: day,
    p_area: area,
    p_status: status,
    p_reason: reason,
    p_district: district,
    p_ward: ward,
    p_q: q,
  });

  if (error || !data) {
    throw new Error("Không xuất được danh sách mã đơn OH.");
  }

  return data as OHOrdersResult;
}
