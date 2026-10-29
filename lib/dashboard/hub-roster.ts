import { sheetDateTime } from "./hub-sheet.ts";

const counts = ["planned_people", "actual_people", "actual_fte", "actual_os", "actual_bpo"] as const;
type Count = typeof counts[number];
export function summarizeHubRoster(grid: unknown[][], stationIds: string[], now = new Date()) {
  const headers = grid[0]?.map(v => String(v).trim()) ?? [];
  for (const key of ["station_id", "event_date_iso", "shift_date_iso", "shift", ...counts]) {
    if (!headers.includes(key)) throw Error(`Roster thiếu cột ${key}`);
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(now);
  const seen = new Set<string>();
  const rows = grid.slice(1).filter(r => r.some(v => String(v ?? "").trim())).flatMap(row => {
    const get = (key: string) => String(row[headers.indexOf(key)] ?? "").trim();
    if (!stationIds.includes(get("station_id"))) return [];
    const getDate = (key: string) => sheetDateTime(row[headers.indexOf(key)])?.slice(0,10) ?? get(key);
    const date = getDate("event_date_iso"), shiftDate = getDate("shift_date_iso"), shift = get("shift");
    const validDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
    if (!validDate(date) || !validDate(shiftDate)) throw Error("Roster có ngày không hợp lệ");
    const time = shift.match(/^([01]\d|2[0-3]):([0-5]\d)\s*[-–]\s*([01]\d|2[0-3]):([0-5]\d)$/);
    if (!time) throw Error(`Ca không hợp lệ: ${shift}`);
    const start = Date.parse(`${shiftDate}T${time[1]}:${time[2]}:00+07:00`);
    let end = Date.parse(`${shiftDate}T${time[3]}:${time[4]}:00+07:00`);
    if (end === start) throw Error(`Ca chưa xác định thời lượng: ${shift}`);
    if (end < start) end += 86400000;
    const key = `${get("station_id")}:${shiftDate}:${shift}`;
    if (seen.has(key)) throw Error(`Trùng ca ${shiftDate} ${shift}; chưa tổng hợp`);
    seen.add(key);
    const values = Object.fromEntries(counts.map(key => {
      const raw = get(key), value = raw === "" ? null : Number(raw);
      if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw Error(`Roster có ${key} không hợp lệ`);
      return [key, value];
    })) as Record<Count, number | null>;
    return [{ date, shiftDate, shift, start, end, values, fetchedAt: sheetDateTime(row[headers.indexOf("fetched_at")]) ?? get("fetched_at") }];
  });
  const date = rows.map(r => r.date).filter(d => d <= today).sort().at(-1);
  if (!date) throw Error("Chưa có roster cho ngày hiện tại hoặc trước đó");
  const daily = rows.filter(r => r.date === date);
  const active = rows.filter(r => r.date <= today && r.start <= now.getTime() && now.getTime() < r.end);
  const sum = (selected: typeof rows) => Object.fromEntries(counts.map(key => [key, selected.some(r => r.values[key] === null) ? null : selected.reduce((n,r) => n + r.values[key]!, 0)])) as Record<Count, number | null>;
  return { date, today, checkedAt: now.toISOString(), daily: sum(daily), active: date === today || active.length ? sum(active) : null, activeShifts: active.map(r => ({ shift: r.shift, date: r.shiftDate })), fetchedAt: [...new Set(daily.map(r => r.fetchedAt).filter(Boolean))].sort()[0] ?? null };
}
export type HubRoster = ReturnType<typeof summarizeHubRoster>;
