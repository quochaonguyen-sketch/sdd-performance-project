import { googleSheetsAccessToken } from "./off-schedule.ts";
import { parseRiderPlan, RIDER_PLAN_ID, RIDER_PLAN_TAB } from "./rider-plan.ts";

export async function readRiderPlan(signal?: AbortSignal) {
  const token = await googleSheetsAccessToken();
  const range = encodeURIComponent(`'${RIDER_PLAN_TAB}'!A1:Z5001`);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${RIDER_PLAN_ID}/values/${range}?valueRenderOption=FORMATTED_VALUE`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
  });
  const payload = await response.json() as { values?: unknown[][]; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? "Không đọc được nguồn rider Sheet1");
  const parsed = parseRiderPlan(payload.values ?? []);
  return {
    riders: parsed.rows.map((row) => ({
      rider_code: row.rider_code,
      full_name: row.full_name,
      kv: row.kv,
      cot: row.cot,
      home_district: row.home_district,
      pickup_district: row.pickup_district,
      pickup_ward: row.pickup_ward,
      delivery_district: row.delivery_district,
      delivery_ward: row.delivery_ward,
    })),
    sheet_rows: parsed.sourceRows,
    skipped_rows: parsed.issues.length,
    issues: parsed.issues,
  };
}
