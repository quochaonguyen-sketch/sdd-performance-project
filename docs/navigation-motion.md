# Sidebar — Chuyển cảnh mượt

- Desktop: sidebar mở/thu trong 280ms; rail icon 44px được giữ lại khi thu. Bấm module khi đang thu sẽ mở menu tương ứng. Nội dung trang thay đổi khoảng đệm đồng bộ với sidebar.
- Menu xuất hiện lần lượt khi mở sidebar hoặc đổi module: thời lượng 240ms, độ trễ 24ms mỗi mục, giới hạn độ trễ tối đa 192ms. Không chạy lại chỉ vì dữ liệu trang tự tải mới.
- Thanh đánh dấu mục đang chọn trượt theo vị trí link thực tế; cập nhật sau resize hoặc đổi nội dung module. Nếu module đang xem không chứa trang hiện tại thì marker được ẩn, không chọn nhầm link đầu tiên.
- Hover và nhấn có dịch chuyển nhỏ trên menu/icon; không có animation lặp liên tục. Màu sắc dùng token giao diện hiện tại.
- RouteReveal chạy một lần trên mỗi lần mount theo pathname, sau trạng thái tải đầu tiên. Các phần nội dung hiện lần lượt, không remount lại form hoặc chạy lại khi thay bộ lọc/polling. Các animation được hủy khi component rời trang.
- `prefers-reduced-motion` tắt các hiệu ứng mới, kể cả khi người dùng thay tùy chọn trong lúc hiệu ứng đang chạy. Sidebar thu được gắn `inert` và `aria-hidden` để không nhận focus vào menu bị ẩn.
- Mobile giữ điều hướng taskbar/menu hiện có.

Mã: `components/layout/sidebar-navigation.tsx`, `components/layout/route-reveal.tsx`, `app/navigation-motion.css`. Không đổi quyền, đường dẫn hoặc dữ liệu nghiệp vụ.
