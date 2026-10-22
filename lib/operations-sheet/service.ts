import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { createAdminClient } from "@/lib/supabase/admin";
import { googleSheetsAccessToken } from "@/lib/google/off-schedule";
import { MAX_PLAN_ROWS, PLAN_TABS, type PlanTab } from "./schema";

export function planSpreadsheetId(value: string) {
  const raw = value.trim();
  if (/^[\w-]{20,150}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.hostname !== "docs.google.com" || url.protocol !== "https:") throw new Error();
    const id = url.pathname.match(/^\/spreadsheets\/d\/([\w-]{20,150})(?:\/|$)/)?.[1];
    if (id) return id;
  } catch { /* Show the same actionable error for invalid input. */ }
  throw new Error("Link hoặc ID Google Sheet không hợp lệ.");
}

export async function readPlanFromGoogle(id: string, signal: AbortSignal) {
  const token = await googleSheetsAccessToken();
  const params = new URLSearchParams({ majorDimension: "ROWS", valueRenderOption: "FORMATTED_VALUE" });
  for (const [tab, config] of Object.entries(PLAN_TABS)) params.append("ranges", `'${tab}'!A1:${String.fromCharCode(64 + config.fields.length)}${MAX_PLAN_ROWS + 2}`);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${params}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? "Không đọc được Google Sheet. Kiểm tra quyền chia sẻ và tên tab.");
  return Object.fromEntries(Object.keys(PLAN_TABS).map((tab, index) => [tab, result.valueRanges?.[index]?.values ?? []])) as Record<string, unknown[][]>;
}

export async function loadCurrentPlan(tabs: PlanTab[]) {
  const admin = createAdminClient();
  const current: Record<PlanTab, Record<string, unknown>[]> = { TUYEN_RIDER: [], TUYEN_PICKUP: [] };
  for (const tab of tabs) {
    const config = PLAN_TABS[tab];
    for (let from = 0; ; from += 1000) {
      const query = admin.from(config.table).select(config.fields.join(","));
      if (tab === "TUYEN_RIDER") query.in("kv", OPERATING_AREAS);
      const { data, error } = await query.not(config.key, "is", null).neq(config.key, "").order(config.key).range(from, from + 999);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as unknown as Record<string, unknown>[];
      current[tab].push(...page);
      if (current[tab].length > MAX_PLAN_ROWS) throw new Error(`Tab ${tab} vượt ${MAX_PLAN_ROWS} dòng. Hãy thu gọn dữ liệu nguồn trước.`);
      if (page.length < 1000) break;
    }
  }
  return current;
}

