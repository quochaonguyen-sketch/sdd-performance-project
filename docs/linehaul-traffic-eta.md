# Dự đoán ETA Linehaul bằng TomTom

Trong Linehaul Management, mở một chuyến đang về hub rồi bấm **Dự đoán ETA theo giao thông**. Không tự gọi dịch vụ khi mở danh sách hoặc mở chi tiết. Kết quả gồm giờ tới hub (giờ Việt Nam), số phút còn lại, quãng đường theo TomTom, độ trễ giao thông được nguồn báo và so sánh với STA. ETA SPX vẫn hiển thị riêng để đối chiếu.

## Cấu hình máy chủ

Đặt biến môi trường sau trong môi trường chạy Next.js (local có thể dùng `.env.local`), rồi khởi động lại ứng dụng:

```dotenv
TOMTOM_API_KEY=your_key
```

Dùng khóa có quyền TomTom Routing API. Không dùng tiền tố `NEXT_PUBLIC_`, không nhập khóa vào giao diện, không commit khóa vào Git. API chỉ gửi tọa độ xe, tọa độ hub và tùy chọn tuyến đến TomTom; không gửi mã chuyến, tên tài xế, biển số hay cookie SPX. Không cần thay đổi database.

## Cách tính và giới hạn

- Máy chủ lấy chuyến từ snapshot hôm nay của hub 4232 sau khi kiểm tra đăng nhập, quyền trang Linehaul và quyền quản lý dashboard. Không nhận tọa độ hoặc URL dịch vụ do trình duyệt cung cấp.
- Gọi Calculate Route với `travelMode=truck`, `vehicleCommercial=true`, `traffic=true`, `departAt=now`, tuyến nhanh nhất, chỉ lấy summary. Dùng nguyên thời gian đến của TomTom, không tự cộng thêm vào ETA SPX hay suy đoán bằng tốc độ cố định.
- Chỉ tính cho chuyến đang di chuyển về hub, chưa có mốc đến/rời/xả xong. GPS phải hợp lệ và không quá 15 phút; snapshot phải không quá 10 phút. GPS báo lỗi, thời gian bất thường hoặc thiếu dữ liệu sẽ chặn dự đoán.
- Cache tối đa 60 giây theo GPS và trạng thái chuyến; các yêu cầu trùng được gộp. Tối đa 4 yêu cầu TomTom đồng thời trên mỗi tiến trình. Nếu triển khai nhiều instance, cần quota dùng chung phù hợp gói dịch vụ. Thời gian chờ nguồn là 15 giây.
- Kết quả giữ thời điểm tính và GPS nguồn; sau 2 phút hoặc qua giờ đến dự kiến sẽ nhắc cập nhật. Không coi ETA đã qua là xác nhận xe đã đến.
- Chưa có tải trọng/kích thước thực tế của từng xe nên chưa áp dụng các hạn chế riêng này. Chưa bao gồm dừng đỗ hay chờ cổng. Tuyến TomTom có thể khác tuyến OSRM trên bản đồ hiện tại. Độ phủ giao thông thực tế có thể khác theo đoạn đường.
- Thiếu khóa, hết quota hoặc lỗi nguồn sẽ báo rõ, không thay bằng ETA giả. Chưa có khóa nên chưa kiểm chứng cuộc gọi giao thông thật trong lần triển khai này.

Tài liệu nguồn: [Calculate Route](https://docs.tomtom.com/routing-api/documentation/tomtom-maps/v1/calculate-route), [Market coverage](https://docs.tomtom.com/routing-api/documentation/tomtom-maps/v1/product-information/market-coverage).

## Kiểm tra

```powershell
node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/linehaul-traffic-eta.test.ts tests/linehaul-traffic-server.test.ts tests/linehaul-traffic-route.test.ts
```

Các test dùng fixture, không gửi GPS thật tới TomTom. Kiểm tra parser, mốc qua ngày, dữ liệu cũ, quyền truy cập, chống thay tọa độ từ client, giữ khóa trên máy chủ, cache, retry và không tạo ETA khi nguồn lỗi.
