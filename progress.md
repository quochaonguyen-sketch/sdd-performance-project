# Tiến độ build

- Đã kiểm tra cấu hình npm và Git. Dự án dùng Next.js 16.2.7, có script build và lint. Thư mục node_modules đã có sẵn.
- Đã chạy `npm test && npm run lint`. npm dừng vì package.json thiếu script test.
- Bộ test Node ban đầu báo sáu lỗi: danh sách nguồn đã thêm WH, một import thiếu đuôi .ts và fixture pickup thiếu stub dịch vụ mask.
- Đã thêm script npm test, sửa import và cập nhật hai bộ test. Đang chạy lại npm test và lint.
- Toàn bộ test Node đã pass ở lần chạy lại đầu tiên.
- Đã cấu hình ESLint bỏ qua đầu ra Next.js trong .next-local và cho phép require trong tệp .cjs.
- Đã xác định lỗi DNS Google Fonts và lỗi quyền ghi .next khi thử Webpack trong sandbox. Đang chạy lại production build với quyền truy cập cần thiết.
- Đã loại thư mục QA cục bộ .taste-skill khỏi ESLint. Đang kiểm tra lỗi lint còn lại trong mã nguồn.
- Production build đã thành công với Turbopack, TypeScript và 118/118 trang tĩnh. ESLint còn 26 lỗi trong mã nguồn và test.
- Đã xử lý các lỗi kiểu và lỗi lint React. Đang chạy lại npm test, ESLint và production build trên bản cuối.
- Build sau bản sửa lint gặp lỗi phân giải tài nguyên Google Fonts của Turbopack. Đang thử lại production build.
- Lần kiểm tra lint kế tiếp còn một lỗi trong phần tải danh sách điều chỉnh. Đã chuyển cập nhật state vào callback của request và thêm hủy request khi unmount.
- Kiểm tra cuối `npm test && npm run lint` trả mã 0. Toàn bộ test Node pass. ESLint báo 0 lỗi và 34 cảnh báo. Các bài kiểm thử tích hợp SQL chạy riêng với cơ sở dữ liệu.
- Production build cuối trả mã 0, vượt qua TypeScript và tạo 118/118 trang. Đã xác nhận đầu ra trong `.next`.

## Tách dữ liệu HV iPhone

- Đã rà luồng WH dashboard, AI, SeaTalk, kho lịch sử và worker Python. Supabase lưu trữ đang nhận lịch sử WH đã giao. Worker vẫn ghi snapshot đầy đủ qua RPC ở Supabase chính.
- Đã xác nhận hai project riêng biệt và Supabase lưu trữ có thể đọc qua API. Project chính có 37 ngày WH, project thứ hai có 36 bản lịch sử WH.
- Đã chuyển đường đọc dashboard, AI và SeaTalk sang nguồn snapshot chung. Worker có đường ghi thẳng vào project thứ hai sau khi hàng đợi chính cho phép.
- Đã sao chép dữ liệu đầy đủ của 37 ngày WH. Worker WH pass 13 test, gồm định tuyến ghi và bảo vệ bản mới hơn.
- Đã đối chiếu 37 ngày WH sau khi sao chép, kết quả pending: 0. Đang kiểm tra đường đọc trực tiếp và xác định máy chạy worker để chuyển nguồn live.
- Đã thử đọc snapshot mới nhất từ project thứ hai và đối chiếu nội dung một ngày lịch sử với project chính.
- Người dùng xác nhận worker vận hành ở máy khác và sẽ áp dụng sau. Đã tạo bản vá worker, kiểm tra bằng git apply --check --reverse và giữ cờ chuyển nguồn tắt.
- Đã sửa export helper nội bộ trong route AI theo quy ước Next.js để Webpack kiểm tra kiểu được. Đang chạy lại build, test và lint.
- Kiểm tra cuối thành công. Webpack build 118/118 trang, npm test và npm run lint trả mã 0 (34 cảnh báo lint), worker WH pass 13 test. Chờ người dùng cập nhật worker ở máy kia trước khi bật nguồn live.

## Chat Nova đồng thời

- Đã rà xác thực ShopAIKey, luồng streaming từng request và cách xử lý lỗi từ nhà cung cấp.
- Đã xác nhận khóa ShopAIKey hiệu lực trên máy trả HTTP 401 cho /models.
- Đã tách timeout kết nối khỏi thời gian stream và thêm một lần thử lại khi ShopAIKey giới hạn ngắn. Test hai tài khoản kiểm tra trùng thời gian, dữ liệu riêng và hủy độc lập.
- Xác minh cuối: test hai tài khoản giả lập và npm test pass, lint 0 lỗi (34 cảnh báo), Webpack build 118/118 trang. Chưa thử chat thật vì khóa ShopAIKey hiệu lực tại checkout vẫn trả 401.
- Đã kiểm tra khóa Nova mới trong .env.local. ShopAIKey trả HTTP 200 cho /models và cả hai yêu cầu streaming đồng thời với gemini-2.5-flash đều trả đúng nội dung mẫu.

## Lịch rider và đồng bộ OFF

- Đã rà API lịch và hai Google Sheet riêng. Người dùng xác nhận nhập các yêu cầu Đã duyệt. Đã thêm trang lịch tuần, chi tiết theo rider và luồng xem trước.
- Đã xác minh Google API đọc được tab Đăng ký OFF và tab OFF. Preview so ngày trùng ở cả hai nguồn và hiển thị trường hợp nghỉ theo ca để xử lý riêng.
- Kiểm thử SQL rollback đã qua, gồm nhập lặp, lưu thay đổi và hàng đợi trong cùng giao dịch, bảo vệ thay đổi đang chờ gửi và khóa ghi Sheet.
- Đã cài SQL lịch rider trên Supabase chính và xác nhận PostgREST trả 200.
- Trình duyệt mở trang mới và được chuyển đến đăng nhập. Chưa thực hiện nhập yêu cầu thật.
- Bản cuối đã qua Webpack build 120/120 trang và npm test && npm run lint (0 lỗi, 34 cảnh báo có sẵn).

## Hiển thị đường vào Lịch rider

- Đã thêm Lịch rider vào Workforce ở thanh bên và menu Thêm trên điện thoại. Trang lịch có mục đang chọn riêng.
- Kiểm tra đường dẫn localhost trả về đăng nhập khi chưa có phiên. npm test và npm run lint đều đạt, với 34 cảnh báo lint có sẵn.

## Bản lưu Lịch rider ở Supabase thứ hai

- Đã rà nguồn attendance_logs và các phụ thuộc vận hành. Đã thêm SQL lưu lịch theo tháng, so phiên bản và đường đọc dự phòng.
- Kiểm thử SQL rollback đã qua, gồm quyền truy cập, tách lịch theo rider và bảo vệ snapshot mới hơn.
- Đã tạo bảng trên sdd-dashboard-project2, cài hàm ở Supabase chính và chuyển lịch thật. Đối chiếu 1 tháng, 1 mục, pending: 0.
- Đọc thử đường API mới với tháng 11/2026 đã trả đúng 1 mục từ kho lưu và đúng 1 mục theo rider. Đã nối cập nhật vào tác vụ archive hằng ngày.
- Kiểm tra cuối: build Webpack 120/120 trang, npm test pass, lint 0 lỗi và 34 cảnh báo có sẵn. Đã đối chiếu dữ liệu thật tại Supabase thứ hai.
