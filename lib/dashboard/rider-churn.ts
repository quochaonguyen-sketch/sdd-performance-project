import { googleSheetsAccessToken } from "../google/off-schedule.ts";
import { HUB_SHEET_ID } from "./hub-sheet.ts";

export const RIDER_CHURN_TAB = "Info Rider SDD";

export type RiderChurnReport = {
  rows: { riderId: string; status: string; canDeactivate: boolean }[];
  checkedAt: string;
};

function cell(value: unknown) {
  return String(value ?? "").trim();
}

export function parseChurnedRiderIds(idRows: unknown[][], statusRows: unknown[][]) {
  const header = cell(statusRows[0]?.[0]).replace(/\s+/g, " ").toLowerCase();
  if (cell(idRows[0]?.[0]).toLowerCase() !== "rider id" || !/^status(?: \(active\s*\/\s*churned\))?$/.test(header)) {
    throw new Error("Tab Info Rider SDD thiếu tiêu đề Rider ID hoặc Status.");
  }

  const churned = new Set<string>();
  const otherStatuses = new Set<string>();
  for (let i = 1; i < idRows.length; i++) {
    const id = cell(idRows[i]?.[0]);
    const status = cell(statusRows[i]?.[0]).toLowerCase();
    if (!/^\d+$/.test(id)) continue;
    if (status === "churned") churned.add(id);
    else otherStatuses.add(id);
  }
  return [...churned].filter(id => !otherStatuses.has(id));
}

export function matchChurnedRiders<T extends { riderCode: string }>(churnedIds: string[], roster: T[]) {
  const ids = new Set(churnedIds);
  return roster.filter(rider => ids.has(rider.riderCode.trim()));
}

export async function readChurnedRiderIds() {
  const token = await googleSheetsAccessToken();
  const params = new URLSearchParams({ valueRenderOption: "FORMATTED_VALUE" });
  for (const column of ["A", "G"]) params.append("ranges", `'${RIDER_CHURN_TAB}'!${column}:${column}`);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${HUB_SHEET_ID}/values:batchGet?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`Không đọc được tab Info Rider SDD (Google ${response.status}).`);
  const { valueRanges } = await response.json() as { valueRanges?: { values?: unknown[][] }[] };
  return parseChurnedRiderIds(valueRanges?.[0]?.values ?? [], valueRanges?.[1]?.values ?? []);
}
