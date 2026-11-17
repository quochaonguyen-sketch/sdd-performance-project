import { z } from "zod";
import { assertOffSheetHeaders, offSheetDate } from "./approved-schedule.ts";
import { offStatuses } from "./model.ts";

export const offReviewKeySchema = z.object({
  request_id: z.uuid(),
  rider_code: z.string().regex(/^[a-z0-9-]{2,30}$/i),
  work_date: z.iso.date(),
});

export type OffReviewKey = z.infer<typeof offReviewKeySchema>;
export type OffReviewStatus = typeof offStatuses[number];
export type OffReviewDecisionStatus = Exclude<OffReviewStatus, "Chờ duyệt">;
export type OffReviewRequest = OffReviewKey & {
  rider_name: string;
  area: string;
  cot: string;
  type: string;
  shift: string;
  reason: string;
  status: OffReviewStatus;
  manager_note: string;
  decided_at: string | null;
};

export function offReviewKey(row: OffReviewKey) {
  return `${row.request_id.toLowerCase()}|${row.rider_code}|${row.work_date}`;
}

export function readOffReviewRows(rows: unknown[][]) {
  assertOffSheetHeaders(rows);
  const requests = new Map<string, OffReviewRequest & { row: number; email: string; submitted_at: string }>();
  const ambiguous = new Set<string>();
  let skipped = 0;
  for (const [index, cells] of rows.slice(1).entries()) {
    if (!cells.some(cell => String(cell ?? "").trim())) continue;
    const read = (column: number) => String(cells[column] ?? "").trim();
    const key = offReviewKeySchema.safeParse({ request_id: read(0), work_date: offSheetDate(cells[2]), rider_code: read(3) });
    const status = offStatuses.find(value => value === read(11));
    if (!key.success) {
      skipped++;
      continue;
    }
    const identity = offReviewKey(key.data);
    if (ambiguous.has(identity) || requests.has(identity)) {
      skipped += requests.delete(identity) ? 2 : 1;
      ambiguous.add(identity);
      continue;
    }
    if (!status) {
      skipped++;
      ambiguous.add(identity);
      continue;
    }
    const serial = typeof cells[1] === "number" ? cells[1] : NaN;
    const moment = new Date(Math.round((serial - 25_569) * 86_400_000) - 7 * 3_600_000);
    const text = read(1).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    const fromText = text && new Date(`${text[3]}-${text[2].padStart(2, "0")}-${text[1].padStart(2, "0")}T${(text[4] ?? "00").padStart(2, "0")}:${text[5] ?? "00"}:${text[6] ?? "00"}+07:00`);
    const created = serial > 0 && Number.isFinite(moment.getTime()) ? moment : fromText;
    requests.set(identity, {
      ...key.data, row: index + 2, rider_name: read(4), area: read(5), cot: read(6), type: read(7),
      shift: read(8), reason: read(9), status, manager_note: read(12), decided_at: null, email: read(10),
      submitted_at: created && Number.isFinite(created.getTime()) ? created.toISOString() : `${key.data.work_date}T00:00:00+07:00`,
    });
  }
  return { requests, skipped };
}
