import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";

// Header phai khop headerAliases trong app/api/riders/import/route.ts
// (normalize: khong dau, viet thuong). Cot ID la bat buoc.
const HEADERS = [
  "KV",
  "Quận ở",
  "COT",
  "ID",
  "Họ tên",
  "Quận lấy",
  "Phường lấy",
  "Point name",
  "Quận giao",
  "Phường giao",
  "Status",
];

const SAMPLE_ROWS = [
  ["KV1", "Quận 5", "COT 1", "116429", "LÂM HUỲNH BẢO PHONG", "Quận 5", "Phường 1", "Điểm lấy A", "Quận 6", "Phường 2", "active"],
  ["KV5", "Quận Gò Vấp", "COT 1", "141635", "NGUYỄN VĂN A", "Quận Gò Vấp", "Phường 1", "Điểm lấy B", "Quận 12", "An Phú Đông", "active"],
];

const GUIDE_ROWS = [
  ["HƯỚNG DẪN IMPORT RIDER"],
  [""],
  ["1. XÓA 2 dòng mẫu trong sheet Riders, chỉ giữ lại dòng tiêu đề rồi nhập dữ liệu của bạn."],
  ["2. Cột ID là BẮT BUỘC, duy nhất, không được trùng với ID đã có trong hệ thống."],
  ["3. Cột Status chỉ nhận: active hoặc inactive (mặc định active nếu bỏ trống)."],
  ["4. Cột KV nhận: KV1, KV2, KV3, KV4, KV5, KV6."],
  ["   KV1: Quận 5, Quận 6, Quận 11, Huyện Bình Chánh."],
  ["   KV2: Quận Tân Bình, Quận Phú Nhuận, Thành phố Thủ Đức."],
  ["   KV3: Quận Bình Tân, Quận Tân Phú, Huyện Bình Chánh."],
  ["   KV4: Quận 1, Quận 4, Quận 7, Quận 10."],
  ["5. KHÔNG đổi tên/sửa dòng tiêu đề. File tối đa 10 MB (.xlsx hoặc .xls)."],
];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([HEADERS, ...SAMPLE_ROWS]);
  sheet["!cols"] = [
    { wch: 8 }, // KV
    { wch: 20 }, // Quận ở
    { wch: 10 }, // COT
    { wch: 12 }, // ID
    { wch: 28 }, // Họ tên
    { wch: 20 }, // Quận lấy
    { wch: 16 }, // Phường lấy
    { wch: 20 }, // Point name
    { wch: 20 }, // Quận giao
    { wch: 16 }, // Phường giao
    { wch: 10 }, // Status
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, "Riders");

  const guide = XLSX.utils.aoa_to_sheet(GUIDE_ROWS);
  guide["!cols"] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(workbook, guide, "Hướng dẫn");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="rider-import-mau.xlsx"',
    },
  });
}
