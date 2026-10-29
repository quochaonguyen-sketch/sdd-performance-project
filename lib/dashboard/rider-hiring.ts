import { parseRiderPlan } from "../google/rider-plan.ts";

// Sheet1 displays US dates (MM/DD/YYYY); never infer DD/MM from ambiguous cells.
export function parseHireDate(value: unknown) {
  const raw = String(value ?? "").trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!iso && !us) return null;
  const date = iso ? raw : `${us![3]}-${us![1].padStart(2,"0")}-${us![2].padStart(2,"0")}`;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === date ? date : null;
}

export function summarizeRiderHiring(grid: unknown[][], now = new Date()) {
  const parsed = parseRiderPlan(grid);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Ho_Chi_Minh" }).format(now);
  const [year, month, day] = today.split("-").map(Number);
  const previousStart = new Date(Date.UTC(year, month-2, 1)).toISOString().slice(0,10);
  const previousEnd = new Date(Date.UTC(year, month-2, Math.min(day, new Date(Date.UTC(year, month-1, 0)).getUTCDate()))).toISOString().slice(0,10);
  const currentStart = `${today.slice(0,7)}-01`;
  const areas = ["KV1","KV2","KV3","KV4","KV5"].map(area => ({area,current:0,previous:0}));
  let missingDates=0, invalidDates=0, futureDates=0, validDates=0;
  for (const rider of parsed.rows) {
    const metadata = rider.metadata as Record<string,unknown>;
    const raw = metadata["Ngày nhận việc"];
    if (!String(raw ?? "").trim()) { missingDates++; continue; }
    const date = parseHireDate(raw);
    if (!date) { invalidDates++; continue; }
    validDates++;
    if (date > today) { futureDates++; continue; }
    const area = areas.find(item => item.area === rider.kv)!;
    if (date >= currentStart && date <= today) area.current++;
    if (date >= previousStart && date <= previousEnd) area.previous++;
  }
  return { today, currentStart, previousStart, previousEnd, checkedAt:now.toISOString(),
    current:areas.reduce((n,a)=>n+a.current,0), previous:areas.reduce((n,a)=>n+a.previous,0), areas,
    validDates, missingDates, invalidDates, futureDates, skippedRows:parsed.issues.length, sourceRows:parsed.sourceRows, validRiders:parsed.rows.length };
}
export type RiderHiring = ReturnType<typeof summarizeRiderHiring>;
