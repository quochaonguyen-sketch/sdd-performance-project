# Nhật ký người dùng và quyền sửa rider theo KV

Đã áp dụng schema `prisma/user-activity-and-rider-scope.sql` trên database website.

## Sử dụng

- Admin mở `/settings`, bật **Thêm / sửa Rider** và chọn **KV được sửa rider** cho tài khoản. Ví dụ Member/FTE chọn riêng KV1. Không chọn KV nào nghĩa là không được sửa rider. Admin luôn quản lý toàn bộ KV.
- `/user-activity` là trang riêng cho admin: đăng nhập Google, đăng xuất, truy cập trang, thêm/sửa/xóa dữ liệu và thay đổi quyền. Có bộ lọc thành viên, loại hoạt động, ngày theo giờ Việt Nam, phân trang và chi tiết thay đổi.
- Nhật ký bắt đầu từ lúc bật tính năng. Không tạo lại lịch sử cũ. Truy cập trang được gửi từ trình duyệt khi trang đã mở (không tính prefetch); thao tác sửa database được ghi bởi trigger trong cùng giao dịch.

## Bảo vệ

- Metadata `app_metadata.rider_edit_areas` chỉ do admin cập nhật, không dùng `user_metadata` để cấp quyền. Quyền và scope được đọc mới trong database lúc ghi.
- Trigger rider kiểm tra cả KV hiện tại và KV sau cập nhật, chặn tạo/chuyển/xóa ngoài quyền, bao gồm import/upsert và RPC. Các API kiểm tra sớm trước upload ảnh hoặc xử lý liên quan.
- Xóa rider và gỡ liên kết lịch sử nằm trong một RPC/giao dịch có khóa hàng. Cập nhật role + app metadata + log cấp quyền cũng nguyên tử.
- API import dùng IMPORT_SECRET và worker service-role không có người dùng vẫn chạy theo quyền hệ thống cũ. Quyền theo KV áp dụng với người dùng web; không tự cấp KV cho thành viên cũ. Cần admin gán KV rõ ràng.
- Khi ghi service-role trong request web, actor header được server lấy từ session đã xác minh, không chuyển tiếp actor header từ client. Browser gọi database trực tiếp dùng auth.uid thay vì header tự khai.
- Trigger audit ghi các thay đổi public có actor; bỏ qua tự ghi bảng nhật ký để tránh lặp. Những lần ghi hệ thống không có actor vẫn dùng activity_logs/import logs hiện có. Khi thêm bảng public mới, chạy lại script để gắn trigger audit.
- Bảng user_activity_logs không cấp quyền cho anon/authenticated. API đọc chỉ cho admin. Service API không được update/delete/truncate lịch sử. JSON phức tạp, raw_data, mật khẩu, token, khóa và nội dung nhạy cảm được che trong log. Không lưu toàn bộ request body, cookie hay header Authorization.
- Ghi lại toàn bộ tab Google Sheet chỉ cho admin hoặc người có đủ năm KV, để tài khoản giới hạn KV không ghi đè dữ liệu ngoài quyền.

## Kiểm chứng

```powershell
node --test tests/rider-area-permissions.test.ts tests/operations-permissions.test.ts
node --env-file=.env --env-file=.env.local scripts/admin-audit-db.cjs tests/user-activity-and-scope.integration.sql --test
```

Kiểm thử database tạo fixture trong transaction và rollback toàn bộ: sửa KV1 được phép; KV2/transfer/insert/delete bị chặn; giả actor header không vượt quyền; thu hồi quyền có hiệu lực với JWT cũ; log chứa actor và trước/sau, không lộ JSON nhạy cảm; chỉ admin cập nhật quyền; nhật ký không thể giả/xóa qua tài khoản thường. API chưa đăng nhập trả 401; trang được chuyển về login. TypeScript toàn repo còn lỗi geojson ở phần bản đồ không thuộc thay đổi này.
