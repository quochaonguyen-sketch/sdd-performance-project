import { createHash } from "node:crypto";
import { extractSpreadsheetId, googleSheetsAccessToken, resolveOffScheduleSpreadsheetId } from "../google/off-schedule.ts";
import { offSheetHeaders, offSheetTabId, offSheetTitle, offShifts, offStatuses, offTypes, type OffRegistration } from "./model.ts";

type Rider = { id: string; rider_code: string; full_name: string; kv: string; cot: string | number | null };

export function offRegistrationSpreadsheetId() {
  const id = extractSpreadsheetId(process.env.OFF_REGISTRATION_SPREADSHEET_ID);
  return id && id !== resolveOffScheduleSpreadsheetId() ? id : null;
}

export function offRegistrationSpreadsheetLink(id: string) {
  return `https://docs.google.com/spreadsheets/d/${id}/edit#gid=${offSheetTabId}`;
}

export async function registrationSheet(id: string) {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;
  const headers = { Authorization: `Bearer ${await googleSheetsAccessToken()}`, "Content-Type": "application/json" };
  async function google(path: string, body?: object) {
    return fetch(`${base}${path}`, { headers, cache: "no-store", signal: AbortSignal.timeout(12_000),
      ...(body ? { method: "POST", body: JSON.stringify(body) } : {}) });
  }
  return google;
}

export async function writeOffRegistration(id: string, input: OffRegistration, rider: Rider) {
  const google = await registrationSheet(id);
  const headerRange = encodeURIComponent(`'${offSheetTitle}'!A1:M1`);
  const metadata = await google(`?ranges=${headerRange}&fields=sheets(properties(sheetId,title),data(rowData(values(userEnteredValue))))`);
  if (!metadata.ok) throw Error("Không đọc được file đăng ký OFF.");
  const { sheets } = await metadata.json() as { sheets: { properties: { title: string; sheetId: number };
    data?: { rowData?: { values?: { userEnteredValue?: { stringValue?: string } }[] }[] }[] }[] };
  const sheet = sheets.find(item => item.properties.title === offSheetTitle && item.properties.sheetId === offSheetTabId);
  if (!sheet) throw Error("Thiếu tab đăng ký OFF.");
  const header = sheet.data?.[0]?.rowData?.[0]?.values;
  if (!offSheetHeaders.every((name, index) => header?.[index]?.userEnteredValue?.stringValue === name)) {
    throw Error("Tab đăng ký OFF có tiêu đề không hợp lệ.");
  }

  const timestamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "medium" }).format(new Date());
  const dateSerial = (value: string) => Date.parse(value) / 86_400_000 + 25569;
  const rows = input.dates.map(date => [input.id, dateSerial(`${timestamp.replace(" ", "T")}Z`), dateSerial(date), rider.rider_code,
    rider.full_name, rider.kv, String(rider.cot ?? ""), offTypes[input.type], offShifts[input.shift], input.reason,
    input.email, offStatuses[0]]);
  const rangeKey = (value: string) => `OFF_${createHash("sha256").update(value).digest("hex")}`;
  const sheetId = sheet.properties.sheetId;
  const range = { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 };
  const claims = [rangeKey(input.id), ...input.dates.map(date => rangeKey(`${rider.id}/${date}`))];
  const result = await google(":batchUpdate", { requests: [
    ...claims.map(key => ({ addNamedRange: { namedRange: { namedRangeId: key, name: key, range } } })),
    { appendCells: { sheetId, fields: "userEnteredValue", rows: rows.map(values => ({ values: values.map(value => ({
      userEnteredValue: typeof value === "number" ? { numberValue: value } : { stringValue: value },
    })) })) } },
  ] }).catch(() => null);
  if (result?.ok) return "saved";
  if (result && result.status !== 400 && result.status !== 409 && result.status < 500) throw Error("Không ghi được yêu cầu OFF vào Google Sheets.");

  // An interrupted response can follow a committed batch. Verify the same submission before reporting failure.
  const check = await google(`/values/${encodeURIComponent(`'${offSheetTitle}'!A1:M`)}?valueRenderOption=UNFORMATTED_VALUE`);
  if (!check.ok) throw Error("Không kiểm tra được kết quả ghi yêu cầu OFF.");
  const { values = [] } = await check.json() as { values?: unknown[][] };
  if (!offSheetHeaders.every((header, index) => values[0]?.[index] === header)) throw Error("Tab đăng ký OFF có tiêu đề không hợp lệ.");
  const requestedDays = new Set(input.dates.map(dateSerial));
  const existing = values.slice(1).filter(row => row[3] === rider.rider_code && requestedDays.has(Number(row[2])));
  const submitted = existing.filter(row => row[0] === input.id && row[7] === offTypes[input.type] && row[8] === offShifts[input.shift]
    && String(row[9] ?? "") === input.reason && row[10] === input.email);
  if (submitted.length === requestedDays.size && new Set(submitted.map(row => Number(row[2]))).size === requestedDays.size) return "saved";
  if (existing.length || values.some(row => row[0] === input.id)) return "duplicate";
  throw Error("Không ghi được yêu cầu OFF vào Google Sheets.");
}
