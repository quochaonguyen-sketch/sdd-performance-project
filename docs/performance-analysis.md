# Performance — mẫu Phân tích

Trang `/performance` giữ bộ lọc ngày/tuần/tháng, KV, quận, phường, COT rider và tìm kiếm; hai chỉ số chính thể hiện tỷ lệ giao/lấy kèm hoàn thành/được phân. Phần biểu đồ gồm xu hướng, ma trận khu × COT và phân bố hiệu suất rider, tiếp theo là bảng rider có sắp xếp/phân trang.

- Xu hướng: chế độ ngày hiển thị 7 ngày kết thúc tại ngày chọn; tuần/tháng hiển thị toàn bộ kỳ. Mỗi ngày là lần đồng bộ gần nhất đã lưu; không tuyên bố so sánh cùng giờ chốt. Ngày thiếu dữ liệu được ngắt đường, khác với ngày có 0 đơn hoàn thành. Có bảng số liệu và điểm có thể focus bằng bàn phím.
- Ma trận: tổng hợp tất cả rider theo KV và COT rider đã cấu hình, trên kỳ và bộ lọc đang chọn. COT1 gồm COT1, COT1.1 và COT1.2; COT2 là COT2. Mỗi rider đóng góp toàn bộ tổng giao/lấy vào nhóm COT của mình, không suy đoán từ tỷ lệ hoặc thiếu dữ liệu phân tách đơn. Rider chưa có COT hợp lệ giữ trong tổng quan và được chú thích số đơn riêng bên dưới ma trận. Không có mẫu số hiển thị `—`; mọi ô luôn kèm tử số/mẫu số. Bấm tên KV để lọc KV và xóa lọc quận/phường cũ. Phân tách COT theo đơn ở bảng rider hiện có được giữ nguyên.
- Phân bố: mỗi rider được tính một lần với tổng hoàn thành/tổng phân trong kỳ; bỏ riêng rider không có mẫu số giao. Các dải không giao nhau: `<60`, `60–<70`, `70–<80`, `80–<90`, `90–100`, `>100`. Giá trị vượt 100% được giữ riêng và có chú thích đối chiếu, không ép về 100%.
- Tỷ lệ tổng là tỷ lệ của các tổng, không phải trung bình tỷ lệ rider. Các biểu đồ và KPI dùng toàn bộ phạm vi, không dùng trang rider đang mở. KPI vẫn đúng khi người dùng mở trang vượt số trang dữ liệu.
- Không dùng `đã phân − đã giao` để gắn nhãn On Hold. Dữ liệu OH nghiệp vụ tiếp tục ở trang OH Delivery.

Không đổi schema hay cơ chế đồng bộ. Truy vấn phân tích gom theo ngày/khu/rider trong database; trình duyệt chỉ nhận các tổng và histogram, không nhận toàn bộ dữ liệu rider để vẽ biểu đồ.

Kiểm thử: `tests/performance-analysis.test.ts` kiểm tỷ lệ trọng số, mẫu số 0, ngày thiếu và ranh giới histogram. `scripts/verify-performance-analysis.cjs` đọc dữ liệu thật cho ngày/tuần/tháng, kiểm đối chiếu tổng, lọc KV, tìm kiếm rỗng và phân trang vượt giới hạn; không sửa database.


Bộ lọc ngày đã gộp thành một ô: bấm mở chọn Một ngày hoặc Khoảng ngày (hai đầu mút đều được tính), giữ lựa chọn nhanh 7 ngày và Trong tháng. Mốc phân Pick Performance là 13:00 theo giờ Việt Nam: <= 13:00 COT1, sau đó COT2. Dấu vàng nhỏ cạnh tên chỉ báo rider có COT lịch 2 nhưng đã pick COT1; tooltip nêu số đơn thực, không đổi COT rider. Tất cả bộ lọc và Excel dùng cùng khoảng ngày đã áp dụng.

Bộ lọc thời gian dùng lịch chọn trực tiếp: bấm ngày bắt đầu rồi ngày kết thúc, tự sắp xếp nếu chọn ngược; chọn cùng ngày hoặc bấm một ngày rồi Áp dụng sẽ xem một ngày. Desktop hiển thị hai tháng, màn hình hẹp một tháng có nút chuyển tháng. Khoảng đã chọn được tô màu; hỗ trợ phím mũi tên/Home/End để di chuyển ngày và Escape để đóng. Kiểm thử lịch gồm năm nhuận, qua tháng/năm, khoảng ngược và giữ các bộ lọc khác.

Cảnh báo Pick chỉ dùng số COT khớp tổng Pick chính thức, cùng quy tắc với ô sản lượng. Pick 0/0 không hiện cảnh báo dù dữ liệu COT lịch sử còn số cũ. Khi xem khoảng ngày hoặc xuất Excel, loại các số COT sai phạm vi ở từng ngày trước khi cộng tổng. `scripts/verify-pickup-warning.cjs` kiểm tra chỉ đọc ba rider từng bị cảnh báo sai trong ngày và khoảng 23–28/10/2026.
