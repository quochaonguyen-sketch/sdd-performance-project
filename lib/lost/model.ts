export type LostSourceRow = {
  row: number; date: string; shipment: string; status: string; reason: string; reasonType: string;
  result: string; amount: number | null;
  month?: number; region?: string; hub?: string; requestType?: string;
  compensationRate?: number | null; codCogs?: number | null;
};
export type LostEvent = { status: number; at: number; station: number; code?: string; rider?: string };
export type LostLog = { at: number; rider: string; error: string; app?: string };
export type LostCheck = {
  shipment_id: string;
  tracking: LostEvent[] | { events: LostEvent[]; displayStatus: number } | null;
  logs: { items: LostLog[]; matchedCount?: number; latestOperation?: LostLog | null } | null;
};
export type LostRow = LostSourceRow & {
  event: LostEvent | null; eventLabel: string; logs: LostLog[]; logCount: number;
  trackingChecked: boolean; logsChecked: boolean;
  lastStatus?: string | null;
  statusBeforeLost?: string | null;
  operationalStatusBeforeLost?: string | null;
  logSourcesChecked?: boolean;
  incidentType?: "Pickup" | "Lost tại Hub/SOC";
  latestLog?: LostLog | null;
};

const text = (value: unknown) => String(value ?? "").trim();
export const lostNameKey = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/đ/g, "d").trim().replace(/\s+/g, " ");
const statusKey = (value: string) => lostNameKey(value).replace(/[^a-z0-9]/g, "");
export const lostSerialEpoch = (serial: number) => Math.round((serial - 25569 - 7 / 24) * 86400);

export type LostGroup = "all" | "pickup" | "not-received" | "shortage" | "other";

const statusLabels: Record<number, string> = {
  1: "LMHub Received", 2: "Delivering", 4: "Delivered", 5: "On Hold", 7: "SOC Pending Receive",
  11: "Lost", 39: "Pickup Done", 591: "Pickup Handedover",
};

export const lostDisplayStatus = (row: Pick<LostRow, "lastStatus" | "status">) => row.lastStatus ?? row.status;

export function lostLogRole(log: Pick<LostLog, "app" | "rider">) {
  const source = lostNameKey(log.app ?? "Driver APP");
  const operator = lostNameKey(log.rider);
  if (["system", "system operator", "spx system"].includes(operator)) return "Hệ thống";
  if (source === "driver app") return "Rider";
  if (["ops", "ops app", "ops portal", "fms portal", "station app", "hub app", "soc app", "wms", "wms portal"].includes(source)) return "Ops";
  return "Chưa rõ vai trò";
}

export function lostDisplayLogs(row: Pick<LostRow, "latestLog" | "logs">) {
  const latestLog = row.latestLog;
  if (!latestLog || row.logs.some(log => log.at === latestLog.at && log.rider === latestLog.rider && log.app === latestLog.app && log.error === latestLog.error)) return row.logs;
  return [latestLog, ...row.logs];
}

export function matchesLostGroup(row: Pick<LostRow, "status" | "reason" | "incidentType">, group: LostGroup) {
  if (group === "all") return true;
  const status = statusKey(row.status);
  const reason = lostNameKey(row.reason);
  const pickup = row.incidentType === "Pickup" || ["pickupdone", "fmhubpickupdone", "fmhubpickuphandedovertostation", "fmhubpickuphandedover", "pickuphandover", "pickuphandedover"].includes(status);
  const notReceived = /\bchua nhan(?: duoc)? hang\b/.test(reason);
  const shortage = /\b(?:thieu hang|rong ruot)\b/.test(reason);
  if (group === "pickup") return pickup;
  if (group === "not-received") return notReceived;
  if (group === "shortage") return shortage;
  return !pickup && !notReceived && !shortage;
}

