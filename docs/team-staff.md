# Nhân sự & lịch FTE

Trang `/team` nằm trong nhóm Đội ngũ, gồm danh sách SUP / LEAD / FTE / BPO (giữ nhãn nguồn SBPO), scope khu vực, tìm tên/OPS ID/email, lịch tuần/tháng và xuất lịch CSV. Chọn Lịch FTE mặc định lọc chức danh FTE; có thể đổi sang chức danh khác.

Nhân sự nhiều KV được hiển thị ở từng KV nhưng tổng chung đếm duy nhất theo hồ sơ. KV6/SPF được giữ theo nguồn, không tự đổi phân công nhân sự sang KV5. Ô lịch trống là chưa xếp ca; OFF, AL, SL, PH và ca kèm hậu tố được giữ nguyên. Nhóm OFF hoặc trạng thái Inactive nằm trong mục đã nghỉ/lưu trữ; dòng thiếu chức danh/trạng thái hoặc nhóm OFF nhưng Active có ghi chú cần kiểm tra.

Chỉ admin được tạo/sửa hồ sơ, thay ca hoặc nhập lại CSV. Người dùng đã đăng nhập được xem qua API. Hai bảng `team_staff` / `team_staff_shifts` bật RLS và không cấp quyền truy cập trực tiếp cho anon/authenticated; API service kiểm tra phiên/quyền hiện tại, trigger database kiểm tra admin và ghi nhật ký trước/sau qua hệ thống audit chung. Hồ sơ không tự tạo tài khoản Auth hoặc cấp quyền rider.

`prisma/team-staff.sql` tạo bảng, chỉ mục, guard, trigger audit và RPC nhập nguyên tử. Trước khi áp dụng database mới cần cài `prisma/user-activity-and-rider-scope.sql`. RPC import dùng quyền invoker, chỉ service_role được gọi; lỗi ở một dòng rollback toàn lượt. OPS ID không trống phải duy nhất. Nhập lại cùng file không tạo trùng hồ sơ/ca hoặc nhật ký cập nhật thừa. Ca trống trong CSV không xóa dữ liệu; ca có giá trị sẽ cập nhật lịch hiện tại, nên luôn có bước xem trước khi nhập trên web.

Nguồn lần đầu: `SDD Hub - __Lịch FTE.csv`, 87 hồ sơ, 11.920 ô lịch có dữ liệu, 01/12/2025–31/10/2026. Dòng Date / Shift chứa chuỗi ngày liên tục được dùng làm trục lịch; cột 164 ở tiêu đề nhân sự ghi `01/05/2026` nhưng tương ứng ngày 01/05/2026 theo lịch liên tục (thay vì hiểu là 05/01). Parser ghi cảnh báo về khác biệt tiêu đề. Import ban đầu có 53 hồ sơ Active ngoài nhóm OFF; sau ba chỉnh sửa trạng thái có nhật ký trên web, còn 50: SUP 2, LEAD 3, FTE 31, BPO 14. Các chỉnh sửa trên web được giữ nguyên khi xác minh, không nhập đè lại nguồn.

Kiểm tra: 5 kiểm thử parser/model; SQL integration rollback kiểm tra chặn member, chống giả actor, audit trước/sau, import nguyên tử, idempotency và quyền Data API; đối chiếu toàn bộ trường nguồn/ô lịch qua `scripts/verify-team-staff.mts`. Giao diện thật được kiểm tra bằng bundle QA tạm với tên nhân sự đã ẩn; truy cập trang thật từ trình duyệt kiểm thử yêu cầu đăng nhập. Build production và lint phần mới đạt.

Lệnh vận hành (từ thư mục project):

```powershell
node --env-file=.env --env-file=.env.local scripts/admin-audit-db.cjs prisma/team-staff.sql
node --experimental-strip-types scripts/import-team-staff.mts "đường-dẫn.csv"
# Thêm --apply để nhập nguồn qua CLI; ghi nhật ký hệ thống, không giả tài khoản người dùng.
node --experimental-strip-types --env-file=.env --env-file=.env.local scripts/import-team-staff.mts "đường-dẫn.csv" --apply
node --experimental-strip-types --env-file=.env --env-file=.env.local scripts/verify-team-staff.mts "đường-dẫn.csv"
node --env-file=.env --env-file=.env.local scripts/admin-audit-db.cjs tests/team-staff.integration.sql --test
```
