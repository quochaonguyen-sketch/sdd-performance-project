# Performance chi tiết theo rider

Bấm tên rider trong bảng /performance để mở /riders/{uuid}/performance. Liên kết dùng UUID hồ sơ đã join đúng mã rider, tắt prefetch hàng loạt, mặc định mở 7 ngày gần nhất, gồm hôm nay và 6 ngày trước. Trang cũ từ danh sách Riders vẫn mở được và mặc định 7 ngày gần nhất theo giờ Việt Nam.

Chọn Từ ngày / Đến ngày rồi Xem dữ liệu. Có mốc nhanh 7/30/90 ngày, làm mới, số tổng kỳ, biểu đồ tối đa 60 ngày có dữ liệu gần nhất, bảng đầy đủ theo ngày và nút Xuất Excel. Ngày thiếu bản ghi không bị giả lập thành 0. COT còn thiếu gộp về COT chính như bảng tổng. Convert Pick = ceil(Pick/3), Total = Deli + Convert Pick; tổng kỳ làm tròn một lần trên tổng Pick, không cộng các số làm tròn từng ngày.

API /api/riders/{uuid}/performance nhận from/to inclusive hoặc days như trước. Phải đăng nhập với context ứng dụng hợp lệ; tra cứu chính xác bằng UUID hoặc rider_code, xác nhận rider thuộc KV1–KV5 trước khi đọc lịch sử. Phân trang server 500 dòng/lần, không cắt im lặng tại ngưỡng REST mặc định. Kiểm tra ngày thực, thứ tự và khoảng tối đa 10 năm. Cache private/no-store.

Thêm export=xlsx để tải Excel cùng bộ lọc. File có hồ sơ, khoảng ngày, 17 cột chi tiết gồm số tổng, COT, quy đổi và tỷ trọng; dòng Tổng kỳ. Công thức Excel có cached values và dùng ROUNDUP(Pick/3,0). Tên rider lưu ô text, không biến chuỗi bắt đầu '=' thành công thức. Bộ lọc Excel chỉ gồm các dòng ngày, không gồm tổng kỳ.

Kiểm tra: ngày nhuận, khoảng đảo/thiếu/ngày giả; COT fallback, trường hợp làm tròn tổng kỳ khác tổng các dòng; Excel ghi/đọc lại, công thức, phạm vi autofilter, an toàn ô tên. Kiểm tra dữ liệu thật của 4 ngày: Excel 21.465 byte, Convert Pick 16 và Total 160 khớp tổng hợp, UUID drilldown hợp lệ. Công cụ: node --experimental-strip-types --env-file=.env --env-file=.env.local scripts/verify-rider-performance.cjs. Chỉ đọc dữ liệu, không ghi DB.
# Đối soát số COT lịch sử (26/10/2026)

Đối chiếu lại API báo cáo Pickup SPX ngày 23 và 24/10 cho rider 158197: cả hai ngày đều có assigned/picked bằng 0. Các bộ đếm COT 2 cũ lần lượt là 45/45 và 36/36, vượt tổng chính thức và không được cộng vào sản lượng. Bảng chi tiết, bảng chính và Excel bỏ bộ chia COT không hợp lệ (tổng chia vượt tổng báo cáo hoặc completed vượt assigned trong từng COT), sau đó mới phân phần còn thiếu vào COT chính. Giữ nguyên tổng chính thức, công thức quy đổi và dữ liệu nguồn; không dùng max(tổng, tổng COT) để làm khớp giả.


Trang chi tiết có ô ID rider và nút Xem rider. Chuyển ID giữ nguyên khoảng ngày đang xem; ID không tồn tại có thông báo và cho nhập lại. URL chứa ID và khoảng ngày nên có thể tải lại/chia sẻ. Mặc định không có from/to là 7 ngày, các URL đã chọn from/to vẫn giữ nguyên.