export function parseLostSheet(grid: unknown[][]): LostSourceRow[] {
  const header = grid[0]?.map(value => lostNameKey(text(value))) ?? [];
  const compensation = header.includes("spx tracking") || header.includes("ngay chot den bu");
  const names = compensation
    ? ["ngay chot den bu", "hub", "spx tracking", "ly do", "ket qua", "trang thai he thong", "so tien den bu",
      "month", "region", "loai yeu cau", "% den bu", "cod/cogs"]
    : ["report_date", "station name", "shipment id", "reason", "result", "last status", "amount", "reason type"];
  const columns = names.map(name => header.indexOf(name));
  if (columns.includes(-1)) throw Error("Tab LOST thiếu cột cần thiết.");
  return grid.slice(1).flatMap((cells, index) => {
    const [rawDate, station, rawShipment, reason, result, status, amount, monthOrReasonType, region, requestType, rate, codCogs] =
      columns.map(column => cells[column]);
    const hub = text(station);
    if (!text(rawShipment) || !/\bSDD-01\b/i.test(hub)) return [];
    const shipment = text(rawShipment).toUpperCase();
    const date = typeof rawDate === "number" && Number.isFinite(rawDate)
      ? new Date((Math.floor(rawDate) - 25569) * 86400000).toISOString().slice(0, 10) : text(rawDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error(`Ngày báo cáo không hợp lệ ở dòng ${index + 2}.`);
    const row = {
      row: index + 2, date, shipment, hub, status: text(status), reason: text(reason),
      reasonType: compensation ? "" : text(monthOrReasonType), result: text(result), amount: sheetNumber(amount),
    };
    if (!compensation) return [row];

    const month = sheetNumber(monthOrReasonType);
    const rateText = text(rate);
    const percentText = rateText.endsWith("%");
    const compensationRate = percentText
      ? sheetNumber(rateText.slice(0, -1).replace(",", ".")) : sheetNumber(rate);
    return [{
      ...row, month: month !== null && Number.isInteger(month) && month >= 1 && month <= 12 ? month : Number(date.slice(5, 7)),
      region: text(region), requestType: text(requestType), codCogs: sheetNumber(codCogs),
      compensationRate: compensationRate === null ? null : compensationRate / (percentText ? 100 : 1),
    }];
  });
}

function sheetNumber(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?\d+(?:\.\d+)?$/.test(value.trim()))) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function reconcileLostRow(row: LostSourceRow, check?: LostCheck): LostRow {
  const status = statusKey(row.status);
  const tracking = check?.tracking;
  const events = Array.isArray(tracking) ? tracking : tracking?.events ?? [];
  const lastStatus = tracking && !Array.isArray(tracking)
    ? statusLabels[tracking.displayStatus] ?? `SPX ${tracking.displayStatus}` : null;
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
  const lost = status === "lost" || lastStatus === "Lost";
  const lostEvent = latest(11) ?? (lastStatus === "Lost" ? latest(11, Infinity) : undefined);
  const lostAt = lost ? lostEvent?.at ?? until : until;
  const previousStatusEvent = lostEvent && events.reduce<LostEvent | undefined>((previous, event) =>
    event.status !== 11 && event.at < lostEvent.at && (!previous || event.at > previous.at) ? event : previous, undefined);
  const statusBeforeLost = previousStatusEvent ? statusLabels[previousStatusEvent.status] ?? `SPX ${previousStatusEvent.status}` : null;
  const previousOperation = lostEvent && events.reduce<LostEvent | undefined>((previous, event) =>
    event.status !== 11 && statusLabels[event.status] && event.at < lostEvent.at && (!previous || event.at > previous.at) ? event : previous, undefined);
  const operationalStatusBeforeLost = previousOperation ? statusLabels[previousOperation.status] : null;
  const beforeLost = lost ? events.filter(event => event.at <= lostAt && [1, 2, 4, 5, 7, 39, 591].includes(event.status))
    .sort((a, b) => b.at - a.at)[0] : undefined;
  const pickup = matchesLostGroup(row, "pickup") || lastStatus === "Pickup Done" || lastStatus === "Pickup Handedover" ||
    [39, 591].includes(beforeLost?.status ?? 0);
  const incidentType = pickup ? "Pickup" : lost && (beforeLost?.status === 1 || /\bqua han tai (?:hub|soc)\b/.test(lostNameKey(row.reason)))
    ? "Lost tại Hub/SOC" : undefined;
  let [code, eventLabel] = cases[status] ?? [0, ""];
  if (!code && pickup) [code, eventLabel] = [39, "Pickup Done"];
  if (!code && incidentType === "Lost tại Hub/SOC" && beforeLost?.status === 1) [code, eventLabel] = [1, "LMHub Received"];
  if (!code && /\bchua\s+nhan\b/.test(lostNameKey(row.reason))) [code, eventLabel] = [4, "Delivered"];
  const hold = status === "onhold" ? latest(5) : undefined;
  let event = code ? latest(code, hold ? hold.at + 1 : lostAt) ?? null : null;
  if (event && ![2, 4, 39].includes(event.status)) event = { ...event, rider: undefined, code: undefined };
  const allLogs = check?.logs?.items ?? [];
  const logSourcesChecked = check?.logs?.latestOperation !== undefined;
  const latestLog = logSourcesChecked ? check?.logs?.latestOperation ?? null
    : allLogs.reduce<LostLog | null>((newest, log) => !newest || log.at > newest.at ? log : newest, null);
  const matched = allLogs.filter(log => !event || (log.at > event.at && (!event.rider || lostNameKey(log.rider) !== lostNameKey(event.rider))))
    .sort((a, b) => b.at - a.at);
  const byRider = new Map<string, LostLog>();
  for (const log of matched) if (!byRider.has(lostNameKey(log.rider))) byRider.set(lostNameKey(log.rider), log);
  const logs = [...byRider.values()];
  return { ...row, event, eventLabel, lastStatus, statusBeforeLost, operationalStatusBeforeLost, incidentType, latestLog, logs, logSourcesChecked,
    logCount: check?.logs?.matchedCount ?? matched.length,
    trackingChecked: tracking != null, logsChecked: check?.logs != null };
}
