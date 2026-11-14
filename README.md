# RoomKeep — API

Node.js (Express 4) + MongoDB (Mongoose 8) cho app Android "RoomKeep" (quản lý nhà trọ, offline-first).
Mô tả app: [docs/RoomKeep-mo-ta.md](docs/RoomKeep-mo-ta.md) · Tài liệu API cho app: [docs/API-cho-FE.md](docs/API-cho-FE.md).
Cùng kiến trúc với `ealing_api`: entry Vercel ở `api/`, rate limit lưu trong Mongo, test trên MongoDB in-memory.

```bash
cp .env.example .env     # đặt MONGODB_URI (database: roomkeep, cùng cluster Atlas với các app khác) và JWT_SECRET
npm install
npm run db:init          # tạo database, collection, index (chạy lại an toàn)
npm run dev              # http://localhost:4000  -> /health, /v1
npm test                 # replica set in-memory (dùng mongod local nếu có)
npm run docs             # sinh lại mục 6 (CRUD) của docs/API-cho-FE.md sau khi sửa schema
```

## Kết nối MongoDB

* `MONGODB_URI` trong `.env`: cluster Atlas dùng chung, **mỗi app một database** (`roomkeep`).
* Local: `src/server.js` connect rồi mới `listen`. Vercel: `api/index.js` cache kết nối, `autoIndex=false` nên **chạy `npm run db:init` một lần** với đúng URI.
* Đẩy dữ liệu (`/sync/push`), đăng ký, xóa tài khoản chạy trong **transaction** (Atlas có sẵn replica set).

## Collections

| Collection | Nội dung |
|---|---|
| `accounts` | Tài khoản: email (duy nhất), bcrypt hash, tên hiển thị, ngôn ngữ, `propertyId` + `role` (`owner`/`manager`) |
| `properties` | Nhà trọ: tên, địa chỉ, SĐT, `rev` (bộ đếm phiên bản đồng bộ), `purgedRev` |
| `sessions` | Mỗi thiết bị đăng nhập: hash refresh token hiện tại + trước đó, hạn trượt, hạn tuyệt đối, thu hồi |
| `sync_records` | **Mọi bảng nghiệp vụ của Room** (Room, Tenant, Contract, MeterReading, RoomStatement...) dạng `{propertyId, table, recordId, rev, isDeleted, payload}` |
| `receipts` | Idempotency key của push (7 ngày) và đăng ký (1 ngày) |
| `invites`, `password_resets`, `rate_hits` | Mã mời quản lý, mã đặt lại mật khẩu (chỉ lưu hash), bộ đếm rate limit / sai mật khẩu |

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `src/services/accounts.js` | Đăng ký (tài khoản + nhà trọ một transaction), đăng nhập, quên/đổi mật khẩu, hồ sơ, xóa tài khoản, thiết bị, mời và thành viên |
| `src/services/tokens.js` | JWT access token, refresh token xoay vòng + phát hiện dùng lại, phiên tuyệt đối |
| `src/services/sync.js` | Push/pull theo `rev`, xung đột theo `baseRev`, bảng chỉ ghi thêm, khóa kỳ, chặn bảng theo vai trò |
| `src/resources/schema.js` | **Schema 69 bảng**: đường dẫn REST, trường/kiểu/bắt buộc/mặc định/enum, liên kết + quy tắc xóa (`restrict`/`cascade`), tìm kiếm, không trùng |
| `src/resources/validate.js` | Kiểm tra bản ghi theo schema (dùng chung cho CRUD và `sync/push`) |
| `src/routes/crud.js` | CRUD từng bảng: danh sách (lọc, `q` không dấu, khoảng ngày, sắp xếp, phân trang), chi tiết, tạo, sửa (`rev`), xóa (chặn/xóa theo), trùng hợp đồng |
| `src/services/onboarding.js` | Bước 2-5 của đăng ký → bản ghi AppSettings, đơn giá điện/nước/dịch vụ, dãy/tầng/phòng |
| `src/services/tables.js` | Danh sách bảng đồng bộ, bảng chỉ ghi thêm, bảng chỉ chủ trọ thấy, bảng gắn kỳ thu |
| `src/web/deletion.js` | Trang web `/account/delete` để yêu cầu xóa tài khoản (yêu cầu của Google Play) |
| `src/middleware/` | requestId + ngôn ngữ, xác thực, rate limit, chặn app cũ (`X-App-Version`), lỗi `{code,message,...}` |

## Quyết định khi tài liệu chưa nói rõ

* **CRUD từng phần và đồng bộ dùng chung dữ liệu** (`sync_records`) và chung một đường ghi (`applyChanges`): cùng `rev`, khóa kỳ, phân quyền. App tính tiền/tiêu thụ; server kiểm tra schema, liên kết, không trùng, hợp đồng chồng ngày, quy tắc xóa, và tính `collectStatus` của bảng tính tiền.
* **Danh tính chỉ lấy từ token.** Mỗi request đọc lại session + account (không tin `role`/`pid` trong JWT), nên đăng xuất, đổi mật khẩu, gỡ thiết bị, gỡ quản lý có hiệu lực ngay.
* **Phiên:** access 2h, refresh trượt 3h không hoạt động, phiên tuyệt đối 12h (đều chỉnh bằng env). Ngưỡng "1 giờ ở nền" là việc của app (token chỉ trong bộ nhớ).
* **Lỗi** theo mô tả: `{ code, message, fields?, requestId }` (không bọc `error`). `message` theo `Accept-Language` (vi mặc định, en), app nên dịch theo `code`.
* **Một tài khoản thuộc tối đa một nhà trọ.** Người được mời có thể đăng ký bằng `inviteCode` (không cần tạo nhà trọ). Nếu đã đăng ký kèm nhà trọ còn trống rồi mới nhập mã, nhà trọ trống đó bị bỏ; nhà trọ đã có dữ liệu thì bị từ chối `already_in_property`.
* **Quản lý (`manager`)** không thấy/không ghi: `StaffPay`, `Investment`, `Expense`, `UtilityBill`, `ReserveFundEntry`, `CashEntry`, `Target`; không mời người, không xem thành viên, không sửa thông tin nhà trọ, không mở khóa kỳ.
* **Khóa kỳ:** `BillingCycle.payload.status = "locked"` chặn sửa `RoomStatement`, `StatementLine`, `StatementAdjust`, `SharedCost`, `SharedCostShare`, `UsageLog` của kỳ đó (`period_locked`). `Collection` (ghi lần thu) vẫn được phép sau khi khóa.
* **AppSettings** dùng id cố định `"main"`. Sửa tên/địa chỉ/SĐT trong AppSettings (push) hoặc `PATCH /v1/me` đều đồng bộ hai chiều với `properties`.
* **Dấu xóa** giữ 90 ngày rồi job hằng ngày xóa cứng; thiết bị có con trỏ cũ hơn nhận `409 resync_required`.
* **Email quên mật khẩu:** mã 8 ký tự (`ABCD-EFGH`), 30 phút, dùng một lần. Chưa cấu hình SMTP thì ngoài production API trả `devToken` để test; production không trả.
* **Mật khẩu:** bcrypt (bcryptjs, chạy được trên Vercel), 8-72 byte, có chữ và số. Sai 5 lần / 15 phút → `429 too_many_attempts`.

## Deploy (Vercel)

`vercel.json` chuyển mọi request vào `api/index.js` (region `sin1`, cron 19:00 UTC = 02:00 giờ VN). Đặt `MONGODB_URI`, `JWT_SECRET`, `CRON_SECRET`, `PUBLIC_BASE_URL`, SMTP; chạy `npm run db:init` một lần.
