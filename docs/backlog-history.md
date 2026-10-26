# Lịch sử và đối chiếu Backlog

Trang `/backlog-history` (Operations → Backlog History) dùng cùng quyền xem Pickup/Delivery Backlog. Biểu đồ lớn hiển thị cả hai nguồn theo 24 giờ, có phóng to, biểu đồ biến động giờ liền trước và bảng nhiệt KV1–KV5. Chọn nguồn để phân tích KPI, lọc khu vực/COT, bấm giờ để chọn mốc B. Chọn riêng ngày của mốc A để so sánh khác ngày, hoặc chọn hai giờ cùng ngày; bảng chi tiết gộp khu vực/quận/phường. Chênh lệch là B − A; hai nguồn được đối chiếu riêng, không cộng tồn giữa các thời điểm. Dòng vắng trong một snapshot đã chụp tương ứng 0; thiếu snapshot không được coi là 0. Biểu đồ không nối qua giờ thiếu và không tính biến động nếu thiếu một trong hai giờ liên tiếp.

## Lưu dữ liệu

`backlog_snapshots` giữ nguồn, snapshot gốc, job, thời gian bắt đầu đọc/chốt/lưu, ngày UTC+7, khung 30 phút và tổng distinct shipment. `backlog_snapshot_rows` giữ pivot theo khu vực, quận, phường với COT1/COT2/chưa rõ COT. Chỉ giữ pivot, không nhân bản mã đơn hay địa chỉ khách hàng. Snapshot cũ không bị thay khi bảng tồn hiện tại được ghi đè.

Trigger `archive_completed_backlog` chạy khi `lmhub_fetch_jobs` chuyển sang DONE, trong cùng giao dịch công bố tồn. Snapshot trùng mã được bỏ qua; tổng header bằng tổng pivot. Pickup chỉ tính Assigned, distinct shipment và dùng quận từ Coverage/tuyến đã xác nhận. Thiếu địa bàn giữ nhóm Chưa xác định. Lịch sử bắt đầu khi tính năng được cài; không tự tạo dữ liệu của các ngày trước.

Delivery giữ hàm ghi 6 tham số cũ từ chối snapshot rỗng. Worker chỉ gọi overload 7 tham số với `p_complete=true` khi đã đọc đủ nguồn và không còn dòng unmapped để xác nhận tồn bằng 0. Lỗi nguồn/mapping không xóa tồn hay sinh snapshot 0.

## Chốt theo giờ và mốc riêng 16:00 / 16:30

Cron database `sdd-backlog-checkpoints` gọi `enqueue_backlog_checkpoints()` mỗi phút. Ngày/mốc được tính bằng `Asia/Ho_Chi_Minh`; mỗi nguồn có 24 mốc :50 và hai mốc riêng 16:00 / 16:30 mỗi ngày. Lịch này độc lập với lịch chu kỳ đang cấu hình ở Data Sources.

Ví dụ lượt đọc bắt đầu từ 11:50 và hoàn tất trước 12:00 chốt đại diện cho giờ 11. Phải bắt đầu và kết thúc trong cửa sổ cuối giờ; lượt kéo sang 12:00 không được gán lại cho giờ 11. Snapshot đã chốt được cố định, các lần đồng bộ thông thường sau đó không thay thế. Nếu chưa có mốc chốt hợp lệ nhưng có snapshot trong giờ, hiển thị snapshot mới nhất dưới nhãn Tạm tính. Giờ trống là thiếu dữ liệu, không phải tồn bằng 0. Hệ thống chỉ dùng lịch sử thực đã lưu, không dựng lại số tồn quá khứ. Hourly RPC trả về 24 điểm và tổng pivot khu vực nhỏ gọn; chỉ hai snapshot được chọn mới tải chi tiết quận/phường. Tự làm mới mỗi 60 giây khi trang đang hiển thị.

Đúng mốc, scheduler xếp hàng lấy nguồn mới hoặc gắn một job chưa bắt đầu/đã bắt đầu sau mốc. Không gắn job đang chạy từ trước mốc. Khi nguồn bận, chờ nguồn rảnh; dùng chung khóa scheduler và quy tắc một job active/source. Một publication vừa xong nhưng parent chưa báo SUCCEEDED vẫn được liên kết qua snapshot đã lưu.

Máy worker cần đang chạy. Mốc giờ quá hạn ở đầu giờ kế tiếp thì MISSED. Lượt lỗi có thể thử lại tối đa hai lần trong cửa sổ 10 phút. Hai mốc riêng vẫn cho bắt đầu trong 15 phút như trước. Không chụp dữ liệu hiện tại để giả lập giờ đã lỡ. UI tách giờ hẹn và giờ chốt thực tế. Không cần mở trình duyệt để lịch chạy.

## Cài đặt và kiểm tra

Theo cấu trúc SQL bootstrap hiện có của repository:

```powershell
node --env-file=.env --env-file=.env.local scripts/apply-backlog-history.cjs
node --env-file=.env --env-file=.env.local scripts/apply-backlog-history.cjs --test
node --test tests/backlog-history.test.ts
```

Script kiểm tra DATABASE_URL trỏ đúng project của website, khóa theo thứ tự của worker và cài trong một giao dịch. Nó bổ sung cột district cho Pickup và cập nhật publisher tương thích dữ liệu cũ thiếu cột này. Test SQL luôn rollback fixture, không giữ lịch/job thử. Các bảng/RPC chỉ cấp service_role, có RLS; API kiểm tra đăng nhập và quyền trước khi đọc.

Đã kiểm tra trực tiếp publication thật của hai nguồn: tổng pivot khớp header; cron hoạt động; kiểm thử lịch trước/đúng/trễ mốc, duplicate, UTC+7, zero, quyền truy cập và tổng hợp/chênh lệch. Các file dữ liệu SQL ở `prisma/backlog-history.sql`; mã worker trong `C:/code/sdd-web-data` cần cùng phiên bản để có trường district và xác nhận empty Delivery.
