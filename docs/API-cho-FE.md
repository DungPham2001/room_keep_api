# RoomKeep API — tài liệu cho app Android

Base URL: `https://<domain>` — mọi endpoint nằm dưới `/v1`. Kiểm tra sống: `GET /v1/health`.
Chỉ HTTPS, JSON UTF-8. Ngày `yyyy-MM-dd`, kỳ `yyyy-MM`, thời điểm ISO 8601 UTC. Tiền là **số nguyên đồng**.

## 1. Quy ước chung

### 1.1 Header
| Header | Khi nào | Ghi chú |
|---|---|---|
| `Authorization: Bearer <accessToken>` | Mọi endpoint cần đăng nhập (đánh dấu 🔒) | Không bao giờ đưa token vào URL |
| `Accept-Language: vi` hoặc `en` | Nên gửi luôn | Ngôn ngữ của `message` lỗi và email quên mật khẩu |
| `X-App-Version: 1.2.0` | Nên gửi luôn | Cũ hơn `minAppVersion` → `426 upgrade_required` |
| `Idempotency-Key` | Tùy chọn ở `/auth/register` | Tương đương `idempotencyKey` trong body |

### 1.2 Lỗi
```json
{ "code": "validation_failed", "message": "Dữ liệu không hợp lệ", "fields": [{ "field": "account.email", "code": "invalid_format" }], "requestId": "req_ab12cd34ef56" }
```
App **dịch theo `code`**, không hiển thị `message` thô. Mã trường (`fields[].code`): `required`, `invalid_type`, `too_short`, `too_long`, `out_of_range`, `invalid_format`, `invalid_enum`, `weak_password`, `terms_required`, `not_found`, `duplicate_id`, `invite_invalid`, `wrong_password`, `same_as_old`.

| HTTP | `code` | App nên làm |
|---|---|---|
| 400 | `validation_failed` | Tô đỏ các trường trong `fields` |
| 400 | `reset_invalid` | "Mã đặt lại không đúng hoặc đã hết hạn" |
| 401 | `unauthorized`, `token_expired`, `token_invalid` | Gọi `/auth/refresh` **một lần** rồi gửi lại |
| 401 | `session_revoked`, `session_expired`, `refresh_invalid`, `refresh_reused` | Về màn hình đăng nhập, **không xóa dữ liệu trên máy** |
| 401 | `invalid_credentials` | "Email hoặc mật khẩu không đúng" |
| 403 | `wrong_password` | Mật khẩu xác nhận sai (đổi mật khẩu, xóa tài khoản, đổi email) |
| 403 | `forbidden` | Vai trò không đủ quyền |
| 403 | `no_property` | Tài khoản chưa thuộc nhà trọ nào → màn hình "nhập mã mời / tạo nhà trọ" |
| 404 | `not_found` | |
| 409 | `email_taken`, `already_member`, `already_in_property`, `has_property`, `owner_cannot_leave` | Thông báo tương ứng |
| 409 | `resync_required` | Tải lại toàn bộ (mục 4.4) |
| 413 | `payload_too_large` | Chia lô nhỏ hơn |
| 426 | `upgrade_required` | Màn hình bắt buộc cập nhật (`minAppVersion`, `latestAppVersion` có trong body) |
| 429 | `too_many_attempts`, `rate_limited` | Chờ `Retry-After` giây (có cả `retryAfter` trong body) |
| 503 | `service_unavailable` | "Máy chủ đang bận" + nút thử lại |
| 5xx | `internal_error` | "Hệ thống đang gặp sự cố" + nút thử lại |

Không có phản hồi (mất mạng, timeout, DNS, SSL) là lỗi phía app: hiện "Không có kết nối mạng, vui lòng kiểm tra và thử lại".

## 2. Tài khoản và phiên

### 2.1 `GET /v1/health`
```json
{ "status": "ok", "apiVersion": "1.0.0", "minAppVersion": "1.0.0", "latestAppVersion": "1.0.0", "serverTime": "2026-11-13T08:00:00Z" }
```

### 2.2 `POST /v1/auth/register` → `201`
Tạo **tài khoản + nhà trọ trong một giao dịch**. `billing`, `rates`, `layout` tùy chọn (bước 3-5 bỏ qua được).
```json
{
  "account": { "email": "chu@example.com", "password": "matkhau123", "displayName": "Cô Lan", "preferredLanguage": "vi" },
  "acceptTerms": true,
  "property": {
    "name": "Nhà trọ Hoa Sen", "address": "12 Lê Lợi", "phone": "0901234567",
    "billing": { "meterDay": 25, "cycleStartDay": 1, "dueDay": 5, "dayCountMode": "fixed30", "roundingStep": 1000 },
    "rates": {
      "electric": { "mode": "flat", "price": 3500 },
      "water": { "mode": "per_m3", "price": 18000 },
      "services": [{ "name": "Internet", "calcMode": "per_room", "price": 100000 }]
    },
    "layout": { "generate": { "blocks": 1, "floorsPerBlock": 3, "roomsPerFloor": 5, "defaultRent": 2500000, "capacity": 2 } }
  },
  "deviceName": "Pixel 8",
  "deviceId": "<id cài đặt của app, cố định trên máy>",
  "idempotencyKey": "<uuid sinh 1 lần cho bản nháp đăng ký>"
}
```
* Mật khẩu: 8-72 byte, có chữ và số. Email không phân biệt hoa thường.
* `dayCountMode`: `fixed30` | `actual`. `electric.mode`: `flat` (cần `price`) | `tiered` (cần `tiers: [{fromKwh, toKwh, pricePerKwh, name?}]`, liền nhau từ 0, chỉ bậc cuối được `toKwh: null`). `water.mode`: `per_m3` | `per_person`. `services[].calcMode`: `per_room` | `per_person` | `per_use`.
* `layout` dạng tự liệt kê (đúng như bản xem trước đã sửa trong app):
  `{ "blocks": [{ "id?": "...", "name": "Dãy A" }], "floors": [{ "id?", "blockId" | "blockIndex": 0, "label": "Tầng 1" }], "rooms": [{ "id?", "floorId" | "floorIndex": 0, "name": "A101", "monthlyRent": 2500000, "areaSqm?": 18.5, "capacity?": 2 }] }`.
  Gửi `id` (UUID của app) để giữ đúng id đã có trong Room. `generate` đặt tên `Dãy A`, `Tầng 1`, phòng `A101, A102...`. Tối đa 1000 phòng.
* **Người được mời làm quản lý**: thay `property` bằng `"inviteCode": "ABCD2345"`.
* Gửi lại cùng `idempotencyKey` + cùng email/mật khẩu (mất mạng sau khi server đã tạo) → `200` với cùng tài khoản, không tạo nhà trọ thứ hai.

Phản hồi (dùng chung cho đăng ký, đăng nhập, nhận mời, tạo nhà trọ):
```json
{
  "account": { "id": "uuid", "email": "chu@example.com", "displayName": "Cô Lan", "preferredLanguage": "vi", "role": "owner", "propertyId": "uuid", "createdAt": "..." },
  "property": { "id": "uuid", "name": "Nhà trọ Hoa Sen", "address": "12 Lê Lợi", "phone": "0901234567", "ownerId": "uuid", "createdAt": "..." },
  "role": "owner",
  "tokens": {
    "tokenType": "Bearer", "accessToken": "eyJ...", "accessTokenExpiresAt": "...", "expiresIn": 7200,
    "refreshToken": "....", "refreshTokenExpiresAt": "...", "sessionExpiresAt": "...", "deviceId": "uuid-thiết-bị-trên-server"
  },
  "changes": [ /* bản ghi đồng bộ, định dạng mục 4.3 */ ],
  "rev": 42,
  "hasMore": false
}
```
`changes` + `rev` chỉ có ở đăng ký và tạo nhà trọ: ghi thẳng vào Room, đặt `lastPulledRev = rev` (nếu `hasMore` thì pull tiếp từ `rev`).
Bản ghi sinh sẵn: `AppSettings` (id `"main"`), `ElectricityTier`, `WaterRate`, `Service` + `ServicePrice`, `Block`, `Floor`, `Room` (`status: "vacant"`, có `nameNoAccent`) + `RoomPrice`, `OnboardingStep` (`property_info`, `billing_rules`, `rates`, `blocks_rooms`, `first_tenant`, đánh dấu `isDone` theo những gì đã nhập).

