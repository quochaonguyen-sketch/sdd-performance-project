import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';
import { PLAN_TABS } from '../../lib/operations-sheet/schema.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'public/templates');
const qa = path.join(root, '.hallmark/route-workbook');
await fs.mkdir(output, { recursive: true });
await fs.mkdir(qa, { recursive: true });
const wb = Workbook.create();
const guide = wb.worksheets.add('HUONG_DAN');
const rider = wb.worksheets.add('TUYEN_RIDER');
const pickup = wb.worksheets.add('TUYEN_PICKUP');
const lists = wb.worksheets.add('DANH_MUC');
const example = wb.worksheets.add('VI_DU');
const navy = '#173B67', blue = '#245C9C', pale = '#FFF6DB', ink = '#263449', muted = '#62748A';

for (const sheet of [guide, rider, pickup, lists, example]) {
  sheet.showGridLines = false;
  sheet.getRange('A1:N35').format.font = { name: 'Arial', size: 11, color: ink };
  sheet.getRange('A1:N35').format.verticalAlignment = 'center';
  sheet.getRange('A1:N35').format.rowHeight = 24;
}
guide.tabColor = navy;
rider.tabColor = blue;
pickup.tabColor = '#A46B16';
guide.getRange('A2').values = [['SDD · QUẢN LÝ TUYẾN']];
guide.getRange('A2').format.font = { name: 'Arial', size: 16, bold: true, color: navy };
guide.getRange('A4:B4').values = [['Bắt đầu', 'Thao tác']];
const instructions = [
  ['1. Lấy dữ liệu', 'Web → Excel / Google Sheet → Dữ liệu web. Tải file chứa mã đang dùng.'],
  ['2. Điền file này', 'Dán giá trị A:K vào TUYEN_RIDER và A:F vào TUYEN_PICKUP. Giữ hàng tiêu đề.'],
  ['3. Chỉnh tuyến', 'Chọn KV, COT, trạng thái; sửa quận, phường, điểm lấy và tên tuyến.'],
  ['4. Kiểm tra mã', 'Cột Kiểm tra mã báo thiếu / trùng mã. Web kiểm tra thêm các giá trị và quyền.'],
  ['5. Nhập Excel', 'Web → Excel / Google Sheet → Excel → Chọn file → Xem trước → Áp dụng.'],
  ['6. Dùng Google Sheets', 'Tải file lên Drive → mở bằng Sheets → Lưu dưới dạng Google Trang tính.'],
  ['7. Kết nối web', 'Chia sẻ Sheet cho email Service Account hiển thị trên web, rồi dán link vào web.'],
  ['8. Đồng bộ Sheets', 'Chọn Google Sheets → Xem trước → Áp dụng. Sheet không tự đẩy khi sửa ô.'],
  ['Ô trống', 'Giữ nguyên giá trị đang có trên web. Xóa dòng trong file không xóa dữ liệu web.'],
  ['Xóa giá trị', 'Nhập [XOA] ở trường tuyến tùy chọn. Không xóa mã, họ tên, KV, COT, trạng thái.'],
  ['Mã định danh', 'Mã rider / Mã phân công lấy từ web. Không sửa mã; không tạo dữ liệu giả.'],
  ['Ghi chú', 'Cột Ghi chú chỉ dùng trong file; web không nhập cột này.'],
  ['Danh mục', 'KV1–KV5, COT1/COT2, active/inactive. Màu vàng nhạt là ô nhập.'],
  ['Phạm vi', '500 dòng mẫu mỗi tab; web nhận tối đa 5.000 dòng/tab và file 5 MB.'],
  ['Lưu ý dữ liệu', 'File trống có chủ đích. Tab VI_DU chỉ minh họa, không được đồng bộ.'],
  ['Ngoài phạm vi', 'File này không chứa điểm danh Attendance, mật khẩu hoặc API key.'],
];
guide.getRange(`A5:B${4 + instructions.length}`).values = instructions;
guide.getRange('A4:B4').format = { fill: navy, font: { name: 'Arial', size: 11, bold: true, color: '#FFFFFF' }, rowHeight: 28 };
guide.getRange('A5:A20').format.font = { name: 'Arial', size: 11, bold: true, color: navy };
guide.getRange('A1:A26').format.columnWidth = 25;
guide.getRange('B1:B26').format.columnWidth = 101;
guide.getRange('B5:B20').format.wrapText = true;
guide.getRange('A5:B20').format.rowHeight = 34;
guide.getRange('A23:B23').values = [['Dữ liệu đã điền', 'Số dòng có mã']];
guide.getRange('A24:A25').values = [['Tuyến rider'], ['Tuyến pickup']];
guide.getRange('B24:B25').formulas = [["=COUNTA('TUYEN_RIDER'!A2:A501)"], ["=COUNTA('TUYEN_PICKUP'!A2:A501)"]];
guide.getRange('B24:B25').format.numberFormat = '0';
guide.getRange('A23:B23').format = { fill: '#E9EFF7', font: { name: 'Arial', size: 11, bold: true, color: navy } };

