# Giờ đến dự kiến của chuyến Linehaul

Cột trạng thái hiển thị ETA của xe đang về hub. Trang ưu tiên ETA SPX còn hiệu lực. Khi cần, trang dùng thời điểm bản ghi GPS cộng thời gian tuyến đường OSRM đã tải để hiển thị quãng đường. Nút **Tính ETA** trong chi tiết dùng cùng quy tắc.

ETA dùng GPS và tọa độ hub hợp lệ, GPS không quá 15 phút và chuyến chưa có mốc đến hoặc rời hub. ETA đã qua hoặc tuyến thiếu thời gian di chuyển được bỏ qua. Ước tính OSRM chưa xét tắc đường, thời gian chờ cổng và hạn chế riêng của xe tải.

OSRM dùng cấu hình `LINEHAUL_ROUTING_URL` của bản đồ Linehaul, mặc định là dịch vụ OSRM công cộng. Danh sách dùng chung kết quả định tuyến với phần quãng đường. Nút trong chi tiết dùng cache tuyến theo GPS và máy chủ kiểm tra đăng nhập, quyền xem chuyến và độ mới của snapshot.