### 2.3 `POST /v1/auth/login` → `200`
`{ "email", "password", "deviceName", "deviceId" }` → `{ account, property, role, tokens }`. Sai 5 lần/15 phút → `429`.
Đăng nhập lại từ cùng `deviceId` sẽ thay phiên cũ của máy đó.

### 2.4 `POST /v1/auth/refresh` → `200`
`{ "refreshToken" }` → `{ "tokens": {...} }`. **Mỗi lần trả cặp mới, cặp cũ vô hiệu.** Gửi lại refresh token cũ → cả phiên bị thu hồi (`refresh_reused`).
* Chỉ một luồng làm mới tại một thời điểm (nhiều request cùng gặp 401 dùng chung một lần refresh).
* Làm mới chủ động khi access token còn ~5 phút và app đang ở trước màn hình.
* Refresh hết hạn nếu 3 giờ không làm mới; phiên tối đa 12 giờ kể từ đăng nhập (`sessionExpiresAt`) → đăng nhập lại.

### 2.5 `POST /v1/auth/logout` → `204`
`{ "refreshToken" }` (Bearer tùy chọn). Luôn `204`.

### 2.6 Quên / đặt lại mật khẩu
* `POST /v1/auth/forgot` `{ "email" }` → **luôn `202`** `{ "status": "accepted" }`, kể cả email chưa đăng ký (không lộ email nào có tài khoản). Gửi `Accept-Language` để email đúng ngôn ngữ.
  * Email gửi tới **địa chỉ đã đăng ký**, tiêu đề `ABCD-EFGH là mã đặt lại mật khẩu RoomKeep của bạn`; mã hiệu lực 30 phút, dùng 1 lần.
  * Yêu cầu mã mới thì mã cũ hết hiệu lực. Tối đa 3 mã/giờ/email (quá thì vẫn `202` nhưng không gửi).
  * Gọi mất vài giây (chờ máy chủ email): hiện vòng xoay chờ, timeout 15 giây.
  * Môi trường dev chưa cấu hình SMTP: phản hồi có thêm `devToken` (mã) để test. Production không bao giờ có.
* `POST /v1/auth/reset` `{ "token": "ABCD-EFGH", "newPassword" }` → `204`.
  * `token`: không phân biệt hoa thường, có hay không dấu gạch, nên cho dán nguyên mã từ email.
  * `newPassword`: 8-72 byte, có cả chữ và số, không đạt thì `400` với `fields[].code = "weak_password"`. Sai mã hoặc hết hạn: `400 reset_invalid`.
  * Thành công: **mọi thiết bị bị đăng xuất** và khóa do nhập sai mật khẩu (nếu có) được gỡ. App chuyển về màn hình đăng nhập, điền sẵn email.
  * Server gửi email **"Mật khẩu RoomKeep của bạn đã được thay đổi"** về địa chỉ đã đăng ký (thời gian, cách đổi, hướng dẫn nếu không phải chính chủ). App không cần làm gì.

Luồng màn hình đề xuất: *Quên mật khẩu* (nhập email) → *Nhập mã + mật khẩu mới* (có nút "Gửi lại mã" sau 60 giây) → *Đăng nhập*.

### 2.7 🔒 `POST /v1/auth/change-password` → `200`
`{ "oldPassword", "newPassword" }` → `{ "status": "ok", "revokedSessions": 2 }`. Thiết bị hiện tại giữ phiên, các thiết bị khác bị đăng xuất. Server gửi email thông báo đổi mật khẩu (kèm tên thiết bị `deviceName` lúc đăng nhập) theo ngôn ngữ `Accept-Language`.

### 2.8 🔒 Hồ sơ
* `GET /v1/me` → `{ account, property, role }` (`property` = `null` nếu chưa thuộc nhà trọ nào).
* `PATCH /v1/me` gửi trường muốn đổi: `displayName`, `preferredLanguage` (`vi`|`en`), `email` (**kèm `password`**), `propertyName`, `address`, `phone` (3 trường nhà trọ chỉ chủ trọ). Trả `{ account, property, role }`. Đổi thông tin nhà trọ cũng cập nhật bản ghi `AppSettings` (các máy khác nhận khi pull).
* `DELETE /v1/me` `{ "password" }` → `204`. **Chủ trọ: xóa nhà trọ và toàn bộ dữ liệu trên máy chủ**, quản lý mất quyền truy cập. Quản lý: chỉ xóa tài khoản của mình.
* `POST /v1/me/property` `{ "property": {...như đăng ký} }` → `201` (cùng định dạng 2.2): cho tài khoản chưa có nhà trọ (vd quản lý bị gỡ).
* Trang web yêu cầu xóa (đưa link lên Google Play): `https://<domain>/account/delete` (thêm `?lang=en`).

### 2.9 🔒 Thiết bị
* `GET /v1/devices` → `{ "devices": [{ "id", "name", "createdAt", "lastSeenAt", "expiresAt", "isCurrent" }] }`
* `DELETE /v1/devices/{id}` → `204` (đăng xuất từ xa ngay lập tức).

## 3. 🔒 Mời quản lý và thành viên (chủ trọ)

| Method | Đường dẫn | Ai | Mô tả |
|---|---|---|---|
| POST | `/v1/invites` `{ "role": "manager" }` | owner | `201 { id, code: "ABCD2345", role, expiresAt, createdAt, status: "active" }`, hạn 48h, dùng 1 lần |
| GET | `/v1/invites` | owner | `{ invites: [...] }`, `status`: `active`/`used`/`expired`/`revoked` |
| DELETE | `/v1/invites/{id}` | owner | Thu hồi mã chưa dùng → `204` |
| POST | `/v1/invites/accept` `{ "code" }` | ai cũng được | Vào nhà trọ → `{ account, property, role, tokens }` (**thay token đang giữ**), rồi tải dữ liệu từ `since=0` |
| GET | `/v1/members` | owner | `{ members: [{ accountId, displayName, email, role, joinedAt }] }` |
| DELETE | `/v1/members/{accountId}` | owner (gỡ quản lý) / manager (`me` = tự rời) | `204`. Người bị gỡ nhận `403 no_property` ngay ở request sau |

**Quyền của quản lý (server chặn thật, không chỉ ẩn nút):** không pull/push các bảng `StaffPay`, `Investment`, `Expense`, `UtilityBill`, `ReserveFundEntry`, `CashEntry`, `Target`; không mời, không xem thành viên, không sửa thông tin nhà trọ, không mở khóa kỳ. App ẩn các màn hình lợi nhuận, lương, chi phí, xóa tài khoản chủ, mời người khi `role = "manager"`.

## 4. 🔒 Đồng bộ

Server lưu nguyên `payload` của từng bản ghi Room, không tự tính tiền. Mỗi thay đổi được nhận nhận một `rev` tăng dần **theo nhà trọ**; app lưu `rev` này vào `serverRev` của bản ghi và dùng `lastPulledRev` làm con trỏ.

