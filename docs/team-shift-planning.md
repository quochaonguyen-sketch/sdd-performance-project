# Ca làm việc và phân tích phân bổ

Trang `/team` có hai tab **Ca làm việc** và **Phân tích ca**. Danh mục khởi tạo 11 mẫu ca, gồm hai đợt nghỉ cho ca 11–20h. Admin có thể thêm/sửa/ẩn mẫu ca, cấu hình giờ nghỉ FTE/BPO, chọn mẫu khi sửa lịch và lưu định biên theo KV, nhóm FTE/BPO, thứ hoặc ngày cụ thể. Các mẫu chưa có giờ nghỉ được đánh dấu và không dùng để tự đề xuất tăng năng lực.

Bản đồ Ngày × Giờ và KV × Giờ sử dụng nhân-giờ quy đổi: trừ khoảng nghỉ, xử lý nửa giờ và ca qua đêm, chia đều Coverage nhiều KV. Một người không bị đếm nguyên người ở nhiều KV. Nhân sự hiện tại được dùng làm nhóm mô phỏng; lịch quá khứ không phải dữ liệu chấm công lịch sử. Ô OFF/phép, ô trống và ca kèm mã nghỉ chưa rõ thời gian không được coi là ca làm việc đầy đủ. Bấm ô bản đồ để xem từng người đóng góp.

Định biên mặc định là mức thử 1 người/KV/giờ từ 07:00 đến trước 23:00, chưa phải SLA hay nhu cầu thực tế. Có thể đặt riêng cho OPS (FTE+BPO), FTE hoặc BPO. Ngày cụ thể ưu tiên hơn quy tắc theo thứ; số 0 được giữ. Bản đồ tổng nhiều KV ưu tiên hiển thị thiếu ở từng KV, không lấy dư của KV khác bù số thiếu để che mất cảnh báo.

Sản lượng Delivery/Pickup theo ngày chỉ là tham chiếu từ các bảng đã đồng bộ. Chưa có chuỗi đơn đầy đủ theo giờ nên không suy diễn sản lượng ngày thành nhu cầu giờ. Giờ nghỉ mẫu là cấu hình mô phỏng có thể chỉnh, không phải xác nhận thời gian nghỉ của từng người.

Gợi ý là thuật toán cải thiện từng bước, giới hạn số ca thay đổi, không cam kết tối ưu toàn cục. Giữ cả thời lượng khung ca lẫn số phút nghỉ; không chuyển sang mẫu thiếu giờ nghỉ để tạo thêm năng lực giả. Giữ OFF/phép/ô trống, loại các giờ chưa rõ, kiểm tra nghỉ giữa ca với ngày trước/sau. Đánh giá tất cả KV bị ảnh hưởng cùng ngày liền kề; tổng thiếu nhân-giờ không tăng. Mặc định nghỉ tối thiểu giữa ca 11 giờ là tham số mô phỏng có thể chỉnh, không diễn giải thành quy định lao động.

Chưa ghi lịch khi tạo gợi ý. Admin xem trước rồi áp dụng; server tính lại từ dữ liệu mới và RPC ghi toàn bộ trong một transaction. Hồ sơ/lịch, lịch ngày liền kề hoặc cấu hình thay đổi sau preview sẽ bị từ chối thay vì ghi đè. Không tự áp dụng vào ngày quá khứ. Guard admin và audit trước/sau dùng chung hệ thống nhân sự.

Schema bổ sung: `prisma/team-planning.sql`, chạy sau `team-staff.sql`. RPC cấu hình và phương án chỉ service_role được gọi qua API có kiểm tra phiên. Các bảng bật RLS, không mở quyền đọc/ghi trực tiếp cho anon/authenticated. Dữ liệu lịch cũ được giữ; chỉ thêm tham chiếu mẫu ca tùy chọn.

Kiểm tra 24/10/2026: 8 unit test phân tích/gợi ý và 5 test import đạt; SQL integration rollback xác nhận guard, audit, lưu định biên 0, áp dụng phương án, chặn dữ liệu cũ và bảo vệ OFF. Trên snapshot thật với định biên thử, mô phỏng 8 thay đổi giảm thiếu ngày 24/10 từ 2 xuống 0 nhân-giờ, giữ nguyên 264 nhân-giờ năng lực; tổng thiếu cả ngày liền kề từ 11 xuống 9. Đây là kiểm tra chỉ đọc, chưa áp dụng lịch thật. Sau tối ưu tính delta theo ứng viên, lần kiểm tra chạy khoảng 25 ms (không gồm truy vấn DB), không phải cam kết thời gian mọi quy mô dữ liệu.
