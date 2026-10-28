# Quản lý LH

Trang `/linehaul` dùng quyền Dashboard / Realtime; chỉ admin và leader có quyền này được gửi lệnh đồng bộ. Dữ liệu và GPS đọc qua API đã đăng nhập, bảng snapshot không cấp quyền trực tiếp cho anon/authenticated.

Nguồn `linehaul` của SDD Web Data lấy `trip/list_v2` với `count=100`, phân trang đầy đủ, `sta` từ 00:00:00 đến 23:59:59 theo Asia/Ho_Chi_Minh. Chỉ giữ điểm STA hôm nay tại station 4232, có driver ID và tên tài xế; chuyến xuất phát hôm qua nhưng STA hôm nay vẫn được tính. Không gọi API vị trí của chuyến chưa gán.

Số đơn là `order_loaded_quantity`; loại xe là `vehicle_type_name`; mã LT là `trip_number`. `pack_type` được tách theo số bao và NA (hàng xá đã được người dùng xác nhận). Giá trị -1 của số lượng SPX là chưa báo tải, được lưu null và hiển thị dấu —. Tổng TO, số TO cần xả và số TO đã xả giữ nhãn kiện TO, không tự coi TO là số bao.

Vị trí lấy từ `trip/location?trip_id=...`, chọn điểm hợp lệ có `upload_time` mới nhất. Không dùng tọa độ trạm làm tọa độ xe. ETA dùng trường nguồn tại hub. GPS quá 15 phút hoặc lỗi cập nhật được cảnh báo; ETA đã qua không được coi là xe đã đến.

Bản đồ hiện km đường bộ còn đến hub và vẽ tuyến tương ứng từ dịch vụ OSRM (GeoJSON), dùng GPS xe và tọa độ hub của snapshot hôm nay. Chỉ tính chuyến đang chờ/đang về, không vẽ đường quay lại cho xe đã đến/rời hub. API `/api/linehaul/route?trip_id=...` kiểm quyền Dashboard như API LH; không nhận tọa độ hoặc URL dịch vụ từ trình duyệt. Cache tuyến 5 phút theo chuyến/GPS/tọa độ; gộp request trùng, giãn truy vấn tối thiểu 1,1 giây. Thiếu GPS, tuyến không hợp lệ, điểm ghép đường xa hơn 1 km hoặc dịch vụ lỗi chỉ báo chưa tính được; không thay bằng khoảng cách đường chim bay. GPS thay đổi loại tuyến cũ; chuyển chuyến hủy request cũ. Tuyến có ghi nguồn OpenStreetMap, nhãn ước tính đường ô tô và cảnh báo GPS cũ; không thay ETA SPX, không khẳng định đây là tuyến xe tải thực tế hoặc đã xét tải trọng/giờ cấm/tắc đường.

Cấu hình `LINEHAUL_ROUTING_URL` trên server web bằng URL gốc OSRM tương thích (ví dụ `http://127.0.0.1:5000` khi tự host), không gồm `/route/v1/...`. Chỉ môi trường `next dev` được dùng mặc định `https://router.project-osrm.org` để thử nghiệm có giới hạn. Production phải cấu hình dịch vụ riêng hoặc nhà cung cấp được phép sử dụng; không tự dùng demo công cộng. Không đưa API key vào biến `NEXT_PUBLIC_*`. Chỉ gửi hai tọa độ để tìm đường, không gửi thông tin tài xế/biển số hay cookie SPX. Cache/giãn request nằm trong mỗi process; triển khai nhiều instance cần limiter dùng chung nếu nhà cung cấp áp giới hạn toàn cục.

Số km còn đến hub cũng hiển thị ngay dưới trạng thái từng chuyến trong danh sách đang điều phối, không cần chọn chuyến hay mở bản đồ. Dùng chung API/cache định tuyến với bản đồ; đọc lại theo nhịp tải snapshot của danh sách. GPS cũ có nhãn cảnh báo; thiếu GPS hoặc lỗi định tuyến không hiển thị km giả.

Kiểm tra định tuyến: `node --experimental-strip-types --test tests/linehaul-road-route.test.ts` và `node scripts/verify-linehaul-routing.cjs`.

Nguồn chạy mỗi 5 phút; trang đọc snapshot mỗi 30 giây khi hiển thị. Cache vị trí 60 giây cho xe hoạt động, 10 phút cho chuyến đã rời hoặc đang chờ chưa có GPS. Thay xe/tài xế/trạng thái/sequence làm cache mất hiệu lực. SPX có rate limit trong JSON retcode 130008001, collector giãn request 0,6 giây và backoff, giữ snapshot cũ khi đọc thiếu danh sách.

