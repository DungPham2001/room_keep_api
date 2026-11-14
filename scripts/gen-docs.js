/**
 * Generates section 7 "CRUD từng phần" of docs/API-cho-FE.md from src/resources/schema.js, so the field
 * reference never drifts from the code. Only the text between the CRUD:START / CRUD:END markers is replaced.
 *   npm run docs
 */
const fs = require('fs');
const path = require('path');
const { RESOURCES, REFERENCED_BY } = require('../src/resources/schema');
const { OWNER_ONLY } = require('../src/services/tables');

const typeOf = (f) => {
  switch (f.type) {
    case 'string': return `chuỗi ≤${f.max}${f.pattern ? ' (SĐT)' : ''}`;
    case 'int': return f.money ? (f.min < 0 ? 'tiền ± (đồng)' : 'tiền (đồng)') : `số nguyên${f.min > -1e15 && f.max < 1e15 ? ` ${f.min}-${f.max}` : f.min === 0 ? ' ≥0' : ''}`;
    case 'number': return `số ${f.min}-${f.max}`;
    case 'bool': return 'true/false';
    case 'date': return 'ngày `yyyy-MM-dd`';
    case 'month': return 'tháng `yyyy-MM`';
    case 'datetime': return 'ISO 8601 hoặc epoch ms';
    case 'enum': return f.values.map((v) => `\`${v}\``).join(' \\| ');
    case 'ref': return `id → \`${RESOURCES[f.table].path}\`${f.onDelete === 'cascade' ? ' (xóa theo)' : f.onDelete === 'restrict' ? ' (chặn xóa)' : ''}`;
    case 'json': return 'JSON tự do';
    default: return f.type;
  }
};

const lines = [];
const out = (s = '') => lines.push(s);

out('<!-- CRUD:START: phần này sinh tự động từ src/resources/schema.js bằng `npm run docs`, đừng sửa tay -->');
out('## 7. 🔒 CRUD từng phần');
out();
out('Mỗi phần (69 bảng của Room) có REST CRUD riêng. Cài đặt nhà trọ là `GET/PATCH /v1/settings`.');
out();
out('* Dữ liệu CRUD và dữ liệu đồng bộ là **một**: ghi qua CRUD tăng `rev`, app nhận khi pull; ghi qua push thì CRUD đọc thấy ngay.');
out('* App Android vẫn nên dùng `sync/push` + `sync/pull` cho thao tác hằng ngày (offline-first). CRUD dùng khi cần thao tác trực tiếp với server (web quản trị, màn hình chỉ chạy khi có mạng, công cụ nhập liệu, kiểm thử).');
out('* `sync/push` kiểm tra **cùng schema** ở mục 7.4: thiếu trường bắt buộc, sai kiểu, sai enum → bản ghi vào `rejected` với `code: "validation_failed"` và `fields`. Trường app có mà schema chưa có được giữ nguyên.');
out();
out('### 7.1 Quy ước chung');
out();
out('Mọi endpoint cần `Authorization: Bearer <accessToken>` và tài khoản đã thuộc một nhà trọ. Dữ liệu chỉ là của nhà trọ trong token.');
out();
out('| Method | Đường dẫn | Mô tả |');
out('|---|---|---|');
out('| GET | `/v1/{path}` | Danh sách: `{ data: [...], page: { limit, offset, total } }` |');
out('| GET | `/v1/{path}/{id}` | Một bản ghi |');
out('| POST | `/v1/{path}` | Tạo → `201` + bản ghi. Có thể gửi `id` (UUID của app); trùng id → `409 duplicate` |');
out('| PATCH | `/v1/{path}/{id}` | Sửa các trường gửi lên → `200` + bản ghi. Gửi kèm `rev` để chống ghi đè: `rev` cũ → `409 version_conflict` kèm `current` |');
out('| DELETE | `/v1/{path}/{id}` | Xóa mềm → `204` (`?rev=` tùy chọn). Còn dữ liệu phụ thuộc → `409 has_dependents` kèm `blockedBy` |');
out();
out('**Bản ghi trả về:** `id`, mọi trường của bảng (chưa có giá trị = `null`), trường tính sẵn, `isDemo`, `rev`, `createdAt`, `updatedAt`. Không gửi được `rev`/`createdAt`/`updatedAt`/`nameNoAccent`/trường tính sẵn (bị bỏ qua).');
out();
out('**Danh sách:**');
out('- Lọc theo trường: `?status=vacant`, nhiều giá trị enum `?status=vacant,reserved`, liên kết `?roomId=<id>`, true/false `?isDone=false`, `?endDate=null`.');
out('- `?q=` tìm không dấu, không phân biệt hoa thường, trên các trường "Tìm" của bảng.');
out('- `?from=yyyy-MM-dd&to=yyyy-MM-dd` trên trường "Ngày chính" của bảng.');
out('- `?sort=name` hoặc `?sort=-createdAt` (trường của bảng, `createdAt`, `updatedAt`). Mặc định: trường "Sắp xếp" tăng dần, không có thì mới nhất trước.');
out('- `?limit=` 1-200 (mặc định 50), `?offset=`. `?isDemo=true|false`.');
out();
out('**Lỗi riêng của CRUD:** `400 validation_failed` (`fields[].code`: `required`, `invalid_type`, `too_long`, `out_of_range`, `invalid_format`, `invalid_enum`, `not_found` = liên kết không tồn tại), `403 forbidden` (quản lý vào bảng chỉ chủ trọ), `404 not_found`, `409 duplicate` (kèm `existingId`), `409 version_conflict`, `409 has_dependents`, `409 contract_overlap`, `409 append_only`, `409 period_locked`.');
out();
out('### 7.2 Luật nghiệp vụ');
out();
out('**Liên kết khi xóa:** *chặn xóa* = không xóa được bản ghi cha khi còn bản ghi này; *xóa theo* = xóa bản ghi cha thì bản ghi này bị xóa cùng.');
out();
out('**Đồng bộ:** mọi thay đổi qua CRUD đều tăng `rev` và app Android nhận được ở lần `GET /v1/sync/pull` kế tiếp. `/v1/sync/push` kiểm tra cùng schema (trường lạ của app được giữ nguyên).');
out();
out('- Hợp đồng `draft`/`active` của cùng một phòng không được chồng ngày (`startA < endB && startB < endA`, không có `endDate` = vô thời hạn) → `409 contract_overlap`; `endDate` ≥ `startDate`.');
out('- Kỳ thu `status = locked`: không sửa được bảng tính tiền, dòng bảng kê, điều chỉnh, chi phí chung và lượt dùng dịch vụ của kỳ → `409 period_locked`. Ghi lần thu (`collections`) vẫn được. Chỉ chủ trọ mở khóa.');
out('- `collections`, `deposit-entries` chỉ ghi thêm: không PATCH (`409 append_only`); nhập nhầm thì xóa rồi ghi lại.');
out('- `room-statements.paidAmount`, `collectStatus` (`unpaid`/`partial`/`paid`) tính từ các lần thu, không lưu.');
out();
out('### 7.3 Danh sách các phần');
out();
out('| Phần | Đường dẫn | Chỉ chủ trọ |');
out('|---|---|---|');
for (const r of Object.values(RESOURCES)) out(`| ${r.label} | [\`/v1/${r.path}\`](#${r.path}) | ${OWNER_ONLY.has(r.table) ? 'có' : ''} |`);
out();