### 4.1 Bảng được đồng bộ
`AppSettings` (id luôn `"main"`), `Block`, `Floor`, `RoomType`, `Room`, `RoomPrice`, `RoomItem`, `RoomDevice`, `PriceBatch`, `OnboardingStep`, `MessageTemplate`, `Tenant`, `Occupant`, `Contract`, `ContractFee`, `ContractChange`, `RoomTransfer`, `ContractTemplate`, `Reservation`, `Prospect`, `Viewing`, `Meter`, `MeterReading`, `MeterReplacement`, `ElectricityTier`, `WaterRate`, `Service`, `ServicePrice`, `ParkingSlot`, `UsageLog`, `SharedCost`, `SharedCostShare`, `BillingCycle`, `RoomStatement`, `StatementLine`, `StatementAdjust`, `Collection`, `DepositEntry`, `HandoverRecord`, `CheckoutCheck`, `DamageCharge`, `RepairRequest`, `Repairer`, `MaintenancePlan`, `MaintenanceLog`, `Visitor`, `KeyLog`, `RuleViolation`, `Announcement`, `CashEntry`, `Expense`, `UtilityBill`, `ReserveFundEntry`, `Staff`, `StaffSchedule`, `StaffPay`, `TaskItem`, `CleaningPlan`, `PatrolItem`, `PatrolRun`, `Feedback`, `Complaint`, `TenantNote`, `MoveOutReason`, `Investment`, `Target`, `Todo`, `ChecklistItem`, `ChecklistRun`.
Bảng chỉ ở máy (không gửi): `Account`, `RegistrationDraft`, `SyncOutbox`, `SyncState`, `SyncConflict`, `SyncLog`, `DeviceSession`, `InviteLocal`. Id bản ghi: 1-64 ký tự `[A-Za-z0-9_-]` (UUID). `payload` ≤ 64 KB.

### 4.2 `POST /v1/sync/push`
```json
{
  "deviceId": "<id cài đặt>",
  "changes": [
    { "table": "Tenant", "id": "uuid", "op": "upsert", "updatedAt": "2026-11-13T08:00:00Z", "baseRev": 17, "payload": { "id": "uuid", "name": "Nguyễn Văn A", "phone": "0900000000", "isDemo": false }, "idempotencyKey": "uuid" },
    { "table": "Room", "id": "uuid", "op": "delete", "baseRev": 9, "idempotencyKey": "uuid" }
  ]
}
```
* Tối đa 500 thay đổi và ~4 MB mỗi lô. Gửi theo thứ tự của `SyncOutbox`.
* `baseRev`: `serverRev` mà bản sửa dựa trên; `null` cho bản ghi tạo mới ở máy.
* `op: "delete"` hoặc `payload.isDeleted = true` đều là dấu xóa (xóa mềm).

Phản hồi `200`:
```json
{
  "accepted":  [{ "table": "Tenant", "id": "uuid", "idempotencyKey": "uuid", "rev": 18 }],
  "conflicts": [{ "table": "Room", "id": "uuid", "idempotencyKey": "uuid", "baseRev": 9, "server": { /* bản ghi trên server, định dạng 4.3 */ } }],
  "rejected":  [{ "table": "Expense", "id": "uuid", "idempotencyKey": "uuid", "code": "forbidden_table", "field": "table" }],
  "newRev": 18
}
```
* `accepted`: ghi `serverRev = rev`, xóa khỏi outbox. Có thể kèm `duplicate: true` (gửi lại cùng `idempotencyKey`, không tạo phiên bản mới) hoặc `unchanged: true` (server đã có đúng nội dung này).
* `conflicts`: lưu vào `SyncConflict`, hiện màn hình so sánh. **Giữ bản máy** → gửi lại với `baseRev = server.rev`. **Giữ bản server** → ghi `server.payload` vào Room, bỏ outbox.
* `rejected` (không thử lại, ghi vào nhật ký đồng bộ): `unknown_table`, `invalid_change`, `validation_failed` (kèm `fields`, theo schema ở mục 6.4), `payload_too_large`, `forbidden_table` (quản lý), `period_locked` (kỳ đã khóa).
* Nhiều thay đổi của cùng một bản ghi trong một lô: thay đổi sau dựa trên thay đổi trước, không tự xung đột.
* **Không bao giờ xung đột:** `Collection`, `DepositEntry`, `MeterReading` (chỉ ghi thêm).
* **Khóa kỳ:** `BillingCycle.payload = { cycle: "2026-11", status: "open" | "locked", ... }`. Khi `locked`: sửa `RoomStatement` (theo `cycleId`), `StatementLine`/`StatementAdjust` (theo `statementId`), `SharedCost`/`UsageLog` (theo `cycle`), `SharedCostShare` (theo `sharedCostId`) bị `period_locked`. Ghi `Collection` vẫn được. Chỉ chủ trọ mở khóa được.
* Lỗi mạng / 5xx / 429: thử lại cả lô với giãn cách tăng dần (an toàn nhờ `idempotencyKey`). 4xx khác: không thử vô hạn.

### 4.3 `GET /v1/sync/pull?since=<rev>&limit=500&tables=Room,Tenant`
```json
{
  "changes": [{ "table": "Room", "id": "uuid", "rev": 19, "op": "upsert", "isDeleted": false, "updatedAt": "2026-11-13T08:00:00Z", "serverUpdatedAt": "2026-11-13T08:00:03Z", "payload": { "id": "uuid", "...": "..." } }],
  "nextRev": 19,
  "hasMore": false,
  "serverRev": 19
}
```
* Ghi từng lô vào Room trong một transaction, lưu `lastPulledRev = nextRev` sau mỗi lô; lặp khi `hasMore`.
* `limit` 1-1000 (mặc định 500). `tables` để bật/tắt nhóm dữ liệu (tính năng 152); bỏ trống = mọi bảng được phép.
* `since=0` (máy mới): không trả dấu xóa.
* Bản ghi đang có thay đổi chưa gửi trong outbox: không ghi đè, để push xử lý xung đột.

### 4.4 Tải lại toàn bộ
`409 resync_required` khi con trỏ quá cũ (dấu xóa đã bị dọn sau 90 ngày) hoặc lớn hơn `serverRev` (server khôi phục, đổi nhà trọ). Cách làm: đẩy outbox trước, pull từ `since=0`, rồi xóa ở máy các bản ghi đã đồng bộ (`serverRev != null`) không có trong kết quả.

### 4.5 `GET /v1/sync/summary`
`{ "serverRev": 120, "purgedRev": 0, "lastChangeAt": "...", "tables": { "Room": 15, "Tenant": 22 } }` cho màn hình trạng thái kết nối.

## 5. Giới hạn
* Theo IP: đọc 120/phút, ghi 60/phút, các endpoint đăng nhập/đăng ký/quên mật khẩu 10/phút → `429` + `Retry-After`.
* Timeout app đề xuất 15 giây; không thử lại vô hạn.

<!-- CRUD:START: phần này sinh tự động từ src/resources/schema.js bằng `npm run docs`, đừng sửa tay -->
## 6. 🔒 CRUD từng phần

Mỗi phần (69 bảng của Room) có REST CRUD riêng. Cài đặt nhà trọ là `GET/PATCH /v1/settings`.

* Dữ liệu CRUD và dữ liệu đồng bộ là **một**: ghi qua CRUD tăng `rev`, app nhận khi pull; ghi qua push thì CRUD đọc thấy ngay.
* App Android vẫn nên dùng `sync/push` + `sync/pull` cho thao tác hằng ngày (offline-first). CRUD dùng khi cần thao tác trực tiếp với server (web quản trị, màn hình chỉ chạy khi có mạng, công cụ nhập liệu, kiểm thử).
* `sync/push` kiểm tra **cùng schema** ở mục 6.4: thiếu trường bắt buộc, sai kiểu, sai enum → bản ghi vào `rejected` với `code: "validation_failed"` và `fields`. Trường app có mà schema chưa có được giữ nguyên.

### 6.1 Quy ước chung

