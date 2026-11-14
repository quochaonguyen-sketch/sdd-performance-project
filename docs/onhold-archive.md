# Hai project Supabase cho SDD Operations

Project chính phục vụ đăng nhập, phân quyền, hồ sơ rider, các chức năng vận hành và toàn bộ chiều ghi từ worker. On-Hold hôm nay, chi tiết mã đơn và giữ hàng qua đêm đọc từ project này.

Project lưu trữ phục vụ lịch sử trong vòng 93 ngày:

- Báo cáo On-Hold đã chốt, gồm số lượt, khu vực, quận/phường, lý do, giờ và dữ liệu xếp hạng rider.
- Biểu đồ tồn Pickup/Delivery theo giờ và nguồn tương ứng của Phân tích vận hành. Chi tiết snapshot theo mã vẫn ở project chính.
- On-Hold theo COT của Pickup, và lịch sử Return theo ngày trong Phân tích vận hành.
- Lịch sử WH, chỉ sao chép các dòng đã giao mà trang WH thực sự hiển thị.

Web so phiên bản ở project chính trước khi đọc. Nếu thiếu bản sao, phiên bản lệch hoặc project lưu trữ gặp lỗi, web đọc lại từ project chính. Các ngày cũ hơn 93 ngày tiếp tục đọc từ project chính.

## Cài đặt

1. Chạy `prisma/operations-archive-source.sql` ở **project chính**. Ở **project lưu trữ**, chạy `prisma/onhold-archive.sql` và `prisma/operations-archive.sql`.
2. Trên máy chạy đồng bộ và trên máy chủ web, đặt `SUPABASE_ARCHIVE_URL` và `SUPABASE_ARCHIVE_KEY`. Dùng Secret API key hoặc service role key của **project lưu trữ**. Các biến Supabase chính vẫn trỏ tới project hiện vận hành app.
3. Từ thư mục dự án, chạy `node scripts/sync-onhold-archive.mts --check` để xem số ngày cần sao chép, sau đó chạy `node scripts/sync-onhold-archive.mts` để đồng bộ. Chạy lại `--check` và đối chiếu `pending: 0`.
4. Chạy cùng một tác vụ đồng bộ mỗi ngày sau khi lịch On-Hold chốt ngày. Tác vụ Windows `SDD On-Hold Archive` lúc **00:15 giờ Việt Nam** đã gọi lệnh này và sẽ lấy cả các nguồn mới. Lệnh chỉ chuyển bản chưa sao chép hoặc đã đổi phiên bản.
5. Triển khai mã mới cùng hai biến môi trường trên máy chủ web. So sánh các báo cáo qua cả ngày lịch sử và hôm nay, rồi theo dõi **Egress** của từng organization trong Supabase Usage.

Có thể quay lại một project bằng cách bỏ `SUPABASE_ARCHIVE_KEY` trên máy chủ web và khởi động lại. Bản gốc ở project chính giúp đối chiếu và quay lại nguồn chính. Hai project cần thuộc hai organization riêng để có hạn mức egress riêng.
