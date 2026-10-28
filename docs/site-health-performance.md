# Tối ưu Sức khỏe website — 28/10/2026

Đọc trực tiếp web_vital_summary (7 ngày): Dashboard desktop LCP/FCP P75 khoảng 6.660 ms (13 mẫu), TTFB 4.484 ms (15 mẫu); OH LCP 7.255 ms (2 mẫu), TTFB 10.659 ms (3 mẫu); Realtime mobile CLS 0,514 (3 mẫu). Số mẫu còn ít; đây là số liệu trước sửa, không phải số đo sau triển khai.

Thay đổi:
- Profile và app_metadata tài khoản được đọc song song theo từng request. Vẫn xác minh claims, domain, role và app_metadata hiện tại, không thêm cache quyền dùng chung.
- Loading boundary tại root cho phép gửi trạng thái tải trong lúc layout xác thực; không xuất nội dung bảo vệ trước khi kiểm tra quyền xong.
- AI chỉ tải code và lịch sử chat khi người dùng bấm mở. Nút giữ kích thước cũ; click đầu mở ngay panel sau khi chunk sẵn sàng.
- Realtime giữ cùng cấu trúc 5 thẻ khu vực cho lúc chờ và lúc có dữ liệu; chờ cả profile rider và snapshot trước khi kết thúc lần tải đầu.

Hai bản build webpack production riêng trong .next/health-before và .next/health-after. Các JS chunk khởi tạo theo client-reference manifest và rootMainFiles: Dashboard 868 → 844 KiB (gzip 251 → 245); Realtime 877 → 852 KiB (253 → 248); OH 911 → 886 KiB (258 → 253). Đây là kích thước bundle trên đĩa, không phải phép đo thời gian tải trang.

Kiểm tra: build production toàn app, TypeScript, ESLint các file sửa; scripts/verify-auth-load-performance.cjs và scripts/verify-health-ui-performance.cjs. Server production kiểm tra /login=200, /dashboard và /onhold chuyển /login khi chưa đăng nhập, /api/web-vitals=401. Các bản dựng thử không thay localhost:3000 và không phát sinh dữ liệu đo giả.

Chưa đo lại LCP/TTFB/CLS của người dùng đã đăng nhập trên production sau triển khai. Không xóa số liệu cũ hoặc đổi ngưỡng đánh giá để che cảnh báo; bảng Sức khỏe website sẽ cập nhật theo các lượt đo mới trong cửa sổ 7 ngày.
