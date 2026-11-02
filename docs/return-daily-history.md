# Lịch sử tồn hàng Return

Trong **Bật AI → Phân tích**, bấm **Xem lịch sử Return**. Bộ lọc ngày/KV của báo cáo áp dụng cho cả chuỗi ngày, xếp KV và top quận. **AI phân tích Return** chuyển câu hỏi giữ đúng ngày/KV sang chat.

Mỗi lần `publish_central_returns` công bố bộ dữ liệu đầy đủ, `capture_return_daily_history` lưu tổng hợp cùng giao dịch, dưới cùng advisory lock. Lịch sử không phụ thuộc người mở web. Nguồn Return hiện chạy theo lịch đồng bộ có sẵn (khoảng 30 phút), không tạo thêm job tải SPX. Lần cuối thành công của ngày theo `Asia/Ho_Chi_Minh` thay thế tổng hợp trong ngày; ngày cũ được giữ. Đồng bộ thiếu/lỗi rollback, không ghi snapshot giả; lần công bố đầy đủ thực sự rỗng được lưu là 0.

Hai bảng `return_daily_history` và `return_daily_history_groups` giữ metadata ngày và tổng hợp theo KV/quận/phường: tổng tồn, chờ trả (10/67), đang trả (72), tồn hub >5 ngày, đang trả >48 giờ và thiếu mốc thời gian. Không lưu thêm mã đơn, thông tin rider hay liên hệ cá nhân. Tuổi hàng lịch sử tính tại snapshot và giữ nguyên khi xem lại. Tổng KV1–KV5 không cộng đơn chưa rõ KV; số chưa rõ được ghi riêng. KV xếp theo tổng tồn, số tồn lâu là cột riêng.

`change` là chênh tồn hai ngày liền kề đã qua; `provisionalChange` là Δ tạm hôm nay so snapshot ngày trước. Số thiếu không điền 0, không so bắc cầu. Phần trăm = Δ / tồn ngày trước ×100; nền 0 không tính %. Snapshot cuối hai ngày có thể khác giờ; không mặc nhiên gọi là chốt 23:59. Chênh lệch tồn không phải lượng nhập, lượng trả thành công hoặc hiệu suất trả. Snapshot hiện tại và lịch sử có timestamp riêng.

Migration `supabase/migrations/20261102074500_return_daily_history.sql` được tạo bằng CLI và kết hợp schema/function ở `prisma/return-daily-history.sql` với publisher ở `prisma/return-source-worker.sql`. Áp dụng migration sau schema Return/worker gốc và trước khi chạy ứng dụng mới. Khi cài từ các file SQL rời, cần cài history trước khi publisher gọi capture. Migration seed duy nhất snapshot đầy đủ đang giữ và có job SUCCEEDED tương ứng; không dựng dữ liệu những ngày đã mất. Đã áp dụng trên database cấu hình của workspace, bắt đầu ngày **02/11/2026**.

RLS bật, không có quyền bảng/RPC cho `anon`/`authenticated`. Chỉ `service_role` đọc/ghi. RPC `read_return_daily_history` giới hạn 93 ngày và trả JSON tổng hợp đầy đủ, không chịu giới hạn 1000 dòng của SELECT. AI kiểm tra quyền trang Return và quyền nghiệp vụ trước khi gọi loader, kể cả khi nguồn hiện tại bị lỗi riêng. Khoảng phân tích UI vẫn tối đa 31 ngày.

Kiểm chứng: `tests/return-history.test.ts` kiểm tra delta, phạm vi, ngày thiếu, zero, xếp KV, tuổi hàng cố định và top có giới hạn; kiểm thử quyền AI không đọc lịch sử khi bị từ chối. `tests/return-daily-history.integration.sql` chạy cùng migration bằng SQL runner `--test`, mọi fixture/DDL rollback. Bài này kiểm tra công bố đủ/thiếu/lặp/rỗng, thay nhóm trong ngày, giữ ngày cũ, ACL/RLS và giới hạn ngày. Kiểm thử publisher cũ và cache Return vẫn đạt; RPC thật đọc được snapshot đầu tiên và từ chối anonymous.

Câu hỏi chỉ về Return chỉ tải hai nguồn snapshot/lịch sử Return, không chờ các nguồn OH/backlog khác. Kiểm thử tài khoản đủ mọi quyền xác nhận không có truy vấn nguồn ngoài Return. Đã đối chiếu trên phiên đăng nhập: lịch sử 02/11/2026 có 500 đơn KV1–KV5 (KV3 170, KV5 118), 6 đơn chưa rõ KV ghi riêng; AI không kết luận tăng/giảm khi mới có một ngày.
