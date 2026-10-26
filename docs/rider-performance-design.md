# Rider Performance — thiết kế dashboard

## Trang chi tiết rider

Trang chi tiết dùng cùng palette xanh dương/xanh lục, surface và border radius 16px, typography, thẻ KPI và trạng thái focus/reduced-motion với trang tổng. Hồ sơ hiển thị tên, ID, KV, COT, địa bàn và kỳ đang xem. Khối tra cứu gom hai form độc lập: đổi ID giữ khoảng ngày; chọn Từ ngày / Đến ngày, Xem dữ liệu, Làm mới và mốc nhanh 7/30/90 ngày. Bảng sản lượng được ưu tiên trước biểu đồ; hướng dẫn COT nằm trong disclosure native, các cột Convert Pick/Total căn giữa, ngày được cố định trong vùng cuộn ngang.

Không thay đổi API, cách chọn khoảng mặc định 7 ngày, URL, luồng xuất Excel hoặc bất kỳ công thức tổng hợp nào. Biểu đồ vẫn dùng 60 ngày có dữ liệu gần nhất và cùng độ cao cột như trước; bổ sung chú giải cùng trục giá trị để đọc dễ hơn.

Kiểm tra lượt thiết kế chi tiết: TypeScript/lint; 14 kiểm thử về COT, quy đổi, phạm vi/ID và workbook; render server với dữ liệu giả kiểm tra hồ sơ, điều khiển, badge, bảng và biểu đồ. Không điều khiển trình duyệt. Trên màn hình nhỏ, form tự xuống hàng và bảng cuộn trong vùng riêng; có bảng màu sáng/tối và hỗ trợ giảm chuyển động.

Thiết kế lại ngày 26/10/2026 theo yêu cầu dùng UI/UX Pro Max. Skill được cài bằng skill-installer từ `nextlevelbuilder/ui-ux-pro-max-skill`, thư mục `.claude/skills/ui-ux-pro-max`, vào `C:/Users/SPXVN19681/.codex/skills/ui-ux-pro-max`.

## Hướng thiết kế đã áp dụng

- Tra cứu `logistics analytics dashboard` và `business intelligence dashboard` bằng `--design-system --density 8`. Áp dụng kết quả Data-Dense Dashboard, bảng màu dữ liệu xanh dương/xanh lục và nhịp khoảng cách gọn cho nghiệp vụ vận hành. Kết quả pattern Enterprise Gateway dành cho landing page không phù hợp nên không dùng; bố cục nội bộ dựa hướng dẫn dashboard/layout chung của skill.
- Tra cứu `client state memo --stack nextjs`; giữ nguyên mô hình server page, component tương tác và các tối ưu debounce, abort, memo hiện có.
- Giữ font đang dùng trong dự án để không tải thêm font hay dependency. Số liệu dùng tabular figures; tên sản lượng theo Excel. Có bảng màu sáng/tối, focus rõ ràng, nhãn trường nhập, trạng thái tải có văn bản và reduced-motion.
- Thứ tự: tiêu đề/kỳ đang xem → bốn thẻ tổng quan → bộ lọc → danh sách rider → phân tích biểu đồ. Total Delivered và Total Picked lấy trực tiếp từ summary hiện có; hai tỷ lệ giữ cách tính hoàn thành / được phân.
- Bộ lọc có nhãn, nút đặt lại khu/địa bàn/COT/từ khóa và trạng thái cập nhật; giữ kỳ đang xem khi đặt lại. Xuất Excel vẫn lấy đầy đủ kết quả theo bộ lọc. Không thay đổi các API, quyền truy cập, cache hay SQL trong lần thiết kế này.
- Bảng giữ badge COT xanh/vàng, các cột Convert Pick/Total gọn và căn giữa. Hàng có vạch phân cách, nền xen kẽ nhẹ, trạng thái hover/focus; vùng cuộn ngang riêng có thể focus bằng bàn phím.

## Bảo toàn chức năng và kiểm tra

Giữ Ngày/Tuần/Tháng/Khoảng ngày; lọc KV, quận, phường, COT, tìm rider/tuyến; phân trang, sắp xếp, làm mới; xuất Excel toàn bộ; mở rider chi tiết mặc định 7 ngày; phân loại COT và mọi công thức quy đổi/tổng/tỷ trọng.

25 kiểm thử hồi quy bao phủ bộ lọc, COT, quy đổi, biểu đồ, cache và workbook. `scripts/verify-performance-ui.cjs` render server bằng dữ liệu giả cho chế độ Ngày và Khoảng ngày để kiểm tra sự hiện diện của các điều khiển, nhãn, badge, liên kết chi tiết và xuất Excel. Script không đăng nhập, không đọc dữ liệu thật, không điều khiển trình duyệt.

Đã rà các breakpoint CSS 375/768/1024/1440px: form/tiêu đề cho phép wrap, KPI hai hoặc bốn cột, bảng rộng chỉ cuộn trong vùng riêng. Đây là kiểm tra cấu trúc/CSS và render server; không thay thế kiểm duyệt hình ảnh trên trình duyệt. Không dùng điều khiển máy theo yêu cầu trước đó của người dùng.