Mọi endpoint cần `Authorization: Bearer <accessToken>` và tài khoản đã thuộc một nhà trọ. Dữ liệu chỉ là của nhà trọ trong token.

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/v1/{path}` | Danh sách: `{ data: [...], page: { limit, offset, total } }` |
| GET | `/v1/{path}/{id}` | Một bản ghi |
| POST | `/v1/{path}` | Tạo → `201` + bản ghi. Có thể gửi `id` (UUID của app); trùng id → `409 duplicate` |
| PATCH | `/v1/{path}/{id}` | Sửa các trường gửi lên → `200` + bản ghi. Gửi kèm `rev` để chống ghi đè: `rev` cũ → `409 version_conflict` kèm `current` |
| DELETE | `/v1/{path}/{id}` | Xóa mềm → `204` (`?rev=` tùy chọn). Còn dữ liệu phụ thuộc → `409 has_dependents` kèm `blockedBy` |

**Bản ghi trả về:** `id`, mọi trường của bảng (chưa có giá trị = `null`), trường tính sẵn, `isDemo`, `rev`, `createdAt`, `updatedAt`. Không gửi được `rev`/`createdAt`/`updatedAt`/`nameNoAccent`/trường tính sẵn (bị bỏ qua).

**Danh sách:**
- Lọc theo trường: `?status=vacant`, nhiều giá trị enum `?status=vacant,reserved`, liên kết `?roomId=<id>`, true/false `?isDone=false`, `?endDate=null`.
- `?q=` tìm không dấu, không phân biệt hoa thường, trên các trường "Tìm" của bảng.
- `?from=yyyy-MM-dd&to=yyyy-MM-dd` trên trường "Ngày chính" của bảng.
- `?sort=name` hoặc `?sort=-createdAt` (trường của bảng, `createdAt`, `updatedAt`). Mặc định: trường "Sắp xếp" tăng dần, không có thì mới nhất trước.
- `?limit=` 1-200 (mặc định 50), `?offset=`. `?isDemo=true|false`.

**Lỗi riêng của CRUD:** `400 validation_failed` (`fields[].code`: `required`, `invalid_type`, `too_long`, `out_of_range`, `invalid_format`, `invalid_enum`, `not_found` = liên kết không tồn tại), `403 forbidden` (quản lý vào bảng chỉ chủ trọ), `404 not_found`, `409 duplicate` (kèm `existingId`), `409 version_conflict`, `409 has_dependents`, `409 contract_overlap`, `409 append_only`, `409 period_locked`.

### 6.2 Luật nghiệp vụ

**Liên kết khi xóa:** *chặn xóa* = không xóa được bản ghi cha khi còn bản ghi này; *xóa theo* = xóa bản ghi cha thì bản ghi này bị xóa cùng.

**Đồng bộ:** mọi thay đổi qua CRUD đều tăng `rev` và app Android nhận được ở lần `GET /v1/sync/pull` kế tiếp. `/v1/sync/push` kiểm tra cùng schema (trường lạ của app được giữ nguyên).

- Hợp đồng `draft`/`active` của cùng một phòng không được chồng ngày (`startA < endB && startB < endA`, không có `endDate` = vô thời hạn) → `409 contract_overlap`; `endDate` ≥ `startDate`.
- Kỳ thu `status = locked`: không sửa được bảng tính tiền, dòng bảng kê, điều chỉnh, chi phí chung và lượt dùng dịch vụ của kỳ → `409 period_locked`. Ghi lần thu (`collections`) vẫn được. Chỉ chủ trọ mở khóa.
- `collections`, `deposit-entries` chỉ ghi thêm: không PATCH (`409 append_only`); nhập nhầm thì xóa rồi ghi lại.
- `room-statements.paidAmount`, `collectStatus` (`unpaid`/`partial`/`paid`) tính từ các lần thu, không lưu.

### 6.3 Danh sách các phần

| Phần | Đường dẫn | Chỉ chủ trọ |
|---|---|---|
| Cài đặt nhà trọ | [`/v1/settings`](#settings) |  |
| Việc khởi động | [`/v1/onboarding-steps`](#onboarding-steps) |  |
| Mẫu tin nhắn | [`/v1/message-templates`](#message-templates) |  |
| Dãy | [`/v1/blocks`](#blocks) |  |
| Tầng | [`/v1/floors`](#floors) |  |
| Loại phòng | [`/v1/room-types`](#room-types) |  |
| Phòng | [`/v1/rooms`](#rooms) |  |
| Giá thuê theo thời điểm | [`/v1/room-prices`](#room-prices) |  |
| Đồ trang bị | [`/v1/room-items`](#room-items) |  |
| Thiết bị trong phòng | [`/v1/room-devices`](#room-devices) |  |
| Cập nhật giá hàng loạt | [`/v1/price-batches`](#price-batches) |  |
| Khách thuê | [`/v1/tenants`](#tenants) |  |
| Ghi nhận về khách | [`/v1/tenant-notes`](#tenant-notes) |  |
| Hợp đồng | [`/v1/contracts`](#contracts) |  |
| Người ở | [`/v1/occupants`](#occupants) |  |
| Phụ phí hợp đồng | [`/v1/contract-fees`](#contract-fees) |  |
| Lịch sử thay đổi hợp đồng | [`/v1/contract-changes`](#contract-changes) |  |
| Chuyển phòng | [`/v1/room-transfers`](#room-transfers) |  |
| Mẫu hợp đồng | [`/v1/contract-templates`](#contract-templates) |  |
| Lý do trả phòng | [`/v1/move-out-reasons`](#move-out-reasons) |  |
| Khách tiềm năng | [`/v1/prospects`](#prospects) |  |
| Giữ chỗ | [`/v1/reservations`](#reservations) |  |
| Lịch xem phòng | [`/v1/viewings`](#viewings) |  |
| Sổ tiền cọc | [`/v1/deposit-entries`](#deposit-entries) |  |
| Biên bản bàn giao | [`/v1/handover-records`](#handover-records) |  |
| Kiểm tra trả phòng | [`/v1/checkout-checks`](#checkout-checks) |  |
| Trừ hư hỏng vào cọc | [`/v1/damage-charges`](#damage-charges) |  |
| Công tơ | [`/v1/meters`](#meters) |  |
| Chỉ số công tơ | [`/v1/meter-readings`](#meter-readings) |  |
| Thay công tơ | [`/v1/meter-replacements`](#meter-replacements) |  |
| Bậc giá điện | [`/v1/electricity-tiers`](#electricity-tiers) |  |
| Giá nước | [`/v1/water-rates`](#water-rates) |  |
| Dịch vụ | [`/v1/services`](#services) |  |
| Đơn giá dịch vụ theo thời điểm | [`/v1/service-prices`](#service-prices) |  |
| Chỗ để xe | [`/v1/parking-slots`](#parking-slots) |  |
| Lượt dùng dịch vụ | [`/v1/usage-logs`](#usage-logs) |  |
| Chi phí chung | [`/v1/shared-costs`](#shared-costs) |  |
| Phần chia chi phí chung | [`/v1/shared-cost-shares`](#shared-cost-shares) |  |
| Kỳ thu | [`/v1/billing-cycles`](#billing-cycles) |  |
| Bảng tính tiền phòng | [`/v1/room-statements`](#room-statements) |  |
| Dòng bảng kê | [`/v1/statement-lines`](#statement-lines) |  |
| Điều chỉnh tay | [`/v1/statement-adjusts`](#statement-adjusts) |  |
| Lần thu tiền | [`/v1/collections`](#collections) |  |
| Thợ sửa | [`/v1/repairers`](#repairers) |  |
| Yêu cầu sửa chữa | [`/v1/repair-requests`](#repair-requests) |  |
| Lịch bảo trì định kỳ | [`/v1/maintenance-plans`](#maintenance-plans) |  |
| Nhật ký bảo trì | [`/v1/maintenance-logs`](#maintenance-logs) |  |
| Khách thăm | [`/v1/visitors`](#visitors) |  |
| Giao nhận chìa khóa | [`/v1/key-logs`](#key-logs) |  |
| Vi phạm nội quy | [`/v1/rule-violations`](#rule-violations) |  |
| Thông báo chung | [`/v1/announcements`](#announcements) |  |
| Sổ thu chi tiền mặt | [`/v1/cash-entries`](#cash-entries) | có |
| Chi phí nhà trọ | [`/v1/expenses`](#expenses) | có |
| Điện nước tổng | [`/v1/utility-bills`](#utility-bills) | có |
| Quỹ dự phòng sửa chữa | [`/v1/reserve-fund-entries`](#reserve-fund-entries) | có |
| Chi phí đầu tư | [`/v1/investments`](#investments) | có |
| Mục tiêu doanh thu | [`/v1/targets`](#targets) | có |
| Nhân sự | [`/v1/staff`](#staff) |  |
| Lịch làm việc | [`/v1/staff-schedules`](#staff-schedules) |  |
| Lương | [`/v1/staff-pays`](#staff-pays) | có |
| Giao việc | [`/v1/tasks`](#tasks) |  |
| Lịch dọn vệ sinh | [`/v1/cleaning-plans`](#cleaning-plans) |  |
| Mục đi tuần | [`/v1/patrol-items`](#patrol-items) |  |
| Lượt đi tuần | [`/v1/patrol-runs`](#patrol-runs) |  |
| Phản hồi khách thuê | [`/v1/feedback`](#feedback) |  |
| Khiếu nại | [`/v1/complaints`](#complaints) |  |
| Việc cần làm | [`/v1/todos`](#todos) |  |
| Việc đầu/cuối tháng | [`/v1/checklist-items`](#checklist-items) |  |
| Đánh dấu việc đầu/cuối tháng | [`/v1/checklist-runs`](#checklist-runs) |  |

### 6.4 Trường của từng phần

#### settings

**Cài đặt nhà trọ** · bảng Room `AppSettings` · một bản ghi duy nhất (id `main`): chỉ `GET` và `PATCH /v1/settings` (PATCH: chủ trọ)

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `language` | `vi` \| `en` |  |  |
| `propertyName` | chuỗi ≤100 |  |  |
| `address` | chuỗi ≤200 |  |  |
| `phone` | chuỗi ≤20 (SĐT) |  |  |
| `meterDay` | số nguyên 1-31 |  |  |
| `cycleStartDay` | số nguyên 1-31 |  |  |
| `dueDay` | số nguyên 1-31 |  |  |
| `dayCountMode` | `fixed30` \| `actual` |  |  |
| `roundingStep` | số nguyên 1-100000 |  |  |
| `dateFormat` | chuỗi ≤20 |  |  |
| `rulesText` | chuỗi ≤20000 |  |  |
| `theme` | `system` \| `light` \| `dark` |  |  |

#### onboarding-steps

**Việc khởi động** · bảng Room `OnboardingStep`

- Tìm (`q`): `key`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `key` | chuỗi ≤40 | có |  |
| `isDone` | true/false |  | `false` |

#### message-templates

**Mẫu tin nhắn** · bảng Room `MessageTemplate`

- Tìm (`q`): `name`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `name` | chuỗi ≤100 | có |  |
| `body` | chuỗi ≤5000 | có |  |

#### blocks

**Dãy** · bảng Room `Block`

- Tìm (`q`): `name`
- Sắp xếp mặc định: `sortOrder`
- Khi xóa: chặn nếu còn `floors`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `name` | chuỗi ≤40 | có |  |
| `sortOrder` | số nguyên 0-100000 |  | `0` |

#### floors

**Tầng** · bảng Room `Floor`

- Tìm (`q`): `label`
- Sắp xếp mặc định: `sortOrder`
- Khi xóa: chặn nếu còn `rooms`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `blockId` | id → `blocks` (chặn xóa) | có |  |
| `label` | chuỗi ≤40 | có |  |
| `sortOrder` | số nguyên 0-100000 |  | `0` |

#### room-types

**Loại phòng** · bảng Room `RoomType`

- Tìm (`q`): `name`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `name` | chuỗi ≤60 | có |  |
| `suggestedPrice` | tiền (đồng) |  |  |

#### rooms

**Phòng** · bảng Room `Room`

- Tìm (`q`): `name`
- Sắp xếp mặc định: `name`
- Khi xóa: xóa theo `room-prices`, xóa theo `room-items`, xóa theo `room-devices`, chặn nếu còn `contracts`, chặn nếu còn `reservations`, chặn nếu còn `meters`, chặn nếu còn `room-statements`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `floorId` | id → `floors` (chặn xóa) | có |  |
| `typeId` | id → `room-types` |  |  |
| `name` | chuỗi ≤40 | có |  |
| `areaSqm` | số 0-10000 |  |  |
| `capacity` | số nguyên 1-50 |  |  |
| `status` | `vacant` \| `occupied` \| `reserved` \| `maintenance` |  | `"vacant"` |
| `amenitiesText` | chuỗi ≤2000 |  |  |
| `note` | chuỗi ≤2000 |  |  |

#### room-prices

**Giá thuê theo thời điểm** · bảng Room `RoomPrice`

- Ngày chính (`from`/`to`): `effectiveFrom`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `roomId` | id → `rooms` (xóa theo) | có |  |
| `monthlyRent` | tiền (đồng) | có |  |
| `effectiveFrom` | ngày `yyyy-MM-dd` | có |  |

#### room-items

**Đồ trang bị** · bảng Room `RoomItem`

- Tìm (`q`): `name`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `roomId` | id → `rooms` (xóa theo) | có |  |
| `name` | chuỗi ≤100 | có |  |
| `qty` | số nguyên 0-10000 |  | `1` |
| `conditionText` | chuỗi ≤500 |  |  |
| `note` | chuỗi ≤1000 |  |  |

#### room-devices

**Thiết bị trong phòng** · bảng Room `RoomDevice`

- Tìm (`q`): `name`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `roomId` | id → `rooms` (xóa theo) | có |  |
| `name` | chuỗi ≤100 | có |  |
| `installedDate` | ngày `yyyy-MM-dd` |  |  |
| `note` | chuỗi ≤1000 |  |  |

#### price-batches

**Cập nhật giá hàng loạt** · bảng Room `PriceBatch`

- Tìm (`q`): `name`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `name` | chuỗi ≤100 | có |  |
| `effectiveAt` | ngày `yyyy-MM-dd` |  |  |
| `ruleJson` | JSON tự do |  |  |
| `status` | `draft` \| `applied` \| `cancelled` |  | `"draft"` |

#### tenants

**Khách thuê** · bảng Room `Tenant`

- Tìm (`q`): `name`, `phone`
- Sắp xếp mặc định: `name`
- Khi xóa: xóa theo `tenant-notes`, chặn nếu còn `contracts`, chặn nếu còn `occupants`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `name` | chuỗi ≤100 | có |  |
| `phone` | chuỗi ≤20 (SĐT) |  |  |
| `workplaceText` | chuỗi ≤200 |  |  |
| `vehicleText` | chuỗi ≤100 |  |  |
| `segment` | `long_term` \| `new` \| `student` \| `family` \| `other` |  |  |
| `emergencyContactText` | chuỗi ≤300 |  |  |
| `note` | chuỗi ≤2000 |  |  |

#### tenant-notes

**Ghi nhận về khách** · bảng Room `TenantNote`

- Ngày chính (`from`/`to`): `date`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `tenantId` | id → `tenants` (xóa theo) | có |  |
| `text` | chuỗi ≤2000 | có |  |
| `date` | ngày `yyyy-MM-dd` | có |  |

#### contracts

**Hợp đồng** · bảng Room `Contract`

- Ngày chính (`from`/`to`): `startDate`
- Sắp xếp mặc định: `startDate`
- Khi xóa: xóa theo `occupants`, xóa theo `contract-fees`, xóa theo `contract-changes`, xóa theo `room-transfers`, xóa theo `move-out-reasons`, chặn nếu còn `deposit-entries`, xóa theo `handover-records`, xóa theo `checkout-checks`, xóa theo `damage-charges`, chặn nếu còn `room-statements`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `roomId` | id → `rooms` (chặn xóa) | có |  |
| `leaderTenantId` | id → `tenants` (chặn xóa) | có |  |
| `startDate` | ngày `yyyy-MM-dd` | có |  |
| `endDate` | ngày `yyyy-MM-dd` |  |  |
| `monthlyRent` | tiền (đồng) | có |  |
| `depositAmount` | tiền (đồng) |  |  |
| `depositDate` | ngày `yyyy-MM-dd` |  |  |
| `extraTerms` | chuỗi ≤10000 |  |  |
| `status` | `draft` \| `active` \| `ended` \| `terminated` |  | `"active"` |
| `terminationReason` | chuỗi ≤500 |  |  |
| `renewedFromId` | id → `contracts` |  |  |

#### occupants

**Người ở** · bảng Room `Occupant`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `contractId` | id → `contracts` (xóa theo) | có |  |
| `tenantId` | id → `tenants` (chặn xóa) | có |  |
| `isLeader` | true/false |  | `false` |
| `moveInDate` | ngày `yyyy-MM-dd` |  |  |
| `moveOutDate` | ngày `yyyy-MM-dd` |  |  |

#### contract-fees

**Phụ phí hợp đồng** · bảng Room `ContractFee`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `contractId` | id → `contracts` (xóa theo) | có |  |
| `serviceId` | id → `services` |  |  |
| `calcMode` | `per_room` \| `per_person` \| `per_use` |  | `"per_room"` |
| `amount` | tiền (đồng) | có |  |
| `effectiveFrom` | ngày `yyyy-MM-dd` |  |  |

#### contract-changes

**Lịch sử thay đổi hợp đồng** · bảng Room `ContractChange`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `contractId` | id → `contracts` (xóa theo) | có |  |
| `changedAt` | ISO 8601 hoặc epoch ms |  |  |
| `fieldKey` | chuỗi ≤60 |  |  |
| `oldValue` | chuỗi ≤500 |  |  |
| `newValue` | chuỗi ≤500 |  |  |
| `note` | chuỗi ≤1000 |  |  |

#### room-transfers

**Chuyển phòng** · bảng Room `RoomTransfer`

- Ngày chính (`from`/`to`): `transferDate`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `contractId` | id → `contracts` (xóa theo) | có |  |
| `fromRoomId` | id → `rooms` | có |  |
| `toRoomId` | id → `rooms` | có |  |
| `transferDate` | ngày `yyyy-MM-dd` | có |  |
| `depositMovedAmount` | tiền (đồng) |  |  |

#### contract-templates

**Mẫu hợp đồng** · bảng Room `ContractTemplate`

- Tìm (`q`): `name`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `name` | chuỗi ≤100 | có |  |
| `bodyText` | chuỗi ≤20000 | có |  |

#### move-out-reasons

**Lý do trả phòng** · bảng Room `MoveOutReason`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `contractId` | id → `contracts` (xóa theo) | có |  |
| `reasonKey` | `price` \| `location` \| `job` \| `rules` \| `other` | có |  |
| `note` | chuỗi ≤1000 |  |  |

#### prospects

**Khách tiềm năng** · bảng Room `Prospect`

- Tìm (`q`): `name`, `phone`
- Sắp xếp mặc định: `name`
- Khi xóa: xóa theo `viewings`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `name` | chuỗi ≤100 | có |  |
| `phone` | chuỗi ≤20 (SĐT) |  |  |
| `interestedRoomsText` | chuỗi ≤500 |  |  |
| `expectedMoveIn` | ngày `yyyy-MM-dd` |  |  |
| `note` | chuỗi ≤2000 |  |  |
| `status` | `new` \| `contacted` \| `viewing` \| `converted` \| `lost` |  | `"new"` |

#### reservations

**Giữ chỗ** · bảng Room `Reservation`

- Tìm (`q`): `tenantName`, `phone`
- Ngày chính (`from`/`to`): `holdUntilDate`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `roomId` | id → `rooms` (chặn xóa) | có |  |
| `prospectId` | id → `prospects` |  |  |
| `tenantName` | chuỗi ≤100 |  |  |
| `phone` | chuỗi ≤20 (SĐT) |  |  |
| `fromDate` | ngày `yyyy-MM-dd` |  |  |
| `holdUntilDate` | ngày `yyyy-MM-dd` | có |  |
| `depositAmount` | tiền (đồng) |  |  |
| `status` | `active` \| `converted` \| `expired` \| `cancelled` |  | `"active"` |
| `note` | chuỗi ≤1000 |  |  |

#### viewings

**Lịch xem phòng** · bảng Room `Viewing`

- Ngày chính (`from`/`to`): `date`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `prospectId` | id → `prospects` (xóa theo) |  |  |
| `roomId` | id → `rooms` |  |  |
| `date` | ngày `yyyy-MM-dd` | có |  |
| `startMinute` | số nguyên 0-1439 |  |  |
| `note` | chuỗi ≤1000 |  |  |
| `status` | `scheduled` \| `done` \| `cancelled` \| `no_show` |  | `"scheduled"` |

#### deposit-entries

**Sổ tiền cọc** · bảng Room `DepositEntry` · chỉ ghi thêm (không PATCH)

- Ngày chính (`from`/`to`): `date`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `contractId` | id → `contracts` (chặn xóa) | có |  |
| `type` | `receive` \| `refund` \| `deduct` \| `transfer_in` \| `transfer_out` | có |  |
| `amount` | tiền (đồng) | có |  |
| `date` | ngày `yyyy-MM-dd` | có |  |
| `reason` | chuỗi ≤300 |  |  |

#### handover-records

**Biên bản bàn giao** · bảng Room `HandoverRecord`

- Ngày chính (`from`/`to`): `date`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `contractId` | id → `contracts` (xóa theo) | có |  |
| `roomId` | id → `rooms` |  |  |
| `kind` | `move_in` \| `move_out` | có |  |
| `conditionText` | chuỗi ≤5000 |  |  |
| `itemsJson` | JSON tự do |  |  |
| `meterReadingsJson` | JSON tự do |  |  |
| `tenantConfirmed` | true/false |  | `false` |
| `date` | ngày `yyyy-MM-dd` | có |  |

#### checkout-checks

**Kiểm tra trả phòng** · bảng Room `CheckoutCheck`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `contractId` | id → `contracts` (xóa theo) | có |  |
| `itemKey` | chuỗi ≤60 | có |  |
| `isDone` | true/false |  | `false` |

#### damage-charges

**Trừ hư hỏng vào cọc** · bảng Room `DamageCharge`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `contractId` | id → `contracts` (xóa theo) | có |  |
| `description` | chuỗi ≤300 | có |  |
| `amount` | tiền (đồng) | có |  |

#### meters

**Công tơ** · bảng Room `Meter`

- Tìm (`q`): `serialNo`
- Khi xóa: chặn nếu còn `meter-readings`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `roomId` | id → `rooms` (chặn xóa) | có |  |
| `kind` | `electric` \| `water` | có |  |
| `serialNo` | chuỗi ≤60 |  |  |
| `initialReading` | số nguyên ≥0 | có |  |
| `installedDate` | ngày `yyyy-MM-dd` |  |  |
| `isActive` | true/false |  | `true` |

#### meter-readings

**Chỉ số công tơ** · bảng Room `MeterReading`

- Ngày chính (`from`/`to`): `readingDate`
- Không trùng: (`meterId`, `cycle`)

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `meterId` | id → `meters` (chặn xóa) | có |  |
| `cycle` | tháng `yyyy-MM` | có |  |
| `readingDate` | ngày `yyyy-MM-dd` |  |  |
| `readingValue` | số nguyên ≥0 | có |  |
| `consumption` | số nguyên |  |  |
| `note` | chuỗi ≤500 |  |  |
| `isReset` | true/false |  | `false` |

#### meter-replacements

**Thay công tơ** · bảng Room `MeterReplacement`

- Ngày chính (`from`/`to`): `date`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `oldMeterId` | id → `meters` | có |  |
| `newMeterId` | id → `meters` | có |  |
| `oldFinalReading` | số nguyên ≥0 | có |  |
| `newInitialReading` | số nguyên ≥0 | có |  |
| `date` | ngày `yyyy-MM-dd` | có |  |

#### electricity-tiers

**Bậc giá điện** · bảng Room `ElectricityTier`

- Sắp xếp mặc định: `fromKwh`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `name` | chuỗi ≤40 |  |  |
| `fromKwh` | số nguyên ≥0 | có |  |
| `toKwh` | số nguyên ≥0 |  |  |
| `pricePerKwh` | tiền (đồng) | có |  |
| `effectiveFrom` | ngày `yyyy-MM-dd` |  |  |

#### water-rates

**Giá nước** · bảng Room `WaterRate`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `mode` | `per_m3` \| `per_person` | có |  |
| `pricePerUnit` | tiền (đồng) | có |  |
| `effectiveFrom` | ngày `yyyy-MM-dd` |  |  |

#### services

**Dịch vụ** · bảng Room `Service`

- Tìm (`q`): `name`
- Sắp xếp mặc định: `name`
- Khi xóa: xóa theo `service-prices`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `name` | chuỗi ≤60 | có |  |
| `calcMode` | `per_room` \| `per_person` \| `per_use` | có |  |
| `defaultPrice` | tiền (đồng) |  |  |
| `isFixedFee` | true/false |  | `true` |

#### service-prices

**Đơn giá dịch vụ theo thời điểm** · bảng Room `ServicePrice`

- Ngày chính (`from`/`to`): `effectiveFrom`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `serviceId` | id → `services` (xóa theo) | có |  |
| `price` | tiền (đồng) | có |  |
| `effectiveFrom` | ngày `yyyy-MM-dd` | có |  |

#### parking-slots

**Chỗ để xe** · bảng Room `ParkingSlot`

- Tìm (`q`): `label`, `vehicleText`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `label` | chuỗi ≤40 | có |  |
| `tenantId` | id → `tenants` |  |  |
| `monthlyFee` | tiền (đồng) |  |  |
| `vehicleText` | chuỗi ≤100 |  |  |

#### usage-logs

**Lượt dùng dịch vụ** · bảng Room `UsageLog`

- Ngày chính (`from`/`to`): `date`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `roomId` | id → `rooms` | có |  |
| `serviceId` | id → `services` | có |  |
| `cycle` | tháng `yyyy-MM` | có |  |
| `qty` | số nguyên 0-100000 | có |  |
| `date` | ngày `yyyy-MM-dd` |  |  |

#### shared-costs

**Chi phí chung** · bảng Room `SharedCost`

- Tìm (`q`): `name`
- Khi xóa: xóa theo `shared-cost-shares`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `cycle` | tháng `yyyy-MM` | có |  |
| `name` | chuỗi ≤100 | có |  |
| `amount` | tiền (đồng) | có |  |
| `splitMode` | `equal` \| `per_person` \| `by_area` | có |  |

#### shared-cost-shares

**Phần chia chi phí chung** · bảng Room `SharedCostShare`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `sharedCostId` | id → `shared-costs` (xóa theo) | có |  |
| `roomId` | id → `rooms` | có |  |
| `amount` | tiền (đồng) | có |  |

#### billing-cycles

**Kỳ thu** · bảng Room `BillingCycle`

- Sắp xếp mặc định: `cycle`
- Không trùng: (`cycle`)
- Khi xóa: chặn nếu còn `room-statements`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `cycle` | tháng `yyyy-MM` | có |  |
| `status` | `open` \| `locked` |  | `"open"` |
| `lockedAt` | ISO 8601 hoặc epoch ms |  |  |
| `note` | chuỗi ≤1000 |  |  |

#### room-statements

**Bảng tính tiền phòng** · bảng Room `RoomStatement`

- Không trùng: (`cycleId`, `contractId`)
- Tính sẵn: `paidAmount`, `collectStatus`
- Khi xóa: xóa theo `statement-lines`, xóa theo `statement-adjusts`, chặn nếu còn `collections`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `cycleId` | id → `billing-cycles` (chặn xóa) | có |  |
| `roomId` | id → `rooms` (chặn xóa) | có |  |
| `contractId` | id → `contracts` (chặn xóa) |  |  |
| `rentAmount` | tiền (đồng) |  |  |
| `electricAmount` | tiền (đồng) |  |  |
| `waterAmount` | tiền (đồng) |  |  |
| `feesAmount` | tiền (đồng) |  |  |
| `sharedAmount` | tiền (đồng) |  |  |
| `discountAmount` | tiền (đồng) |  |  |
| `adjustAmount` | tiền ± (đồng) |  |  |
| `totalAmount` | tiền ± (đồng) | có |  |
| `prorationNote` | chuỗi ≤500 |  |  |
| `missingReadings` | true/false |  | `false` |

#### statement-lines

**Dòng bảng kê** · bảng Room `StatementLine`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `statementId` | id → `room-statements` (xóa theo) | có |  |
| `kind` | `rent` \| `electric` \| `water` \| `fee` \| `shared` \| `discount` \| `adjust` \| `other` | có |  |
| `description` | chuỗi ≤200 |  |  |
| `qty` | số -1000000000-1000000000 |  |  |
| `unitPrice` | tiền ± (đồng) |  |  |
| `amount` | tiền ± (đồng) | có |  |

#### statement-adjusts

**Điều chỉnh tay** · bảng Room `StatementAdjust`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `statementId` | id → `room-statements` (xóa theo) | có |  |
| `amount` | tiền ± (đồng) | có |  |
| `reason` | chuỗi ≤300 | có |  |

#### collections

**Lần thu tiền** · bảng Room `Collection` · chỉ ghi thêm (không PATCH)

- Ngày chính (`from`/`to`): `paidAt`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `statementId` | id → `room-statements` (chặn xóa) | có |  |
| `amount` | tiền (đồng) | có |  |
| `paidAt` | ngày `yyyy-MM-dd` | có |  |
| `methodNote` | chuỗi ≤200 |  |  |

#### repairers

**Thợ sửa** · bảng Room `Repairer`

- Tìm (`q`): `name`, `phone`, `skillText`
- Sắp xếp mặc định: `name`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `name` | chuỗi ≤100 | có |  |
| `phone` | chuỗi ≤20 (SĐT) |  |  |
| `skillText` | chuỗi ≤200 |  |  |
| `note` | chuỗi ≤1000 |  |  |

#### repair-requests

**Yêu cầu sửa chữa** · bảng Room `RepairRequest`

- Tìm (`q`): `description`, `category`
- Ngày chính (`from`/`to`): `reportedDate`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `roomId` | id → `rooms` | có |  |
| `tenantId` | id → `tenants` |  |  |
| `reportedDate` | ngày `yyyy-MM-dd` | có |  |
| `category` | chuỗi ≤60 |  |  |
| `priority` | `urgent` \| `normal` \| `low` |  | `"normal"` |
| `description` | chuỗi ≤2000 | có |  |
| `status` | `new` \| `assigned` \| `in_progress` \| `done` |  | `"new"` |
| `repairerId` | id → `repairers` |  |  |
| `cost` | tiền (đồng) |  |  |
| `costBearer` | `owner` \| `tenant` |  |  |
| `doneDate` | ngày `yyyy-MM-dd` |  |  |

#### maintenance-plans

**Lịch bảo trì định kỳ** · bảng Room `MaintenancePlan`

- Tìm (`q`): `title`
- Khi xóa: xóa theo `maintenance-logs`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `roomId` | id → `rooms` |  |  |
| `deviceId` | id → `room-devices` |  |  |
| `title` | chuỗi ≤100 | có |  |
| `intervalDays` | số nguyên 1-3650 | có |  |
| `lastDoneDate` | ngày `yyyy-MM-dd` |  |  |

#### maintenance-logs

**Nhật ký bảo trì** · bảng Room `MaintenanceLog`

- Ngày chính (`from`/`to`): `date`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `planId` | id → `maintenance-plans` (xóa theo) | có |  |
| `date` | ngày `yyyy-MM-dd` | có |  |
| `cost` | tiền (đồng) |  |  |
| `note` | chuỗi ≤1000 |  |  |

#### visitors

**Khách thăm** · bảng Room `Visitor`

- Tìm (`q`): `name`, `phone`
- Ngày chính (`from`/`to`): `visitDate`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `roomId` | id → `rooms` | có |  |
| `name` | chuỗi ≤100 | có |  |
| `phone` | chuỗi ≤20 (SĐT) |  |  |
| `visitDate` | ngày `yyyy-MM-dd` | có |  |
| `stayedOvernight` | true/false |  | `false` |
| `note` | chuỗi ≤1000 |  |  |

#### key-logs

**Giao nhận chìa khóa** · bảng Room `KeyLog`

- Tìm (`q`): `keyLabel`, `givenTo`
- Ngày chính (`from`/`to`): `givenDate`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `roomId` | id → `rooms` | có |  |
| `keyLabel` | chuỗi ≤60 | có |  |
| `givenTo` | chuỗi ≤100 |  |  |
| `givenDate` | ngày `yyyy-MM-dd` | có |  |
| `returnedDate` | ngày `yyyy-MM-dd` |  |  |

#### rule-violations

**Vi phạm nội quy** · bảng Room `RuleViolation`

- Ngày chính (`from`/`to`): `date`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `roomId` | id → `rooms` |  |  |
| `tenantId` | id → `tenants` |  |  |
| `date` | ngày `yyyy-MM-dd` | có |  |
| `text` | chuỗi ≤2000 | có |  |
| `action` | chuỗi ≤500 |  |  |

#### announcements

**Thông báo chung** · bảng Room `Announcement`

- Tìm (`q`): `title`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `title` | chuỗi ≤200 | có |  |
| `body` | chuỗi ≤5000 | có |  |
| `targetJson` | JSON tự do |  |  |

#### cash-entries

**Sổ thu chi tiền mặt** · bảng Room `CashEntry` · chỉ chủ trọ

- Ngày chính (`from`/`to`): `date`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `type` | `in` \| `out` | có |  |
| `amount` | tiền (đồng) | có |  |
| `reason` | chuỗi ≤300 |  |  |
| `date` | ngày `yyyy-MM-dd` | có |  |

#### expenses

**Chi phí nhà trọ** · bảng Room `Expense` · chỉ chủ trọ

- Tìm (`q`): `category`, `note`
- Ngày chính (`from`/`to`): `date`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `category` | chuỗi ≤60 | có |  |
| `amount` | tiền (đồng) | có |  |
| `date` | ngày `yyyy-MM-dd` | có |  |
| `isRecurring` | true/false |  | `false` |
| `note` | chuỗi ≤300 |  |  |

#### utility-bills

**Điện nước tổng** · bảng Room `UtilityBill` · chỉ chủ trọ

- Sắp xếp mặc định: `cycle`
- Không trùng: (`cycle`, `kind`)

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `cycle` | tháng `yyyy-MM` | có |  |
| `kind` | `electric` \| `water` | có |  |
| `totalAmount` | tiền (đồng) | có |  |
| `totalUnits` | số nguyên ≥0 |  |  |

#### reserve-fund-entries

**Quỹ dự phòng sửa chữa** · bảng Room `ReserveFundEntry` · chỉ chủ trọ

- Ngày chính (`from`/`to`): `date`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `type` | `in` \| `out` | có |  |
| `amount` | tiền (đồng) | có |  |
| `date` | ngày `yyyy-MM-dd` | có |  |
| `reason` | chuỗi ≤300 |  |  |

#### investments

**Chi phí đầu tư** · bảng Room `Investment` · chỉ chủ trọ

- Ngày chính (`from`/`to`): `date`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `roomId` | id → `rooms` |  |  |
| `amount` | tiền (đồng) | có |  |
| `date` | ngày `yyyy-MM-dd` | có |  |
| `note` | chuỗi ≤300 |  |  |

#### targets

**Mục tiêu doanh thu** · bảng Room `Target` · chỉ chủ trọ

- Sắp xếp mặc định: `month`
- Không trùng: (`month`)

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `month` | tháng `yyyy-MM` | có |  |
| `targetRevenue` | tiền (đồng) | có |  |

#### staff

**Nhân sự** · bảng Room `Staff`

- Tìm (`q`): `name`
- Sắp xếp mặc định: `name`
- Khi xóa: xóa theo `staff-schedules`, chặn nếu còn `staff-pays`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `name` | chuỗi ≤100 | có |  |
| `role` | `manager` \| `guard` \| `cleaner` \| `other` | có |  |
| `note` | chuỗi ≤1000 |  |  |

#### staff-schedules

**Lịch làm việc** · bảng Room `StaffSchedule`

- Ngày chính (`from`/`to`): `date`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `staffId` | id → `staff` (xóa theo) | có |  |
| `date` | ngày `yyyy-MM-dd` | có |  |
| `shiftLabel` | chuỗi ≤40 |  |  |

#### staff-pays

**Lương** · bảng Room `StaffPay` · chỉ chủ trọ

- Sắp xếp mặc định: `cycle`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `staffId` | id → `staff` (chặn xóa) | có |  |
| `cycle` | tháng `yyyy-MM` | có |  |
| `amount` | tiền (đồng) | có |  |
| `note` | chuỗi ≤300 |  |  |

#### tasks

**Giao việc** · bảng Room `TaskItem`

- Tìm (`q`): `title`
- Ngày chính (`from`/`to`): `dueDate`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `title` | chuỗi ≤200 | có |  |
| `assigneeId` | id → `staff` |  |  |
| `dueDate` | ngày `yyyy-MM-dd` |  |  |
| `status` | `todo` \| `doing` \| `done` |  | `"todo"` |
| `refType` | chuỗi ≤40 |  |  |
| `refId` | chuỗi ≤64 |  |  |

#### cleaning-plans

**Lịch dọn vệ sinh** · bảng Room `CleaningPlan`

- Tìm (`q`): `area`
- Sắp xếp mặc định: `dayOfWeek`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `area` | chuỗi ≤100 | có |  |
| `dayOfWeek` | số nguyên 1-7 | có |  |
| `staffId` | id → `staff` |  |  |

#### patrol-items

**Mục đi tuần** · bảng Room `PatrolItem`

- Tìm (`q`): `title`
- Sắp xếp mặc định: `sortOrder`
- Khi xóa: xóa theo `patrol-runs`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `title` | chuỗi ≤100 | có |  |
| `sortOrder` | số nguyên 0-100000 |  | `0` |

#### patrol-runs

**Lượt đi tuần** · bảng Room `PatrolRun`

- Ngày chính (`from`/`to`): `date`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `itemId` | id → `patrol-items` (xóa theo) | có |  |
| `date` | ngày `yyyy-MM-dd` | có |  |
| `isDone` | true/false |  | `false` |
| `doneBy` | chuỗi ≤100 |  |  |

#### feedback

**Phản hồi khách thuê** · bảng Room `Feedback`

- Ngày chính (`from`/`to`): `date`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `roomId` | id → `rooms` |  |  |
| `tenantId` | id → `tenants` |  |  |
| `score` | số nguyên 1-5 |  |  |
| `text` | chuỗi ≤2000 |  |  |
| `date` | ngày `yyyy-MM-dd` | có |  |

#### complaints

**Khiếu nại** · bảng Room `Complaint`

- Ngày chính (`from`/`to`): `date`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `roomId` | id → `rooms` |  |  |
| `tenantId` | id → `tenants` |  |  |
| `date` | ngày `yyyy-MM-dd` | có |  |
| `text` | chuỗi ≤2000 | có |  |
| `resolution` | chuỗi ≤2000 |  |  |
| `cost` | tiền (đồng) |  |  |
| `status` | `open` \| `resolved` |  | `"open"` |

#### todos

**Việc cần làm** · bảng Room `Todo`

- Tìm (`q`): `title`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `title` | chuỗi ≤200 | có |  |
| `dueAt` | ISO 8601 hoặc epoch ms |  |  |
| `repeatRule` | `none` \| `daily` \| `weekly` \| `monthly` |  | `"none"` |
| `isDone` | true/false |  | `false` |

#### checklist-items

**Việc đầu/cuối tháng** · bảng Room `ChecklistItem`

- Tìm (`q`): `title`
- Sắp xếp mặc định: `sortOrder`
- Khi xóa: xóa theo `checklist-runs`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `kind` | `start_of_month` \| `end_of_month` | có |  |
| `title` | chuỗi ≤200 | có |  |
| `sortOrder` | số nguyên 0-100000 |  | `0` |

#### checklist-runs

**Đánh dấu việc đầu/cuối tháng** · bảng Room `ChecklistRun`

| Trường | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `itemId` | id → `checklist-items` (xóa theo) | có |  |
| `period` | tháng `yyyy-MM` | có |  |
| `isDone` | true/false |  | `false` |

<!-- CRUD:END -->
