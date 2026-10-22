# Rider Operations — Transit Green (mẫu C)

Áp dụng Taste Skill v2, nhánh app screens từ https://github.com/Leonxlnx/taste-skill.

## Hướng thiết kế

Dashboard trả lời: sản lượng giao nhận và tiến độ xử lý trong kỳ đang ra sao?
Phạm vi số liệu dashboard và hệ thống là KV1–KV5.
Giữ nguyên truy vấn, phân quyền, callback Google và các chức năng đang có.

Khung xanh lá nhạt #f0f5f1. Sidebar hai tầng gồm rail 44px, gutter 12px và panel 216px (tổng 272px). Panel trắng inset 12px, góc 10px. Vùng làm việc trắng
viền mảnh, góc 16px, inset 8px. Panel 8px; control 6px; gutter 24px.
IBM Plex Sans tải bằng next/font với subset tiếng Việt. Chữ 12/14/16/24,
số liệu tabular 28px; tổng sản lượng 36px. Màu dữ liệu #28775f.
Dark mode dùng xám trung tính, giữ nguyên phân cấp.

Dấu nhận diện: biểu tượng các tuyến giao nhau và wordmark rider.; tổng sản lượng
trên nền xanh rừng, tiến độ trên nền trắng và dải so sánh KV1–KV5 từ dữ liệu thật. Trang đăng nhập dùng trục
Điều phối → Theo dõi → Hoàn tất, thể hiện quy trình, không phải số liệu vận hành.

## Triển khai

`app/workspace.css` đặt sau stylesheet cũ, giới hạn layout dashboard bằng
`.ops-overview`, dùng token chung cho shell và control. Không thêm thư viện.
Rail chọn module Vận hành, Đội ngũ, Bản đồ & tuyến, Excel & dữ liệu, Quản trị. Panel hiển thị các liên kết của module; chế độ song song, AI, thông báo, note nhanh,
menu mobile và theme vẫn dùng state/handler sẵn có. Shell dùng breadcrumb để
không lặp h1 của trang. Không có dữ liệu mẫu hoặc chỉ báo online giả.

Mobile gập sidebar sang taskbar/menu, tổng sản lượng và tiến độ xếp dọc,
dải khu vực chuyển thành hai hoặc ba cột; bảng rộng cuộn trong khung hiện có. QA và bản vẽ hướng nằm trong
`.taste-skill/` (không đưa vendor hoặc ảnh kiểm tra vào mã sản phẩm).

Module hiện tại tự suy ra từ URL; chọn rail chỉ đổi menu, bấm liên kết mới chuyển trang. Route thay đổi tự chọn đúng module. Các mục dành cho member vẫn theo điều kiện phân quyền sẵn có. Mobile giữ taskbar và menu đầy đủ; logo Transit dùng chung với trang đăng nhập và icon trình duyệt.

## Dashboard: Forest + River

Theo yêu cầu tăng màu sắc và điểm nhấn, `app/dashboard.css` thêm phối màu riêng:
xanh rừng #193f36 cho tổng sản lượng, xanh lam #357ba9 cho Delivery và xanh ngọc
#58a08b cho Pickup. Khối so sánh kỳ dùng nền xanh lam nhạt; trạng thái thất bại
chỉ dùng đỏ khi có số liệu. Giữ sidebar mẫu C. Các số liệu lấy từ truy vấn hiện có,
không tạo số mẫu; lỗi tải được hiển thị với chi tiết có thể mở và nút thử lại.
