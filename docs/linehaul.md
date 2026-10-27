# Quản lý LH

Trang `/linehaul` dùng quyền Dashboard / Realtime; chỉ admin và leader có quyền này được gửi lệnh đồng bộ. Dữ liệu và GPS đọc qua API đã đăng nhập, bảng snapshot không cấp quyền trực tiếp cho anon/authenticated.

Nguồn `linehaul` của SDD Web Data lấy `trip/list_v2` với `count=100`, phân trang đầy đủ, `sta` từ 00:00:00 đến 23:59:59 theo Asia/Ho_Chi_Minh. Chỉ giữ điểm STA hôm nay tại station 4232, có driver ID và tên tài xế; chuyến xuất phát hôm qua nhưng STA hôm nay vẫn được tính. Không gọi API vị trí của chuyến chưa gán.

Số đơn là `order_loaded_quantity`; loại xe là `vehicle_type_name`; mã LT là `trip_number`. `pack_type` được tách theo số bao và NA (hàng xá đã được người dùng xác nhận). Giá trị -1 của số lượng SPX là chưa báo tải, được lưu null và hiển thị dấu —. Tổng TO, số TO cần xả và số TO đã xả giữ nhãn kiện TO, không tự coi TO là số bao.

Vị trí lấy từ `trip/location?trip_id=...`, chọn điểm hợp lệ có `upload_time` mới nhất. Không dùng tọa độ trạm làm tọa độ xe, không suy đoán tuyến đường hay thời gian di chuyển. ETA dùng trường nguồn tại hub. GPS quá 15 phút hoặc lỗi cập nhật được cảnh báo; ETA đã qua không được coi là xe đã đến.

Nguồn chạy mỗi 5 phút; trang đọc snapshot mỗi 30 giây khi hiển thị. Cache vị trí 60 giây cho xe hoạt động, 10 phút cho chuyến đã rời hoặc đang chờ chưa có GPS. Thay xe/tài xế/trạng thái/sequence làm cache mất hiệu lực. SPX có rate limit trong JSON retcode 130008001, collector giãn request 0,6 giây và backoff, giữ snapshot cũ khi đọc thiếu danh sách.

Chạy `scripts/apply-linehaul.cjs` bằng env dự án để cài schema; `--test` kiểm tra trong transaction rollback. Collector dùng cookie SPX riêng của SDD Web Data. Máy worker phải hoạt động để đồng bộ; không có lệnh sửa chuyến hay gán tài xế trên SPX.

Tab **Đã về / xả hôm nay** dùng POST `https://spx.shopee.vn/mgmt/api/pc/dashboard/lm/linehaul_trips` với body `{}`, thay cho nguồn `trip/history/list`. Chỉ giữ dòng `trip_status=3`, có tài xế, đúng station/arrived_station 4232, STA và ATA hôm nay theo giờ Việt Nam. API dashboard không có trip ID nội bộ, dùng mã LT làm định danh khi chưa ghép được với ID của chuyến đang chạy; khử trùng theo mã LT, ưu tiên dữ liệu dashboard.

Số đơn lấy từ `trip_order_qty_td`, tổng TO từ `trip_to_qty_td`, loại xe từ `vehicle_group_type`. Pack type mới có dạng `Bao 90x70 10,Other 25`: 10 bao, 25 xá (Other tương ứng NA trong danh sách vận tải cùng LT). Trường hợp không phân tích được giữ mô tả gốc và không tự thay bằng 0.

Dashboard chỉ có `trip_ata` (đến SDD hub) và `trip_atd` (rời kho xuất phát), không có giờ xả xong hay số TO đã xả. Vì vậy trạng thái hiển thị **Đã đến hub · Dashboard**, giờ hoàn tất xả và số xả thực tế không được tự tạo. Tổng TO không bị coi thành số TO thực tế đã xả. Không gọi API GPS cho nhóm này.

Khi có nhiều máy worker, tác vụ LH chỉ được cấp cho worker báo version chứa `lh-dashboard` (hiện tại `1.2-lh-dashboard`). RPC ghi snapshot cũng kiểm tra version/heartbeat để máy dùng code cũ không ghi đè nguồn đã đổi. Sau khi cập nhật collector, khởi động lại worker an toàn để công bố version mới; các nguồn khác không đổi quy tắc nhận job.
