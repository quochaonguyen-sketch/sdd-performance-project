# Rà soát dữ liệu Rider — 29/10/2026

Đối chiếu lúc 15:16:21 29/10/26 (giờ Việt Nam).

Nguồn: [Data Web dashboard SDD — Sheet1](https://docs.google.com/spreadsheets/d/1gsUhZMc5jLvFizy804gtAan3vtzxmmjKwOvycrj4xZU/edit#gid=0).

Đã đọc 1179 dòng nguồn, 1174 Driver ID khác nhau. Toàn bộ 1160 dòng hợp lệ có trên database và khớp KV, COT, tên, quận ở, quận/phường lấy, quận/phường giao và metadata được đồng bộ. Không có sai lệch KV trên cả các dòng bị bỏ qua nhưng vẫn có KV hợp lệ trong Sheet. Không có Driver ID trùng hoặc KV ngoài KV1–KV5 trong database.

| KV | Dòng hợp lệ trên Sheet | Tổng rider trên web/database |
| --- | ---: | ---: |
| KV1 | 218 | 218 |
| KV2 | 248 | 254 |
| KV3 | 223 | 223 |
| KV4 | 190 | 191 |
| KV5 | 281 | 296 |
| Tổng | 1160 | 1182 |

Đã kiểm tra trực tiếp bộ lọc cả 5 KV trên web: số kết quả khớp database. Trang đang trở về tất cả khu vực. Cột KV hiển thị riêng với quận/phường giao.

## Các dòng cần sửa ở Sheet

19 dòng bị bỏ qua: 10 dòng thuộc 5 Driver ID trùng; 8 dòng khác thiếu KV; 1 dòng thiếu tên. Có tổng cộng 13 ô KV trống, trong đó 5 dòng đồng thời trùng ID đã được tính ở nhóm trùng. Không tự suy ra KV từ quận giao.

| Dòng trên Sheet | Driver ID | Vấn đề |
| ---: | --- | --- |
| 311 | 164949 | Driver ID trùng; bỏ qua tất cả dòng cùng ID |
| 345 | 165202 | Driver ID trùng; bỏ qua tất cả dòng cùng ID |
| 468 | 165082 | Driver ID trùng; bỏ qua tất cả dòng cùng ID |
| 469 | 165415 | Driver ID trùng; bỏ qua tất cả dòng cùng ID |
| 470 | 165421 | Driver ID trùng; bỏ qua tất cả dòng cùng ID |
| 938 | 161002 | Thiếu hoặc sai KV |
| 990 | 147101 | Thiếu tên tài xế |
| 1164 | 164407 | Thiếu hoặc sai KV |
| 1169 | 164949 | Driver ID trùng; bỏ qua tất cả dòng cùng ID |
| 1170 | 165082 | Driver ID trùng; bỏ qua tất cả dòng cùng ID |
| 1171 | 165202 | Driver ID trùng; bỏ qua tất cả dòng cùng ID |
| 1172 | 165415 | Driver ID trùng; bỏ qua tất cả dòng cùng ID |
| 1175 | 165421 | Driver ID trùng; bỏ qua tất cả dòng cùng ID |
| 1179 | 117907 | Thiếu hoặc sai KV |
| 1180 | 121892 | Thiếu hoặc sai KV |
| 1182 | 163732 | Thiếu hoặc sai KV |
| 1186 | 166917 | Thiếu hoặc sai KV |
| 1187 | 166918 | Thiếu hoặc sai KV |
| 1189 | 166920 | Thiếu hoặc sai KV |

Với ID trùng, cần giữ một dòng chuẩn duy nhất hoặc sửa đúng ID của từng rider. Điền KV/tên còn thiếu theo dữ liệu vận hành. Tiến trình sẽ tự đọc lại sau khi nguồn hợp lệ; không ghi ngược vào Sheet.

## Rider chỉ có trên web

15 rider không có trong Sheet hiện tại, được giữ nguyên:

| Driver ID | KV đang lưu |
| --- | --- |
| 163031 | KV2 |
| 129913 | KV5 |
| 160830 | KV4 |
| 114748 | KV5 |
| 113451 | KV5 |
| 141962 | KV5 |
| 157697 | KV5 |
| 160627 | KV5 |
| 162661 | KV5 |
| 162856 | KV5 |
| 147406 | KV5 |
| 142679 | KV5 |
| 141385 | KV5 |
| 162518 | KV5 |
| 163028 | KV5 |

Chênh lệch tổng số còn gồm các rider có sẵn được giữ nguyên khi dòng nguồn không hợp lệ. Đồng bộ không xóa rider khi nguồn thiếu dòng.

## Trạng thái và phạm vi kiểm tra

Đã khởi động lại đồng bộ mỗi phút. Lượt chạy đầu: 0 thêm, 0 sửa, 1.160 không đổi. Ba bài kiểm tra parser, TypeScript và lint các file liên quan đều đạt.

Đối chiếu xác nhận web khớp nguồn, không xác minh được tính đúng thực tế của KV mà người quản lý nhập trên Sheet. Những dòng thiếu/trùng cần được sửa ở nguồn. Tiến trình hiện phụ thuộc máy Windows đang chạy, chưa cài tự khởi động sau khi khởi động lại máy.
