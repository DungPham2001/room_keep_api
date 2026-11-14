/**
 * Runs the real API (in-memory MongoDB, same code as production) through every endpoint and writes the exact
 * requests and responses into section 8 of docs/API-cho-FE.md (between EXAMPLES:START / EXAMPLES:END).
 *   npm run docs:examples
 * Long values are shortened for reading: tokens, and arrays of more than 3 items (the count is noted).
 */
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');

if (!process.env.MONGOMS_SYSTEM_BINARY && fs.existsSync('/opt/homebrew/bin/mongod')) {
  process.env.MONGOMS_SYSTEM_BINARY = '/opt/homebrew/bin/mongod';
  process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '9.0.4';
}

const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const app = require('../src/app');
const config = require('../src/config');
require('../src/models');

const BASE = 'https://roomkeepapi-ivory.vercel.app';
const out = [];
const w = (s = '') => out.push(s);

const shortToken = (v) => (typeof v === 'string' && v.length > 40 ? `${v.slice(0, 24)}…` : v);
function shorten(v, notes, key = '') {
  if (Array.isArray(v)) {
    if (v.length > 3) notes.push(`\`${key || 'mảng'}\` có ${v.length} phần tử, chỉ hiện 3 phần tử đầu.`);
    return v.slice(0, 3).map((x) => shorten(x, notes, key));
  }
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = ['accessToken', 'refreshToken'].includes(k) ? shortToken(x) : shorten(x, notes, k);
    return o;
  }
  return v;
}
const pretty = (v) => JSON.stringify(v, null, 2);

/** Calls the API and documents it. */
async function call(title, method, url, { body, token, headers = {}, note, expect } = {}) {
  let req = request(app)[method.toLowerCase()](url);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
  const res = body !== undefined ? await req.send(body) : await req;
  if (expect && res.status !== expect) throw new Error(`${method} ${url} -> ${res.status} ${JSON.stringify(res.body)}`);

  w(`#### ${title}`);
  w();
  w(`\`${method} ${url.replace(/^\/v1/, '/v1')}\` → **${res.status}**`);
  w();
  const shownHeaders = { ...(token ? { Authorization: 'Bearer <accessToken>' } : {}), ...headers };
  if (Object.keys(shownHeaders).length || body !== undefined) {
    w('Request:');
    w('```http');
    w(`${method} ${BASE}${url}`);
    for (const [k, v] of Object.entries(shownHeaders)) w(`${k}: ${v}`);
    if (body !== undefined) w('Content-Type: application/json');
    w('```');
    if (body !== undefined) {
      w('```json');
      w(pretty(body));
      w('```');
    }
  }
  w('Response:');
  const notes = [];
  if (res.status === 204) {
    w('```');
    w('(không có body)');
    w('```');
  } else if ((res.headers['content-type'] || '').includes('json')) {
    w('```json');
    w(pretty(shorten(res.body, notes)));
    w('```');
  }
  for (const n of [...new Set(notes)]) w(`* ${n}`);
  if (note) w(`* ${note}`);
  w();
  return res;
}

