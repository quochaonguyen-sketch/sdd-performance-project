export type LostSourceRow = {
  row: number; date: string; shipment: string; status: string; reason: string; reasonType: string;
  result: string; amount: number | null;
};
export type LostEvent = { status: number; at: number; station: number; code?: string; rider?: string };
export type LostLog = { at: number; rider: string; error: string };
export type LostCheck = {
  shipment_id: string;
  tracking: LostEvent[] | null;
  logs: { items: LostLog[]; matchedCount?: number } | null;
};
export type LostRow = LostSourceRow & {
  event: LostEvent | null; eventLabel: string; logs: LostLog[]; logCount: number;
  trackingChecked: boolean; logsChecked: boolean;
};

const text = (value: unknown) => String(value ?? "").trim();
export const lostNameKey = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/đ/g, "d").trim().replace(/\s+/g, " ");
const statusKey = (value: string) => lostNameKey(value).replace(/[^a-z0-9]/g, "");
export const lostSerialEpoch = (serial: number) => Math.round((serial - 25569 - 7 / 24) * 86400);

export type LostGroup = "all" | "pickup" | "not-received" | "shortage" | "other";

export function matchesLostGroup(row: Pick<LostSourceRow, "status" | "reason">, group: LostGroup) {
  if (group === "all") return true;
  const status = statusKey(row.status);
  const reason = lostNameKey(row.reason);
  const pickup = ["pickupdone", "fmhubpickupdone", "fmhubpickuphandedovertostation", "fmhubpickuphandedover", "pickuphandover"].includes(status);
  const notReceived = /\bchua nhan(?: duoc)? hang\b/.test(reason);
  const shortage = /\b(?:thieu hang|rong ruot)\b/.test(reason);
  if (group === "pickup") return pickup;
  if (group === "not-received") return notReceived;
  if (group === "shortage") return shortage;
  return !pickup && !notReceived && !shortage;
}

export function parseLostSheet(grid: unknown[][]): LostSourceRow[] {
  const header = grid[0]?.map(value => text(value).toLowerCase()) ?? [];
  const columns = ["report_date", "station name", "shipment id", "reason", "result", "reason type", "last status", "amount"].map(name => header.indexOf(name));
  if (columns.includes(-1)) throw Error("Tab LOST thiếu cột cần thiết.");
  return grid.slice(1).flatMap((cells, index) => {
    const [rawDate, station, rawShipment, reason, result, reasonType, status, amount] = columns.map(column => cells[column]);
    if (!text(rawShipment) || !/\bSDD-01\b/i.test(text(station))) return [];
    const shipment = text(rawShipment).toUpperCase();
    const date = typeof rawDate === "number" && Number.isFinite(rawDate)
      ? new Date((Math.floor(rawDate) - 25569) * 86400000).toISOString().slice(0, 10) : text(rawDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error(`Ngày báo cáo không hợp lệ ở dòng ${index + 2}.`);
    return [{ row: index + 2, date, shipment, status: text(status), reason: text(reason), reasonType: text(reasonType), result: text(result), amount: typeof amount === "number" && Number.isFinite(amount) ? amount : null }];
  });
}

export function reconcileLostRow(row: LostSourceRow, check?: LostCheck): LostRow {
  const status = statusKey(row.status);
  const events = check?.tracking ?? [];
  const until = Date.parse(`${row.date}T00:00:00+07:00`) / 1000 + 86400;
  const latest = (code: number, through = until) => events.filter(event => event.status === code && event.at < through &&
    (![1, 39].includes(code) || event.station === 4232))
    .sort((a, b) => b.at - a.at)[0];
  const cases: Record<string, [number, string]> = {
    fmhubpickupdone: [39, "Pickup Done"], pickupdone: [39, "Pickup Done"],
    fmhubpickuphandedovertostation: [39, "Pickup Done"],
    delivering: [2, "Delivering"], onhold: [2, "Delivering"],
    delivered: [4, "Delivered"], lmhubreceived: [1, "LMHub Received"],
    socpendingreceive: [7, "SOC Pending Receive"],
  };
  let [code, eventLabel] = cases[status] ?? [0, ""];
  if (!code && /\bchua\s+nhan\b/.test(lostNameKey(row.reason))) [code, eventLabel] = [4, "Delivered"];
  const hold = status === "onhold" ? latest(5) : undefined;
  let event = code ? latest(code, hold ? hold.at + 1 : until) ?? null : null;
  if (event && ![2, 4, 39].includes(event.status)) event = { ...event, rider: undefined, code: undefined };
  const matched = (check?.logs?.items ?? []).filter(log => !event || (log.at > event.at && (!event.rider || lostNameKey(log.rider) !== lostNameKey(event.rider))))
    .sort((a, b) => b.at - a.at);
  const byRider = new Map<string, LostLog>();
  for (const log of matched) if (!byRider.has(lostNameKey(log.rider))) byRider.set(lostNameKey(log.rider), log);
  const logs = [...byRider.values()];
  return { ...row, event, eventLabel, logs, logCount: check?.logs?.matchedCount ?? matched.length, trackingChecked: check?.tracking != null, logsChecked: check?.logs != null };
}
