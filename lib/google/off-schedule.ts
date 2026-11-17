import { createPrivateKey, createSign } from "node:crypto";
import type { RiderScheduleStatus } from "../attendance/statuses.ts";

export type GoogleScheduleStatus = "" | RiderScheduleStatus;

export type GoogleScheduleUpdate = {
  rider_code: string;
  rider_name: string;
  work_date: string;
  status: GoogleScheduleStatus;
};

export const OFF_SCHEDULE_HEADERS = ["Mã rider", "Họ tên rider", "Ngày", "Trạng thái"] as const;
export const OFF_SCHEDULE_LABELS: Record<Exclude<GoogleScheduleStatus, "" | "ON">, string> = {
  OFF_WEEKLY: "OFF tuần",
  OFF_APPROVED: "OFF có xin phép",
  OFF_UNEXPECTED: "OFF đột xuất",
  WORKING_REST_DAY: "OFF nhưng không OFF",
  NO_PICKUP: "Không đi pick",
  NO_DELIVERY: "Không đi giao",
  OFF_HOLIDAY: "OFF lễ",
  SUPPORT: "Đi hỗ trợ",
  APP_LOCKED: "Khóa app",
};

const normalizeLabel = (value: unknown) => String(value ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").trim();
const sheetLabels = new Map(Object.entries(OFF_SCHEDULE_LABELS).map(([status, label]) => [normalizeLabel(label), status as RiderScheduleStatus]));
sheetLabels.set("off", "OFF_WEEKLY").set("off co phep", "OFF_APPROVED").set("off phep", "OFF_APPROVED");
export const offScheduleStatus = (label: unknown) => sheetLabels.get(normalizeLabel(label)) ?? null;

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export function cleanGoogleCredential(value: string | undefined) {
  let clean = value?.trim() ?? "";
  if (clean.endsWith(",")) clean = clean.slice(0, -1).trim();
  if (
    (clean.startsWith('"') && clean.endsWith('"')) ||
    (clean.startsWith("'") && clean.endsWith("'"))
  ) {
    clean = clean.slice(1, -1);
  }
  return clean.replace(/\\n/g, "\n").trim();
}

export function extractSpreadsheetId(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return null;
  return text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1]
    ?? (text.match(/^[a-zA-Z0-9-_]+$/)?.[0] ?? null);
}

export function resolveOffScheduleSpreadsheetId(sheetUrl?: string | null) {
  const configuredId = extractSpreadsheetId(cleanGoogleCredential(process.env.OFF_SCHEDULE_SPREADSHEET_ID));
  if (!configuredId) return null;
  if (sheetUrl?.trim() && extractSpreadsheetId(sheetUrl) !== configuredId) {
    throw new Error("Link không khớp với file Google Sheet lịch rider đã cấu hình.");
  }
  return configuredId;
}

export async function googleSheetsAccessToken(signal?: AbortSignal) {
  const email = cleanGoogleCredential(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const privateKey = cleanGoogleCredential(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
  if (!email || !privateKey) {
    throw new Error("Chưa cấu hình Google Service Account trên máy chủ");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;

  let key;
  try {
    key = createPrivateKey(privateKey);
  } catch {
    throw new Error("Private key của Google Service Account không đúng định dạng");
  }

  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${base64Url(signer.sign(key))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
    signal: signal ?? AbortSignal.timeout(12_000),
  });
  const result = await response.json().catch(() => null) as {
    access_token?: string;
    error_description?: string;
  } | null;
  if (!response.ok || !result?.access_token) {
    throw new Error(result?.error_description ?? "Không thể xác thực Google Service Account");
  }
  return result.access_token;
}

export function parseOffScheduleDate(value: unknown, fallbackYear = new Date().getFullYear()) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || value >= 2_958_466) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000).toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  const iso = text.match(/^(\d{4})[-/]([01]?\d)[-/]([0-3]?\d)$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const vi = text.match(/^([0-3]?\d)[-/]([01]?\d)[-/](\d{4})$/);
  if (vi) return `${vi[3]}-${vi[2].padStart(2, "0")}-${vi[1].padStart(2, "0")}`;
  const viShort = text.match(/^([0-3]?\d)[-/]([01]?\d)$/);
  if (viShort) {
    return `${fallbackYear}-${viShort[2].padStart(2, "0")}-${viShort[1].padStart(2, "0")}`;
  }
  return null;
}

async function googleJson<T>(response: Response, fallback: string) {
  const result = await response.json().catch(() => null) as (T & { error?: { message?: string } }) | null;
  if (!response.ok) {
    const message = result?.error?.message ?? fallback;
    if (response.status === 403) {
      throw new Error(
        `${message}. Hãy chia sẻ quyền Editor cho Google Service Account của hệ thống.`,
      );
    }
    throw new Error(message);
  }
  return result;
}

async function readOffRows(baseUrl: string, headers: Record<string, string>, signal?: AbortSignal) {
  const response = await fetch(
    `${baseUrl}/${encodeURIComponent("'OFF'!A:D")}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
    { headers, cache: "no-store", signal: signal ?? AbortSignal.timeout(20_000) },
  );
  const data = await googleJson<{ values?: unknown[][] }>(response, "Google Sheets API từ chối đọc tab OFF");
  if (!data) throw Error("Không đọc được tab OFF.");
  return data.values ?? [];
}

export function assertOffScheduleHeaders(row: unknown[] | undefined) {
  if (!OFF_SCHEDULE_HEADERS.every((label, index) => row?.[index] === label)) {
    throw Error("Tab OFF cần đúng tiêu đề Mã rider, Họ tên rider, Ngày và Trạng thái.");
  }
}

export async function readOffScheduleKeys(spreadsheetId: string, from: string, to: string, signal: AbortSignal) {
  const token = await googleSheetsAccessToken(signal);
  const rows = await readOffRows(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values`, { Authorization: `Bearer ${token}` }, signal);
  const years = new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))]);
  const keys = new Set<string>();
  for (const row of rows.slice(1)) {
    const code = String(row[0] ?? "").trim();
    if (!code) continue;
    for (const year of years) {
      const day = parseOffScheduleDate(row[2], year);
      if (day && day >= from && day <= to) keys.add(`${code}|${day}`);
    }
  }
  return keys;
}

