# Tối ưu Tồn Delivery — 26/10/2026

- Lỗi thực tế: RPC `publish_sdd_delivery_inventory` trả `57014` sau khi fetch xong; snapshot cũ được giữ nguyên.
- Fetch 500 đơn/request (đã xác minh trực tiếp SPX). Thử 1.000 và 2.000 trả đủ nhưng chậm hơn đáng kể, nên không dùng. Pool riêng `DELIVERY_WORKERS=24`, giới hạn tối đa 24.
- Cache chỉ giữ kế hoạch chia khoảng thời gian liên tục; mỗi khoảng vẫn được đọc mới ở mọi lượt. Khoảng rỗng gộp lại, khoảng đông tự chia; kiểm tra ID trùng/thiếu và total trước khi công bố. Cache tự cắt theo lookback đang trượt, đổi station/project/lookback sẽ bỏ cache.
- Cache kết quả địa bàn trong mỗi lượt và lập chỉ mục phường một lần. Giữ quy tắc địa bàn duy nhất và thống kê từng đơn; không suy đoán địa bàn thiếu.
- Gửi dictionary gồm nhóm địa bàn/COT và mỗi đơn `[shipment_id,create_time,received_time,group_index]`, JSON UTF-8 gọn. RPC riêng chỉ cấp service_role giải mã về publisher hiện hữu. Giữ kiểm tra owner/lease, phạm vi, ID trùng, atomic publication và lịch sử pivot. Trên 27.180 đơn: 9.764.213 → 2.263.313 byte, giảm 76,8%.
- Publisher kiểm tra distinct trên cột text thay vì cả JSON, work_mem 16 MB, timeout riêng 60 giây; không tăng timeout toàn database. Thời điểm hoàn tất dùng clock_timestamp.

## Triển khai

Cài SQL trước khi cập nhật worker. Trong thư mục website, sau các bootstrap Delivery và Backlog hiện có:

```powershell
node --env-file=.env --env-file=.env.local scripts/apply-delivery-performance.cjs
node --env-file=.env --env-file=.env.local scripts/apply-delivery-performance.cjs --test
```

Worker daemon hiện hữu khởi tạo child mới mỗi tác vụ, tự dùng code mới. Benchmark chỉ đọc nguồn, không ghi DB và chặn mở trình duyệt khi hết phiên:

```powershell
.venv/Scripts/python.exe -X utf8 benchmark_delivery.py
```

## Số đo thực tế

| Lượt chạy | Quy mô | Fetch + xử lý | Gửi/ghi và xác nhận | Tổng từ khi nhận job | Kết quả |
|---|---:|---:|---:|---:|---|
| Trước sửa 12:23 | 19.973 đơn hợp lệ | khoảng 61 s | timeout, thử lại | 101.604 ms | FAILED |
| Sau sửa timeout + cache, 16 luồng | 27.180 đơn hợp lệ | khoảng 45 s kể cả startup | khoảng 32 s | 77.441 ms | SUCCEEDED |
| Compact + 24 luồng, 12:51 | 27.238 đơn hợp lệ | 35.488 ms kể cả startup | 12.436 ms | **47.924 ms** | SUCCEEDED |

Tổng cải thiện khoảng 53% so với lượt lỗi, dù lượt sau có nhiều đơn hơn. Đây là các lượt thực ở thời điểm khác nhau, không phải benchmark cùng một tập dữ liệu cố định. Job xác nhận: `38cd87e1-a730-4dc9-b524-ddd823aff2b1`; history giữ đúng 27.238 đơn. Quy mô tồn thay đổi theo hoạt động thực tế, không dùng lượt ít đơn để suy ra mức cải thiện của lượt 27.000 đơn.

Full Python suite: 178 tests, 1 skipped. Kiểm thử SQL compact giải mã Unicode, nhóm địa bàn, malformed reference, quyền truy cập, giữ snapshot và history; mọi fixture đều rollback.

Sau khi lập chỉ mục phường, lượt thật lúc 14:02 có 502 đơn hợp lệ hoàn tất trong 9.381 ms. Đã đọc lại toàn bộ trường của từng dòng và đối chiếu với artifact: 502/502 dòng khớp, 0 sai khác; tổng history cũng là 502. Quy mô đã giảm so với buổi trưa nên không dùng số 9.381 ms để so tốc độ với lượt 27.000 đơn. Công cụ kiểm tra lại: `scripts/verify-delivery-publication.cjs job-id artifact.json`, chạy với hai env-file của website.
