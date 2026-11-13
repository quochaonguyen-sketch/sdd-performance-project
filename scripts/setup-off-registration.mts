import { offSheetHeaders, offSheetTabId, offSheetTitle, offStatuses } from "../lib/off-registration/model.ts";
import { offRegistrationSpreadsheetId, registrationSheet } from "../lib/off-registration/sheets.ts";

const id = offRegistrationSpreadsheetId();
if (!id) throw Error("Cần cấu hình OFF_REGISTRATION_SPREADSHEET_ID bằng file riêng.");
const google = await registrationSheet(id);
const metadata = await google("?fields=sheets(properties(sheetId,title))");
if (!metadata.ok) throw Error(`Chưa đọc được Google Sheet (${metadata.status}).`);
const { sheets } = await metadata.json() as { sheets: { properties: { title: string; sheetId: number } }[] };
const existing = sheets.find(sheet => sheet.properties.title === offSheetTitle)?.properties;
if (existing) {
  const response = await google(`/values/${encodeURIComponent(`'${offSheetTitle}'!A1:M1`)}`);
  const { values } = await response.json() as { values?: string[][] };
  if (!response.ok || existing.sheetId !== offSheetTabId || !offSheetHeaders.every((header, i) => values?.[0]?.[i] === header)) throw Error("Tab Đăng ký OFF đã tồn tại với cấu trúc khác.");
  console.log(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=${existing.sheetId}`);
} else {
  const sheetId = offSheetTabId;
  const header = { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: offSheetHeaders.length };
  const statusColumn = { sheetId, startRowIndex: 1, startColumnIndex: 11, endColumnIndex: 12 };
  const palette = [
    { backgroundColor: { red: 1, green: .95, blue: .81 }, foregroundColor: { red: .46, green: .28, blue: 0 } },
    { backgroundColor: { red: .86, green: .96, blue: .91 }, foregroundColor: { red: 0, green: .35, blue: .24 } },
    { backgroundColor: { red: 1, green: .90, blue: .90 }, foregroundColor: { red: .61, green: .14, blue: .20 } },
  ];
  const response = await google(":batchUpdate", { requests: [
    { addSheet: { properties: { sheetId, title: offSheetTitle, gridProperties: { frozenRowCount: 1, frozenColumnCount: 1, hideGridlines: true, rowCount: 1000, columnCount: offSheetHeaders.length } } } },
    { updateCells: { range: header, fields: "userEnteredValue,userEnteredFormat", rows: [{ values: offSheetHeaders.map(stringValue => ({
      userEnteredValue: { stringValue }, userEnteredFormat: { backgroundColor: { red: .09, green: .17, blue: .28 },
        textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, verticalAlignment: "MIDDLE" },
    })) }] } },
    { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 34 }, fields: "pixelSize" } },
    ...[235, 151, 106, 98, 174, 92, 65, 132, 96, 250, 220, 115, 250].map((pixelSize, startIndex) => ({ updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex, endIndex: startIndex + 1 }, properties: { pixelSize }, fields: "pixelSize",
    } })),
    ...[{ column: 1, type: "DATE_TIME", pattern: "dd/mm/yyyy hh:mm:ss" }, { column: 2, type: "DATE", pattern: "dd/mm/yyyy" }].map(({ column, type, pattern }) => ({
      repeatCell: { range: { sheetId, startRowIndex: 1, startColumnIndex: column, endColumnIndex: column + 1 },
        cell: { userEnteredFormat: { numberFormat: { type, pattern } } }, fields: "userEnteredFormat.numberFormat" },
    })),
    { setBasicFilter: { filter: { range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: offSheetHeaders.length } } } },
    { setDataValidation: { range: statusColumn, rule: { condition: { type: "ONE_OF_LIST", values: offStatuses.map(userEnteredValue => ({ userEnteredValue })) }, strict: true, showCustomUi: true } } },
    ...offStatuses.map((userEnteredValue, index) => ({ addConditionalFormatRule: { index, rule: { ranges: [statusColumn], booleanRule: {
      condition: { type: "TEXT_EQ", values: [{ userEnteredValue }] }, format: { backgroundColor: palette[index].backgroundColor, textFormat: { foregroundColor: palette[index].foregroundColor, bold: true } },
    } } } })),
  ] });
  if (!response.ok) {
    const { error } = await response.json().catch(() => ({}));
    throw Error(`Chưa tạo được tab Đăng ký OFF (${response.status}) ${error?.message ?? ""}`);
  }
  console.log(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=${sheetId}`);
}
