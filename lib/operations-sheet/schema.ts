export const MAX_PLAN_ROWS = 5000;
export const CLEAR_CELL = "[XOA]";
export const PLAN_TABS = {
  TUYEN_RIDER: {
    table: "riders", key: "rider_code",
    fields: ["rider_code", "full_name", "kv", "cot", "home_district", "pickup_district", "pickup_ward", "point_name", "delivery_district", "delivery_ward", "status"],
    headers: ["Mã rider", "Họ tên", "KV", "COT", "Quận ở", "Quận lấy", "Phường lấy", "Điểm lấy", "Quận giao", "Phường giao", "Trạng thái"],
  },
  TUYEN_PICKUP: {
    table: "pickup_assignments", key: "assignment_key",
    fields: ["assignment_key", "route_name", "cot", "mapped_pickup_point_group", "ward", "district"],
    headers: ["Mã phân công", "Tên tuyến", "COT", "Nhóm điểm lấy", "Phường", "Quận"],
  },
} as const;
export type PlanTab = keyof typeof PLAN_TABS;
export type PlanRow = { tab: PlanTab; row: number; key: string; patch: Record<string, string | null> };
export type PlanIssue = { tab: string; row: number; message: string };
export type PlanChange = PlanRow & { before: Record<string, unknown>; after: Record<string, string | null> };

export function normalizePlanHeader(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").replace(/[_\s]+/g, " ").trim().toLowerCase();
}

export function parsePlanSheets(sheets: Record<string, unknown[][]>) {
  const rows: PlanRow[] = [];
  const issues: PlanIssue[] = [];
  let present = 0;
  for (const tab of Object.keys(PLAN_TABS) as PlanTab[]) {
    const values = sheets[tab];
    if (!values) continue;
    present++;
    const config = PLAN_TABS[tab];
    const header = values[0] ?? [];
    if (config.headers.some((label, col) => normalizePlanHeader(header[col]) !== normalizePlanHeader(label))) {
      issues.push({ tab, row: 1, message: "Sai tiêu đề hoặc thứ tự cột. Hãy dùng file mẫu." });
      continue;
    }
    if (values.length > MAX_PLAN_ROWS + 1) {
      issues.push({ tab, row: 1, message: `Mỗi tab tối đa ${MAX_PLAN_ROWS} dòng dữ liệu.` });
      continue;
    }
    const seen = new Set<string>();
    values.slice(1).forEach((cells, index) => {
      if (!cells.slice(0, config.fields.length).some(value => String(value ?? "").trim())) return;
      const row = index + 2;
      const key = String(cells[0] ?? "").trim();
      if (!key || key === CLEAR_CELL) { issues.push({ tab, row, message: "Thiếu mã định danh." }); return; }
      if (key.length > 200 || seen.has(key)) { issues.push({ tab, row, message: `Mã bị trùng hoặc quá dài: ${key.slice(0, 50)}` }); return; }
      seen.add(key);
      const patch: Record<string, string | null> = {};
      config.fields.slice(1).forEach((field, index) => {
        let value = String(cells[index + 1] ?? "").trim();
        if (!value) return; // Ô trống giữ nguyên dữ liệu trên web.
        if (value.length > 2000) { issues.push({ tab, row, message: `${config.headers[index + 1]} vượt 2000 ký tự.` }); return; }
        if (value === CLEAR_CELL) {
          if (["full_name", "status", "kv", "cot"].includes(field)) issues.push({ tab, row, message: `Không được xóa ${config.headers[index + 1]}.` });
          else patch[field] = null;
          return;
        }
        if (field === "kv") {
          value = value.replace(/\s+/g, "").toUpperCase();
          if (!/^KV[1-5]$/.test(value)) issues.push({ tab, row, message: "KV phải từ KV1 đến KV5." });
        }
        if (field === "cot") {
          value = value.replace(/\s+/g, "").toUpperCase();
          if (!["COT1", "COT2"].includes(value)) issues.push({ tab, row, message: "COT phải là COT1 hoặc COT2." });
        }
        if (field === "status") {
          value = value.toLowerCase();
          if (!["active", "inactive"].includes(value)) issues.push({ tab, row, message: "Trạng thái phải là active hoặc inactive." });
        }
        patch[field] = value;
      });
      rows.push({ tab, row, key, patch });
    });
  }
  if (!present) issues.push({ tab: "", row: 1, message: "Không có tab TUYEN_RIDER hoặc TUYEN_PICKUP." });
  return { rows, issues };
}

export function buildPlanChanges(rows: PlanRow[], current: Record<PlanTab, Record<string, unknown>[]>) {
  const issues: PlanIssue[] = [];
  const changes: PlanChange[] = [];
  const maps = Object.fromEntries((Object.keys(PLAN_TABS) as PlanTab[]).map(tab => [tab, new Map(current[tab].map(row => [String(row[PLAN_TABS[tab].key]), row]))])) as Record<PlanTab, Map<string, Record<string, unknown>>>;
  for (const row of rows) {
    const existing = maps[row.tab].get(row.key);
    if (!existing) { issues.push({ tab: row.tab, row: row.row, message: `Mã ${row.key} chưa có trên web. Hãy tạo hoặc import dữ liệu nguồn trước.` }); continue; }
    const after = Object.fromEntries(Object.entries(row.patch).filter(([field, value]) => (existing[field] ?? null) !== value));
    if (!Object.keys(after).length) continue;
    const before = Object.fromEntries(Object.keys(after).map(field => [field, existing[field] ?? null]));
    changes.push({ ...row, patch: after, before, after });
  }
  return { changes, issues };
}