async function main() {
  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1, configSettings: { electionTimeoutMillis: 10000 } } });
  await mongoose.connect(rs.getUri());
  for (const name of mongoose.modelNames()) await mongoose.model(name).syncIndexes();
  const PW = 'Matkhau2026';

  w('<!-- EXAMPLES:START: phần này sinh tự động bằng `npm run docs:examples` (chạy API thật trên database tạm), đừng sửa tay -->');
  w('## 8. Request / response thật của từng endpoint');
  w();
  w('Mọi ví dụ dưới đây là **phản hồi thật** của API (cùng code đang chạy trên Vercel), chụp lại bằng script. Id, thời điểm, mã sẽ khác mỗi lần, **tên trường, kiểu và cấu trúc thì giống hệt**. Token được rút gọn cho dễ đọc.');
  w();
  w('Quy ước kiểu: id = chuỗi UUID; thời điểm = chuỗi ISO 8601 UTC (`2026-11-15T08:00:00Z`); ngày = `yyyy-MM-dd`; tiền = số nguyên đồng; trường có thể `null` được ghi rõ ở mục 8.0.');
  w();
  w('### 8.0 Model dùng chung (để khai báo data class)');
  w();
  w('| Model | Trường (kiểu, `?` = có thể null) |');
  w('|---|---|');
  w('| `Account` | `id` string, `email` string, `phone` string? (SĐT đăng nhập = SĐT nhà trọ, chỉ chủ trọ), `displayName` string, `preferredLanguage` "vi"\\|"en", `role` "owner"\\|"manager"?, `propertyId` string?, `createdAt` string |');
  w('| `Property` | `id` string, `name` string, `address` string, `phone` string, `ownerId` string, `createdAt` string |');
  w('| `Profile` | `account` Account, `property` Property?, `role` "owner"\\|"manager"? |');
  w('| `Tokens` | `tokenType` "Bearer", `accessToken` string, `accessTokenExpiresAt` string, `expiresIn` int (giây), `refreshToken` string, `refreshTokenExpiresAt` string, `sessionExpiresAt` string, `deviceId` string |');
  w('| `AuthResponse` | Profile + `tokens` Tokens (+ `changes` SyncRecord[], `rev` int, `hasMore` bool khi đăng ký / nhận mời / tạo nhà trọ) |');
  w('| `SyncRecord` | `table` string, `id` string, `rev` int, `op` "upsert"\\|"delete", `isDeleted` bool, `updatedAt` string? (do app gửi), `serverUpdatedAt` string, `payload` object (các cột của bảng + `id`, `isDeleted`, `isDemo`, `updatedAt`) |');
  w('| `SyncChange` (gửi lên) | `table` string, `id` string, `op` "upsert"\\|"delete", `baseRev` int?, `updatedAt` string?, `payload` object? (bắt buộc khi upsert), `idempotencyKey` string? |');
  w('| `PushResponse` | `accepted` [{`table`, `id`, `idempotencyKey`?, `rev` int, `duplicate`? bool, `unchanged`? bool}], `conflicts` [{`table`, `id`, `idempotencyKey`?, `baseRev` int?, `server` SyncRecord}], `rejected` [{`table`?, `id`?, `idempotencyKey`?, `code` string, `field` string, `fields`? FieldError[]}], `newRev` int |');
  w('| `PullResponse` | `changes` SyncRecord[], `nextRev` int, `hasMore` bool, `serverRev` int |');
  w('| `CrudRecord` | `id` string + mọi trường của bảng (mục 7.4, chưa có = `null`) + trường tính sẵn + `isDemo` bool, `rev` int, `createdAt` string, `updatedAt` string |');
  w('| `CrudList` | `data` CrudRecord[], `page` {`limit` int, `offset` int, `total` int} |');
  w('| `ApiError` | `code` string, `message` string, `requestId` string, `fields`? FieldError[], cùng các trường thêm tùy mã lỗi (`retryAfter`, `current`, `blockedBy`, `existingId`, `conflictWith`, `minAppVersion`...) |');
  w('| `FieldError` | `field` string, `code` string |');
  w();
  w('**Lưu ý khi parse:** JSON có thể có thêm trường mới trong các bản sau, nên bật `ignoreUnknownKeys` (kotlinx.serialization) hoặc `FAIL_ON_UNKNOWN_PROPERTIES = false` (Jackson/Moshi tương đương). Riêng `payload` của SyncRecord nên parse theo `table` (hoặc giữ dạng `JsonObject` rồi ánh xạ trong lớp chuyển đổi), vì mỗi bảng một cấu trúc.');
  w();

  // ---------- 8.1 system ----------
  w('### 8.1 Hệ thống');
  w();
  await call('Kiểm tra sống', 'GET', '/v1/health', { expect: 200 });

  // ---------- 8.2 auth ----------
  w('### 8.2 Đăng ký, đăng nhập, phiên');
  w();
  const reg = await call('Đăng ký, app tự tạo dữ liệu ở máy (`seed: false`)', 'POST', '/v1/auth/register', {
    expect: 201,
    headers: { 'Accept-Language': 'vi' },
    body: { account: { email: 'chu@example.com', password: PW, displayName: 'Cô Lan' }, acceptTerms: true, seed: false, property: { name: 'Nhà trọ Hoa Sen', address: '12 Lê Lợi', phone: '0901234567' }, deviceName: 'Pixel 8', deviceId: 'install-1', idempotencyKey: '6f1c2c8e-0d1a-4c1e-9a55-1e2b3c4d5e6f' },
    note: 'Gửi lại đúng body này (cùng `idempotencyKey`) sau khi mất mạng → `200` với cùng tài khoản.',
  });
  let t = reg.body.tokens;
  await call('Đăng ký, server sinh sẵn dữ liệu (`layout`, `rates`, `billing`)', 'POST', '/v1/auth/register', {
    expect: 201,
    body: {
      account: { email: 'chu2@example.com', password: PW, displayName: 'Chú Tư' }, acceptTerms: true,
      property: {
        name: 'Trọ Bình An', billing: { meterDay: 25, dueDay: 5, dayCountMode: 'fixed30' },
        rates: { electric: { mode: 'flat', price: 3500 }, water: { mode: 'per_m3', price: 18000 }, services: [{ name: 'Internet', calcMode: 'per_room', price: 100000 }] },
        layout: { blocks: [{ id: 'blk-a', name: 'Dãy A' }], floors: [{ id: 'flr-a1', blockId: 'blk-a', label: 'Tầng 1' }], rooms: [{ id: 'room-a101', floorId: 'flr-a1', name: 'A101', monthlyRent: 2500000 }, { id: 'room-a102', floorId: 'flr-a1', name: 'A102', monthlyRent: 2500000 }] },
      },
      deviceName: 'Galaxy A55',
    },
  });
  await call('Đăng nhập bằng email', 'POST', '/v1/auth/login', { expect: 200, body: { login: 'chu@example.com', password: PW, deviceName: 'Pixel 8', deviceId: 'install-1' } });
  await call('Đăng nhập bằng số điện thoại (SĐT nhà trọ)', 'POST', '/v1/auth/login', { expect: 200, body: { login: '0901 234 567', password: PW, deviceName: 'Pixel 8', deviceId: 'install-1' }, note: 'Gửi nguyên chuỗi người dùng gõ; server chuẩn hóa `0901 234 567` / `+84901234567` thành `0901234567`.' }).then((r) => { t = r.body.tokens; });
  const ref = await call('Làm mới token', 'POST', '/v1/auth/refresh', { expect: 200, body: { refreshToken: t.refreshToken }, note: '`refreshToken` cũ hết hiệu lực ngay; luôn thay cả cặp.' });
  t = ref.body.tokens;
  await call('Hồ sơ', 'GET', '/v1/me', { token: t.accessToken, expect: 200 });
  await call('Sửa hồ sơ', 'PATCH', '/v1/me', { token: t.accessToken, expect: 200, body: { displayName: 'Cô Lan Anh', preferredLanguage: 'vi' } });
  await call('Thiết bị đã đăng nhập', 'GET', '/v1/devices', { token: t.accessToken, expect: 200 });

  // ---------- 8.3 password ----------
  w('### 8.3 Mật khẩu');
  w();
  const fg = await call('Quên mật khẩu', 'POST', '/v1/auth/forgot', { expect: 202, headers: { 'Accept-Language': 'vi' }, body: { email: 'chu@example.com' }, note: '**Production chỉ trả `{ "status": "accepted" }`.** `devToken` chỉ có ở môi trường dev chưa cấu hình email (như lúc chụp ví dụ này); mã thật nằm trong email.' });
  await call('Đặt lại mật khẩu', 'POST', '/v1/auth/reset', { expect: 204, body: { token: fg.body.devToken, newPassword: 'Matkhau2027' }, note: 'Mọi thiết bị bị đăng xuất: phải đăng nhập lại.' });
  t = (await request(app).post('/v1/auth/login').send({ email: 'chu@example.com', password: 'Matkhau2027', deviceName: 'Pixel 8' })).body.tokens;
  await call('Đổi mật khẩu', 'POST', '/v1/auth/change-password', { token: t.accessToken, expect: 200, body: { oldPassword: 'Matkhau2027', newPassword: PW } });

  // ---------- 8.4 sync ----------
  w('### 8.4 Đồng bộ');
  w();
  const p1 = await call('Đẩy thay đổi (bản ghi mới)', 'POST', '/v1/sync/push', {
    token: t.accessToken, expect: 200,
    body: {
      deviceId: 'install-1',
      changes: [
        { table: 'AppSettings', id: 'main', op: 'upsert', baseRev: null, updatedAt: '2026-11-15T08:00:00Z', idempotencyKey: 'k-settings-1', payload: { propertyName: 'Nhà trọ Hoa Sen', meterDay: 28, dueDay: 5, dayCountMode: 'fixed30', roundingStep: 1000, elecPrice: 3500 } },
        { table: 'Block', id: 'blk-a', op: 'upsert', baseRev: null, idempotencyKey: 'k-blk-a', payload: { name: 'Dãy A', sortOrder: 0 } },
        { table: 'Floor', id: 'flr-a1', op: 'upsert', baseRev: null, idempotencyKey: 'k-flr-a1', payload: { blockId: 'blk-a', label: 'Tầng 1', sortOrder: 0 } },
        { table: 'Room', id: 'room-a101', op: 'upsert', baseRev: null, idempotencyKey: 'k-room-a101', payload: { floorId: 'flr-a1', name: 'A101', capacity: 2, rent: 2500000, area: 18 } },
        { table: 'Tenant', id: 'ten-1', op: 'upsert', baseRev: null, idempotencyKey: 'k-ten-1', payload: { name: 'Nguyễn Văn An', phone: '0900000101' } },
      ],
    },
    note: '`rent`, `area`, `elecPrice` không có trong schema: server **giữ nguyên** (trường riêng của app), không báo lỗi. Ghi `rev` của từng bản ghi vào `serverRev` ở máy.',
  });
  const roomRev = p1.body.accepted.find((a) => a.id === 'room-a101').rev;
  // another device edits the room -> conflict for the first device
  const t2 = (await request(app).post('/v1/auth/login').send({ email: 'chu@example.com', password: PW, deviceName: 'Máy quản lý' })).body.tokens;
  await request(app).post('/v1/sync/push').set('Authorization', `Bearer ${t2.accessToken}`).send({ changes: [{ table: 'Room', id: 'room-a101', op: 'upsert', baseRev: roomRev, payload: { floorId: 'flr-a1', name: 'A101', capacity: 3, rent: 2600000 } }] });
  await call('Đẩy thay đổi: có xung đột và bị từ chối', 'POST', '/v1/sync/push', {
    token: t.accessToken, expect: 200,
    body: {
      deviceId: 'install-1',
      changes: [
        { table: 'Room', id: 'room-a101', op: 'upsert', baseRev: roomRev, idempotencyKey: 'k-room-a101-2', payload: { floorId: 'flr-a1', name: 'A101', capacity: 2, rent: 2700000 } },
        { table: 'Contract', id: 'ct-1', op: 'upsert', baseRev: null, idempotencyKey: 'k-ct-1', payload: { roomId: 'room-a101', tenantId: 'ten-1', rent: 2500000, start: '2026-11-01' } },
        { table: 'Tenant', id: 'ten-2', op: 'upsert', baseRev: null, idempotencyKey: 'k-ten-2', payload: { name: 'Trần Thị Bích', phone: '0900000102', segment: 'vip' } },
        { table: 'Tenant', id: 'ten-1', op: 'delete', baseRev: p1.body.accepted.find((a) => a.id === 'ten-1').rev, idempotencyKey: 'k-ten-1-del' },
      ],
    },
    note: 'Room: máy khác đã sửa sau `baseRev` → `conflicts`, kèm bản trên server. Contract: dùng tên trường của app (`tenantId`, `rent`, `start`) nên thiếu các trường bắt buộc `leaderTenantId`, `startDate`, `monthlyRent` → `rejected`, liệt kê đủ trong `fields`. Tenant `segment: "vip"` sai enum → `rejected`. Xóa Tenant → `accepted`.',
  });
  await call('Kéo thay đổi', 'GET', '/v1/sync/pull?since=0&limit=500', { token: t.accessToken, expect: 200, note: 'Lặp với `since = nextRev` khi `hasMore = true`. `since=0` không trả bản ghi đã xóa; `since>0` có trả (`op: "delete"`).' });
  await call('Kéo thay đổi, chỉ một số bảng', 'GET', '/v1/sync/pull?since=0&tables=Room,Tenant', { token: t.accessToken, expect: 200 });
  await call('Tóm tắt đồng bộ', 'GET', '/v1/sync/summary', { token: t.accessToken, expect: 200 });

  // ---------- 8.5 CRUD ----------
  w('### 8.5 CRUD (ví dụ phòng, hợp đồng, bảng tính tiền)');
  w();
  await call('Danh sách phòng', 'GET', '/v1/rooms?limit=50&offset=0', { token: t.accessToken, expect: 200, note: 'Trường riêng của app (`rent`, `area`) không xuất hiện ở CRUD; CRUD chỉ trả các trường của schema (mục 7.4).' });
  const room = await call('Tạo phòng', 'POST', '/v1/rooms', { token: t.accessToken, expect: 201, body: { id: 'room-a102', floorId: 'flr-a1', name: 'A102', capacity: 2, areaSqm: 18.5 } });
  await call('Một phòng', 'GET', '/v1/rooms/room-a102', { token: t.accessToken, expect: 200 });
  await call('Sửa phòng (có `rev` để chống ghi đè)', 'PATCH', '/v1/rooms/room-a102', { token: t.accessToken, expect: 200, body: { status: 'maintenance', note: 'Sửa trần', rev: room.body.rev } });
  await request(app).post('/v1/tenants').set('Authorization', `Bearer ${t.accessToken}`).send({ id: 'ten-2', name: 'Trần Thị Bích', phone: '0900000102', segment: 'long_term' });
  await request(app).post('/v1/tenants').set('Authorization', `Bearer ${t.accessToken}`).send({ id: 'ten-3', name: 'Trần Thị Thu', phone: '0900000103' });
  await call('Tìm khách không dấu', 'GET', '/v1/tenants?q=tran thi', { token: t.accessToken, expect: 200 });
  const ct = await call('Tạo hợp đồng', 'POST', '/v1/contracts', { token: t.accessToken, expect: 201, body: { roomId: 'room-a102', leaderTenantId: 'ten-2', startDate: '2026-11-01', endDate: '2027-10-31', monthlyRent: 2500000, depositAmount: 2500000 } }).catch(async () => {
    // ten-2 was rejected above (bad enum): create it properly first
    await request(app).post('/v1/tenants').set('Authorization', `Bearer ${t.accessToken}`).send({ id: 'ten-2', name: 'Trần Thị Bích', phone: '0900000102' });
    return null;
  });
  let contractId = ct?.body?.id;
  if (!contractId) {
    out.splice(out.lastIndexOf('#### Tạo hợp đồng'));
    contractId = (await call('Tạo hợp đồng', 'POST', '/v1/contracts', { token: t.accessToken, expect: 201, body: { roomId: 'room-a102', leaderTenantId: 'ten-2', startDate: '2026-11-01', endDate: '2027-10-31', monthlyRent: 2500000, depositAmount: 2500000 } })).body.id;
  }
  const cyc = (await request(app).post('/v1/billing-cycles').set('Authorization', `Bearer ${t.accessToken}`).send({ cycle: '2026-11' })).body;
  const st = await call('Tạo bảng tính tiền', 'POST', '/v1/room-statements', { token: t.accessToken, expect: 201, body: { cycleId: cyc.id, roomId: 'room-a102', contractId, rentAmount: 2500000, electricAmount: 350000, waterAmount: 72000, feesAmount: 120000, totalAmount: 3042000 } });
  await request(app).post('/v1/collections').set('Authorization', `Bearer ${t.accessToken}`).send({ statementId: st.body.id, amount: 2000000, paidAt: '2026-11-05', methodNote: 'Tiền mặt' });
  await call('Bảng tính tiền sau một lần thu (`paidAmount`, `collectStatus` tính sẵn)', 'GET', `/v1/room-statements/${st.body.id}`, { token: t.accessToken, expect: 200 });
  await call('Cài đặt nhà trọ', 'GET', '/v1/settings', { token: t.accessToken, expect: 200 });
  await request(app).post('/v1/blocks').set('Authorization', `Bearer ${t.accessToken}`).send({ id: 'blk-b', name: 'Dãy B' });
  await call('Xóa', 'DELETE', '/v1/blocks/blk-b', { token: t.accessToken, expect: 204 });

  // ---------- 8.6 invites ----------
  w('### 8.6 Mời quản lý');
  w();
  const inv = await call('Tạo mã mời (chủ trọ)', 'POST', '/v1/invites', { token: t.accessToken, expect: 201, body: { role: 'manager' } });
  await call('Đăng ký bằng mã mời', 'POST', '/v1/auth/register', { expect: 201, body: { account: { email: 'quanly@example.com', password: PW, displayName: 'Quản lý Hùng' }, acceptTerms: true, inviteCode: inv.body.code, deviceName: 'Redmi 13' } });
  await call('Danh sách thành viên', 'GET', '/v1/members', { token: t.accessToken, expect: 200 });

  // ---------- 8.7 income / expenses ----------
  w('### 8.7 Thu chi (ghi chép)');
  w();
  w('Các bảng thu chi dùng CRUD chung (mục 7). `cash-entries`, `expenses`, `utility-bills`, `reserve-fund-entries`, `investments`, `targets`, `staff-pays` **chỉ chủ trọ** (quản lý nhận `403 forbidden`). `collections`, `deposit-entries` chỉ ghi thêm (không PATCH). Lọc theo tháng bằng `?from=yyyy-MM-01&to=yyyy-MM-31` trên ngày chính của bảng, hoặc `?cycle=yyyy-MM` với bảng có trường `cycle`.');
  w();
  const P = (pathName, body) => request(app).post(`/v1/${pathName}`).set('Authorization', `Bearer ${t.accessToken}`).send(body).then((r) => { if (r.status !== 201) throw new Error(`${pathName} ${r.status} ${JSON.stringify(r.body)}`); return r.body; });
  await call('Ghi một lần thu tiền phòng', 'POST', '/v1/collections', { token: t.accessToken, expect: 201, body: { statementId: st.body.id, amount: 1042000, paidAt: '2026-11-10', methodNote: 'Chuyển khoản' } });
  await call('Các lần thu của một bảng tính tiền', 'GET', `/v1/collections?statementId=${st.body.id}`, { token: t.accessToken, expect: 200 });
  await P('deposit-entries', { contractId, type: 'receive', amount: 2500000, date: '2026-11-01', reason: 'Nhận cọc khi ký hợp đồng' });
  await call('Sổ cọc của một hợp đồng', 'GET', `/v1/deposit-entries?contractId=${contractId}`, { token: t.accessToken, expect: 200 });
  await call('Ghi một khoản chi', 'POST', '/v1/expenses', { token: t.accessToken, expect: 201, body: { category: 'Điện tổng', amount: 3650000, date: '2026-11-03', isRecurring: true, note: 'Hóa đơn EVN tháng 10' } });
  await P('expenses', { category: 'Nước tổng', amount: 760000, date: '2026-11-03', isRecurring: true, note: 'Hóa đơn nước tháng 10' });
  await P('expenses', { category: 'Internet', amount: 600000, date: '2026-11-01', isRecurring: true, note: 'Cáp quang toàn nhà' });
  await P('expenses', { category: 'Sửa chữa', amount: 350000, date: '2026-11-08', note: 'Nạp gas máy lạnh A201' });
  await call('Chi phí trong tháng 11', 'GET', '/v1/expenses?from=2026-11-01&to=2026-11-30&sort=-date', { token: t.accessToken, expect: 200 });
  await P('cash-entries', { type: 'in', amount: 500000, reason: 'Cọc giữ chỗ A204', date: '2026-11-12' });
  await P('cash-entries', { type: 'out', amount: 180000, reason: 'Mua bóng đèn hành lang', date: '2026-11-07' });
  await call('Sổ thu chi tiền mặt', 'GET', '/v1/cash-entries?sort=-date', { token: t.accessToken, expect: 200 });
  await call('Chỉ các khoản chi tiền mặt', 'GET', '/v1/cash-entries?type=out', { token: t.accessToken, expect: 200 });
  await P('utility-bills', { cycle: '2026-10', kind: 'electric', totalAmount: 3650000, totalUnits: 820 });
  await P('utility-bills', { cycle: '2026-10', kind: 'water', totalAmount: 760000, totalUnits: 33 });
  await call('Điện nước tổng của kỳ', 'GET', '/v1/utility-bills?cycle=2026-10', { token: t.accessToken, expect: 200 });
  await P('reserve-fund-entries', { type: 'in', amount: 500000, date: '2026-10-31', reason: 'Trích quỹ tháng 10' });
  await P('reserve-fund-entries', { type: 'out', amount: 650000, date: '2026-11-10', reason: 'Thay khóa, sơn phòng A104' });
  await call('Quỹ dự phòng sửa chữa', 'GET', '/v1/reserve-fund-entries', { token: t.accessToken, expect: 200 });
  const staffRow = await P('staff', { name: 'Cô Sáu', role: 'cleaner' });
  await P('staff-pays', { staffId: staffRow.id, cycle: '2026-10', amount: 1500000, note: 'Lương tháng 10' });
  await call('Lương nhân viên theo kỳ', 'GET', '/v1/staff-pays?cycle=2026-10', { token: t.accessToken, expect: 200 });
  await P('investments', { amount: 48000000, date: '2025-01-01', note: 'Lắp 8 máy lạnh' });
  await call('Chi phí đầu tư', 'GET', '/v1/investments', { token: t.accessToken, expect: 200 });
  await P('targets', { month: '2026-11', targetRevenue: 20000000 });
  await call('Mục tiêu doanh thu', 'GET', '/v1/targets', { token: t.accessToken, expect: 200 });
  const mgr = (await request(app).post('/v1/auth/login').send({ email: 'quanly@example.com', password: PW })).body.tokens;
  await call('Quản lý xem chi phí → bị chặn', 'GET', '/v1/expenses', { token: mgr.accessToken, expect: 403 });

  // ---------- 8.8 errors ----------
  w('### 8.8 Lỗi thường gặp');
  w();
  await call('Thiếu token', 'GET', '/v1/me', { expect: 401 });
  const expired = jwt.sign({ sub: reg.body.account.id, sid: 'x', exp: Math.floor(Date.now() / 1000) - 10 }, config.jwt.secret, { algorithm: 'HS256', issuer: config.jwt.issuer, audience: config.jwt.audience });
  await call('Access token hết hạn → gọi `/auth/refresh` rồi gửi lại', 'GET', '/v1/me', { token: expired, expect: 401 });
  await call('Refresh token sai hoặc đã bị thu hồi → về màn hình đăng nhập', 'POST', '/v1/auth/refresh', { expect: 401, body: { refreshToken: 'abc.def' }, note: 'Gửi lại một refresh token cũ (đã đổi) thì `code` là `refresh_reused` và cả phiên bị thu hồi; xử lý giống nhau: về màn hình đăng nhập, giữ dữ liệu trên máy.' });
  await call('Sai mật khẩu', 'POST', '/v1/auth/login', { expect: 401, body: { email: 'chu@example.com', password: 'sai123456' } });
  await call('Dữ liệu không hợp lệ', 'POST', '/v1/auth/register', { expect: 400, headers: { 'Accept-Language': 'vi' }, body: { account: { email: 'sai-email', password: 'abc', displayName: '' }, property: { name: '' } } });
  await call('SĐT nhà trọ đã được nhà trọ khác dùng', 'POST', '/v1/auth/register', { expect: 409, body: { account: { email: 'khac@example.com', password: PW, displayName: 'Y' }, acceptTerms: true, seed: false, property: { name: 'Y', phone: '+84 901 234 567' } } });
  await call('Email đã đăng ký', 'POST', '/v1/auth/register', { expect: 409, body: { account: { email: 'chu@example.com', password: PW, displayName: 'X' }, acceptTerms: true, seed: false, property: { name: 'X' } } });
  await call('Sửa đè bản cũ (CRUD)', 'PATCH', '/v1/rooms/room-a102', { token: t.accessToken, expect: 409, body: { note: 'x', rev: 1 } });
  await call('Xóa khi còn dữ liệu liên kết', 'DELETE', '/v1/rooms/room-a102', { token: t.accessToken, expect: 409 });
  await call('Không tìm thấy', 'GET', '/v1/rooms/khong-co', { token: t.accessToken, expect: 404 });
  await call('App quá cũ', 'GET', '/v1/me', { token: t.accessToken, headers: { 'X-App-Version': '0.9.0' }, expect: 426 });
  w('<!-- EXAMPLES:END -->');

  await mongoose.disconnect();
  await rs.stop();

  const file = path.join(__dirname, '..', 'docs', 'API-cho-FE.md');
  let doc = fs.readFileSync(file, 'utf8');
  const a = doc.indexOf('<!-- EXAMPLES:START');
  const b = doc.indexOf('<!-- EXAMPLES:END -->');
  const block = out.join('\n');
  doc = a >= 0 && b >= 0 ? `${doc.slice(0, a)}${block}${doc.slice(b + '<!-- EXAMPLES:END -->'.length)}` : `${doc.trimEnd()}\n\n${block}\n`;
  fs.writeFileSync(file, doc);
  console.log(`docs/API-cho-FE.md section 8: ${out.filter((l) => l.startsWith('#### ')).length} examples`);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
