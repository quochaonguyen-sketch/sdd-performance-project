# Trợ lý vận hành SDD

Mở **Bật AI** trong thanh công cụ. Trợ lý có ba mục:

- **Giao ca**: tổng hợp Delivery, Pickup và lịch FTE hôm nay/ngày mai, kèm nguồn và thời điểm. Bấm **Sao chép báo cáo giao ca** để lấy văn bản. Báo cáo được tạo khi mở hoặc tải lại; không tự gửi đến nhóm hay tạo lịch gửi định kỳ.
- **Cần xử lý**: gợi ý kiểm tra có mức ưu tiên và liên kết tới trang xử lý. Đây là danh sách suy ra từ dữ liệu, không phải các bản ghi công việc hay thao tác đã thực hiện.
- **Hỏi dữ liệu**: hỏi bằng tiếng Việt. Phạm vi mặc định là vận hành hôm nay và lịch FTE hôm nay/ngày mai. Phạm vi **Trang & lịch rider** giữ luồng hỏi lịch rider cũ, với kiểm tra đủ quyền các nguồn liên quan.

Ví dụ câu hỏi: “KV3 rider nào còn nhiều đơn giao nhất?”, “Ngày mai KV1 có bao nhiêu FTE đi làm?”, “Tôi cần ưu tiên kiểm tra việc gì hôm nay?”. Các câu hỏi vượt phạm vi ngày hoặc yêu cầu tên FTE phải được nêu rõ là chưa có dữ liệu tương ứng.

Nút **Mở nguồn xử lý** đóng hộp trợ lý và mở đúng KV qua `ai_area`. Liên kết FTE thêm `ai_day` để chọn ngày và chức danh FTE; các trang đặt lại bộ lọc cũ có thể che mất kết quả. KV và ngày trên URL được kiểm tra trước khi áp dụng. Các tham số này chỉ chọn bộ lọc, không thay đổi quyền truy cập.

## Nguồn và tính đúng dữ liệu

`GET /api/ai/briefing` yêu cầu phiên đăng nhập được xác minh và kiểm tra quyền đọc từng trang trước khi truy vấn:

| Nguồn | Quyền | Cách đọc |
|---|---|---|
| Danh bạ rider | Rider Directory hoặc Delivery Realtime để ghép rider | Client phiên người dùng, RLS, phân trang đủ dữ liệu |
| Delivery | Delivery Realtime | Snapshot hôm nay, phân trang đủ dữ liệu, kiểm tra snapshot không đổi khi tải |
| Pickup | Pickup Realtime và quyền xem Pickup | Dùng lại endpoint hiện có để giữ đúng full-fleet và legacy fallback |
| FTE | Staffing & Scheduling | Dùng loader lịch hiện có, chỉ xuất tổng hợp FTE hiện tại |

Thời điểm đọc danh bạ/lịch khác với thời điểm snapshot Delivery/Pickup. Snapshot khác ngày, quá 20 phút, sai thời điểm hoặc không tải được sẽ không được tính thành số liệu hôm nay. Nguồn không có quyền xem không được truy vấn. Kết quả API là `private, no-store`; không lưu dữ liệu trợ lý vào localStorage hoặc cache dùng chung giữa tài khoản.

Các phép tính chạy bằng code:

- Delivery còn giao = max(0, gán − đã giao).
- Pickup chờ lấy = max(0, gán − đã lấy − Onhold). Các lượt gán có thể trùng đơn giữa rider; không gọi đây là số đơn duy nhất.
- FTE chỉ tính nhân sự Active, chưa archived, chức danh FTE. Ca làm đầy đủ, OFF/phép, ca kèm nghỉ và chưa rõ ca được tách riêng. Tổng toàn đội không cộng trùng người phụ trách nhiều KV; số theo từng KV có thể trùng coverage.
- Danh sách xếp hạng chỉ là top 5 mỗi KV. Tìm theo mã/tên trong câu hỏi trả tối đa 20 dòng khớp, có thông tin giới hạn; tổng hợp vẫn dùng toàn bộ nguồn được tải.

Quy tắc cảnh báo hiện tại: rider còn đơn giao và không giao từ 60 phút; rider còn từ 50 lượt gán Pickup; rider thiếu quận hoặc phường giao; FTE chưa rõ ca ngày mai; nguồn cũ/lỗi/thiếu. Thiếu lịch không có nghĩa là OFF. Chưa có dữ liệu định biên để kết luận thiếu người chỉ từ số lượng FTE.

## Hỏi AI và quyền dữ liệu

Chat dùng ShopAIKey và cấu hình máy chủ hiện có. Khi bật dữ liệu, máy chủ tự tải số liệu được cấp quyền rồi gửi ngữ cảnh tới dịch vụ AI; không tin dữ liệu thống kê gửi từ trình duyệt. Giao diện thông báo việc dùng dịch vụ AI, có nút tắt dữ liệu và ghi nguồn trên câu trả lời. Không có API key thì báo cáo và danh sách ưu tiên vẫn hoạt động; phần hội thoại cần cấu hình dịch vụ.

Prompt phân biệt tên rider/nội dung báo cáo/lịch sử chat với chỉ dẫn, yêu cầu chỉ dùng nguồn hợp lệ, nêu giới hạn danh sách và ngày của câu hỏi. Phạm vi cũ có nhiều nguồn ghép phải đủ quyền mọi nguồn trước khi đọc. Đọc và đối chiếu không yêu cầu xác nhận; đề xuất thay đổi dữ liệu cần được người dùng thực hiện/duyệt trên trang nguồn.

