# Chức năng vận hành và file quản lý tuyến

## Các chức năng được mở lại

- Quản lý PUP và thế pick: `/pickup-management`, `/pickup-management?view=replacement`.
- Return đầy đủ: tổng quan, tra cứu / gán đơn, rider trả, phân công COT ở `/return-orders`.
- Ghi chú cá nhân `/notes` và nút ghi chú nhanh toàn ứng dụng.
- Rider gửi yêu cầu tại `/off-registration`. Admin và Leader có quyền Workforce xử lý tại `/team/off-review`.
- Giao việc `/tasks`, theo dõi vi phạm `/violations`.
- Khu vực `/zones`, vẽ tuyến `/zone-builder`.
- Trợ lý AI trên header, cấu hình kết nối AI trong `/settings`.
- Hướng dẫn các API import tại `/imports`.
- Excel / Google Sheet tại `/route-sheet`.

Mở **Lịch rider** từ mục **Workforce**, chọn một khu vực KV1–KV5 để tải lịch riêng của khu vực đó. Sau đó chọn **Theo tuần** hoặc **Theo tháng** và lọc theo rider, quận hoặc COT. Bấm **Đổi khu vực** để quay lại bảng chọn.

## Đăng ký OFF

Supabase 2 lưu lịch rider, đơn đăng ký, quyết định và hàng đợi đồng bộ lịch sang Google Sheet. Hồ sơ rider và phân quyền dùng Supabase chính. Mỗi ngày đăng ký có một dòng và các ngày gửi cùng lượt dùng chung **Mã yêu cầu**.

Duyệt nghỉ cả ngày sẽ lưu quyết định, lịch rider và hàng đợi trong cùng một giao dịch. Từ chối cần lý do. Nghỉ theo ca cần xử lý riêng vì lịch làm/nghỉ lưu theo ngày. Các yêu cầu duyệt trước đây trên Google Sheet có thể dùng **Đưa vào lịch** nếu còn thiếu lịch.

Google Sheet đăng ký cũ là nguồn chuyển dữ liệu. Google Sheet **lịch OFF** vẫn đồng bộ qua các nút trên web hoặc tác vụ gọi `GET /api/attendance/schedule/sync` với `Authorization: Bearer <CRON_SECRET>`. Xem cách chuyển dữ liệu trong [hướng dẫn hai Supabase](onhold-archive.md#lịch-rider).

## File Excel

`public/templates/SDD_Quan_ly_tuyen.xlsx` gồm:

- `HUONG_DAN`: hướng dẫn thao tác và đếm số dòng có mã.
- `TUYEN_RIDER`: mã rider, họ tên, KV, COT, quận ở, quận / phường lấy, điểm lấy, quận / phường giao, trạng thái.
- `TUYEN_PICKUP`: mã phân công, tên tuyến, COT, nhóm điểm lấy, phường, quận.
- `DANH_MUC`: các giá trị KV1–KV5, COT1/COT2, active/inactive.
- `VI_DU`: dữ liệu minh họa, không nhập vào web.

Có 500 dòng nhập mỗi tab, dropdown, bộ lọc, cố định tiêu đề và mã, cảnh báo thiếu / trùng mã. Chỉ các cột dữ liệu trong hai tab tuyến được nhập. Cột kiểm tra mã và ghi chú không nhập.

## Thiết lập database

Chạy SQL trên database của **sdd-performance-project**, không dùng database mẫu chỉ vì có tên tương tự:

1. Nếu chưa có, chạy các schema hiện có cho chức năng được sử dụng: `personal-notes.sql`, `member-tasks.sql`, `rider-violations.sql`, `rider-off-requests.sql`, `pickup-assignments.sql`, `pickup-replacements.sql`, các SQL `return-order-*.sql`.
2. Bảo đảm `riders` có các trường tuyến trong `supabase-rider-fields.sql` và trạng thái active/inactive trong `rider-status.sql`.
3. Chạy `prisma/operations-route-plan.sql` để cài RPC cập nhật tuyến theo transaction.
4. Nếu dùng fetch tồn, làm theo `docs/fetch-ton.md`.

Không cần tạo bảng mới cho file tuyến. RPC chỉ sửa bản ghi đã tồn tại và ghi lịch sử vào `activity_logs`. Function chỉ được gọi bằng service role phía server. Nếu một dòng đã thay đổi sau xem trước, toàn bộ batch được rollback.

## Sử dụng Excel

1. Vào `/route-sheet`, tải **Dữ liệu web** để lấy đúng mã. Chức năng xuất chỉ đưa ra loại tuyến mà tài khoản có quyền.
2. Dán **giá trị** A:K của tab rider và A:F của tab pickup vào file mẫu, bắt đầu từ dòng 2.
3. Sửa thông tin tuyến. Ô trống giữ nguyên; `[XOA]` xóa trường tuyến tùy chọn. Để ngừng rider, nhập `inactive`, không xóa mã.
4. Chọn file `.xlsx` trên web, bấm **Xem trước thay đổi**, kiểm tra trước / sau rồi **Áp dụng**.

Không tạo rider hoặc phân công mới qua file này. Dùng màn Riders / API import để tạo dữ liệu nguồn trước. Không nhập mã giả ở tab VI_DU. Mỗi tab tối đa 5.000 dòng, file tối đa 5 MB. Bản xem trước có chữ ký, gắn với người dùng và dữ liệu, hết hạn sau 10 phút.

## Đưa lên Google Sheets

1. Tải file Excel lên Google Drive, mở bằng Google Sheets rồi chọn **Lưu dưới dạng Google Trang tính**.
2. Trên server, cấu hình `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`. Bật Google Sheets API cho project của Service Account.
3. Chia sẻ file với email đó, quyền Người xem là đủ cho luồng đọc này.
4. Có thể đặt `OPERATIONS_SPREADSHEET_ID` làm file mặc định. Nếu không, dán link / ID vào web khi đọc.
5. Giữ nguyên tên `TUYEN_RIDER`, `TUYEN_PICKUP` và các tiêu đề. Chọn nguồn Google Sheets trên web, xem trước rồi áp dụng.

Luồng này đọc Sheet vào web khi người dùng bấm nút; không tự đồng bộ nền và không ghi ngược vào Sheet. Có thể xuất Excel dữ liệu web bất kỳ lúc nào. Sau khi chuyển đổi file, kiểm tra lại dropdown và công thức trong Google Sheets.

Nguồn API: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchGet

## Kiểm tra

- `node --test tests/operations-sheet.test.ts tests/delivery-inventory.test.ts`
- `node node_modules/typescript/bin/tsc --noEmit`
- Build production: `node node_modules/next/dist/bin/next build --webpack` nếu đang dùng node_modules liên kết từ dự án khác.
- Tạo lại mẫu: `node scripts/artifacts/build-route-workbook.mjs` với runtime artifact-tool đã được cung cấp.

File mẫu được kiểm tra công thức đếm / mã trùng bằng thay đổi đầu vào rồi khôi phục file trống, render kiểm tra cả 5 tab và kiểm tra cấu trúc XLSX. Chưa xác nhận luồng Google Sheets, RPC trên database thật và các màn cần đăng nhập khi chưa có môi trường hoạt động được cấu hình.
