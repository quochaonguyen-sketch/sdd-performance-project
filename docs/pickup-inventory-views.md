# Tồn pickup

- Tồn khu vực / zone: danh sách mã zone trực tiếp theo KV1–KV5, không còn bước nhóm theo phường. Tìm mã zone, lọc COT đơn và mức tồn; KPI và biểu đồ dùng cùng dữ liệu zone. Zone trống vẫn có nhóm Chưa có mã zone.
- Tồn theo rider: cột Mã zone liệt kê các zone đang giữ đơn; tìm được bằng tên, mã rider hoặc mã zone. Lọc theo COT phụ trách từ hồ sơ rider, giữ cả tồn từ COT trước. Không tách rider theo COT tạo đơn.
- API zone-board và riders yêu cầu đăng nhập và quyền quản lý pickup. RPC chỉ cấp service_role, tổng hợp JSON tránh giới hạn 1000 dòng. Snapshot lấy từ dữ liệu nguồn.
- Cài SQL: prisma/pickup-rider-inventory.sql. Kiểm tra SQL bằng tests/pickup-rider-inventory.integration.sql trong giao dịch rollback.
