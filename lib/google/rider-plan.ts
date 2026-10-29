export const RIDER_PLAN_ID = "1gsUhZMc5jLvFizy804gtAan3vtzxmmjKwOvycrj4xZU";
export const RIDER_PLAN_TAB = "Sheet1";

export function parseRiderPlan(grid: unknown[][]) {
  if (grid.length > 5000) throw Error("Sheet vượt 5.000 dòng; chưa đồng bộ.");
  const text = (v: unknown) => String(v ?? "").normalize("NFC").trim();
  const index = grid.findIndex(row => row.some(c => text(c) === "Driver ID") && row.some(c => text(c) === "Tên tài xế"));
  if (index < 0) throw Error("Không tìm thấy tiêu đề Driver ID / Tên tài xế.");
  const headers = grid[index].map(text);
  for (const h of ["Khu vực", "COT", "Quận lấy", "Phường lấy", "Quận giao", "Phường giao"]) if (!headers.includes(h)) throw Error(`Sheet thiếu cột ${h}.`);
  const at = (row: unknown[], h: string) => text(row[headers.indexOf(h)]);
  const counts = new Map<string, number>();
  for (const row of grid.slice(index + 1)) { const id = at(row, "Driver ID"); if (id) counts.set(id, (counts.get(id) ?? 0) + 1); }
  const rows: Array<Record<string, unknown>> = [];
  const issues: Array<{ row: number; rider_code: string; error: string }> = [];
  grid.slice(index + 1).forEach((row, i) => {
    if (!row.some(v => text(v))) return;
    const id = at(row, "Driver ID"), kv = at(row, "Khu vực").replace(/\s/g, "").toUpperCase(), cot = at(row, "COT").replace(/\s/g, "").toUpperCase(), name = at(row, "Tên tài xế");
    const error = !/^\d{3,20}$/.test(id) ? "Driver ID không hợp lệ" : counts.get(id)! > 1 ? "Driver ID trùng; bỏ qua tất cả dòng cùng ID" : !/^KV[1-5]$/.test(kv) ? "Thiếu hoặc sai KV" : !["COT1", "COT2"].includes(cot) ? "Thiếu hoặc sai COT" : !name ? "Thiếu tên tài xế" : null;
    if (error) { issues.push({ row: index + i + 2, rider_code: id, error }); return; }
    const nullable = (h: string) => at(row, h) || null;
    const metadata = Object.fromEntries(["Tuyến Pickup FMS", "Note Pickup", "Phường mới", "Note giao", "NOTE", "BSX RD", "Rider", "Ngày nhận việc", "Trạng thái tuyến"].map(h => [h, nullable(h)]));
    rows.push({ rider_code: id, kv, cot, full_name: name, home_district: nullable("Quận ở"), pickup_district: nullable("Quận lấy"), pickup_ward: nullable("Phường lấy"), delivery_district: nullable("Quận giao"), delivery_ward: nullable("Phường giao"), metadata });
  });
  if (!rows.length) throw Error("Sheet không có rider hợp lệ; giữ nguyên dữ liệu web.");
  return { rows, issues, sourceRows: [...counts.values()].reduce((n, v) => n + v, 0) };
}
