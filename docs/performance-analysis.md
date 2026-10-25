# Performance — mẫu Phân tích

Trang `/performance` giữ bộ lọc ngày/tuần/tháng, KV, quận, phường, COT rider và tìm kiếm; hai chỉ số chính thể hiện tỷ lệ giao/lấy kèm hoàn thành/được phân. Phần biểu đồ gồm xu hướng, ma trận khu × COT và phân bố hiệu suất rider, tiếp theo là bảng rider có sắp xếp/phân trang.

- Xu hướng: chế độ ngày hiển thị 7 ngày kết thúc tại ngày chọn; tuần/tháng hiển thị toàn bộ kỳ. Mỗi ngày là lần đồng bộ gần nhất đã lưu; không tuyên bố so sánh cùng giờ chốt. Ngày thiếu dữ liệu được ngắt đường, khác với ngày có 0 đơn hoàn thành. Có bảng số liệu và điểm có thể focus bằng bàn phím.
- Ma trận: tổng hợp tất cả rider theo KV và COT rider đã cấu hình, trên kỳ và bộ lọc đang chọn. COT1 gồm COT1, COT1.1 và COT1.2; COT2 là COT2. Mỗi rider đóng góp toàn bộ tổng giao/lấy vào nhóm COT của mình, không suy đoán từ tỷ lệ hoặc thiếu dữ liệu phân tách đơn. Rider chưa có COT hợp lệ giữ trong tổng quan và được chú thích số đơn riêng bên dưới ma trận. Không có mẫu số hiển thị `—`; mọi ô luôn kèm tử số/mẫu số. Bấm tên KV để lọc KV và xóa lọc quận/phường cũ. Phân tách COT theo đơn ở bảng rider hiện có được giữ nguyên.
- Phân bố: mỗi rider được tính một lần với tổng hoàn thành/tổng phân trong kỳ; bỏ riêng rider không có mẫu số giao. Các dải không giao nhau: `<60`, `60–<70`, `70–<80`, `80–<90`, `90–100`, `>100`. Giá trị vượt 100% được giữ riêng và có chú thích đối chiếu, không ép về 100%.
- Tỷ lệ tổng là tỷ lệ của các tổng, không phải trung bình tỷ lệ rider. Các biểu đồ và KPI dùng toàn bộ phạm vi, không dùng trang rider đang mở. KPI vẫn đúng khi người dùng mở trang vượt số trang dữ liệu.
- Không dùng `đã phân − đã giao` để gắn nhãn On Hold. Dữ liệu OH nghiệp vụ tiếp tục ở trang OH Delivery.

Không đổi schema hay cơ chế đồng bộ. Truy vấn phân tích gom theo ngày/khu/rider trong database; trình duyệt chỉ nhận các tổng và histogram, không nhận toàn bộ dữ liệu rider để vẽ biểu đồ.

Kiểm thử: `tests/performance-analysis.test.ts` kiểm tỷ lệ trọng số, mẫu số 0, ngày thiếu và ranh giới histogram. `scripts/verify-performance-analysis.cjs` đọc dữ liệu thật cho ngày/tuần/tháng, kiểm đối chiếu tổng, lọc KV, tìm kiếm rỗng và phân trang vượt giới hạn; không sửa database.
