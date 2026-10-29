export function parseHubFc(grid: unknown[][]) {
  const clean = (v: unknown) => String(v ?? "").trim();
  const index = grid.findIndex(row => row.some(v => clean(v) === "Date") && row.some(v => clean(v) === "HCM Total"));
  if (index < 0) throw Error("Không tìm thấy tiêu đề bảng FC");
  const headers = grid[index].map(clean);
  for (const key of ["Date", "Day", "HCM MP", "HCM WH", "HCM Total"]) if (!headers.includes(key)) throw Error(`FC thiếu cột ${key}`);
  const seen = new Set<string>();
  const rows = grid.slice(index + 1).filter(row => row.some(v => clean(v))).map(row => {
    const get = (key: string) => clean(row[headers.indexOf(key)]);
    const date = get("Date").replaceAll("/", "-");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw Error(`Ngày FC không hợp lệ: ${get("Date")}`);
    if (seen.has(date)) throw Error(`FC trùng ngày ${date}; chưa tổng hợp`);
    seen.add(date);
    const count = (key: string) => {
      const raw = get(key);
      if (!raw) return null;
      if (!/^\d+$/.test(raw) && !/^\d{1,3}(,\d{3})+$/.test(raw)) throw Error(`FC có ${key} không hợp lệ tại ${date}`);
      const n = Number(raw.replaceAll(",", ""));
      if (!Number.isSafeInteger(n)) throw Error(`FC có số vượt giới hạn tại ${date}`);
      return n;
    };
    const mp = count("HCM MP"), wh = count("HCM WH"), total = count("HCM Total");
    return { date, day: get("Day"), mp, wh, total, mismatch: mp !== null && wh !== null && total !== null && mp + wh !== total };
  }).sort((a,b) => a.date.localeCompare(b.date));
  if (!rows.length) throw Error("Tab FC chưa có dữ liệu");
  return { rows, checkedAt: new Date().toISOString(), months: [...new Set(rows.map(r => r.date.slice(0,7)))] };
}
export type HubFc = ReturnType<typeof parseHubFc>;