## Phân tích biến động theo ngày

Tab **Phân tích** đọc `GET /api/ai/analysis`, mặc định 7 ngày đến hôm nay, tối đa 31 ngày. Chọn KV và checkpoint backlog giờ `HH:50`, rồi bấm **Xem phân tích**. Component chỉ được tải khi mở tab. Nút **AI phân tích** chuyển câu hỏi có ngày/KV/giờ sang chat; chat nhận diện backlog/OH/Volume/FC/Return và tải lịch sử thay vì snapshot giao ca. Không thêm dependency hoặc thay đổi database.

- Backlog Delivery/Pickup: RPC hourly cho mỗi ngày và ngày liền trước đầu khoảng. Chỉ so hai checkpoint cùng giờ đã chốt; mốc thiếu không lấy giờ khác bù. Thẻ đầu hiển thị ngày có dữ liệu gần nhất, có ghi ngày rõ.
- OH = số OH / Delivery Volume cùng ngày, cùng KV ×100. Chênh tỷ lệ tính bằng điểm phần trăm; phần trăm tăng/giảm số đơn dùng mẫu số ngày trước. Mẫu số 0/thiếu không tạo tỷ lệ. Toàn đội yêu cầu đủ cả 5 KV. OH chưa chốt không so với ngày đủ dữ liệu. Điểm nóng ưu tiên ngày gần nhất đã chốt OH và có Volume trong khoảng; bảng vẫn giữ số tạm hôm nay. Quận/phường chỉ có tỷ trọng OH, chưa có mẫu số Volume riêng.
- Qua đêm: chỉ cohort cutoff 23h đã khóa, chỉ đơn thuộc cutoff; phân biệt tổng cohort theo ngày và số còn lại theo trạng thái đồng bộ hiện tại. Không coi chênh lệch hai cohort là số đã xử lý.
- FC: nguồn Plan FC là HCM Total **Inbound**. So với Total Inbound cùng ngày và toàn HCM; không dùng Delivery Volume hoặc một KV làm Actual. Hub chỉ có ngày hiện có; không suy Actual lịch sử. Ngày hôm nay đánh dấu tạm tính; chênh lệch ghi rõ đơn và % trên FC. Chênh tổng ở sheet có cảnh báo.
- Return: snapshot hiện có, tách chờ trả (10/67), đang trả (72), tuổi tồn hub >5 ngày, thời gian đang trả >48h, mốc thời gian thiếu và điểm nóng KV/quận. Ghi snapshot và thời điểm tính tuổi. Lịch sử tổng hợp ngày tự lưu trong cùng giao dịch công bố Return thành công; so hai ngày liền kề, đánh dấu Δ tạm hôm nay, không so bắc cầu. Xếp KV theo tổng tồn và top 15 quận, tách riêng hàng tồn >5 ngày. Chưa có số trả thành công để tính tỷ lệ thành công. Xem `docs/return-daily-history.md` về cài đặt và ngữ nghĩa lịch sử.

Các nguồn được kiểm tra quyền trang và quyền nghiệp vụ tương ứng **trước** khi gọi client/RPC/loader đặc quyền. Không truy vấn nguồn bị từ chối. Phân trang đủ Volume/overnight; backlog tối đa 2 RPC đồng thời cho mỗi loại (4 tổng cộng); OH đọc từng ngày để tránh timeout pivot nhiều ngày, cache riêng theo tài khoản tối đa 60 giây (64 mục), kiểm tra quyền trước cả cache. Nguồn lỗi không đóng góp số liệu. Kết quả chỉ là tổng hợp, không gửi mã đơn hoặc thông tin liên hệ rider vào AI. Lịch sử không áp dụng ngưỡng cũ 20 phút của realtime. FC cache nguồn tối đa 15 phút. Endpoint luôn `private, no-store`.

Kiểm thử bổ sung bao phủ công thức OH, mẫu số theo KV/ngày, chênh điểm phần trăm, mốc chưa chốt/thiếu, checkpoint cùng giờ, cohort qua đêm, đúng phạm vi FC, tuổi hàng Return, phạm vi chat, không đọc nguồn bị cấm, xác thực và kiểm tra tham số API. Dữ liệu thật sau đăng nhập đã hiển thị chuỗi backlog/OH/Volume/overnight và snapshot FC/Return.

## Kiểm tra

13 kiểm thử ban đầu bao phủ phép tính, ca thiếu/ca kèm nghỉ, coverage nhiều KV, dữ liệu cũ/lỗi/không quyền, xếp hạng có giới hạn, không truy vấn nguồn bị từ chối, xác minh lại quyền chat, streaming ngữ cảnh qua provider giả lập và kiểm tra KV/ngày trên liên kết. Kiểm tra thực tế trên phiên đăng nhập đã xác nhận báo cáo, sao chép, danh sách ưu tiên và một câu trả lời FTE qua dịch vụ AI khớp tổng hợp. Liên kết nguồn được đối chiếu với bộ lọc thực tế, gồm ngày mai ở lịch FTE. Kiểm tra bố cục desktop và màn hình nhỏ 375px. TypeScript, ESLint và build production được chạy trước bàn giao.

AI có thể diễn đạt hoặc suy luận sai; số liệu code và trang nguồn là chỗ đối chiếu. Các cảnh báo là ngưỡng kiểm tra cố định, chưa phải dự báo nhu cầu hay đề xuất điều phối theo năng lực từng rider. Chưa kiểm thử đồng thời nhiều người dùng hoặc mọi cách diễn đạt tiếng Việt.
