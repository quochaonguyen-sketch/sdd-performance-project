# Lịch sử và đối chiếu Backlog

Trang `/backlog-history` (Operations → Backlog History) dùng cùng quyền xem Pickup/Delivery Backlog. Biểu đồ lớn hiển thị cả hai nguồn theo 24 giờ, có phóng to, biểu đồ biến động giờ liền trước và bảng nhiệt KV1–KV5. Chọn nguồn để phân tích KPI, lọc khu vực/COT, bấm giờ để chọn mốc B. Chọn riêng ngày của mốc A để so sánh khác ngày, hoặc chọn hai giờ cùng ngày; bảng chi tiết gộp khu vực/quận/phường. Chênh lệch là B − A; hai nguồn được đối chiếu riêng, không cộng tồn giữa các thời điểm. Dòng vắng trong một snapshot đã chụp tương ứng 0; thiếu snapshot không được coi là 0. Biểu đồ không nối qua giờ thiếu và không tính biến động nếu thiếu một trong hai giờ liên tiếp.

## Lưu dữ liệu

`backlog_snapshots` giữ nguồn, snapshot gốc, job, thời gian bắt đầu đọc/chốt/lưu, ngày UTC+7, khung 30 phút và tổng distinct shipment. `backlog_snapshot_rows` giữ pivot theo khu vực, quận, phường với COT1/COT2/chưa rõ COT. Chỉ giữ pivot, không nhân bản mã đơn hay địa chỉ khách hàng. Snapshot cũ không bị thay khi bảng tồn hiện tại được ghi đè.

Trigger `archive_completed_backlog` chạy khi `lmhub_fetch_jobs` chuyển sang DONE. Nó ghi pivot sang Supabase archive và kiểm tra tổng trước khi commit lượt công bố tồn ở database chính. Snapshot trùng mã được bỏ qua; khi giao dịch chính phải chạy lại, cùng mã nguồn dùng cùng ID ở archive. Pickup chỉ tính Assigned, distinct shipment và dùng quận từ Coverage/tuyến đã xác nhận. Thiếu địa bàn giữ nhóm Chưa xác định. Lịch sử bắt đầu khi tính năng được cài.

Delivery giữ hàm ghi 6 tham số cũ từ chối snapshot rỗng. Worker chỉ gọi overload 7 tham số với `p_complete=true` khi đã đọc đủ nguồn và không còn dòng unmapped để xác nhận tồn bằng 0. Lỗi nguồn/mapping không xóa tồn hay sinh snapshot 0.

## Chốt theo giờ và mốc riêng từng nguồn

Cron database `sdd-backlog-checkpoints` gọi `enqueue_backlog_checkpoints()` mỗi phút. Ngày/mốc được tính bằng `Asia/Ho_Chi_Minh`; mỗi nguồn có 24 mốc :50. Mốc riêng Delivery: **13:30 / 17:30**; Pickup: **11:15 / 15:30**. Các mốc riêng này thay lịch 16:00/16:30; lịch sử đã chốt trước đó vẫn giữ nguyên. Lịch này độc lập với lịch chu kỳ đang cấu hình ở Data Sources.

Ví dụ lượt đọc bắt đầu từ 11:50 và hoàn tất trước 12:00 chốt đại diện cho giờ 11. Phải bắt đầu và kết thúc trong cửa sổ cuối giờ; lượt kéo sang 12:00 không được gán lại cho giờ 11. Snapshot đã chốt được cố định, các lần đồng bộ thông thường sau đó không thay thế. Nếu chưa có mốc chốt hợp lệ nhưng có snapshot trong giờ, hiển thị snapshot mới nhất dưới nhãn Tạm tính. Giờ trống là thiếu dữ liệu, không phải tồn bằng 0. Hệ thống chỉ dùng lịch sử thực đã lưu, không dựng lại số tồn quá khứ. Hourly RPC trả về 24 điểm và tổng pivot khu vực nhỏ gọn; chỉ hai snapshot được chọn mới tải chi tiết quận/phường. Tự làm mới mỗi 60 giây khi trang đang hiển thị.

