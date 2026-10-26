# Quy đổi Pick trên bảng Performance

Bảng dùng mẫu Cân đối do người dùng chốt, điều chỉnh độ rộng ngày 26/10: Rider 15%, KV/COT 7%, khu vực 13%, Deli 15%, Pick 11%, Convert Pick 11%, Total 13%, tỷ trọng 15%. Deli/Pick và badge căn đầu cột để giảm khoảng trống sau Khu vực. Badge COT 1/COT 2 đầy đủ, xếp dọc, có nền/viền xanh và vàng như bản cũ. Bỏ hai cột tỷ lệ hoàn thành Deli/Pick; giữ Convert Pick, Total và tỷ trọng Deli/Pick quy đổi.

- Deli dùng delivery_delivered, Pick dùng pickup_picked (số đã hoàn thành).
- Convert Pick = ceil(Pick / 3). Total = Deli + Convert Pick.
- Tỷ trọng = Deli / Total và Convert Pick / Total. Total = 0 hiển thị dấu gạch ngang. Hai nhãn phần trăm được làm tròn bù để cộng đúng 100,0%.
- Tuần/tháng: cộng sản lượng theo rider trong kỳ rồi mới làm tròn Pick/3 một lần, không cộng các giá trị đã làm tròn theo ngày.
- Convert Pick và Total sắp xếp tại database trên toàn bộ phạm vi lọc trước phân trang, dùng cùng công thức với giao diện. Không ghi đè số liệu gốc.
- Theo quy tắc người dùng chốt: bảng không hiện dòng Chưa xác định COT. Phần assigned/completed còn thiếu sau khi trừ COT1/COT2 đã biết được cộng vào COT chính đang hiển thị của rider, cho cả Deli và Pick. COT 1.1/1.2 thuộc COT 1. Các số đã phân loại giữ nguyên; việc gộp thực hiện khi hiển thị, không ghi đè dữ liệu nguồn. Rider chưa có COT chính không bị tự gán COT tùy ý.

Đã kiểm tra biên chia hết/có dư, tổng bằng 0 và tỷ trọng, TypeScript, lint và production build. Localhost đã chạy bản mới.
