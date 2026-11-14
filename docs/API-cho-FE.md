# RoomKeep API — tài liệu cho app Android

| | |
|---|---|
| **Base URL** | `https://roomkeepapi-ivory.vercel.app` (mọi endpoint nằm dưới `/v1`) |
| **Kiểm tra sống** | `GET https://roomkeepapi-ivory.vercel.app/v1/health` |
| **Trang xóa tài khoản** (khai trên Google Play) | `https://roomkeepapi-ivory.vercel.app/account/delete` (`?lang=en` cho tiếng Anh) |
| **Chính sách quyền riêng tư** (khai trên Google Play và mở từ màn hình đăng ký) | `https://roomkeepapi-ivory.vercel.app/privacy` (`?lang=en` cho tiếng Anh) |
| **Định dạng** | Chỉ HTTPS, JSON UTF-8. Ngày `yyyy-MM-dd`, kỳ `yyyy-MM`, thời điểm ISO 8601 UTC. Tiền là **số nguyên đồng** |
| **Đăng nhập** | `Authorization: Bearer <accessToken>` ở mọi endpoint có 🔒 |

**Mục lục:** [0. Tóm tắt endpoint](#0-tóm-tắt-endpoint) · [1. Quy ước chung](#1-quy-ước-chung) · [2. Tài khoản và phiên](#2-tài-khoản-và-phiên) · [3. Mời quản lý](#3--mời-quản-lý-và-thành-viên-chủ-trọ) · [4. Đồng bộ](#4--đồng-bộ) · [5. Luồng xử lý trong app](#5-luồng-xử-lý-trong-app) · [6. Giới hạn](#6-giới-hạn) · [7. CRUD từng phần](#7--crud-từng-phần) · [8. Request / response thật](#8-request--response-thật-của-từng-endpoint)

## 0. Tóm tắt endpoint

| Nhóm | Method | Đường dẫn | 🔒 | Mục |
|---|---|---|---|---|
| Hệ thống | GET | `/v1/health` | | [2.1](#21-get-v1health) |
| Tài khoản | POST | `/v1/auth/register` | | [2.2](#22-post-v1authregister--201) |
| | POST | `/v1/auth/login` | | [2.3](#23-post-v1authlogin--200) |
| | POST | `/v1/auth/refresh` | | [2.4](#24-post-v1authrefresh--200) |
| | POST | `/v1/auth/logout` | | [2.5](#25-post-v1authlogout--204) |
| | POST | `/v1/auth/forgot` | | [2.6](#26-quên--đặt-lại-mật-khẩu) |
| | POST | `/v1/auth/reset` | | [2.6](#26-quên--đặt-lại-mật-khẩu) |
| | POST | `/v1/auth/change-password` | 🔒 | [2.7](#27--post-v1authchange-password--200) |
| Hồ sơ | GET / PATCH / DELETE | `/v1/me` | 🔒 | [2.8](#28--hồ-sơ) |
| | POST | `/v1/me/property` | 🔒 | [2.8](#28--hồ-sơ) |
| Thiết bị | GET | `/v1/devices` | 🔒 | [2.9](#29--thiết-bị) |
| | DELETE | `/v1/devices/{id}` | 🔒 | [2.9](#29--thiết-bị) |
| Mời quản lý | POST / GET | `/v1/invites` | 🔒 chủ trọ | [3](#3--mời-quản-lý-và-thành-viên-chủ-trọ) |
| | DELETE | `/v1/invites/{id}` | 🔒 chủ trọ | [3](#3--mời-quản-lý-và-thành-viên-chủ-trọ) |
| | POST | `/v1/invites/accept` | 🔒 | [3](#3--mời-quản-lý-và-thành-viên-chủ-trọ) |
| Thành viên | GET | `/v1/members` | 🔒 chủ trọ | [3](#3--mời-quản-lý-và-thành-viên-chủ-trọ) |
| | DELETE | `/v1/members/{accountId}` | 🔒 | [3](#3--mời-quản-lý-và-thành-viên-chủ-trọ) |
| Đồng bộ | POST | `/v1/sync/push` | 🔒 | [4.2](#42-post-v1syncpush) |
| | GET | `/v1/sync/pull` | 🔒 | [4.3](#43-get-v1syncpullsincerevlimit500tablesroomtenant) |
| | GET | `/v1/sync/summary` | 🔒 | [4.5](#45-get-v1syncsummary) |
| Cài đặt nhà trọ | GET / PATCH | `/v1/settings` | 🔒 | [7](#7--crud-từng-phần) |
| CRUD 69 phần | GET / POST | `/v1/{phần}` (vd `/v1/rooms`, `/v1/tenants`, `/v1/contracts`) | 🔒 | [7](#7--crud-từng-phần) |
| | GET / PATCH / DELETE | `/v1/{phần}/{id}` | 🔒 | [7](#7--crud-từng-phần) |
| Web | GET / POST | `/account/delete` (không có `/v1`) | | [2.8](#28--hồ-sơ) |
| | GET | `/privacy` (không có `/v1`) | | chính sách quyền riêng tư |

## 1. Quy ước chung

### 1.1 Header
| Header | Khi nào | Ghi chú |
|---|---|---|
| `Authorization: Bearer <accessToken>` | Mọi endpoint có 🔒 | Không bao giờ đưa token vào URL, log hay tệp xuất |
| `Accept-Language: vi` hoặc `en` | Nên gửi ở mọi request | Ngôn ngữ của `message` lỗi và của email (mã đặt lại, báo đổi mật khẩu) |
| `X-App-Version: 1.2.0` | Nên gửi ở mọi request | Cũ hơn `minAppVersion` → `426 upgrade_required` |
| `Content-Type: application/json` | Request có body | |
| `Idempotency-Key` | Tùy chọn ở `/auth/register` | Tương đương `idempotencyKey` trong body |

Phản hồi có `X-Request-Id` (cũng là `requestId` trong body lỗi): ghi vào nhật ký lỗi của app để tra cứu khi cần hỗ trợ.

### 1.2 Lỗi
```json
{ "code": "validation_failed", "message": "Dữ liệu không hợp lệ", "fields": [{ "field": "account.email", "code": "invalid_format" }], "requestId": "req_ab12cd34ef56" }
```
App **dịch theo `code`**, không hiển thị `message` thô (`message` chỉ là chữ dự phòng theo `Accept-Language`).

Mã lỗi từng trường (`fields[].code`): `phone_taken`, `required`, `invalid_type`, `too_short`, `too_long`, `out_of_range`, `invalid_format`, `invalid_enum`, `weak_password`, `terms_required`, `not_found` (liên kết không tồn tại), `duplicate`, `duplicate_id`, `invite_invalid`, `wrong_password`, `same_as_old`.

| HTTP | `code` | App nên làm |
|---|---|---|
| 400 | `validation_failed` | Tô đỏ các trường trong `fields` |
| 400 | `reset_invalid` | "Mã đặt lại không đúng hoặc đã hết hạn" |
| 401 | `unauthorized`, `token_expired`, `token_invalid` | Gọi `/auth/refresh` **một lần** rồi gửi lại request |
| 401 | `session_revoked`, `session_expired`, `refresh_invalid`, `refresh_reused` | Về màn hình đăng nhập, **không xóa dữ liệu trên máy** |
| 401 | `invalid_credentials` | "Email hoặc mật khẩu không đúng" |
| 403 | `wrong_password` | Mật khẩu xác nhận sai (đổi mật khẩu, xóa tài khoản, đổi email) |
| 403 | `forbidden` | Vai trò không đủ quyền (quản lý vào phần của chủ trọ) |
| 403 | `no_property` | Tài khoản chưa thuộc nhà trọ nào → màn hình "nhập mã mời / tạo nhà trọ" |
| 404 | `not_found` | Bản ghi không còn (bị xóa ở máy khác): tải lại danh sách |
| 409 | `email_taken`, `phone_taken`, `already_member`, `already_in_property`, `has_property`, `owner_cannot_leave` | Thông báo tương ứng |
| 409 | `version_conflict` | Bản ghi đã bị sửa ở nơi khác; body có `current` (bản mới nhất) để hiện so sánh |
| 409 | `duplicate` | Đã tồn tại (vd kỳ thu tháng này); body có `existingId` |
| 409 | `has_dependents` | Không xóa được vì còn dữ liệu liên kết; `blockedBy` liệt kê phần đang vướng |
| 409 | `contract_overlap` | Phòng đã có hợp đồng khác trong khoảng ngày; `conflictWith` là id hợp đồng đó |
| 409 | `append_only` | Lần thu / sổ cọc không sửa được, chỉ xóa rồi ghi lại |
| 409 | `period_locked` | Kỳ thu đã khóa |
| 409 | `resync_required` | Tải lại toàn bộ (mục 4.4) |
| 413 | `payload_too_large` | Chia lô nhỏ hơn |
| 426 | `upgrade_required` | Màn hình bắt buộc cập nhật (`minAppVersion`, `latestAppVersion` có trong body) |
| 429 | `too_many_attempts`, `rate_limited` | Chờ `Retry-After` giây (có cả `retryAfter` trong body) |
| 503 | `service_unavailable` | "Máy chủ đang bận" + nút thử lại |
| 5xx | `internal_error` | "Hệ thống đang gặp sự cố" + nút thử lại |

Không nhận được phản hồi (mất mạng, timeout, DNS, SSL) là lỗi phía app: hiện "Không có kết nối mạng, vui lòng kiểm tra và thử lại" kèm nút thử lại.

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
* **`property.phone` là SĐT đăng nhập của chủ trọ** (xem 2.3). Không được trùng với nhà trọ khác: trùng → `409 phone_taken`, `fields: [{ field: "property.phone", code: "phone_taken" }]`. Bỏ trống thì chủ trọ chỉ đăng nhập bằng email.
* `dayCountMode`: `fixed30` | `actual`. `electric.mode`: `flat` (cần `price`) | `tiered` (cần `tiers: [{fromKwh, toKwh, pricePerKwh, name?}]`, liền nhau từ 0, chỉ bậc cuối được `toKwh: null`). `water.mode`: `per_m3` | `per_person`. `services[].calcMode`: `per_room` | `per_person` | `per_use`.
* `layout` dạng tự liệt kê (đúng như bản xem trước đã sửa trong app):
  `{ "blocks": [{ "id?": "...", "name": "Dãy A" }], "floors": [{ "id?", "blockId" | "blockIndex": 0, "label": "Tầng 1" }], "rooms": [{ "id?", "floorId" | "floorIndex": 0, "name": "A101", "monthlyRent": 2500000, "areaSqm?": 18.5, "capacity?": 2 }] }`.
  Gửi `id` (UUID của app) để giữ đúng id đã có trong Room. `generate` đặt tên `Dãy A`, `Tầng 1`, phòng `A101, A102...`. Tối đa 1000 phòng.
* **`"seed": false`** (đặt ở gốc body hoặc trong `property`): server **không tạo bản ghi nào**, kể cả `AppSettings` và `OnboardingStep`; phản hồi có `changes: []`, `rev: 0`. App tự push dữ liệu đã tạo ở máy sau khi đăng ký (`baseRev: null`, không xung đột). Khi `seed: false` thì không gửi kèm `billing`/`rates`/`layout` (gửi → `400`, `fields[].code = "not_allowed"`). Mặc định `seed: true`.
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
Bản ghi sinh sẵn (khi không có `seed: false`): `AppSettings` (id `"main"`), `ElectricityTier`, `WaterRate`, `Service` + `ServicePrice`, `Block`, `Floor`, `Room` (`status: "vacant"`, có `nameNoAccent`) + `RoomPrice`, `OnboardingStep` (`property_info`, `billing_rules`, `rates`, `blocks_rooms`, `first_tenant`, đánh dấu `isDone` theo những gì đã nhập).

### 2.3 `POST /v1/auth/login` → `200`
`{ "login": "<email hoặc số điện thoại>", "password", "deviceName", "deviceId" }` → `{ account, property, role, tokens }`.
* `login` có `@` → email (không phân biệt hoa thường); không có `@` → số điện thoại. Server tự chuẩn hóa SĐT: `0901 234 567`, `090.123.4567`, `+84 901 234 567`, `84901234567` đều là `0901234567`. App cứ gửi nguyên chuỗi người dùng gõ, một ô nhập chung "Email hoặc số điện thoại".
* **SĐT đăng nhập = SĐT nhà trọ của chủ trọ** (`account.phone` trong phản hồi). Sửa SĐT nhà trọ (`PATCH /v1/me` trường `phone`, `PATCH /v1/settings`, hoặc push `AppSettings.phone`) thì SĐT đăng nhập đổi theo. **Quản lý** không có SĐT đăng nhập (`account.phone = null`), đăng nhập bằng email.
* Server cũng nhận tên trường `phone` hoặc `email` thay cho `login` (gửi một trong ba). Thiếu cả ba → `400`, `fields: [{ field: "login", code: "required" }]`.
* Sai thông tin → `401 invalid_credentials` (không cho biết sai email/SĐT hay sai mật khẩu). `login` không phải email cũng không phải SĐT → `400`, `fields: [{ field: "login", code: "invalid_format" }]`.
* Sai 5 lần/15 phút → `429 too_many_attempts`; tính theo tài khoản, nhập email hay SĐT đều cộng chung.
* Đăng nhập lại từ cùng `deviceId` sẽ thay phiên cũ của máy đó.

### 2.4 `POST /v1/auth/refresh` → `200`
`{ "refreshToken" }` → `{ "tokens": {...} }`. **Mỗi lần trả cặp mới, cặp cũ vô hiệu.** Gửi lại refresh token cũ → cả phiên bị thu hồi (`refresh_reused`).
* Chỉ một luồng làm mới tại một thời điểm (nhiều request cùng gặp 401 dùng chung một lần refresh).
* Làm mới chủ động khi access token còn ~5 phút và app đang ở trước màn hình.
* Refresh hết hạn nếu 3 giờ không làm mới; phiên tối đa 12 giờ kể từ đăng nhập (`sessionExpiresAt`) → đăng nhập lại.

### 2.5 `POST /v1/auth/logout` → `204`
`{ "refreshToken" }` (Bearer tùy chọn). Luôn `204`.

### 2.6 Quên / đặt lại mật khẩu
* `POST /v1/auth/forgot` `{ "email" }` (**chỉ email**, không nhận SĐT) → **luôn `202`** `{ "status": "accepted" }`, kể cả email chưa đăng ký (không lộ email nào có tài khoản). Gửi `Accept-Language` để email đúng ngôn ngữ.
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
* `PATCH /v1/me` gửi trường muốn đổi: `displayName`, `preferredLanguage` (`vi`|`en`), `email` (**kèm `password`**), `propertyName`, `address`, `phone` (3 trường nhà trọ chỉ chủ trọ; `phone` cũng là SĐT đăng nhập của chủ trọ, trùng nhà trọ khác → `409 phone_taken`). Trả `{ account, property, role }`. Đổi thông tin nhà trọ cũng cập nhật bản ghi `AppSettings` (các máy khác nhận khi pull).
* `DELETE /v1/me` `{ "password" }` → `204`. **Chủ trọ: xóa nhà trọ và toàn bộ dữ liệu trên máy chủ**, quản lý mất quyền truy cập. Quản lý: chỉ xóa tài khoản của mình.
* `POST /v1/me/property` `{ "property": {...như đăng ký}, "seed"?: false }` → `201` (cùng định dạng 2.2): cho tài khoản chưa có nhà trọ (vd quản lý bị gỡ).
* Trang web yêu cầu xóa (đưa link lên Google Play): `https://roomkeepapi-ivory.vercel.app/account/delete` (thêm `?lang=en`). Người dùng nhập email hoặc SĐT + mật khẩu.

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
* `rejected` (không thử lại, ghi vào nhật ký đồng bộ): `unknown_table`, `invalid_change`, `validation_failed` (kèm `fields`, theo schema ở mục 7.4), `payload_too_large`, `forbidden_table` (quản lý), `period_locked` (kỳ đã khóa).
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

## 5. Luồng xử lý trong app

Nguyên tắc chung: **giao diện chỉ đọc từ Room trên máy**; API chỉ dùng để đăng nhập và đồng bộ. Mất mạng hay máy chủ lỗi thì màn hình vẫn chạy trên dữ liệu đã có, hiện dải "Đang ngoại tuyến", thay đổi xếp hàng trong `SyncOutbox`.

### 5.1 Mở app
1. `GET /v1/health` (không bắt buộc chờ): nếu `minAppVersion` > phiên bản app → màn hình bắt buộc cập nhật.
2. Còn token trong bộ nhớ (app chưa bị đóng) → vào thẳng. Không còn → màn hình chọn **Đăng nhập** / **Đăng ký** / **Dùng không tài khoản**. Màn hình đăng nhập có **một ô "Email hoặc số điện thoại"**, điền sẵn giá trị lần trước (không nhớ mật khẩu).
3. Đã đăng nhập → mở tệp Room của tài khoản (`roomkeep_<accountId>.db`), đẩy outbox (`sync/push`) rồi kéo thay đổi (`sync/pull?since=<lastPulledRev>`).

### 5.2 Giữ phiên đăng nhập
| Tình huống | App làm gì |
|---|---|
| Access token còn ~5 phút và app đang mở, có thao tác gần đây | `POST /auth/refresh`, thay cả cặp token |
| Request nhận `401 token_expired` / `unauthorized` | Refresh **một lần** (nhiều request cùng lúc dùng chung một lần refresh) rồi gửi lại |
| Chuyển sang app khác (Zalo...) rồi quay lại | Giữ nguyên phiên và màn hình; token hết hạn thì refresh ngay, người dùng không thấy gì |
| Ở nền hoặc không thao tác **quá 1 giờ**, app bị đóng hẳn | Xóa token khỏi bộ nhớ, lần mở sau đăng nhập lại |
| Refresh trả `session_expired` / `refresh_reused` / `refresh_invalid` / `session_revoked` | Về màn hình đăng nhập, **giữ dữ liệu và outbox trên máy** |
| Đăng xuất | `POST /auth/logout { refreshToken }`, hỏi giữ hay xóa dữ liệu trên máy |

Token **chỉ nằm trong bộ nhớ**, không lưu vào Room, SharedPreferences hay tệp xuất. Phiên tối đa 12 giờ kể từ đăng nhập (`sessionExpiresAt`); báo trước khi sắp hết.

### 5.3 Đăng ký
1. Các bước 1-5 lưu nháp trong `RegistrationDraft` (không lưu mật khẩu). Sinh `idempotencyKey` một lần cho bản nháp.
2. Bước 5 (dãy, tầng, phòng): app tự sinh danh sách để người dùng xem và sửa, rồi gửi dạng `layout.blocks/floors/rooms` có `id` của app.
3. `POST /auth/register`. Mất mạng giữa chừng → giữ nháp, bấm lại dùng **cùng `idempotencyKey`** (server trả `200` với đúng tài khoản cũ, không tạo nhà trọ thứ hai).
4. Thành công → ghi `changes` vào Room, `lastPulledRev = rev`. App tự tạo dữ liệu ở máy (không gửi `layout`/`rates`/`billing`) thì gửi `"seed": false`, rồi push toàn bộ bản ghi đã tạo, kể cả `AppSettings` id `main`.
5. Người được mời làm quản lý: chỉ bước 1 + ô **mã mời**, gửi `inviteCode` thay cho `property`.

### 5.4 Quên mật khẩu
*Nhập email* → `POST /auth/forgot` (luôn `202`, hiện "Nếu email đã đăng ký, mã đã được gửi") → *Nhập mã + mật khẩu mới* → `POST /auth/reset` (`204`) → *Đăng nhập* với email điền sẵn. Nút "Gửi lại mã" sau 60 giây. Kiểm tra mật khẩu ở app (8 ký tự, có chữ và số) chỉ để gợi ý; lỗi thật lấy từ `fields`.

### 5.5 Đồng bộ
1. Mọi thay đổi dữ liệu ghi vào `SyncOutbox` **trong cùng giao dịch Room** với thay đổi đó, kèm `baseRev` = `serverRev` hiện tại và một `idempotencyKey` mới.
2. Khi có mạng và app đang mở (hoặc người dùng bấm "Đồng bộ"): `POST /sync/push` theo lô ≤ 500 thay đổi, rồi `GET /sync/pull` đến khi `hasMore = false`.
3. Xử lý kết quả push: `accepted` → ghi `serverRev`, xóa khỏi outbox. `conflicts` → `SyncConflict` + màn hình so sánh. `rejected` → ghi `SyncLog`, không thử lại.
4. Lỗi mạng, `5xx`, `429` → thử lại cả lô, giãn cách tăng dần (2s, 4s, 8s... tối đa vài phút).
5. Ghi mọi lần đồng bộ vào `SyncLog` (thời điểm, hướng, số bản ghi, kết quả) cho màn hình nhật ký.

### 5.6 Mời quản lý
Chủ trọ: `POST /invites` → hiện mã 8 ký tự + nút sao chép/gửi Zalo. Người nhận: đăng ký với `inviteCode` (5.3), hoặc đã có tài khoản thì `POST /invites/accept` → **thay token đang giữ** bằng `tokens` trong phản hồi, mở tệp Room mới, pull từ `since=0`. Khi `role = "manager"`: ẩn lợi nhuận, lương, chi phí tổng, mời người, xóa nhà trọ.

## 6. Giới hạn
* Theo IP: đọc 120/phút, ghi 60/phút, các endpoint đăng nhập/đăng ký/quên mật khẩu 10/phút → `429` + `Retry-After`.
* Timeout app đề xuất 15 giây; không thử lại vô hạn.
* Một lần gọi đầu tiên sau một thời gian không ai dùng có thể chậm hơn vài giây (máy chủ khởi động); timeout 15 giây là đủ.

<!-- CRUD:START: phần này sinh tự động từ src/resources/schema.js bằng `npm run docs`, đừng sửa tay -->
## 7. 🔒 CRUD từng phần

Mỗi phần (69 bảng của Room) có REST CRUD riêng. Cài đặt nhà trọ là `GET/PATCH /v1/settings`.

* Dữ liệu CRUD và dữ liệu đồng bộ là **một**: ghi qua CRUD tăng `rev`, app nhận khi pull; ghi qua push thì CRUD đọc thấy ngay.
* App Android vẫn nên dùng `sync/push` + `sync/pull` cho thao tác hằng ngày (offline-first). CRUD dùng khi cần thao tác trực tiếp với server (web quản trị, màn hình chỉ chạy khi có mạng, công cụ nhập liệu, kiểm thử).
* `sync/push` kiểm tra **cùng schema** ở mục 7.4: thiếu trường bắt buộc, sai kiểu, sai enum → bản ghi vào `rejected` với `code: "validation_failed"` và `fields`. Trường app có mà schema chưa có được giữ nguyên.

### 7.1 Quy ước chung

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

### 7.2 Luật nghiệp vụ

**Liên kết khi xóa:** *chặn xóa* = không xóa được bản ghi cha khi còn bản ghi này; *xóa theo* = xóa bản ghi cha thì bản ghi này bị xóa cùng.

**Đồng bộ:** mọi thay đổi qua CRUD đều tăng `rev` và app Android nhận được ở lần `GET /v1/sync/pull` kế tiếp. `/v1/sync/push` kiểm tra cùng schema (trường lạ của app được giữ nguyên).

- Hợp đồng `draft`/`active` của cùng một phòng không được chồng ngày (`startA < endB && startB < endA`, không có `endDate` = vô thời hạn) → `409 contract_overlap`; `endDate` ≥ `startDate`.
- Kỳ thu `status = locked`: không sửa được bảng tính tiền, dòng bảng kê, điều chỉnh, chi phí chung và lượt dùng dịch vụ của kỳ → `409 period_locked`. Ghi lần thu (`collections`) vẫn được. Chỉ chủ trọ mở khóa.
- `collections`, `deposit-entries` chỉ ghi thêm: không PATCH (`409 append_only`); nhập nhầm thì xóa rồi ghi lại.
- `room-statements.paidAmount`, `collectStatus` (`unpaid`/`partial`/`paid`) tính từ các lần thu, không lưu.

### 7.3 Danh sách các phần

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

### 7.4 Trường của từng phần

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

<!-- EXAMPLES:START: phần này sinh tự động bằng `npm run docs:examples` (chạy API thật trên database tạm), đừng sửa tay -->
## 8. Request / response thật của từng endpoint

Mọi ví dụ dưới đây là **phản hồi thật** của API (cùng code đang chạy trên Vercel), chụp lại bằng script. Id, thời điểm, mã sẽ khác mỗi lần, **tên trường, kiểu và cấu trúc thì giống hệt**. Token được rút gọn cho dễ đọc.

Quy ước kiểu: id = chuỗi UUID; thời điểm = chuỗi ISO 8601 UTC (`2026-11-15T08:00:00Z`); ngày = `yyyy-MM-dd`; tiền = số nguyên đồng; trường có thể `null` được ghi rõ ở mục 8.0.

### 8.0 Model dùng chung (để khai báo data class)

| Model | Trường (kiểu, `?` = có thể null) |
|---|---|
| `Account` | `id` string, `email` string, `phone` string? (SĐT đăng nhập = SĐT nhà trọ, chỉ chủ trọ), `displayName` string, `preferredLanguage` "vi"\|"en", `role` "owner"\|"manager"?, `propertyId` string?, `createdAt` string |
| `Property` | `id` string, `name` string, `address` string, `phone` string, `ownerId` string, `createdAt` string |
| `Profile` | `account` Account, `property` Property?, `role` "owner"\|"manager"? |
| `Tokens` | `tokenType` "Bearer", `accessToken` string, `accessTokenExpiresAt` string, `expiresIn` int (giây), `refreshToken` string, `refreshTokenExpiresAt` string, `sessionExpiresAt` string, `deviceId` string |
| `AuthResponse` | Profile + `tokens` Tokens (+ `changes` SyncRecord[], `rev` int, `hasMore` bool khi đăng ký / nhận mời / tạo nhà trọ) |
| `SyncRecord` | `table` string, `id` string, `rev` int, `op` "upsert"\|"delete", `isDeleted` bool, `updatedAt` string? (do app gửi), `serverUpdatedAt` string, `payload` object (các cột của bảng + `id`, `isDeleted`, `isDemo`, `updatedAt`) |
| `SyncChange` (gửi lên) | `table` string, `id` string, `op` "upsert"\|"delete", `baseRev` int?, `updatedAt` string?, `payload` object? (bắt buộc khi upsert), `idempotencyKey` string? |
| `PushResponse` | `accepted` [{`table`, `id`, `idempotencyKey`?, `rev` int, `duplicate`? bool, `unchanged`? bool}], `conflicts` [{`table`, `id`, `idempotencyKey`?, `baseRev` int?, `server` SyncRecord}], `rejected` [{`table`?, `id`?, `idempotencyKey`?, `code` string, `field` string, `fields`? FieldError[]}], `newRev` int |
| `PullResponse` | `changes` SyncRecord[], `nextRev` int, `hasMore` bool, `serverRev` int |
| `CrudRecord` | `id` string + mọi trường của bảng (mục 7.4, chưa có = `null`) + trường tính sẵn + `isDemo` bool, `rev` int, `createdAt` string, `updatedAt` string |
| `CrudList` | `data` CrudRecord[], `page` {`limit` int, `offset` int, `total` int} |
| `ApiError` | `code` string, `message` string, `requestId` string, `fields`? FieldError[], cùng các trường thêm tùy mã lỗi (`retryAfter`, `current`, `blockedBy`, `existingId`, `conflictWith`, `minAppVersion`...) |
| `FieldError` | `field` string, `code` string |

**Lưu ý khi parse:** JSON có thể có thêm trường mới trong các bản sau, nên bật `ignoreUnknownKeys` (kotlinx.serialization) hoặc `FAIL_ON_UNKNOWN_PROPERTIES = false` (Jackson/Moshi tương đương). Riêng `payload` của SyncRecord nên parse theo `table` (hoặc giữ dạng `JsonObject` rồi ánh xạ trong lớp chuyển đổi), vì mỗi bảng một cấu trúc.

### 8.1 Hệ thống

#### Kiểm tra sống

`GET /v1/health` → **200**

Response:
```json
{
  "status": "ok",
  "apiVersion": "1.0.0",
  "minAppVersion": "1.0.0",
  "latestAppVersion": "1.0.0",
  "serverTime": "2026-11-14T19:18:20Z"
}
```

### 8.2 Đăng ký, đăng nhập, phiên

#### Đăng ký, app tự tạo dữ liệu ở máy (`seed: false`)

`POST /v1/auth/register` → **201**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/auth/register
Accept-Language: vi
Content-Type: application/json
```
```json
{
  "account": {
    "email": "chu@example.com",
    "password": "Matkhau2026",
    "displayName": "Cô Lan"
  },
  "acceptTerms": true,
  "seed": false,
  "property": {
    "name": "Nhà trọ Hoa Sen",
    "address": "12 Lê Lợi",
    "phone": "0901234567"
  },
  "deviceName": "Pixel 8",
  "deviceId": "install-1",
  "idempotencyKey": "6f1c2c8e-0d1a-4c1e-9a55-1e2b3c4d5e6f"
}
```
Response:
```json
{
  "account": {
    "id": "e5580e26-ebd1-4f29-8cee-672b0954a2f5",
    "email": "chu@example.com",
    "phone": "0901234567",
    "displayName": "Cô Lan",
    "preferredLanguage": "vi",
    "role": "owner",
    "propertyId": "4d4235c2-da2a-42d2-ad28-98986a60d988",
    "createdAt": "2026-11-14T19:18:20Z"
  },
  "property": {
    "id": "4d4235c2-da2a-42d2-ad28-98986a60d988",
    "name": "Nhà trọ Hoa Sen",
    "address": "12 Lê Lợi",
    "phone": "0901234567",
    "ownerId": "e5580e26-ebd1-4f29-8cee-672b0954a2f5",
    "createdAt": "2026-11-14T19:18:20Z"
  },
  "role": "owner",
  "tokens": {
    "tokenType": "Bearer",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5…",
    "accessTokenExpiresAt": "2026-11-14T21:18:21Z",
    "expiresIn": 7200,
    "refreshToken": "30657be7-32cb-4007-85fa-…",
    "refreshTokenExpiresAt": "2026-11-14T22:18:21Z",
    "sessionExpiresAt": "2026-11-15T07:18:21Z",
    "deviceId": "30657be7-32cb-4007-85fa-4709a67addcb"
  },
  "changes": [],
  "rev": 0,
  "hasMore": false
}
```
* Gửi lại đúng body này (cùng `idempotencyKey`) sau khi mất mạng → `200` với cùng tài khoản.

#### Đăng ký, server sinh sẵn dữ liệu (`layout`, `rates`, `billing`)

`POST /v1/auth/register` → **201**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/auth/register
Content-Type: application/json
```
```json
{
  "account": {
    "email": "chu2@example.com",
    "password": "Matkhau2026",
    "displayName": "Chú Tư"
  },
  "acceptTerms": true,
  "property": {
    "name": "Trọ Bình An",
    "billing": {
      "meterDay": 25,
      "dueDay": 5,
      "dayCountMode": "fixed30"
    },
    "rates": {
      "electric": {
        "mode": "flat",
        "price": 3500
      },
      "water": {
        "mode": "per_m3",
        "price": 18000
      },
      "services": [
        {
          "name": "Internet",
          "calcMode": "per_room",
          "price": 100000
        }
      ]
    },
    "layout": {
      "blocks": [
        {
          "id": "blk-a",
          "name": "Dãy A"
        }
      ],
      "floors": [
        {
          "id": "flr-a1",
          "blockId": "blk-a",
          "label": "Tầng 1"
        }
      ],
      "rooms": [
        {
          "id": "room-a101",
          "floorId": "flr-a1",
          "name": "A101",
          "monthlyRent": 2500000
        },
        {
          "id": "room-a102",
          "floorId": "flr-a1",
          "name": "A102",
          "monthlyRent": 2500000
        }
      ]
    }
  },
  "deviceName": "Galaxy A55"
}
```
Response:
```json
{
  "account": {
    "id": "00e9cde5-50ee-4830-b8e8-d210dfe20835",
    "email": "chu2@example.com",
    "phone": null,
    "displayName": "Chú Tư",
    "preferredLanguage": "vi",
    "role": "owner",
    "propertyId": "475cbfdc-3679-47b6-867c-d3e8d6cd4aa1",
    "createdAt": "2026-11-14T19:18:21Z"
  },
  "property": {
    "id": "475cbfdc-3679-47b6-867c-d3e8d6cd4aa1",
    "name": "Trọ Bình An",
    "address": "",
    "phone": "",
    "ownerId": "00e9cde5-50ee-4830-b8e8-d210dfe20835",
    "createdAt": "2026-11-14T19:18:21Z"
  },
  "role": "owner",
  "tokens": {
    "tokenType": "Bearer",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5…",
    "accessTokenExpiresAt": "2026-11-14T21:18:21Z",
    "expiresIn": 7200,
    "refreshToken": "c0bd6402-dee1-42af-9c1f-…",
    "refreshTokenExpiresAt": "2026-11-14T22:18:21Z",
    "sessionExpiresAt": "2026-11-15T07:18:21Z",
    "deviceId": "c0bd6402-dee1-42af-9c1f-3e689c0190d2"
  },
  "changes": [
    {
      "table": "AppSettings",
      "id": "main",
      "rev": 1,
      "op": "upsert",
      "isDeleted": false,
      "updatedAt": "2026-11-14T19:18:21.030Z",
      "serverUpdatedAt": "2026-11-14T19:18:21Z",
      "payload": {
        "id": "main",
        "language": "vi",
        "propertyName": "Trọ Bình An",
        "address": "",
        "phone": "",
        "meterDay": 25,
        "cycleStartDay": 1,
        "dueDay": 5,
        "dayCountMode": "fixed30",
        "roundingStep": 1000,
        "dateFormat": "dd/MM/yyyy",
        "rulesText": "",
        "updatedAt": "2026-11-14T19:18:21.030Z",
        "isDeleted": false,
        "isDemo": false
      }
    },
    {
      "table": "ElectricityTier",
      "id": "965b490f-aa52-4be5-b58b-d4d932cf2f63",
      "rev": 2,
      "op": "upsert",
      "isDeleted": false,
      "updatedAt": "2026-11-14T19:18:21.030Z",
      "serverUpdatedAt": "2026-11-14T19:18:21Z",
      "payload": {
        "id": "965b490f-aa52-4be5-b58b-d4d932cf2f63",
        "name": "Đồng giá",
        "fromKwh": 0,
        "toKwh": null,
        "pricePerKwh": 3500,
        "effectiveFrom": "2026-11-15",
        "updatedAt": "2026-11-14T19:18:21.030Z",
        "isDeleted": false,
        "isDemo": false
      }
    },
    {
      "table": "WaterRate",
      "id": "a032d63a-209e-41fa-ad5c-1d0aa109eeb0",
      "rev": 3,
      "op": "upsert",
      "isDeleted": false,
      "updatedAt": "2026-11-14T19:18:21.030Z",
      "serverUpdatedAt": "2026-11-14T19:18:21Z",
      "payload": {
        "id": "a032d63a-209e-41fa-ad5c-1d0aa109eeb0",
        "mode": "per_m3",
        "pricePerUnit": 18000,
        "effectiveFrom": "2026-11-15",
        "updatedAt": "2026-11-14T19:18:21.030Z",
        "isDeleted": false,
        "isDemo": false
      }
    }
  ],
  "rev": 16,
  "hasMore": false
}
```
* `changes` có 16 phần tử, chỉ hiện 3 phần tử đầu.

#### Đăng nhập bằng email

`POST /v1/auth/login` → **200**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/auth/login
Content-Type: application/json
```
```json
{
  "login": "chu@example.com",
  "password": "Matkhau2026",
  "deviceName": "Pixel 8",
  "deviceId": "install-1"
}
```
Response:
```json
{
  "account": {
    "id": "e5580e26-ebd1-4f29-8cee-672b0954a2f5",
    "email": "chu@example.com",
    "phone": "0901234567",
    "displayName": "Cô Lan",
    "preferredLanguage": "vi",
    "role": "owner",
    "propertyId": "4d4235c2-da2a-42d2-ad28-98986a60d988",
    "createdAt": "2026-11-14T19:18:20Z"
  },
  "property": {
    "id": "4d4235c2-da2a-42d2-ad28-98986a60d988",
    "name": "Nhà trọ Hoa Sen",
    "address": "12 Lê Lợi",
    "phone": "0901234567",
    "ownerId": "e5580e26-ebd1-4f29-8cee-672b0954a2f5",
    "createdAt": "2026-11-14T19:18:20Z"
  },
  "role": "owner",
  "tokens": {
    "tokenType": "Bearer",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5…",
    "accessTokenExpiresAt": "2026-11-14T21:18:21Z",
    "expiresIn": 7200,
    "refreshToken": "b004eeba-b084-4ba9-a98b-…",
    "refreshTokenExpiresAt": "2026-11-14T22:18:21Z",
    "sessionExpiresAt": "2026-11-15T07:18:21Z",
    "deviceId": "b004eeba-b084-4ba9-a98b-7b54a990ce93"
  }
}
```

#### Đăng nhập bằng số điện thoại (SĐT nhà trọ)

`POST /v1/auth/login` → **200**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/auth/login
Content-Type: application/json
```
```json
{
  "login": "0901 234 567",
  "password": "Matkhau2026",
  "deviceName": "Pixel 8",
  "deviceId": "install-1"
}
```
Response:
```json
{
  "account": {
    "id": "e5580e26-ebd1-4f29-8cee-672b0954a2f5",
    "email": "chu@example.com",
    "phone": "0901234567",
    "displayName": "Cô Lan",
    "preferredLanguage": "vi",
    "role": "owner",
    "propertyId": "4d4235c2-da2a-42d2-ad28-98986a60d988",
    "createdAt": "2026-11-14T19:18:20Z"
  },
  "property": {
    "id": "4d4235c2-da2a-42d2-ad28-98986a60d988",
    "name": "Nhà trọ Hoa Sen",
    "address": "12 Lê Lợi",
    "phone": "0901234567",
    "ownerId": "e5580e26-ebd1-4f29-8cee-672b0954a2f5",
    "createdAt": "2026-11-14T19:18:20Z"
  },
  "role": "owner",
  "tokens": {
    "tokenType": "Bearer",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5…",
    "accessTokenExpiresAt": "2026-11-14T21:18:21Z",
    "expiresIn": 7200,
    "refreshToken": "629b7fab-fd0e-42dd-85f6-…",
    "refreshTokenExpiresAt": "2026-11-14T22:18:21Z",
    "sessionExpiresAt": "2026-11-15T07:18:21Z",
    "deviceId": "629b7fab-fd0e-42dd-85f6-3ffa49ae74f6"
  }
}
```
* Gửi nguyên chuỗi người dùng gõ; server chuẩn hóa `0901 234 567` / `+84901234567` thành `0901234567`.

#### Làm mới token

`POST /v1/auth/refresh` → **200**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/auth/refresh
Content-Type: application/json
```
```json
{
  "refreshToken": "629b7fab-fd0e-42dd-85f6-3ffa49ae74f6.UHDUtiIPBFpFKJRCZ98nkAqBf3LNpkPXQpQUBAHn7HE"
}
```
Response:
```json
{
  "tokens": {
    "tokenType": "Bearer",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5…",
    "accessTokenExpiresAt": "2026-11-14T21:18:21Z",
    "expiresIn": 7200,
    "refreshToken": "629b7fab-fd0e-42dd-85f6-…",
    "refreshTokenExpiresAt": "2026-11-14T22:18:21Z",
    "sessionExpiresAt": "2026-11-15T07:18:21Z",
    "deviceId": "629b7fab-fd0e-42dd-85f6-3ffa49ae74f6"
  }
}
```
* `refreshToken` cũ hết hiệu lực ngay; luôn thay cả cặp.

#### Hồ sơ

`GET /v1/me` → **200**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/me
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "account": {
    "id": "e5580e26-ebd1-4f29-8cee-672b0954a2f5",
    "email": "chu@example.com",
    "phone": "0901234567",
    "displayName": "Cô Lan",
    "preferredLanguage": "vi",
    "role": "owner",
    "propertyId": "4d4235c2-da2a-42d2-ad28-98986a60d988",
    "createdAt": "2026-11-14T19:18:20Z"
  },
  "property": {
    "id": "4d4235c2-da2a-42d2-ad28-98986a60d988",
    "name": "Nhà trọ Hoa Sen",
    "address": "12 Lê Lợi",
    "phone": "0901234567",
    "ownerId": "e5580e26-ebd1-4f29-8cee-672b0954a2f5",
    "createdAt": "2026-11-14T19:18:20Z"
  },
  "role": "owner"
}
```

#### Sửa hồ sơ

`PATCH /v1/me` → **200**

Request:
```http
PATCH https://roomkeepapi-ivory.vercel.app/v1/me
Authorization: Bearer <accessToken>
Content-Type: application/json
```
```json
{
  "displayName": "Cô Lan Anh",
  "preferredLanguage": "vi"
}
```
Response:
```json
{
  "account": {
    "id": "e5580e26-ebd1-4f29-8cee-672b0954a2f5",
    "email": "chu@example.com",
    "phone": "0901234567",
    "displayName": "Cô Lan Anh",
    "preferredLanguage": "vi",
    "role": "owner",
    "propertyId": "4d4235c2-da2a-42d2-ad28-98986a60d988",
    "createdAt": "2026-11-14T19:18:20Z"
  },
  "property": {
    "id": "4d4235c2-da2a-42d2-ad28-98986a60d988",
    "name": "Nhà trọ Hoa Sen",
    "address": "12 Lê Lợi",
    "phone": "0901234567",
    "ownerId": "e5580e26-ebd1-4f29-8cee-672b0954a2f5",
    "createdAt": "2026-11-14T19:18:20Z"
  },
  "role": "owner"
}
```

#### Thiết bị đã đăng nhập

`GET /v1/devices` → **200**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/devices
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "devices": [
    {
      "id": "629b7fab-fd0e-42dd-85f6-3ffa49ae74f6",
      "name": "Pixel 8",
      "createdAt": "2026-11-14T19:18:21Z",
      "lastSeenAt": "2026-11-14T19:18:21Z",
      "expiresAt": "2026-11-15T07:18:21Z",
      "isCurrent": true
    }
  ]
}
```

### 8.3 Mật khẩu

#### Quên mật khẩu

`POST /v1/auth/forgot` → **202**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/auth/forgot
Accept-Language: vi
Content-Type: application/json
```
```json
{
  "email": "chu@example.com"
}
```
Response:
```json
{
  "status": "accepted",
  "devToken": "78CB-E3KC"
}
```
* **Production chỉ trả `{ "status": "accepted" }`.** `devToken` chỉ có ở môi trường dev chưa cấu hình email (như lúc chụp ví dụ này); mã thật nằm trong email.

#### Đặt lại mật khẩu

`POST /v1/auth/reset` → **204**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/auth/reset
Content-Type: application/json
```
```json
{
  "token": "78CB-E3KC",
  "newPassword": "Matkhau2027"
}
```
Response:
```
(không có body)
```
* Mọi thiết bị bị đăng xuất: phải đăng nhập lại.

#### Đổi mật khẩu

`POST /v1/auth/change-password` → **200**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/auth/change-password
Authorization: Bearer <accessToken>
Content-Type: application/json
```
```json
{
  "oldPassword": "Matkhau2027",
  "newPassword": "Matkhau2026"
}
```
Response:
```json
{
  "status": "ok",
  "revokedSessions": 0
}
```

### 8.4 Đồng bộ

#### Đẩy thay đổi (bản ghi mới)

`POST /v1/sync/push` → **200**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/sync/push
Authorization: Bearer <accessToken>
Content-Type: application/json
```
```json
{
  "deviceId": "install-1",
  "changes": [
    {
      "table": "AppSettings",
      "id": "main",
      "op": "upsert",
      "baseRev": null,
      "updatedAt": "2026-11-15T08:00:00Z",
      "idempotencyKey": "k-settings-1",
      "payload": {
        "propertyName": "Nhà trọ Hoa Sen",
        "meterDay": 28,
        "dueDay": 5,
        "dayCountMode": "fixed30",
        "roundingStep": 1000,
        "elecPrice": 3500
      }
    },
    {
      "table": "Block",
      "id": "blk-a",
      "op": "upsert",
      "baseRev": null,
      "idempotencyKey": "k-blk-a",
      "payload": {
        "name": "Dãy A",
        "sortOrder": 0
      }
    },
    {
      "table": "Floor",
      "id": "flr-a1",
      "op": "upsert",
      "baseRev": null,
      "idempotencyKey": "k-flr-a1",
      "payload": {
        "blockId": "blk-a",
        "label": "Tầng 1",
        "sortOrder": 0
      }
    },
    {
      "table": "Room",
      "id": "room-a101",
      "op": "upsert",
      "baseRev": null,
      "idempotencyKey": "k-room-a101",
      "payload": {
        "floorId": "flr-a1",
        "name": "A101",
        "capacity": 2,
        "rent": 2500000,
        "area": 18
      }
    },
    {
      "table": "Tenant",
      "id": "ten-1",
      "op": "upsert",
      "baseRev": null,
      "idempotencyKey": "k-ten-1",
      "payload": {
        "name": "Nguyễn Văn An",
        "phone": "0900000101"
      }
    }
  ]
}
```
Response:
```json
{
  "accepted": [
    {
      "table": "AppSettings",
      "id": "main",
      "idempotencyKey": "k-settings-1",
      "rev": 1
    },
    {
      "table": "Block",
      "id": "blk-a",
      "idempotencyKey": "k-blk-a",
      "rev": 2
    },
    {
      "table": "Floor",
      "id": "flr-a1",
      "idempotencyKey": "k-flr-a1",
      "rev": 3
    }
  ],
  "conflicts": [],
  "rejected": [],
  "newRev": 5
}
```
* `accepted` có 5 phần tử, chỉ hiện 3 phần tử đầu.
* `rent`, `area`, `elecPrice` không có trong schema: server **giữ nguyên** (trường riêng của app), không báo lỗi. Ghi `rev` của từng bản ghi vào `serverRev` ở máy.

#### Đẩy thay đổi: có xung đột và bị từ chối

`POST /v1/sync/push` → **200**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/sync/push
Authorization: Bearer <accessToken>
Content-Type: application/json
```
```json
{
  "deviceId": "install-1",
  "changes": [
    {
      "table": "Room",
      "id": "room-a101",
      "op": "upsert",
      "baseRev": 4,
      "idempotencyKey": "k-room-a101-2",
      "payload": {
        "floorId": "flr-a1",
        "name": "A101",
        "capacity": 2,
        "rent": 2700000
      }
    },
    {
      "table": "Contract",
      "id": "ct-1",
      "op": "upsert",
      "baseRev": null,
      "idempotencyKey": "k-ct-1",
      "payload": {
        "roomId": "room-a101",
        "tenantId": "ten-1",
        "rent": 2500000,
        "start": "2026-11-01"
      }
    },
    {
      "table": "Tenant",
      "id": "ten-2",
      "op": "upsert",
      "baseRev": null,
      "idempotencyKey": "k-ten-2",
      "payload": {
        "name": "Trần Thị Bích",
        "phone": "0900000102",
        "segment": "vip"
      }
    },
    {
      "table": "Tenant",
      "id": "ten-1",
      "op": "delete",
      "baseRev": 5,
      "idempotencyKey": "k-ten-1-del"
    }
  ]
}
```
Response:
```json
{
  "accepted": [
    {
      "table": "Tenant",
      "id": "ten-1",
      "idempotencyKey": "k-ten-1-del",
      "rev": 7
    }
  ],
  "conflicts": [
    {
      "table": "Room",
      "id": "room-a101",
      "idempotencyKey": "k-room-a101-2",
      "baseRev": 4,
      "server": {
        "table": "Room",
        "id": "room-a101",
        "rev": 6,
        "op": "upsert",
        "isDeleted": false,
        "updatedAt": null,
        "serverUpdatedAt": "2026-11-14T19:18:21Z",
        "payload": {
          "floorId": "flr-a1",
          "name": "A101",
          "capacity": 3,
          "rent": 2600000,
          "isDemo": false,
          "nameNoAccent": "a101",
          "id": "room-a101",
          "isDeleted": false
        }
      }
    }
  ],
  "rejected": [
    {
      "table": "Contract",
      "id": "ct-1",
      "idempotencyKey": "k-ct-1",
      "code": "validation_failed",
      "field": "leaderTenantId",
      "fields": [
        {
          "field": "leaderTenantId",
          "code": "required"
        },
        {
          "field": "startDate",
          "code": "required"
        },
        {
          "field": "monthlyRent",
          "code": "required"
        }
      ]
    },
    {
      "table": "Tenant",
      "id": "ten-2",
      "idempotencyKey": "k-ten-2",
      "code": "validation_failed",
      "field": "segment",
      "fields": [
        {
          "field": "segment",
          "code": "invalid_enum"
        }
      ]
    }
  ],
  "newRev": 7
}
```
* Room: máy khác đã sửa sau `baseRev` → `conflicts`, kèm bản trên server. Contract: dùng tên trường của app (`tenantId`, `rent`, `start`) nên thiếu các trường bắt buộc `leaderTenantId`, `startDate`, `monthlyRent` → `rejected`, liệt kê đủ trong `fields`. Tenant `segment: "vip"` sai enum → `rejected`. Xóa Tenant → `accepted`.

#### Kéo thay đổi

`GET /v1/sync/pull?since=0&limit=500` → **200**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/sync/pull?since=0&limit=500
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "changes": [
    {
      "table": "AppSettings",
      "id": "main",
      "rev": 1,
      "op": "upsert",
      "isDeleted": false,
      "updatedAt": "2026-11-15T08:00:00Z",
      "serverUpdatedAt": "2026-11-14T19:18:21Z",
      "payload": {
        "propertyName": "Nhà trọ Hoa Sen",
        "meterDay": 28,
        "dueDay": 5,
        "dayCountMode": "fixed30",
        "roundingStep": 1000,
        "elecPrice": 3500,
        "isDemo": false,
        "id": "main",
        "isDeleted": false
      }
    },
    {
      "table": "Block",
      "id": "blk-a",
      "rev": 2,
      "op": "upsert",
      "isDeleted": false,
      "updatedAt": null,
      "serverUpdatedAt": "2026-11-14T19:18:21Z",
      "payload": {
        "name": "Dãy A",
        "sortOrder": 0,
        "isDemo": false,
        "id": "blk-a",
        "isDeleted": false
      }
    },
    {
      "table": "Floor",
      "id": "flr-a1",
      "rev": 3,
      "op": "upsert",
      "isDeleted": false,
      "updatedAt": null,
      "serverUpdatedAt": "2026-11-14T19:18:21Z",
      "payload": {
        "blockId": "blk-a",
        "label": "Tầng 1",
        "sortOrder": 0,
        "isDemo": false,
        "id": "flr-a1",
        "isDeleted": false
      }
    }
  ],
  "nextRev": 7,
  "hasMore": false,
  "serverRev": 7
}
```
* `changes` có 4 phần tử, chỉ hiện 3 phần tử đầu.
* Lặp với `since = nextRev` khi `hasMore = true`. `since=0` không trả bản ghi đã xóa; `since>0` có trả (`op: "delete"`).

#### Kéo thay đổi, chỉ một số bảng

`GET /v1/sync/pull?since=0&tables=Room,Tenant` → **200**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/sync/pull?since=0&tables=Room,Tenant
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "changes": [
    {
      "table": "Room",
      "id": "room-a101",
      "rev": 6,
      "op": "upsert",
      "isDeleted": false,
      "updatedAt": null,
      "serverUpdatedAt": "2026-11-14T19:18:21Z",
      "payload": {
        "floorId": "flr-a1",
        "name": "A101",
        "capacity": 3,
        "rent": 2600000,
        "isDemo": false,
        "nameNoAccent": "a101",
        "id": "room-a101",
        "isDeleted": false
      }
    }
  ],
  "nextRev": 7,
  "hasMore": false,
  "serverRev": 7
}
```

#### Tóm tắt đồng bộ

`GET /v1/sync/summary` → **200**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/sync/summary
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "serverRev": 7,
  "purgedRev": 0,
  "lastChangeAt": "2026-11-14T19:18:21Z",
  "tables": {
    "AppSettings": 1,
    "Block": 1,
    "Floor": 1,
    "Room": 1
  }
}
```

### 8.5 CRUD (ví dụ phòng, hợp đồng, bảng tính tiền)

#### Danh sách phòng

`GET /v1/rooms?limit=50&offset=0` → **200**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/rooms?limit=50&offset=0
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "data": [
    {
      "id": "room-a101",
      "floorId": "flr-a1",
      "typeId": null,
      "name": "A101",
      "areaSqm": null,
      "capacity": 3,
      "status": null,
      "amenitiesText": null,
      "note": null,
      "isDemo": false,
      "rev": 6,
      "createdAt": "2026-11-14T19:18:21Z",
      "updatedAt": "2026-11-14T19:18:21Z"
    }
  ],
  "page": {
    "limit": 50,
    "offset": 0,
    "total": 1
  }
}
```
* Trường riêng của app (`rent`, `area`) không xuất hiện ở CRUD; CRUD chỉ trả các trường của schema (mục 7.4).

#### Tạo phòng

`POST /v1/rooms` → **201**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/rooms
Authorization: Bearer <accessToken>
Content-Type: application/json
```
```json
{
  "id": "room-a102",
  "floorId": "flr-a1",
  "name": "A102",
  "capacity": 2,
  "areaSqm": 18.5
}
```
Response:
```json
{
  "id": "room-a102",
  "floorId": "flr-a1",
  "typeId": null,
  "name": "A102",
  "areaSqm": 18.5,
  "capacity": 2,
  "status": "vacant",
  "amenitiesText": null,
  "note": null,
  "isDemo": false,
  "rev": 8,
  "createdAt": "2026-11-14T19:18:21Z",
  "updatedAt": "2026-11-14T19:18:21Z"
}
```

#### Một phòng

`GET /v1/rooms/room-a102` → **200**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/rooms/room-a102
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "id": "room-a102",
  "floorId": "flr-a1",
  "typeId": null,
  "name": "A102",
  "areaSqm": 18.5,
  "capacity": 2,
  "status": "vacant",
  "amenitiesText": null,
  "note": null,
  "isDemo": false,
  "rev": 8,
  "createdAt": "2026-11-14T19:18:21Z",
  "updatedAt": "2026-11-14T19:18:21Z"
}
```

#### Sửa phòng (có `rev` để chống ghi đè)

`PATCH /v1/rooms/room-a102` → **200**

Request:
```http
PATCH https://roomkeepapi-ivory.vercel.app/v1/rooms/room-a102
Authorization: Bearer <accessToken>
Content-Type: application/json
```
```json
{
  "status": "maintenance",
  "note": "Sửa trần",
  "rev": 8
}
```
Response:
```json
{
  "id": "room-a102",
  "floorId": "flr-a1",
  "typeId": null,
  "name": "A102",
  "areaSqm": 18.5,
  "capacity": 2,
  "status": "maintenance",
  "amenitiesText": null,
  "note": "Sửa trần",
  "isDemo": false,
  "rev": 9,
  "createdAt": "2026-11-14T19:18:21Z",
  "updatedAt": "2026-11-14T19:18:21Z"
}
```

#### Tìm khách không dấu

`GET /v1/tenants?q=tran thi` → **200**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/tenants?q=tran thi
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "data": [
    {
      "id": "ten-2",
      "name": "Trần Thị Bích",
      "phone": "0900000102",
      "workplaceText": null,
      "vehicleText": null,
      "segment": "long_term",
      "emergencyContactText": null,
      "note": null,
      "isDemo": false,
      "rev": 10,
      "createdAt": "2026-11-14T19:18:21Z",
      "updatedAt": "2026-11-14T19:18:21Z"
    },
    {
      "id": "ten-3",
      "name": "Trần Thị Thu",
      "phone": "0900000103",
      "workplaceText": null,
      "vehicleText": null,
      "segment": null,
      "emergencyContactText": null,
      "note": null,
      "isDemo": false,
      "rev": 11,
      "createdAt": "2026-11-14T19:18:21Z",
      "updatedAt": "2026-11-14T19:18:21Z"
    }
  ],
  "page": {
    "limit": 50,
    "offset": 0,
    "total": 2
  }
}
```

#### Tạo hợp đồng

`POST /v1/contracts` → **201**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/contracts
Authorization: Bearer <accessToken>
Content-Type: application/json
```
```json
{
  "roomId": "room-a102",
  "leaderTenantId": "ten-2",
  "startDate": "2026-11-01",
  "endDate": "2027-10-31",
  "monthlyRent": 2500000,
  "depositAmount": 2500000
}
```
Response:
```json
{
  "id": "a057fa17-62b2-4332-81b9-9b805a32c044",
  "roomId": "room-a102",
  "leaderTenantId": "ten-2",
  "startDate": "2026-11-01",
  "endDate": "2027-10-31",
  "monthlyRent": 2500000,
  "depositAmount": 2500000,
  "depositDate": null,
  "extraTerms": null,
  "status": "active",
  "terminationReason": null,
  "renewedFromId": null,
  "isDemo": false,
  "rev": 12,
  "createdAt": "2026-11-14T19:18:21Z",
  "updatedAt": "2026-11-14T19:18:21Z"
}
```

#### Tạo bảng tính tiền

`POST /v1/room-statements` → **201**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/room-statements
Authorization: Bearer <accessToken>
Content-Type: application/json
```
```json
{
  "cycleId": "29a459d0-5f6c-4125-afc5-0fb60b01143c",
  "roomId": "room-a102",
  "contractId": "a057fa17-62b2-4332-81b9-9b805a32c044",
  "rentAmount": 2500000,
  "electricAmount": 350000,
  "waterAmount": 72000,
  "feesAmount": 120000,
  "totalAmount": 3042000
}
```
Response:
```json
{
  "id": "7be0afd0-87aa-4fe5-81b8-93074128760c",
  "cycleId": "29a459d0-5f6c-4125-afc5-0fb60b01143c",
  "roomId": "room-a102",
  "contractId": "a057fa17-62b2-4332-81b9-9b805a32c044",
  "rentAmount": 2500000,
  "electricAmount": 350000,
  "waterAmount": 72000,
  "feesAmount": 120000,
  "sharedAmount": null,
  "discountAmount": null,
  "adjustAmount": null,
  "totalAmount": 3042000,
  "prorationNote": null,
  "missingReadings": false,
  "paidAmount": 0,
  "collectStatus": "unpaid",
  "isDemo": false,
  "rev": 14,
  "createdAt": "2026-11-14T19:18:21Z",
  "updatedAt": "2026-11-14T19:18:21Z"
}
```

#### Bảng tính tiền sau một lần thu (`paidAmount`, `collectStatus` tính sẵn)

`GET /v1/room-statements/7be0afd0-87aa-4fe5-81b8-93074128760c` → **200**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/room-statements/7be0afd0-87aa-4fe5-81b8-93074128760c
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "id": "7be0afd0-87aa-4fe5-81b8-93074128760c",
  "cycleId": "29a459d0-5f6c-4125-afc5-0fb60b01143c",
  "roomId": "room-a102",
  "contractId": "a057fa17-62b2-4332-81b9-9b805a32c044",
  "rentAmount": 2500000,
  "electricAmount": 350000,
  "waterAmount": 72000,
  "feesAmount": 120000,
  "sharedAmount": null,
  "discountAmount": null,
  "adjustAmount": null,
  "totalAmount": 3042000,
  "prorationNote": null,
  "missingReadings": false,
  "paidAmount": 2000000,
  "collectStatus": "partial",
  "isDemo": false,
  "rev": 14,
  "createdAt": "2026-11-14T19:18:21Z",
  "updatedAt": "2026-11-14T19:18:21Z"
}
```

#### Cài đặt nhà trọ

`GET /v1/settings` → **200**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/settings
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "id": "main",
  "language": null,
  "propertyName": "Nhà trọ Hoa Sen",
  "address": null,
  "phone": null,
  "meterDay": 28,
  "cycleStartDay": null,
  "dueDay": 5,
  "dayCountMode": "fixed30",
  "roundingStep": 1000,
  "dateFormat": null,
  "rulesText": null,
  "theme": null,
  "isDemo": false,
  "rev": 1,
  "createdAt": "2026-11-14T19:18:21Z",
  "updatedAt": "2026-11-14T19:18:21Z"
}
```

#### Xóa

`DELETE /v1/blocks/blk-b` → **204**

Request:
```http
DELETE https://roomkeepapi-ivory.vercel.app/v1/blocks/blk-b
Authorization: Bearer <accessToken>
```
Response:
```
(không có body)
```

### 8.6 Mời quản lý

#### Tạo mã mời (chủ trọ)

`POST /v1/invites` → **201**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/invites
Authorization: Bearer <accessToken>
Content-Type: application/json
```
```json
{
  "role": "manager"
}
```
Response:
```json
{
  "id": "6df28c6a-1366-40ff-b661-46f4a73ccd9d",
  "code": "NUXK4B8G",
  "role": "manager",
  "expiresAt": "2026-11-16T19:18:21Z",
  "createdAt": "2026-11-14T19:18:21Z",
  "status": "active",
  "usedAt": null
}
```

#### Đăng ký bằng mã mời

`POST /v1/auth/register` → **201**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/auth/register
Content-Type: application/json
```
```json
{
  "account": {
    "email": "quanly@example.com",
    "password": "Matkhau2026",
    "displayName": "Quản lý Hùng"
  },
  "acceptTerms": true,
  "inviteCode": "NUXK4B8G",
  "deviceName": "Redmi 13"
}
```
Response:
```json
{
  "account": {
    "id": "4327eb6c-b8ad-4907-9f97-bbe94964b7e2",
    "email": "quanly@example.com",
    "phone": null,
    "displayName": "Quản lý Hùng",
    "preferredLanguage": "vi",
    "role": "manager",
    "propertyId": "4d4235c2-da2a-42d2-ad28-98986a60d988",
    "createdAt": "2026-11-14T19:18:21Z"
  },
  "property": {
    "id": "4d4235c2-da2a-42d2-ad28-98986a60d988",
    "name": "Nhà trọ Hoa Sen",
    "address": "12 Lê Lợi",
    "phone": "0901234567",
    "ownerId": "e5580e26-ebd1-4f29-8cee-672b0954a2f5",
    "createdAt": "2026-11-14T19:18:20Z"
  },
  "role": "manager",
  "tokens": {
    "tokenType": "Bearer",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5…",
    "accessTokenExpiresAt": "2026-11-14T21:18:21Z",
    "expiresIn": 7200,
    "refreshToken": "1a3d1f50-bce3-4ba1-a2a5-…",
    "refreshTokenExpiresAt": "2026-11-14T22:18:21Z",
    "sessionExpiresAt": "2026-11-15T07:18:21Z",
    "deviceId": "1a3d1f50-bce3-4ba1-a2a5-b0d6a1b3db49"
  },
  "changes": [
    {
      "table": "AppSettings",
      "id": "main",
      "rev": 1,
      "op": "upsert",
      "isDeleted": false,
      "updatedAt": "2026-11-15T08:00:00Z",
      "serverUpdatedAt": "2026-11-14T19:18:21Z",
      "payload": {
        "propertyName": "Nhà trọ Hoa Sen",
        "meterDay": 28,
        "dueDay": 5,
        "dayCountMode": "fixed30",
        "roundingStep": 1000,
        "elecPrice": 3500,
        "isDemo": false,
        "id": "main",
        "isDeleted": false
      }
    },
    {
      "table": "Block",
      "id": "blk-a",
      "rev": 2,
      "op": "upsert",
      "isDeleted": false,
      "updatedAt": null,
      "serverUpdatedAt": "2026-11-14T19:18:21Z",
      "payload": {
        "name": "Dãy A",
        "sortOrder": 0,
        "isDemo": false,
        "id": "blk-a",
        "isDeleted": false
      }
    },
    {
      "table": "Floor",
      "id": "flr-a1",
      "rev": 3,
      "op": "upsert",
      "isDeleted": false,
      "updatedAt": null,
      "serverUpdatedAt": "2026-11-14T19:18:21Z",
      "payload": {
        "blockId": "blk-a",
        "label": "Tầng 1",
        "sortOrder": 0,
        "isDemo": false,
        "id": "flr-a1",
        "isDeleted": false
      }
    }
  ],
  "rev": 17,
  "hasMore": false
}
```
* `changes` có 11 phần tử, chỉ hiện 3 phần tử đầu.

#### Danh sách thành viên

`GET /v1/members` → **200**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/members
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "members": [
    {
      "accountId": "e5580e26-ebd1-4f29-8cee-672b0954a2f5",
      "displayName": "Cô Lan Anh",
      "email": "chu@example.com",
      "role": "owner",
      "joinedAt": "2026-11-14T19:18:20Z"
    },
    {
      "accountId": "4327eb6c-b8ad-4907-9f97-bbe94964b7e2",
      "displayName": "Quản lý Hùng",
      "email": "quanly@example.com",
      "role": "manager",
      "joinedAt": "2026-11-14T19:18:21Z"
    }
  ]
}
```

### 8.7 Thu chi (ghi chép)

Các bảng thu chi dùng CRUD chung (mục 7). `cash-entries`, `expenses`, `utility-bills`, `reserve-fund-entries`, `investments`, `targets`, `staff-pays` **chỉ chủ trọ** (quản lý nhận `403 forbidden`). `collections`, `deposit-entries` chỉ ghi thêm (không PATCH). Lọc theo tháng bằng `?from=yyyy-MM-01&to=yyyy-MM-31` trên ngày chính của bảng, hoặc `?cycle=yyyy-MM` với bảng có trường `cycle`.

#### Ghi một lần thu tiền phòng

`POST /v1/collections` → **201**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/collections
Authorization: Bearer <accessToken>
Content-Type: application/json
```
```json
{
  "statementId": "7be0afd0-87aa-4fe5-81b8-93074128760c",
  "amount": 1042000,
  "paidAt": "2026-11-10",
  "methodNote": "Chuyển khoản"
}
```
Response:
```json
{
  "id": "2b8a348b-49eb-4e5a-a121-1667759136f3",
  "statementId": "7be0afd0-87aa-4fe5-81b8-93074128760c",
  "amount": 1042000,
  "paidAt": "2026-11-10",
  "methodNote": "Chuyển khoản",
  "isDemo": false,
  "rev": 18,
  "createdAt": "2026-11-14T19:18:21Z",
  "updatedAt": "2026-11-14T19:18:21Z"
}
```

#### Các lần thu của một bảng tính tiền

`GET /v1/collections?statementId=7be0afd0-87aa-4fe5-81b8-93074128760c` → **200**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/collections?statementId=7be0afd0-87aa-4fe5-81b8-93074128760c
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "data": [
    {
      "id": "2b8a348b-49eb-4e5a-a121-1667759136f3",
      "statementId": "7be0afd0-87aa-4fe5-81b8-93074128760c",
      "amount": 1042000,
      "paidAt": "2026-11-10",
      "methodNote": "Chuyển khoản",
      "isDemo": false,
      "rev": 18,
      "createdAt": "2026-11-14T19:18:21Z",
      "updatedAt": "2026-11-14T19:18:21Z"
    },
    {
      "id": "bfeae71f-83fd-497b-9e88-0b6f39d4834e",
      "statementId": "7be0afd0-87aa-4fe5-81b8-93074128760c",
      "amount": 2000000,
      "paidAt": "2026-11-05",
      "methodNote": "Tiền mặt",
      "isDemo": false,
      "rev": 15,
      "createdAt": "2026-11-14T19:18:21Z",
      "updatedAt": "2026-11-14T19:18:21Z"
    }
  ],
  "page": {
    "limit": 50,
    "offset": 0,
    "total": 2
  }
}
```

#### Sổ cọc của một hợp đồng

`GET /v1/deposit-entries?contractId=a057fa17-62b2-4332-81b9-9b805a32c044` → **200**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/deposit-entries?contractId=a057fa17-62b2-4332-81b9-9b805a32c044
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "data": [
    {
      "id": "c080d540-448b-4be1-a99d-779720a4202c",
      "contractId": "a057fa17-62b2-4332-81b9-9b805a32c044",
      "type": "receive",
      "amount": 2500000,
      "date": "2026-11-01",
      "reason": "Nhận cọc khi ký hợp đồng",
      "isDemo": false,
      "rev": 19,
      "createdAt": "2026-11-14T19:18:21Z",
      "updatedAt": "2026-11-14T19:18:21Z"
    }
  ],
  "page": {
    "limit": 50,
    "offset": 0,
    "total": 1
  }
}
```

#### Ghi một khoản chi

`POST /v1/expenses` → **201**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/expenses
Authorization: Bearer <accessToken>
Content-Type: application/json
```
```json
{
  "category": "Điện tổng",
  "amount": 3650000,
  "date": "2026-11-03",
  "isRecurring": true,
  "note": "Hóa đơn EVN tháng 10"
}
```
Response:
```json
{
  "id": "b2c73bca-c911-41cf-92f5-2be12c614342",
  "category": "Điện tổng",
  "amount": 3650000,
  "date": "2026-11-03",
  "isRecurring": true,
  "note": "Hóa đơn EVN tháng 10",
  "isDemo": false,
  "rev": 20,
  "createdAt": "2026-11-14T19:18:21Z",
  "updatedAt": "2026-11-14T19:18:21Z"
}
```

#### Chi phí trong tháng 11

`GET /v1/expenses?from=2026-11-01&to=2026-11-30&sort=-date` → **200**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/expenses?from=2026-11-01&to=2026-11-30&sort=-date
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "data": [
    {
      "id": "14545c3c-f7a0-4b16-8fa7-03f557cdb1cc",
      "category": "Sửa chữa",
      "amount": 350000,
      "date": "2026-11-08",
      "isRecurring": false,
      "note": "Nạp gas máy lạnh A201",
      "isDemo": false,
      "rev": 23,
      "createdAt": "2026-11-14T19:18:21Z",
      "updatedAt": "2026-11-14T19:18:21Z"
    },
    {
      "id": "b2c73bca-c911-41cf-92f5-2be12c614342",
      "category": "Điện tổng",
      "amount": 3650000,
      "date": "2026-11-03",
      "isRecurring": true,
      "note": "Hóa đơn EVN tháng 10",
      "isDemo": false,
      "rev": 20,
      "createdAt": "2026-11-14T19:18:21Z",
      "updatedAt": "2026-11-14T19:18:21Z"
    },
    {
      "id": "206cdc54-50fe-4d9c-a8fe-c62b0b57d272",
      "category": "Nước tổng",
      "amount": 760000,
      "date": "2026-11-03",
      "isRecurring": true,
      "note": "Hóa đơn nước tháng 10",
      "isDemo": false,
      "rev": 21,
      "createdAt": "2026-11-14T19:18:21Z",
      "updatedAt": "2026-11-14T19:18:21Z"
    }
  ],
  "page": {
    "limit": 50,
    "offset": 0,
    "total": 4
  }
}
```
* `data` có 4 phần tử, chỉ hiện 3 phần tử đầu.

#### Sổ thu chi tiền mặt

`GET /v1/cash-entries?sort=-date` → **200**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/cash-entries?sort=-date
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "data": [
    {
      "id": "7dc5db41-f970-49a9-8706-d88507189c79",
      "type": "in",
      "amount": 500000,
      "reason": "Cọc giữ chỗ A204",
      "date": "2026-11-12",
      "isDemo": false,
      "rev": 24,
      "createdAt": "2026-11-14T19:18:21Z",
      "updatedAt": "2026-11-14T19:18:21Z"
    },
    {
      "id": "fbe7579d-542c-4a12-bf8a-e6b5153badea",
      "type": "out",
      "amount": 180000,
      "reason": "Mua bóng đèn hành lang",
      "date": "2026-11-07",
      "isDemo": false,
      "rev": 25,
      "createdAt": "2026-11-14T19:18:21Z",
      "updatedAt": "2026-11-14T19:18:21Z"
    }
  ],
  "page": {
    "limit": 50,
    "offset": 0,
    "total": 2
  }
}
```

#### Chỉ các khoản chi tiền mặt

`GET /v1/cash-entries?type=out` → **200**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/cash-entries?type=out
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "data": [
    {
      "id": "fbe7579d-542c-4a12-bf8a-e6b5153badea",
      "type": "out",
      "amount": 180000,
      "reason": "Mua bóng đèn hành lang",
      "date": "2026-11-07",
      "isDemo": false,
      "rev": 25,
      "createdAt": "2026-11-14T19:18:21Z",
      "updatedAt": "2026-11-14T19:18:21Z"
    }
  ],
  "page": {
    "limit": 50,
    "offset": 0,
    "total": 1
  }
}
```

#### Điện nước tổng của kỳ

`GET /v1/utility-bills?cycle=2026-10` → **200**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/utility-bills?cycle=2026-10
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "data": [
    {
      "id": "94f093ea-80e3-4fcd-aa40-82d39a4f5bb5",
      "cycle": "2026-10",
      "kind": "electric",
      "totalAmount": 3650000,
      "totalUnits": 820,
      "isDemo": false,
      "rev": 26,
      "createdAt": "2026-11-14T19:18:21Z",
      "updatedAt": "2026-11-14T19:18:21Z"
    },
    {
      "id": "1dc8e29f-27a0-4ed6-8aa1-26b96e2eff9d",
      "cycle": "2026-10",
      "kind": "water",
      "totalAmount": 760000,
      "totalUnits": 33,
      "isDemo": false,
      "rev": 27,
      "createdAt": "2026-11-14T19:18:21Z",
      "updatedAt": "2026-11-14T19:18:21Z"
    }
  ],
  "page": {
    "limit": 50,
    "offset": 0,
    "total": 2
  }
}
```

#### Quỹ dự phòng sửa chữa

`GET /v1/reserve-fund-entries` → **200**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/reserve-fund-entries
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "data": [
    {
      "id": "af53021a-bf74-4763-aeec-e9726d08ec55",
      "type": "out",
      "amount": 650000,
      "date": "2026-11-10",
      "reason": "Thay khóa, sơn phòng A104",
      "isDemo": false,
      "rev": 29,
      "createdAt": "2026-11-14T19:18:21Z",
      "updatedAt": "2026-11-14T19:18:21Z"
    },
    {
      "id": "963947e9-4692-4eb1-a472-3c6f6fa5c873",
      "type": "in",
      "amount": 500000,
      "date": "2026-10-31",
      "reason": "Trích quỹ tháng 10",
      "isDemo": false,
      "rev": 28,
      "createdAt": "2026-11-14T19:18:21Z",
      "updatedAt": "2026-11-14T19:18:21Z"
    }
  ],
  "page": {
    "limit": 50,
    "offset": 0,
    "total": 2
  }
}
```

#### Lương nhân viên theo kỳ

`GET /v1/staff-pays?cycle=2026-10` → **200**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/staff-pays?cycle=2026-10
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "data": [
    {
      "id": "b8fcc33d-74e1-4f60-bf6c-4269a4bf09ad",
      "staffId": "72dfc4ee-c005-4636-92a6-eaa108e5d08c",
      "cycle": "2026-10",
      "amount": 1500000,
      "note": "Lương tháng 10",
      "isDemo": false,
      "rev": 31,
      "createdAt": "2026-11-14T19:18:21Z",
      "updatedAt": "2026-11-14T19:18:21Z"
    }
  ],
  "page": {
    "limit": 50,
    "offset": 0,
    "total": 1
  }
}
```

#### Chi phí đầu tư

`GET /v1/investments` → **200**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/investments
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "data": [
    {
      "id": "37598395-fe6b-4e9d-95ad-4fbe338c4980",
      "roomId": null,
      "amount": 48000000,
      "date": "2025-01-01",
      "note": "Lắp 8 máy lạnh",
      "isDemo": false,
      "rev": 32,
      "createdAt": "2026-11-14T19:18:21Z",
      "updatedAt": "2026-11-14T19:18:21Z"
    }
  ],
  "page": {
    "limit": 50,
    "offset": 0,
    "total": 1
  }
}
```

#### Mục tiêu doanh thu

`GET /v1/targets` → **200**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/targets
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "data": [
    {
      "id": "b78e5568-e105-4ce1-a2ba-1809b9f513f0",
      "month": "2026-11",
      "targetRevenue": 20000000,
      "isDemo": false,
      "rev": 33,
      "createdAt": "2026-11-14T19:18:21Z",
      "updatedAt": "2026-11-14T19:18:21Z"
    }
  ],
  "page": {
    "limit": 50,
    "offset": 0,
    "total": 1
  }
}
```

#### Quản lý xem chi phí → bị chặn

`GET /v1/expenses` → **403**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/expenses
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "code": "forbidden",
  "message": "Bạn không có quyền thực hiện thao tác này",
  "requestId": "req_0cd894666acc"
}
```

### 8.8 Lỗi thường gặp

#### Thiếu token

`GET /v1/me` → **401**

Response:
```json
{
  "code": "unauthorized",
  "message": "Bạn cần đăng nhập để tiếp tục",
  "requestId": "req_56d91293c1e4"
}
```

#### Access token hết hạn → gọi `/auth/refresh` rồi gửi lại

`GET /v1/me` → **401**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/me
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "code": "token_expired",
  "message": "Phiên truy cập đã hết hạn",
  "requestId": "req_b07b614ffa3b"
}
```

#### Refresh token sai hoặc đã bị thu hồi → về màn hình đăng nhập

`POST /v1/auth/refresh` → **401**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/auth/refresh
Content-Type: application/json
```
```json
{
  "refreshToken": "abc.def"
}
```
Response:
```json
{
  "code": "refresh_invalid",
  "message": "Không thể làm mới phiên, vui lòng đăng nhập lại",
  "requestId": "req_8a1576cd19c4"
}
```
* Gửi lại một refresh token cũ (đã đổi) thì `code` là `refresh_reused` và cả phiên bị thu hồi; xử lý giống nhau: về màn hình đăng nhập, giữ dữ liệu trên máy.

#### Sai mật khẩu

`POST /v1/auth/login` → **401**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/auth/login
Content-Type: application/json
```
```json
{
  "email": "chu@example.com",
  "password": "sai123456"
}
```
Response:
```json
{
  "code": "invalid_credentials",
  "message": "Email/số điện thoại hoặc mật khẩu không đúng",
  "requestId": "req_33ec9152cebb"
}
```

#### Dữ liệu không hợp lệ

`POST /v1/auth/register` → **400**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/auth/register
Accept-Language: vi
Content-Type: application/json
```
```json
{
  "account": {
    "email": "sai-email",
    "password": "abc",
    "displayName": ""
  },
  "property": {
    "name": ""
  }
}
```
Response:
```json
{
  "code": "validation_failed",
  "message": "Dữ liệu không hợp lệ",
  "fields": [
    {
      "field": "account.email",
      "code": "invalid_format"
    },
    {
      "field": "account.password",
      "code": "weak_password"
    },
    {
      "field": "account.displayName",
      "code": "required"
    }
  ],
  "requestId": "req_fdab794228a5"
}
```
* `fields` có 5 phần tử, chỉ hiện 3 phần tử đầu.

#### SĐT nhà trọ đã được nhà trọ khác dùng

`POST /v1/auth/register` → **409**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/auth/register
Content-Type: application/json
```
```json
{
  "account": {
    "email": "khac@example.com",
    "password": "Matkhau2026",
    "displayName": "Y"
  },
  "acceptTerms": true,
  "seed": false,
  "property": {
    "name": "Y",
    "phone": "+84 901 234 567"
  }
}
```
Response:
```json
{
  "code": "phone_taken",
  "message": "Số điện thoại này đã được dùng cho tài khoản khác",
  "fields": [
    {
      "field": "property.phone",
      "code": "phone_taken"
    }
  ],
  "requestId": "req_edbb70586e9d"
}
```

#### Email đã đăng ký

`POST /v1/auth/register` → **409**

Request:
```http
POST https://roomkeepapi-ivory.vercel.app/v1/auth/register
Content-Type: application/json
```
```json
{
  "account": {
    "email": "chu@example.com",
    "password": "Matkhau2026",
    "displayName": "X"
  },
  "acceptTerms": true,
  "seed": false,
  "property": {
    "name": "X"
  }
}
```
Response:
```json
{
  "code": "email_taken",
  "message": "Email này đã được đăng ký",
  "requestId": "req_4deb1d77fdc3"
}
```

#### Sửa đè bản cũ (CRUD)

`PATCH /v1/rooms/room-a102` → **409**

Request:
```http
PATCH https://roomkeepapi-ivory.vercel.app/v1/rooms/room-a102
Authorization: Bearer <accessToken>
Content-Type: application/json
```
```json
{
  "note": "x",
  "rev": 1
}
```
Response:
```json
{
  "code": "version_conflict",
  "message": "Bản ghi đã được sửa ở nơi khác, hãy tải lại rồi sửa tiếp",
  "current": {
    "id": "room-a102",
    "floorId": "flr-a1",
    "typeId": null,
    "name": "A102",
    "areaSqm": 18.5,
    "capacity": 2,
    "status": "maintenance",
    "amenitiesText": null,
    "note": "Sửa trần",
    "isDemo": false,
    "rev": 9,
    "createdAt": "2026-11-14T19:18:21Z",
    "updatedAt": "2026-11-14T19:18:21Z"
  },
  "requestId": "req_00e4c3d5f42e"
}
```

#### Xóa khi còn dữ liệu liên kết

`DELETE /v1/rooms/room-a102` → **409**

Request:
```http
DELETE https://roomkeepapi-ivory.vercel.app/v1/rooms/room-a102
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "code": "has_dependents",
  "message": "Không thể xóa vì còn dữ liệu đang liên kết",
  "blockedBy": [
    {
      "resource": "contracts",
      "field": "roomId",
      "count": 1
    },
    {
      "resource": "room-statements",
      "field": "roomId",
      "count": 1
    }
  ],
  "requestId": "req_6b888fe81d3d"
}
```

#### Không tìm thấy

`GET /v1/rooms/khong-co` → **404**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/rooms/khong-co
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "code": "not_found",
  "message": "Không tìm thấy",
  "requestId": "req_7921ed92ebf3"
}
```

#### App quá cũ

`GET /v1/me` → **426**

Request:
```http
GET https://roomkeepapi-ivory.vercel.app/v1/me
Authorization: Bearer <accessToken>
X-App-Version: 0.9.0
```
Response:
```json
{
  "code": "upgrade_required",
  "message": "Phiên bản ứng dụng quá cũ, vui lòng cập nhật",
  "minAppVersion": "1.0.0",
  "latestAppVersion": "1.0.0",
  "requestId": "req_5ce6faf0cd3d"
}
```

<!-- EXAMPLES:END -->
