# Performance: bố cục và tìm kiếm (26/10/2026)

- Khung trang, bộ lọc và placeholder hiển thị trước; dữ liệu tải qua API đã xác thực. Tìm kiếm/lọc/phân trang cập nhật URL bằng History API, không chạy lại toàn bộ trang server.
- Tìm kiếm chờ ngừng gõ 250 ms. AbortController và số thứ tự yêu cầu ngăn phản hồi cũ ghi đè phản hồi mới. Giữ bảng đang xem trong khi tải, memo hóa biểu đồ và từng dòng để giảm render khi gõ.
- Tìm thêm tên tuyến (`zones.name`), điểm pickup và phường pickup; giữ các trường tên/mã rider và khu vực hiện có.
- Giảm từ 5 truy vấn tuần tự xuống 3 truy vấn độc lập chạy đồng thời. Gộp danh sách lựa chọn và thống kê phường vào một truy vấn. Bỏ JSON COT lớn khỏi danh sách chính; badge dùng các bộ đếm COT rõ ràng. Trang chi tiết/xuất file vẫn đọc dữ liệu chi tiết riêng.
- Cache kết quả 10 giây, metadata 30 giây; mỗi cache tối đa 24 khóa, gộp yêu cầu đồng thời cùng khóa. Nút làm mới đổi revision để bỏ qua cả hai cache. Metadata không phụ thuộc từ khóa, sort hay phân trang.
- Trên server chạy liên tục, chỉ tái sử dụng DIRECT_URL dạng session pool đã cấu hình nếu trùng host/project, database và tài khoản với DATABASE_URL. Pool riêng tối đa 3 kết nối; lỗi kết nối ban đầu quay về client cũ. Không áp dụng cho Vercel/AWS Lambda. Không thay đổi quyền hay cấu hình môi trường.

## Đo dữ liệu thực

Lệnh: `node --env-file=.env --env-file=.env.local scripts/benchmark-performance-loader.cjs`.
Đo loader trực tiếp bằng tài khoản database được cấu hình; không phải thời gian trình duyệt/API có xác thực. Dữ liệu ngày 26/10/2026, 1.151 nhóm, trang đầu 100 dòng.

| Trường hợp | Trước | Sau, lần kiểm tra cuối |
| --- | ---: | ---: |
| Tìm `Toàn`, kết nối đã mở | 6.522 ms | 1.004 ms |
| Tìm `Phường`, kết nối đã mở | 6.964 ms | 542 ms |
| Tìm lại `Toàn` trong TTL | — | 1 ms, không truy vấn DB |
| Tải toàn bộ trang đầu khi mở kết nối mới | 9.768 ms | 10.497 ms |

Các lượt đo trước đó sau tối ưu dao động 1.313–2.027 ms cho hai từ khóa. Thời gian mạng/database thay đổi theo lượt chạy; tải dữ liệu đầu tiên chưa có cache không cải thiện đáng kể. Trang được tách để người dùng thấy bộ lọc và trạng thái tải trước khi các truy vấn hoàn tất.

Đã kiểm tra sắp xếp Total giảm dần và liên kết rider bằng dữ liệu thực ngày 25/10; TypeScript, lint và 14 kiểm thử gồm bộ lọc, giới hạn kết nối, quy đổi/COT, cache và xuất Excel.