out('### 7.4 Trường của từng phần');
out();
for (const r of Object.values(RESOURCES)) {
  out(`#### ${r.path}`);
  out();
  const meta = [`**${r.label}**`, `bảng Room \`${r.table}\``];
  if (OWNER_ONLY.has(r.table)) meta.push('chỉ chủ trọ');
  if (r.singleton) meta.push(`một bản ghi duy nhất (id \`${r.singleton}\`): chỉ \`GET\` và \`PATCH /v1/${r.path}\` (PATCH: chủ trọ)`);
  if (r.appendOnly === true) meta.push('chỉ ghi thêm (không PATCH)');
  out(meta.join(' · '));
  out();
  const opts = [];
  if (r.search.length) opts.push(`Tìm (\`q\`): ${r.search.map((s) => `\`${s}\``).join(', ')}`);
  if (r.date) opts.push(`Ngày chính (\`from\`/\`to\`): \`${r.date}\``);
  if (r.sort) opts.push(`Sắp xếp mặc định: \`${r.sort}\``);
  if (r.unique.length) opts.push(`Không trùng: ${r.unique.map((u) => `(${u.map((x) => `\`${x}\``).join(', ')})`).join(', ')}`);
  if (r.computed.length) opts.push(`Tính sẵn: ${r.computed.map((x) => `\`${x}\``).join(', ')}`);
  const refBy = (REFERENCED_BY[r.table] || []).filter((x) => x.onDelete !== 'none');
  if (refBy.length) opts.push(`Khi xóa: ${refBy.map((x) => `${x.onDelete === 'restrict' ? 'chặn nếu còn' : 'xóa theo'} \`${RESOURCES[x.table].path}\``).join(', ')}`);
  for (const o of opts) out(`- ${o}`);
  if (opts.length) out();
  out('| Trường | Kiểu | Bắt buộc | Mặc định |');
  out('|---|---|---|---|');
  for (const [k, f] of Object.entries(r.fields)) {
    out(`| \`${k}\` | ${typeOf(f)} | ${f.required ? 'có' : ''} | ${f.default !== undefined ? `\`${JSON.stringify(f.default)}\`` : ''} |`);
  }
  out();
}

out('<!-- CRUD:END -->');

const file = path.join(__dirname, '..', 'docs', 'API-cho-FE.md');
const doc = fs.readFileSync(file, 'utf8');
const a = doc.indexOf('<!-- CRUD:START');
const b = doc.indexOf('<!-- CRUD:END -->');
if (a < 0 || b < 0) throw new Error('CRUD:START / CRUD:END markers not found in docs/API-cho-FE.md');
fs.writeFileSync(file, `${doc.slice(0, a)}${lines.join('\n')}${doc.slice(b + '<!-- CRUD:END -->'.length)}`);
console.log(`docs/API-cho-FE.md section 7: ${Object.keys(RESOURCES).length} resources`);
