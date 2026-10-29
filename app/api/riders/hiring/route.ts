import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { googleSheetsAccessToken } from "@/lib/google/off-schedule";
import { RIDER_PLAN_ID } from "@/lib/google/rider-plan";
import { summarizeRiderHiring } from "@/lib/dashboard/rider-hiring";
import { TtlCache } from "@/lib/cache/ttl-cache";

const cache = new TtlCache<unknown[][]>(300_000, 1);

export async function GET(request: Request) {
  if (!await getCurrentUserContext()) return NextResponse.json({error:"Chưa đăng nhập"},{status:401});
  try {
    if (request.headers.get("x-dashboard-refresh") === "1") cache.delete("Sheet1");
    const result = await cache.load("Sheet1", async () => {
      const token = await googleSheetsAccessToken();
      const range = encodeURIComponent("Sheet1!A1:Z5001");
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${RIDER_PLAN_ID}/values/${range}?valueRenderOption=FORMATTED_VALUE`,{headers:{Authorization:`Bearer ${token}`},cache:"no-store",signal:AbortSignal.timeout(30000)});
      if (!response.ok) throw Error(`Không đọc được ngày nhận việc từ Sheet1 (Google ${response.status})`);
      const grid: unknown[][] = (await response.json()).values ?? [];
      summarizeRiderHiring(grid);
      return grid;
    });
    // Recalculate the month window even when source rows are cached across midnight.
    return NextResponse.json(summarizeRiderHiring(result.value),{headers:{"Cache-Control":"private, no-store","X-Data-Cache":result.hit?"HIT":"MISS"}});
  } catch (e) {
    return NextResponse.json({error:e instanceof Error?e.message:"Không tải được ngày nhận việc"},{status:503,headers:{"Cache-Control":"private, no-store"}});
  }
}
