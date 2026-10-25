# Dashboard — Spotlight

Hiệu ứng trên thẻ sản lượng, tiến độ giao, 5 khu vực và đơn trả quá 48 giờ. Giữ bố cục, màu theo khu, dữ liệu và đường dẫn hiện có.

- Rê chuột: vùng sáng mềm bám vị trí con trỏ, thẻ nâng 3px và bóng nhẹ. Xử lý tọa độ bằng event delegation tại Dashboard, tối đa một lần đọc/ghi layout mỗi animation frame; không set React state theo chuyển động chuột.
- Bàn phím: focus vào link trong thẻ có vùng sáng ở giữa; giữ focus ring của link. Touch không có hover/nâng thẻ.
- Cập nhật: sau một lần tải thành công, so giá trị thực của từng thẻ với lần trước. Chỉ thẻ có thay đổi mới quét sáng một lần trong 760ms, lệch tối đa 140ms giữa các thẻ. Các vùng số nhấc nhẹ 3px, không thay nội dung số để mô phỏng tăng đếm.
- Lần tải đầu và lần đổi phạm vi lập baseline. Polling không đổi số không chạy hiệu ứng. Không thêm request, thay số liệu hoặc tạo animation lặp vô hạn.
- Tiến độ giữ độ rộng đúng dữ liệu, chuyển giữa hai độ rộng trong 500ms.
- `prefers-reduced-motion` tắt hover/nâng thẻ/chuyển độ rộng; các animation đang chạy được hủy khi tùy chọn thay đổi. Dọn listeners, animation frames và animations khi rời Dashboard.

Mã: `components/dashboard/dashboard-spotlight.tsx`, `dashboard-spotlight.module.css` và các điểm đánh dấu trên `dashboard-view.tsx`. Không thay cơ chế đồng bộ hay quyền dữ liệu.
