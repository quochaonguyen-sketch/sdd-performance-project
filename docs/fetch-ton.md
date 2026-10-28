# Fetch tồn pickup / delivery

Chuyển từ `sdd_rider_ops_kv56`, đổi phạm vi về KV1–KV5 theo KV dữ liệu nguồn. Không suy đoán KV từ tên quận.

## Thiết lập database

Trong Supabase SQL Editor của **dự án này**, chạy theo thứ tự:

1. `prisma/pickup-48h-realtime.sql` nếu chưa thiết lập Pickup Realtime.
2. `prisma/pickup-inventory-raw.sql`.
3. `prisma/pickup-ward-board-rpc.sql`.
4. `prisma/lmhub-inventory.sql`.
5. `prisma/lmhub-fetch-jobs.sql`.

Các trang yêu cầu quyền `manage_pickup`; admin luôn có quyền. Nút fetch dành cho admin, leader hoặc member có quyền xem tồn. Service role chỉ dùng trên server và worker. RLS đọc dữ liệu theo profile và quyền trong `app_metadata`, tương ứng cơ chế phân quyền hiện tại.

## Kết nối worker

Web chỉ tạo job PENDING trong `lmhub_fetch_jobs`. Python worker của SPX Launcher phải đọc hàng đợi trên cùng Supabase và ghi snapshot về đây. Nếu chưa có worker, job sẽ chờ và dữ liệu không tự xuất hiện.

- Cấu hình web: `NEXT_PUBLIC_SUPABASE_URL`, khóa public/anon, `SUPABASE_SERVICE_ROLE_KEY`, tùy chọn `LMHUB_COOLDOWN_SECONDS` (mặc định 60 giây).
- Cấu hình worker: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, tùy chọn `LMHUB_WORKER_ID`.
- Dùng `scripts/lmhub-fetch-queue-worker.example.py` làm mẫu tích hợp vào worker đang có; file này chỉ cung cấp claim/finish, không thực hiện đăng nhập hay fetch SPX.
- Đọc `job.params.kind`: `delivery` chạy fetch delivery và ghi `lmhub_inventory_rows`; `pickup` chạy job tồn pickup và ghi `pickup_48h_no_api2` cùng các bảng pickup tương ứng; `all` chạy cả hai.
- Mẫu ghi snapshot delivery: `scripts/lmhub-inventory-upsert.example.py`.
- Chỉ chạy **một worker xử lý tuần tự** cho hàng đợi chung. RPC claim dùng khóa hàng, nhưng không ngăn nhiều worker lấy các job khác nhau cùng lúc.

## Kiểm tra sau khi cấu hình

### Sửa lỗi ghi Tồn Pickup bị timeout

Lỗi `publish_central_pickup: HTTP 500, mã 57014` xuất hiện sau khi đã đọc đủ SPX là timeout bước ghi database. Ngân sách RPC này là 120 giây, HTTP worker 150 giây; các RPC khác giữ 20 giây. Worker gửi JSON UTF-8 gọn để giảm payload tiếng Việt. Không tự retry mù một publication đang chạy; phiên bản hiện tại giữ upsert + xóa snapshot cũ + xác nhận + lịch sử backlog trong cùng giao dịch, giữ kiểm tra ownership, duplicate và nguồn rỗng hoàn chỉnh.

Publisher khóa dòng job trong lúc commit. `pulse_data_source_job` dùng `FOR UPDATE SKIP LOCKED`; khi dòng đang bận thì chỉ đọc lại owner/status/phase thay vì chờ khóa và làm daemon báo lỗi kết nối. Trước publication, lease được cấp 5 phút để bao phủ giới hạn ghi 120 giây; các heartbeat bình thường vẫn cập nhật theo cơ chế cũ. Không tự đổi owner hay đánh dấu thành công khi heartbeat không cập nhật được lease.

Áp dụng: `node --env-file=.env --env-file=.env.local scripts/apply-pickup-publication-timeout.cjs`, đồng thời cập nhật `C:/code/sdd-web-data/sdd_data/source_control.py`. Tiến trình con nạp module mỗi job; thay đổi RPC có hiệu lực sau reload schema, không cần dừng các job đang chạy. `--test` kiểm publisher với 12.000 bản ghi, cùng indexes và audit trigger, ownership, idempotency, nguồn lỗi/rỗng và phạm vi KV trong các bảng tạm; toàn bộ fixture rollback và không thay tồn thật.

Đối chiếu lượt chạy thật bằng ba số: `lmhub_fetch_jobs.row_count`, số dòng snapshot mới trong `pickup_48h_no_api2` và `backlog_snapshots.total_orders`. Kiểm tra heartbeat trong giai đoạn publishing phải trả về nhanh, không đợi transaction ghi xong.

1. Đăng nhập bằng tài khoản có quyền Pickup, mở `/inventory-delivery` hoặc `/lmhub-inventory` từ menu.
2. Bấm Fetch, kiểm tra job chuyển PENDING → RUNNING → DONE; lỗi worker hiển thị ERROR.
3. Kiểm tra snapshot mới xuất hiện, số tồn và chi tiết phường khớp dữ liệu SPX. Thử lọc COT, tìm phường và xuất dữ liệu.
4. Tài khoản thiếu quyền nhận 403 khi gọi API; trình duyệt không được ghi trực tiếp vào hàng đợi.

Kiểm tra phép tổng hợp delivery: `node --test tests/delivery-inventory.test.ts`.

RPC tổng hợp dùng `pickup_ward_board_kv1_kv5` để tránh gọi nhầm hàm cũ chỉ tổng hợp KV5/KV6. Khi chưa cài RPC mới, web quét raw có lọc KV1–KV5 và đếm distinct shipment_id.