lists.getRange('A2').values = [['DANH MỤC CHỌN']];
lists.getRange('A2').format.font = { name: 'Arial', size: 16, bold: true, color: navy };
lists.getRange('A4:D4').values = [['KV', 'COT', 'Trạng thái', 'Ý nghĩa']];
lists.getRange('A5:D9').values = [
  ['KV1', 'COT1', 'active', 'Rider đang hoạt động'],
  ['KV2', 'COT2', 'inactive', 'Rider ngừng hoạt động'],
  ['KV3', '', '', ''], ['KV4', '', '', ''], ['KV5', '', '', ''],
];
lists.getRange('A4:D4').format = { fill: navy, font: { name: 'Arial', size: 11, bold: true, color: '#FFFFFF' } };
lists.getRange('A1:C13').format.columnWidth = 20;
lists.getRange('D1:D13').format.columnWidth = 35;
lists.getRange('A13').values = [['Danh mục tham khảo. Web chỉ chấp nhận các giá trị nêu trên.']];
lists.getRange('A13:D13').format.font = { name: 'Arial', size: 11, italic: true, color: muted };

for (const [tab, sheet] of [['TUYEN_RIDER', rider], ['TUYEN_PICKUP', pickup]]) {
  const config = PLAN_TABS[tab];
  const count = config.fields.length;
  const last = String.fromCharCode(64 + count);
  const checkCol = String.fromCharCode(65 + count);
  const noteCol = String.fromCharCode(66 + count);
  const full = sheet.getRange(`A1:${noteCol}501`);
  full.format.font = { name: 'Arial', size: 11, color: ink };
  full.format.rowHeight = 25;
  full.format.verticalAlignment = 'center';
  sheet.getRange(`A1:${noteCol}1`).values = [[...config.headers, 'Kiểm tra mã', 'Ghi chú']];
  sheet.getRange(`A1:${noteCol}1`).format = { fill: navy, font: { name: 'Arial', size: 11, bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center', verticalAlignment: 'center', rowHeight: 30 };
  sheet.getRange(`A2:${last}501`).format.fill = pale;
  sheet.getRange('A2:A501').setNumberFormat('@');
  sheet.getRange('A1:A501').format.columnWidth = tab === 'TUYEN_RIDER' ? 20 : 36;
  sheet.getRange(`B1:${noteCol}501`).format.columnWidth = 24;
  if (tab === 'TUYEN_RIDER') {
    sheet.getRange('B1:B501').format.columnWidth = 28;
    sheet.getRange('C1:D501').format.columnWidth = 12;
    sheet.getRange('H1:H501').format.columnWidth = 32;
    sheet.getRange('C2:C501').dataValidation = { rule: { type: 'list', values: ['KV1', 'KV2', 'KV3', 'KV4', 'KV5'] } };
    sheet.getRange('D2:D501').dataValidation = { rule: { type: 'list', values: ['COT1', 'COT2'] } };
    sheet.getRange('K2:K501').dataValidation = { rule: { type: 'list', values: ['active', 'inactive'] } };
  } else {
    sheet.getRange('C1:C501').format.columnWidth = 12;
    sheet.getRange('C2:C501').dataValidation = { rule: { type: 'list', values: ['COT1', 'COT2'] } };
  }
  sheet.getRange(`${checkCol}2`).formulas = [[`=IF(COUNTA(A2:${last}2)=0,"",IF(A2="","Thiếu mã",IF(COUNTIF($A$2:$A$501,A2)>1,"Trùng mã","")))`]];
  sheet.getRange(`${checkCol}2:${checkCol}501`).fillDown();
  sheet.getRange(`${checkCol}2:${checkCol}501`).format.fill = '#F0F3F8';
  sheet.getRange(`A2:${noteCol}501`).conditionalFormats.addCustom(`LEN($${checkCol}2)>0`, { fill: '#FDE8E7', font: { color: '#9A2626', bold: true } });
  sheet.tables.add(`A1:${noteCol}501`, true, tab === 'TUYEN_RIDER' ? 'RiderRoutes' : 'PickupRoutes');
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(1);
}

example.getRange('A2').values = [['VÍ DỤ ĐIỀN · KHÔNG PHẢI DỮ LIỆU THẬT']];
example.getRange('A2').format.font = { name: 'Arial', size: 16, bold: true, color: navy };
example.getRange('A4:K4').values = [[...PLAN_TABS.TUYEN_RIDER.headers]];
example.getRange('A5:K6').values = [
  ['DEMO_R001', 'Rider minh họa A', 'KV1', 'COT1', 'Quận 1', 'Quận 1', 'Phường Bến Nghé', 'Điểm mẫu A', 'Quận 1', 'Phường Bến Nghé', 'active'],
  ['DEMO_R002', '', 'KV4', 'COT2', '', '', '[XOA]', '', 'Hóc Môn', 'Bà Điểm', ''],
];
example.getRange('A9:F9').values = [[...PLAN_TABS.TUYEN_PICKUP.headers]];
example.getRange('A10:F10').values = [['DEMO_ASSIGNMENT', 'Tuyến minh họa 01', 'COT1', 'Nhóm shop mẫu', 'Phường mẫu', 'Quận mẫu']];
for (const range of ['A4:K4', 'A9:F9']) example.getRange(range).format = { fill: navy, font: { name: 'Arial', size: 11, bold: true, color: '#FFFFFF' } };
example.getRange('A1:K14').format.columnWidth = 25;
example.getRange('C1:C14').format.columnWidth = 13;
example.getRange('A13').values = [['Ô trống = giữ nguyên. [XOA] = xóa trường tuyến tùy chọn. Thay mã DEMO bằng mã thật lấy từ web.']];
example.getRange('A13').format.font = { name: 'Arial', size: 11, italic: true, color: muted };

wb.recalculate();
// Verify formulas respond to edits, then restore the blank template.
rider.getRange('A2:B3').values = [['QA_01', 'Kiểm tra A'], ['QA_01', 'Kiểm tra B']];
wb.recalculate();
if (guide.getRange('B24').values[0][0] !== 2 || rider.getRange('L2').values[0][0] !== 'Trùng mã') throw new Error('Duplicate/count recalculation failed');
rider.getRange('A3').values = [['QA_02']];
wb.recalculate();
if (rider.getRange('L2').values[0][0] !== '') throw new Error('Unique ID recalculation failed');
rider.getRange('A2:K3').clear({ applyTo: 'contents' });
wb.recalculate();
if (guide.getRange('B24').values[0][0] !== 0) throw new Error('Template restoration failed');
const errors = await wb.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!', options: { useRegex: true, maxResults: 10 }, summary: 'Route template formula scan' });
await fs.writeFile(path.join(qa, 'checks.txt'), errors.ndjson);
for (const [sheetName, range] of [['HUONG_DAN', 'A1:B25'], ['TUYEN_RIDER', 'A1:M8'], ['TUYEN_PICKUP', 'A1:H8'], ['DANH_MUC', 'A1:F14'], ['VI_DU', 'A1:K14']]) {
  if (process.argv[2] && process.argv[2] !== sheetName) continue;
  const png = await wb.render({ sheetName, range, scale: 1.4, format: 'png' });
  await fs.writeFile(path.join(qa, `${sheetName}.png`), new Uint8Array(await png.arrayBuffer()));
}
await (await SpreadsheetFile.exportXlsx(wb)).save(path.join(output, 'SDD_Quan_ly_tuyen.xlsx'));
await fs.rename(path.join(output, 'SDD_Quan_ly_tuyen.xlsx.inspect.ndjson'), path.join(qa, 'export-inspect.ndjson')).catch(() => {});
console.log('Created public/templates/SDD_Quan_ly_tuyen.xlsx · 5 sheets · formula checks passed');
