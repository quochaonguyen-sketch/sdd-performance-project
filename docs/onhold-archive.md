# Hai project Supabase cho SDD Operations

Project chính phục vụ đăng nhập, phân quyền, hồ sơ rider, hàng đợi và các chức năng vận hành. On-Hold hôm nay, chi tiết mã đơn và giữ hàng qua đêm đọc từ project này.

Project lưu trữ phục vụ lịch sử trong vòng 93 ngày:

- Báo cáo On-Hold đã chốt, gồm số lượt, khu vực, quận/phường, lý do, giờ và dữ liệu xếp hạng rider.
- Biểu đồ tồn Pickup/Delivery theo giờ và nguồn tương ứng của Phân tích vận hành. Chi tiết snapshot theo mã vẫn ở project chính.
- On-Hold theo COT của Pickup, và lịch sử Return theo ngày trong Phân tích vận hành.
- Lịch sử WH ở chế độ cũ, chỉ sao chép các dòng đã giao. Sau chuyển nguồn, project lưu trữ nhận trực tiếp toàn bộ snapshot HV iPhone từ worker.

Web so phiên bản ở project chính trước khi đọc. Nếu thiếu bản sao, phiên bản lệch hoặc project lưu trữ gặp lỗi, web đọc lại từ project chính. Các ngày cũ hơn 93 ngày tiếp tục đọc từ project chính.

## Cài đặt

1. Chạy `prisma/operations-archive-source.sql` ở **project chính**. Ở **project lưu trữ**, chạy `prisma/onhold-archive.sql` và `prisma/operations-archive.sql`.
2. Trên máy chạy đồng bộ và trên máy chủ web, đặt `SUPABASE_ARCHIVE_URL` và `SUPABASE_ARCHIVE_KEY`. Dùng Secret API key hoặc service role key của **project lưu trữ**. Các biến Supabase chính vẫn trỏ tới project hiện vận hành app.
3. Từ thư mục dự án, chạy `node scripts/sync-onhold-archive.mts --check` để xem số ngày cần sao chép, sau đó chạy `node scripts/sync-onhold-archive.mts` để đồng bộ. Chạy lại `--check` và đối chiếu `pending: 0`.
4. Chạy cùng một tác vụ đồng bộ mỗi ngày sau khi lịch On-Hold chốt ngày. Tác vụ Windows `SDD On-Hold Archive` lúc **00:15 giờ Việt Nam** đã gọi lệnh này và sẽ lấy cả các nguồn mới. Lệnh chỉ chuyển bản chưa sao chép hoặc đã đổi phiên bản.
5. Triển khai mã mới cùng hai biến môi trường trên máy chủ web. So sánh các báo cáo qua cả ngày lịch sử và hôm nay, rồi theo dõi **Egress** của từng organization trong Supabase Usage.

Ở chế độ sao chép lịch sử, bỏ `SUPABASE_ARCHIVE_KEY` rồi khởi động lại web sẽ đưa đường đọc về project chính. Hai project cần thuộc hai organization riêng để có hạn mức egress riêng.

## Chuyển nguồn HV iPhone

1. Cập nhật checkout web và worker Python `sdd-web-data`. Trang WH, AI và SeaTalk dùng chung đường đọc snapshot. Hàng đợi, quyền truy cập và trạng thái gửi SeaTalk ở project chính.
2. Với `SUPABASE_ARCHIVE_URL` và `SUPABASE_ARCHIVE_KEY` đã cấu hình, chạy `node scripts/move-wh-snapshots.mts --apply` trên checkout web. Chạy lại lệnh với tham số mặc định để đối chiếu, kết quả cần có `pending: 0`.
3. Đặt `WH_SUPABASE_ARCHIVE_ENABLED=1` cùng cấu hình project lưu trữ ở web và worker đang chạy. Nếu worker đọc cấu hình từ checkout web trên cùng máy, có thể đặt trong `.env.local` của checkout đó. Bật lại web để nạp biến môi trường. Tác vụ đồng bộ lịch sử dùng cùng biến này để bỏ qua WH.
4. Kiểm tra lượt WH kế tiếp hoàn thành và thời điểm snapshot trên project lưu trữ tăng, đồng thời thời điểm trên project chính giữ nguyên. Đối chiếu trang WH cho hôm nay và một ngày lịch sử.

Sau khi chuyển nguồn, giữ khóa project lưu trữ cho WH. Các ngày phát sinh mới được ghi đầy đủ ở project thứ hai. Nếu cần đưa WH trở lại project chính, sao lưu và đối chiếu các ngày chỉ có ở project thứ hai trước khi đổi cấu hình.

## Lịch rider

Mã web mới dùng Supabase 2 cho lịch, đăng ký OFF và hàng đợi đồng bộ lịch với Google Sheet. Bảng lưu theo tháng `rider_schedule_archive` giữ làm bản lưu cũ. Hồ sơ rider và phiên đăng nhập tiếp tục dùng Supabase chính.

1. Chạy `prisma/rider-schedule-supabase2.sql` tại **Supabase 2** bằng SQL Editor. SQL tạo các bảng riêng tư và RPC cho service role.
2. Kiểm tra cấu hình hai Supabase và các file nguồn `OFF_SCHEDULE_SPREADSHEET_ID`, `OFF_REGISTRATION_SPREADSHEET_ID` trên máy chạy chuyển. Tránh nhập thêm lịch và đăng ký vào nguồn cũ trong lúc đối chiếu và chuyển mã web.
3. Chạy `node scripts/move-rider-schedule.mts --apply` để chuyển lịch, đơn đăng ký, quyết định cũ và hàng đợi. Lệnh chỉ thêm dòng còn thiếu. Lịch từ Supabase chính và cập nhật đang chờ gửi được ưu tiên nếu trùng rider/ngày với Sheet. Đối chiếu lại bằng `node scripts/move-rider-schedule.mts`, kết quả cần có `missing_or_changed: 0`.
4. Triển khai mã web và kiểm tra lần lượt đăng ký, duyệt, xem một khu vực và đồng bộ lịch lên Sheet. Dữ liệu cũ được giữ để đối chiếu.
