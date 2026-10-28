Giữ hàng qua đêm tra trạng thái trực tiếp bằng POST `https://spx.shopee.vn/api/fleet_order/order/tracking_list/search`, payload `{count:24,page_no:1,search_id_list:[...]}`. Mỗi batch tối đa 24 mã; đối chiếu đủ mã, không trùng, không nhận bản ghi ngoài danh sách. Không lưu payload SPX, cookie hoặc địa chỉ khách hàng.

Luồng nền nằm trong `C:/code/sdd-web-data/sdd_data/overnight_status.py`, được worker trung tâm khởi động cùng vòng đời. Database cấp lease 10 phút cho từng ngày, tự chọn ngày còn đơn chưa xử lý mỗi 5 phút. Không cần mở trang web. Nút cập nhật tạo yêu cầu tra cứu ngay; trang tự tải dữ liệu mỗi 15 giây khi đang hiển thị. Ngày đã xử lý hết dừng quét tự động, vẫn có thể yêu cầu kiểm tra lại.

SPX: 2 Delivering, 4 Delivered, 5 Onhold; 10/67/72 Returned. Mã 1 là LMHub_Received, chỉ tính Returned khi nhập lại đúng hub sau thời điểm chốt. Mã chưa ánh xạ hiển thị `SPX (mã)`; không tự suy ra Delivered khi mất khỏi feed OH. Danh sách, rider và ghi chú chốt giữ nguyên. Thiếu mã, lỗi cookie/kết nối, hoặc kết quả không hợp lệ giữ toàn bộ trạng thái cũ, báo lỗi và thử lại sau 5 phút. Mốc cập nhật dùng thời điểm bắt đầu đọc SPX, không dùng lúc bấm nút.

Cài `prisma/overnight-status-sync.sql` bằng `scripts/apply-overnight-status-sync.cjs` với env dự án (`--test` chạy SQL integration và rollback). Khởi động lại worker trung tâm sau khi nó hoàn tất tác vụ hiện tại. Nạp code website mới để nhận trạng thái đang chờ/đang chạy/lỗi và tự tải kết quả. Cookie SPX và máy worker phải hoạt động.

Kiểm tra: `tests/overnight-status-sync.integration.sql` (lease, retry, đối chiếu đầy đủ, quyền service_role, bảo toàn dữ liệu); Python `tests/test_overnight_status.py` và `tests/test_onhold_daily.py`. Luồng chốt đêm dùng SPX 2/5 rồi đổi 2 thành mã cutoff nội bộ 1.