Chạy `scripts/apply-linehaul.cjs` bằng env dự án để cài schema; `--test` kiểm tra trong transaction rollback. Collector dùng cookie SPX riêng của SDD Web Data. Máy worker phải hoạt động để đồng bộ; không có lệnh sửa chuyến hay gán tài xế trên SPX.

Tab **Đã về / xả hôm nay** dùng POST `https://spx.shopee.vn/mgmt/api/pc/dashboard/lm/linehaul_trips` với body `{}`, thay cho nguồn `trip/history/list`. Chỉ giữ dòng `trip_status=3`, có tài xế, đúng station/arrived_station 4232, STA và ATA hôm nay theo giờ Việt Nam. API dashboard không có trip ID nội bộ, dùng mã LT làm định danh khi chưa ghép được với ID của chuyến đang chạy; khử trùng theo mã LT, ưu tiên dữ liệu dashboard.

Số đơn lấy từ `trip_order_qty_td`, tổng TO từ `trip_to_qty_td`, loại xe từ `vehicle_group_type`. Pack type mới có dạng `Bao 90x70 10,Other 25`: 10 bao, 25 xá (Other tương ứng NA trong danh sách vận tải cùng LT). Trường hợp không phân tích được giữ mô tả gốc và không tự thay bằng 0.

Dashboard chỉ có `trip_ata` (đến SDD hub) và `trip_atd` (rời kho xuất phát), không có giờ xả xong hay số TO đã xả. Vì vậy trạng thái hiển thị **Đã đến hub · Dashboard**, giờ hoàn tất xả và số xả thực tế không được tự tạo. Tổng TO không bị coi thành số TO thực tế đã xả. Không gọi API GPS cho nhóm này.

Khi có nhiều máy worker, tác vụ LH chỉ được cấp cho worker báo version chứa `lh-dashboard` (hiện tại `1.2-lh-dashboard`). RPC ghi snapshot cũng kiểm tra version/heartbeat để máy dùng code cũ không ghi đè nguồn đã đổi. Sau khi cập nhật collector, khởi động lại worker an toàn để công bố version mới; các nguồn khác không đổi quy tắc nhận job.

Danh sách LH chiếm toàn bộ chiều ngang. Bấm dòng chuyến hoặc nút mã LT để mở modal chi tiết (bản đồ/tuyến, tải hàng và mốc vận hành). Dialog native giữ focus bên trong, đóng bằng Esc/nút đóng/bấm nền và trả focus về chuyến. Bản đồ chỉ mount khi mở chi tiết. Cột GPS gần nhất hiển thị thời gian upload GPS thực tế gồm ngày/giờ/phút/giây theo Asia/Ho_Chi_Minh, không thay bằng giờ tải snapshot; GPS quá 15 phút có nhãn cũ, thiếu thời gian có thông báo rõ.

Tổng hợp sản lượng: ba thẻ chính Đã xả / Đang về hub / Đang lên hàng (nhóm chờ xuất phát, chỉ tính đơn đã báo tải), kèm nhóm xe đã đến nhưng chưa xác nhận xả. Chỉ tính luồng inbound/stopover, không cộng outbound. Tổng xả đếm đơn inbound khi đã có bằng chứng nhập đủ toàn bộ TO của chuyến (`expected_unload == load_total > 0` và `unloaded_units >= load_total`) và mốc xả hoặc đến trong ngày; không dùng số TO làm số đơn, không lấy toàn tải stopover làm đơn đã xả. Collector ghép số đơn từ dashboard với scan xả/giờ xả thực tế từ active theo cùng mã LT. Không suy ra giờ xả từ giờ đến.

Biểu đồ 24 giờ dùng giờ xả thực tế cho đã xả, STA cho đang về/đang lên hàng và ATA cho đã đến; có chú thích rõ. Mốc giờ thiếu vẫn giữ tổng nhưng không tự đặt lên biểu đồ. Số đơn thiếu có cảnh báo `≥` hoặc `?`, không biến thành số 0. Bấm thẻ/legend lọc nhóm, bấm giờ lọc các chuyến, bấm thanh chuyến mở modal (kể cả chuyến lịch sử khi bảng chính đang ở tab điều phối). Tổng ngày độc lập bộ lọc bảng. Kiểm thử tính toán: `tests/linehaul-summary.test.ts`; Python `tests.test_linehaul` kiểm tra ghép bằng chứng xả.
