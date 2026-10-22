import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserContext } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

function saigonDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function GET() {
  const context = await getCurrentUserContext();
  if (!context) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const from = saigonDate();
  const to = saigonDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
  const { data, error } = await admin
    .from("rider_off_requests")
    .select("id,rider_id,rider_code,off_date,request_type,shift,created_at,reason")
    .eq("status", "PENDING")
    .gte("off_date", from)
    .lte("off_date", to)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const riderIds = Array.from(new Set((data ?? []).map((item) => item.rider_id).filter(Boolean)));
  const { data: riders } = riderIds.length
    ? await admin.from("riders").select("id,full_name").in("kv", OPERATING_AREAS).in("id", riderIds)
    : { data: [] as Array<{ id: string; full_name: string | null }> };
  const nameById = new Map((riders ?? []).map((rider) => [rider.id, rider.full_name]));

  const requests = (data ?? []).map((item) => ({
    id: item.id,
    rider_code: item.rider_code,
    rider_name: nameById.get(item.rider_id) ?? null,
    off_date: item.off_date,
    request_type: item.request_type,
    shift: item.shift,
    created_at: item.created_at,
    reason: item.reason,
  }));

  return NextResponse.json({ success: true, count: requests.length, requests });
}