export async function readOffScheduleHistory(spreadsheetId: string, year: number, signal: AbortSignal) {
  const token = await googleSheetsAccessToken(signal);
  const rows = await readOffRows(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values`, { Authorization: `Bearer ${token}` }, signal);
  const schedule = new Map<string, { rider_code: string; work_date: string; status: string }>();
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const rider_code = String(row[0] ?? "").trim();
    if (!rider_code || !String(row[3] ?? "").trim()) continue;
    const work_date = parseOffScheduleDate(row[2], year);
    const status = offScheduleStatus(row[3]);
    if (!work_date || !status || !Number.isFinite(Date.parse(work_date)) ||
      new Date(work_date).toISOString().slice(0, 10) !== work_date) { skipped++; continue; }
    schedule.set(`${rider_code}|${work_date}`, { rider_code, work_date, status });
  }
  return { rows: [...schedule.values()], skipped };
}

export async function syncScheduleUpdatesToGoogleSheet(
  spreadsheetId: string,
  updates: GoogleScheduleUpdate[],
  signal?: AbortSignal,
) {
  const token = await googleSheetsAccessToken(signal);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values`;
  const rows = await readOffRows(baseUrl, headers, signal);
  assertOffScheduleHeaders(rows[0]);
  const rowNumbersByKey = new Map<string, number[]>();
  const blankRowNumbers: number[] = [];

  // Fallback year for short dates like "1/9" without year
  const fallbackYear = updates[0] ? Number(String(updates[0].work_date).slice(0, 4)) : new Date().getFullYear();
  rows.forEach((row, index) => {
    if (index > 0 && !row.slice(0, 4).some((cell) => String(cell ?? "").trim())) {
      blankRowNumbers.push(index + 1);
      return;
    }
    const riderCode = String(row[0] ?? "").trim();
    const workDate = parseOffScheduleDate(row[2], fallbackYear);
    if (!riderCode || !workDate) return;
    const key = `${riderCode}|${workDate}`;
    const rowNumbers = rowNumbersByKey.get(key) ?? [];
    rowNumbers.push(index + 1);
    rowNumbersByKey.set(key, rowNumbers);
  });

  const latestByKey = new Map(
    updates.map((item) => [`${item.rider_code}|${item.work_date}`, item]),
  );
  const data: Array<{ range: string; majorDimension: "ROWS"; values: (string | number)[][] }> = [];
  const appendRows: (string | number)[][] = [];
  const clearRanges: string[] = [];
  let addedRows = 0;

  for (const [key, item] of latestByKey) {
    const rowNumbers = rowNumbersByKey.get(key) ?? [];
    if (!item.status || item.status === "ON") {
      clearRanges.push(...rowNumbers.map((rowNumber) => `'OFF'!A${rowNumber}:D${rowNumber}`));
      continue;
    }

    const values = [
      item.rider_code,
      item.rider_name,
      Date.parse(item.work_date) / 86_400_000 + 25_569,
      OFF_SCHEDULE_LABELS[item.status],
    ];
    const [firstRow, ...duplicateRows] = rowNumbers;
    if (firstRow) {
      data.push({
        range: `'OFF'!A${firstRow}:D${firstRow}`,
        majorDimension: "ROWS",
        values: [values],
      });
      clearRanges.push(...duplicateRows.map((rowNumber) => `'OFF'!A${rowNumber}:D${rowNumber}`));
    } else {
      const blankRow = blankRowNumbers.pop();
      if (blankRow) {
        data.push({
          range: `'OFF'!A${blankRow}:D${blankRow}`,
          majorDimension: "ROWS",
          values: [values],
        });
        addedRows += 1;
      } else {
        appendRows.push(values);
      }
    }
  }

  if (appendRows.length) {
    await googleJson(
      await fetch(`${baseUrl}/${encodeURIComponent("'OFF'!A:D")}:append?valueInputOption=RAW&insertDataOption=OVERWRITE`, {
        method: "POST",
        headers,
        body: JSON.stringify({ majorDimension: "ROWS", values: appendRows }),
        cache: "no-store",
        signal,
      }),
      "Google Sheets API từ chối thêm dòng lịch",
    );
  }

  if (data.length) {
    await googleJson(
      await fetch(`${baseUrl}:batchUpdate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ valueInputOption: "RAW", data }),
        cache: "no-store",
        signal,
      }),
      "Google Sheets API từ chối cập nhật lịch",
    );
  }

  if (clearRanges.length) {
    await googleJson(
      await fetch(`${baseUrl}:batchClear`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ranges: clearRanges }),
        cache: "no-store",
        signal,
      }),
      "Google Sheets API từ chối xóa lịch ON",
    );
  }

  return {
    spreadsheet_id: spreadsheetId,
    updated: data.length - addedRows,
    appended: addedRows + appendRows.length,
    cleared: clearRanges.length,
  };
}