Đúng mốc, scheduler xếp hàng lấy nguồn mới hoặc gắn một job chưa bắt đầu/đã bắt đầu sau mốc. Không gắn job đang chạy từ trước mốc. Khi nguồn bận, chờ nguồn rảnh; dùng chung khóa scheduler và quy tắc một job active/source. Một publication vừa xong nhưng parent chưa báo SUCCEEDED vẫn được liên kết qua snapshot đã lưu.

Máy worker cần đang chạy. Mốc giờ quá hạn ở đầu giờ kế tiếp thì MISSED. Lượt lỗi theo giờ có thể thử lại tối đa hai lần trong cửa sổ 10 phút. Bốn mốc riêng yêu cầu bắt đầu sau giờ hẹn và hoàn tất trong 15 phút; lượt đang chạy quá hạn cũng được đánh dấu MISSED. Không chụp dữ liệu hiện tại để giả lập giờ đã lỡ. Nếu có snapshot lịch sử thật thỏa đúng cửa sổ, scheduler có thể liên kết lại snapshot đó. UI tách giờ hẹn và giờ chốt thực tế. Không cần mở trình duyệt để lịch chạy.

Khối **Phường còn tồn** trên Backlog History cho chọn hai giờ chốt theo nguồn, xem KV/quận/phường và số đơn còn tồn, sắp từ nhiều xuống ít. Lọc KV/COT dùng pivot đã lưu, không ghép địa bàn hiện tại. Chỉ hiển thị phường còn tồn >0; snapshot xác nhận zero hiển thị không còn tồn, còn thiếu snapshot không tính thành zero. Khi đủ hai mốc, nút đối chiếu đưa chúng vào bảng A/B theo phường. Đây là so sánh số tồn tại hai thời điểm, không xác nhận cùng một đơn còn tồn qua cả hai mốc. Pickup giữ đúng Assigned chưa lấy, không gồm OH.

Cập nhật riêng lịch mà không cài lại publisher/schema: `node --env-file=.env --env-file=.env.local scripts/apply-backlog-cutoffs.cjs --test`, sau đó bỏ `--test` để cài. Script chỉ thay helper/lịch/validation, giữ pivot và lịch giờ; bỏ các mốc 16:00/16:30 chưa bắt đầu trong tương lai. Kiểm thử SQL: `tests/backlog-cutoffs.integration.sql`.

## Cài đặt và kiểm tra

Database chính lưu `backlog_snapshots` và `backlog_checkpoints`. Database archive lưu `backlog_snapshot_rows` và header phục vụ khóa ngoại. Các RPC hiện có trên database chính lấy pivot qua HTTPS. Khóa API của archive nằm trong Vault với tên `backlog_pivot_archive`. Khi xoay khóa, cập nhật secret đó với cùng cấu trúc JSON `url` và `key`.

Với project mới, cài schema chính bằng `scripts/apply-backlog-history.cjs` và cài `prisma/backlog-snapshot-archive.sql`, `prisma/backlog-pivot-archive.sql` trên project archive. Với nguồn đã có dữ liệu, chạy các bước chuyển sau:

```powershell
node --experimental-strip-types scripts/copy-backlog-snapshots.mts --apply
node --experimental-strip-types scripts/cutover-backlog-pivot.cjs
node --experimental-strip-types scripts/cutover-backlog-pivot.cjs --apply
node --test tests/backlog-history.test.ts
```

Cutover xác minh tổng và nội dung pivot, kiểm tra kết quả API theo giờ và chi tiết của Pickup/Delivery rồi mới commit việc xóa bảng ở nguồn. Lượt chạy mặc định rollback các thay đổi ở database chính. Các bảng và RPC chỉ cấp cho service_role, bảng có RLS; API kiểm tra quyền đăng nhập trước khi đọc.

Đã kiểm tra trực tiếp publication thật của hai nguồn: tổng pivot khớp header; cron hoạt động; kiểm thử lịch trước/đúng/trễ mốc, duplicate, UTC+7, zero, quyền truy cập và tổng hợp/chênh lệch. Các file dữ liệu SQL ở `prisma/backlog-history.sql`; mã worker trong `C:/code/sdd-web-data` cần cùng phiên bản để có trường district và xác nhận empty Delivery.
