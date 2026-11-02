import { addDays } from "../team/model.ts";
import { OPERATING_AREAS } from "../locations/operating-areas.ts";

export type ReturnHistoryDay = { report_date: string; snapshot_id: string; captured_at: string; station_id: number; total_orders: number; unknown_area_orders: number; capture_count: number };
export type ReturnHistoryGroup = { report_date: string; area: string; district: string; ward: string; total: number; waiting: number; returning_count: number; over5_days: number; returning_over48h: number; unknown_hub_age: number; unknown_returning_start: number };
export type ReturnHistoryData = { days: ReturnHistoryDay[]; groups: ReturnHistoryGroup[] };
const empty = () => ({ total: 0, waiting: 0, returning: 0, over5Days: 0, returningOver48h: 0, unknownHubAge: 0, unknownReturningStart: 0 });
function counts(rows: ReturnHistoryGroup[]) {
  return rows.reduce((n, row) => ({ total: n.total + row.total, waiting: n.waiting + row.waiting, returning: n.returning + row.returning_count,
    over5Days: n.over5Days + row.over5_days, returningOver48h: n.returningOver48h + row.returning_over48h,
    unknownHubAge: n.unknownHubAge + row.unknown_hub_age, unknownReturningStart: n.unknownReturningStart + row.unknown_returning_start }), empty());
}
function change(value: number, before: number | null) {
  return before === null ? null : { delta: value - before, percent: before > 0 ? (value - before) / before * 100 : value === 0 ? 0 : null };
}

export function summarizeReturnHistory(data: ReturnHistoryData, scope: { from: string; to: string; area: string }, today: string) {
  const headers = new Map(data.days.map(day => [day.report_date, day]));
  const groups = data.groups.filter(row => OPERATING_AREAS.includes(row.area as typeof OPERATING_AREAS[number]) && (scope.area === "all" || row.area === scope.area));
  const at = (date: string, area?: string, district?: string) => headers.has(date) ? counts(groups.filter(row => row.report_date === date && (!area || row.area === area) && (!district || row.district === district))) : null;
  const daily = [];
  for (let date = scope.from; date <= scope.to; date = addDays(date, 1)) {
    const header = headers.get(date), value = at(date), previous = at(addDays(date, -1)), partial = date >= today;
    const delta = value ? change(value.total, previous?.total ?? null) : null;
    daily.push({ date, capturedAt: header?.captured_at ?? null, partial, counts: value,
      change: partial ? null : delta, provisionalChange: partial ? delta : null, unknownAreaOrders: header?.unknown_area_orders ?? null });
  }
  const latest = daily.findLast(row => row.counts !== null) ?? null;
  const focusDate = latest?.date ?? null, previousDate = focusDate ? addDays(focusDate, -1) : null;
  const ranked = (area: string, district?: string) => {
    const value = at(focusDate!, area, district)!, previous = previousDate ? at(previousDate, area, district) : null;
    const delta = change(value.total, previous?.total ?? null);
    return { area, ...(district ? { district } : {}), ...value, change: latest?.partial ? null : delta,
      provisionalChange: latest?.partial ? delta : null, sharePct: latest?.counts?.total ? value.total / latest.counts.total * 100 : null };
  };
  const areas = focusDate ? OPERATING_AREAS.filter(area => scope.area === "all" || scope.area === area).map(area => ranked(area)).sort((a, b) => b.total - a.total || a.area.localeCompare(b.area)) : [];
  const districts = new Map<string, { area: string; district: string }>();
  // Include prior-day districts so a complete drop to zero remains visible.
  for (const row of groups.filter(row => row.report_date === focusDate || row.report_date === previousDate)) districts.set(JSON.stringify([row.area, row.district]), { area: row.area, district: row.district });
  const hotspots = focusDate ? [...districts.values()].map(row => ({ ...ranked(row.area, row.district), district: row.district })).sort((a, b) => b.total - a.total || b.over5Days - a.over5Days || a.area.localeCompare(b.area)).slice(0, 15) : [];
  return { focusDate, latest, daily, areas, hotspots,
    definition: "Lưu lần đồng bộ Return đầy đủ cuối cùng của mỗi ngày theo Asia/Ho_Chi_Minh; hiển thị đúng giờ snapshot. Ngày hiện tại tạm tính, Δ tạm so snapshot cuối ngày trước. Ngày thiếu để trống, không điền 0 hoặc so bắc cầu. Giờ snapshot giữa hai ngày có thể khác nhau. Tuổi hàng lịch sử tính tại lúc chụp, không tính lại bằng giờ hiện tại. Δ là chênh lệch tồn, không phải số đã trả thành công hay lượng nhập/xuất. Tổng và tỷ trọng chỉ gồm KV1–KV5; đơn chưa rõ KV ghi riêng. Tổng tính trên toàn bộ nhóm trước khi lấy top 15 quận." };
}
export type ReturnHistoryAnalysis = ReturnType<typeof summarizeReturnHistory>;
