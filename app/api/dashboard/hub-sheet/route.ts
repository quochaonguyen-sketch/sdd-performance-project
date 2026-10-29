import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { googleSheetsAccessToken } from "@/lib/google/off-schedule";
import { HUB_SHEET_ID, parseHubSheet } from "@/lib/dashboard/hub-sheet";
import { summarizeHubRoster } from "@/lib/dashboard/hub-roster";
import { parseHubFc } from "@/lib/dashboard/hub-fc";
import { TtlCache } from "@/lib/cache/ttl-cache";
import { summarizeRiderHiring } from "@/lib/dashboard/rider-hiring";
import { parseRiderPlan } from "@/lib/google/rider-plan";

const hubCache = new TtlCache<unknown[][]>(60_000, 1);
// Cache source rows, not active-shift totals: shift boundaries are recalculated on every request.
const rosterCache = new TtlCache<unknown[][]>(300_000, 1);
const fcCache = new TtlCache<unknown[][]>(900_000, 1);
const hiringCache = new TtlCache<unknown[][]>(300_000, 1);

export async function GET(request: Request) {
  if (!await getCurrentUserContext()) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  try {
    const force = request.headers.get("x-dashboard-refresh") === "1";
    let token: ReturnType<typeof googleSheetsAccessToken> | undefined;
    async function read(range: string, cache: TtlCache<unknown[][]>, validate: (grid: unknown[][]) => unknown, formatted = false) {
      if (force) cache.delete(range);
      return (await cache.load(range, async () => {
        token ??= googleSheetsAccessToken();
        const accessToken = await token;
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${HUB_SHEET_ID}/values/${encodeURIComponent(range)}?valueRenderOption=${formatted ? "FORMATTED_VALUE" : "UNFORMATTED_VALUE"}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw Error(`Không đọc được nguồn ${range.split("!")[0]} (Google ${response.status})`);
        const grid: unknown[][] = (await response.json()).values ?? [];
        validate(grid);
        return grid;
      })).value;
    }
    const [hubResult, rosterResult, fcResult, hiringResult] = await Promise.allSettled([
      read("dashboard!A1:AZ5001", hubCache, parseHubSheet),
      read("'Roster Shifts D0'!A1:AZ5001", rosterCache, grid => grid),
      read("FC!A1:E5001", fcCache, parseHubFc, true),
      read("Sheet1!A1:Z5001", hiringCache, parseRiderPlan, true),
    ]);
    if (hubResult.status === "rejected") throw hubResult.reason;
    const hub = parseHubSheet(hubResult.value);
    let roster;
    try {
      if (rosterResult.status === "rejected") throw rosterResult.reason;
      roster = { data: summarizeHubRoster(rosterResult.value, hub.stations.map(r => r.stationId)), error: null };
    } catch (e) {
      rosterCache.delete("'Roster Shifts D0'!A1:AZ5001");
      roster = { data: null, error: e instanceof Error ? e.message : "Không tải được roster" };
    }
    let fc;
    try {
      if (fcResult.status === "rejected") throw fcResult.reason;
      fc = { data: parseHubFc(fcResult.value), error: null };
    } catch (e) { fc = { data: null, error: e instanceof Error ? e.message : "Không tải được FC" }; }
    let hiring;
    try {
      if (hiringResult.status === "rejected") throw hiringResult.reason;
      hiring = { data: summarizeRiderHiring(hiringResult.value), error: null };
    } catch (e) {
      hiringCache.delete("Sheet1!A1:Z5001");
      hiring = { data: null, error: e instanceof Error ? e.message : "Không tải được ngày nhận việc" };
    }
    return NextResponse.json({ ...hub, roster, fc, hiring }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không tải được nguồn dashboard" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
