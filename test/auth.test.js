const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { start, stop, reset, api, app, register, login, PASSWORD, phoneFor } = require('./helpers');
const { Session } = require('../src/models');

before(start);
after(stop);
beforeEach(reset);

test('health, unknown route, error format, language, forced update', async () => {
  const h = (await api.get('health').expect(200)).body;
  assert.equal(h.status, 'ok');
  assert.ok(h.apiVersion && h.minAppVersion && h.serverTime);
  await request(app).get('/health').expect(200);

  const nf = (await api.get('nothing').expect(404)).body;
  assert.equal(nf.code, 'not_found');
  assert.match(nf.requestId, /^req_/);
  const en = (await request(app).get('/v1/me').set('Accept-Language', 'en-US').expect(401)).body;
  assert.equal(en.code, 'unauthorized');
  assert.equal(en.message, 'Please sign in to continue');

  const old = (await request(app).post('/v1/auth/login').set('X-App-Version', '0.9.0').send({}).expect(426)).body;
  assert.equal(old.code, 'upgrade_required');
  assert.equal(old.minAppVersion, '1.0.0');
  await request(app).get('/v1/health').set('X-App-Version', '0.1').expect(200);

  const badJson = await request(app).post('/v1/auth/login').set('Content-Type', 'application/json').send('{oops').expect(400);
  assert.equal(badJson.body.code, 'validation_failed');
});

test('register: validation, one transaction, seed records, tokens', async () => {
  const bad = (await api.post('auth/register', { account: { email: 'x', password: 'short', displayName: '' }, property: { name: '' } }).expect(400)).body;
  const codes = Object.fromEntries(bad.fields.map((f) => [f.field, f.code]));
  assert.equal(codes['account.email'], 'invalid_format');
  assert.equal(codes['account.password'], 'weak_password');
  assert.equal(codes['account.displayName'], 'required');
  assert.equal(codes.acceptTerms, 'terms_required');
  assert.equal(codes['property.name'], 'required');

  const res = await api.post('auth/register', {
    account: { email: 'Chu@Example.com', password: PASSWORD, displayName: 'Chủ trọ', preferredLanguage: 'vi' },
    acceptTerms: true,
    property: {
      name: 'Nhà trọ Hoa Sen',
      address: '12 Lê Lợi',
      phone: '0901 234 567',
      billing: { meterDay: 25, dueDay: 5, dayCountMode: 'actual' },
      rates: {
        electric: { mode: 'tiered', tiers: [{ fromKwh: 0, toKwh: 50, pricePerKwh: 3000 }, { fromKwh: 50, toKwh: null, pricePerKwh: 3500 }] },
        water: { mode: 'per_person', price: 100000 },
        services: [{ name: 'Internet', calcMode: 'per_room', price: 100000 }, { name: 'Rác', calcMode: 'per_person', price: 20000 }],
      },
      layout: { generate: { blocks: 2, floorsPerBlock: 2, roomsPerFloor: 3, defaultRent: 2500000 } },
    },
    deviceName: 'Pixel 8',
    deviceId: 'install-1',
  }).expect(201);
  const b = res.body;
  assert.equal(b.account.email, 'chu@example.com');
  assert.equal(b.role, 'owner');
  assert.equal(b.property.name, 'Nhà trọ Hoa Sen');
  assert.equal(b.tokens.tokenType, 'Bearer');
  assert.ok(b.tokens.accessToken && b.tokens.refreshToken && b.tokens.deviceId);
  assert.ok(b.tokens.expiresIn > 7000 && b.tokens.expiresIn <= 7200, 'access token ~2h');

  const by = (t) => b.changes.filter((c) => c.table === t);
  assert.equal(by('Room').length, 12);
  assert.equal(by('RoomPrice').length, 12);
  assert.equal(by('Block').length, 2);
  assert.equal(by('Floor').length, 4);
  assert.equal(by('ElectricityTier').length, 2);
  assert.equal(by('Service').length, 2);
  assert.equal(by('ServicePrice').length, 2);
  assert.equal(by('WaterRate')[0].payload.mode, 'per_person');
  const settings = by('AppSettings')[0];
  assert.equal(settings.id, 'main');
  assert.equal(settings.payload.meterDay, 25);
  assert.equal(settings.payload.dayCountMode, 'actual');
  const names = by('Room').map((c) => c.payload.name).sort();
  assert.deepEqual(names.slice(0, 3), ['A101', 'A102', 'A103']);
  assert.equal(by('Room')[0].payload.status, 'vacant');
  const steps = Object.fromEntries(by('OnboardingStep').map((c) => [c.payload.key, c.payload.isDone]));
  assert.deepEqual(steps, { property_info: true, billing_rules: true, rates: true, blocks_rooms: true, first_tenant: false });
  assert.equal(b.rev, b.changes.length);
  assert.equal(b.hasMore, false);

  // duplicate email (case-insensitive)
  const dup = (await api.post('auth/register', { account: { email: 'CHU@example.com', password: PASSWORD, displayName: 'X' }, acceptTerms: true, property: { name: 'B' } }).expect(409)).body;
  assert.equal(dup.code, 'email_taken');

  // bad tier chain is rejected and nothing is created
  const tiers = (await api.post('auth/register', {
    account: { email: 'b@example.com', password: PASSWORD, displayName: 'B' }, acceptTerms: true,
    property: { name: 'B', rates: { electric: { mode: 'tiered', tiers: [{ fromKwh: 0, toKwh: 50, pricePerKwh: 1 }, { fromKwh: 60, pricePerKwh: 2 }] } } },
  }).expect(400)).body;
  assert.equal(tiers.fields[0].field, 'property.rates.electric.tiers[1].fromKwh');
  await api.post('auth/login', { email: 'b@example.com', password: PASSWORD }).expect(401);
});

test('register with seed:false creates no records; the app pushes its own AppSettings without conflict', async () => {
  const base = { account: { email: 'noseed@example.com', password: PASSWORD, displayName: 'N' }, acceptTerms: true };
  const bad = (await api.post('auth/register', { ...base, seed: false, property: { name: 'P', layout: { generate: { blocks: 1, floorsPerBlock: 1, roomsPerFloor: 1 } } } }).expect(400)).body;
  assert.deepEqual(bad.fields, [{ field: 'property.layout', code: 'not_allowed' }]);
  assert.equal((await api.post('auth/register', { ...base, seed: 'no', property: { name: 'P' } }).expect(400)).body.fields[0].field, 'seed');

  const r = (await api.post('auth/register', { ...base, seed: false, property: { name: 'Trọ Không Seed' } }).expect(201)).body;
  assert.deepEqual(r.changes, []);
  assert.equal(r.rev, 0);
  assert.equal(r.property.name, 'Trọ Không Seed');
  const t = r.tokens.accessToken;
  const push = (await api.post('sync/push', { changes: [
    { table: 'AppSettings', id: 'main', op: 'upsert', baseRev: null, payload: { propertyName: 'Trọ Không Seed', dueDay: 5 } },
    { table: 'OnboardingStep', id: 'app-step-1', op: 'upsert', baseRev: null, payload: { key: 'rooms', isDone: false } },
  ] }, t).expect(200)).body;
  assert.equal(push.accepted.length, 2);
  assert.equal(push.conflicts.length, 0);

  // also accepted inside `property`, and for POST /me/property
  const r2 = (await api.post('auth/register', { ...base, account: { ...base.account, email: 'noseed2@example.com' }, property: { name: 'P2', seed: false } }).expect(201)).body;
  assert.deepEqual(r2.changes, []);
});

test('register is idempotent by idempotencyKey (retry after a lost response)', async () => {
  const body = { account: { email: 'idem@example.com', password: PASSWORD, displayName: 'I' }, acceptTerms: true, property: { name: 'P' }, idempotencyKey: 'reg-1' };
  const first = (await api.post('auth/register', body).expect(201)).body;
  const again = (await api.post('auth/register', body).expect(200)).body;
  assert.equal(again.account.id, first.account.id);
  assert.equal(again.property.id, first.property.id);
  // same key but wrong password is not a replay
  await api.post('auth/register', { ...body, account: { ...body.account, password: 'khac12345' } }).expect(409);
});

test('login, wrong password lockout, me', async () => {
  await register('a@example.com');
  const wrong = (await api.post('auth/login', { email: 'a@example.com', password: 'sai123456' }).expect(401)).body;
  assert.equal(wrong.code, 'invalid_credentials');
  const unknown = (await api.post('auth/login', { email: 'nobody@example.com', password: 'sai123456' }).expect(401)).body;
  assert.equal(unknown.code, 'invalid_credentials', 'same answer for unknown email');

  const s = await login('A@example.com');
  assert.equal(s.role, 'owner');
  const me = (await api.get('me', s.tokens.accessToken).expect(200)).body;
  assert.equal(me.account.displayName, 'Chủ trọ');
  assert.equal(me.property.name, 'Nhà trọ Hoa Sen');
  assert.equal(me.role, 'owner');
  assert.equal(me.account.passwordHash, undefined);

  for (let i = 0; i < 5; i += 1) await api.post('auth/login', { email: 'a@example.com', password: 'sai123456' });
  const locked = await api.post('auth/login', { email: 'a@example.com', password: PASSWORD }).expect(429);
  assert.equal(locked.body.code, 'too_many_attempts');
  assert.ok(Number(locked.headers['retry-after']) > 0);
});

test('login with email or the property phone (owner); phone follows the property phone; managers use email', async () => {
  const r = (await api.post('auth/register', {
    account: { email: 'lan@example.com', password: PASSWORD, displayName: 'Cô Lan' }, acceptTerms: true,
    property: { name: 'Trọ Lan', phone: '0901 234 567' }, deviceName: 'Pixel',
  }).expect(201)).body;
  assert.equal(r.account.phone, '0901234567');

  for (const login of ['0901234567', '+84 901 234 567', '84901234567', '090.123.4567', 'LAN@example.com']) {
    const b = (await api.post('auth/login', { login, password: PASSWORD }).expect(200)).body;
    assert.equal(b.account.email, 'lan@example.com', login);
  }
  await api.post('auth/login', { email: 'lan@example.com', password: PASSWORD }).expect(200); // older field still works
  await api.post('auth/login', { phone: '0901234567', password: PASSWORD }).expect(200); // `phone` field also accepted
  assert.equal((await api.post('auth/login', { login: '0901234567', password: 'sai123456' }).expect(401)).body.code, 'invalid_credentials');
  assert.equal((await api.post('auth/login', { login: '0999999999', password: PASSWORD }).expect(401)).body.code, 'invalid_credentials');
  assert.deepEqual((await api.post('auth/login', { login: '12ab', password: PASSWORD }).expect(400)).body.fields, [{ field: 'login', code: 'invalid_format' }]);
  assert.deepEqual((await api.post('auth/login', { password: PASSWORD }).expect(400)).body.fields[0], { field: 'login', code: 'required' });

  // the same phone cannot be used by a second property
  const dup = (await api.post('auth/register', { account: { email: 'other@example.com', password: PASSWORD, displayName: 'X' }, acceptTerms: true, property: { name: 'X', phone: '+84901234567' } }).expect(409)).body;
  assert.equal(dup.code, 'phone_taken');
  assert.deepEqual(dup.fields, [{ field: 'property.phone', code: 'phone_taken' }]);

  // changing the property phone changes the login phone
  // (fresh token: the logins above went past the 10-sessions cap, which revokes the oldest session)
  const t = (await api.post('auth/login', { login: 'lan@example.com', password: PASSWORD }).expect(200)).body.tokens.accessToken;
  assert.equal((await api.patch('me', { phone: '0912 345 678' }, t).expect(200)).body.account.phone, '0912345678');
  await api.post('auth/login', { login: '0901234567', password: PASSWORD }).expect(401);
  await api.post('auth/login', { login: '0912345678', password: PASSWORD }).expect(200);
  // ...also when the app pushes AppSettings, or through PATCH /settings
  const s = (await api.get('sync/pull?since=0&tables=AppSettings', t)).body.changes[0];
  await api.post('sync/push', { changes: [{ table: 'AppSettings', id: 'main', op: 'upsert', baseRev: s.rev, payload: { ...s.payload, phone: '0933 000 111' } }] }, t).expect(200);
  await api.post('auth/login', { login: '0933000111', password: PASSWORD }).expect(200);
  await api.patch('settings', { phone: '0944000222' }, t).expect(200);
  await api.post('auth/login', { login: '0944000222', password: PASSWORD }).expect(200);
  // another owner's phone is refused on PATCH /me
  await register('b@example.com');
  assert.equal((await api.patch('me', { phone: phoneFor('b@example.com') }, t).expect(409)).body.code, 'phone_taken');

  // a manager has no login phone: the property phone still signs in the owner
  const inv = (await api.post('invites', {}, t).expect(201)).body;
  const m = (await api.post('auth/register', { account: { email: 'ql@example.com', password: PASSWORD, displayName: 'QL' }, acceptTerms: true, inviteCode: inv.code }).expect(201)).body;
  assert.equal(m.account.phone, null);
  assert.equal((await api.post('auth/login', { login: '0944000222', password: PASSWORD }).expect(200)).body.role, 'owner');

  // forgot password stays email-only; the web deletion page accepts the phone
  assert.deepEqual((await api.post('auth/forgot', { email: '0944000222' }).expect(400)).body.fields, [{ field: 'email', code: 'invalid_format' }]);
  assert.ok((await api.post('auth/forgot', { email: 'lan@example.com' }).expect(202)).body.devToken);
  await request(app).post('/account/delete').type('form').send({ email: '0944000222', password: 'sai123456', confirm: 'yes' }).expect(401);
});

test('refresh rotates; reusing the old refresh token revokes the session', async () => {
  const r = await register();
  const t1 = r.tokens;
  const t2 = (await api.post('auth/refresh', { refreshToken: t1.refreshToken }).expect(200)).body.tokens;
  assert.notEqual(t2.refreshToken, t1.refreshToken);
  await api.get('me', t2.accessToken).expect(200);

  const reused = (await api.post('auth/refresh', { refreshToken: t1.refreshToken }).expect(401)).body;
  assert.equal(reused.code, 'refresh_reused');
  // whole session is gone: new pair and old access token both rejected
  assert.equal((await api.post('auth/refresh', { refreshToken: t2.refreshToken }).expect(401)).body.code, 'refresh_reused');
  assert.equal((await api.get('me', t2.accessToken).expect(401)).body.code, 'session_revoked');

  assert.equal((await api.post('auth/refresh', { refreshToken: 'garbage' }).expect(401)).body.code, 'refresh_invalid');
  assert.equal((await api.get('me', 'not.a.jwt').expect(401)).body.code, 'token_invalid');
});

test('refresh fails after the idle window or the absolute session limit', async () => {
  const r = await register();
  await Session.updateOne({ _id: r.tokens.deviceId }, { $set: { refreshExpiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await api.post('auth/refresh', { refreshToken: r.tokens.refreshToken }).expect(401)).body.code, 'session_expired');

  const s = await login('chu@example.com');
  await Session.updateOne({ _id: s.tokens.deviceId }, { $set: { absoluteExpiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await api.get('me', s.tokens.accessToken).expect(401)).body.code, 'session_expired');
});

test('logout with refresh token (even with an expired access token)', async () => {
  const r = await register();
  await api.post('auth/logout', { refreshToken: r.tokens.refreshToken }).set('Authorization', 'Bearer expired.token.here').expect(204);
  await api.get('me', r.tokens.accessToken).expect(401);
  await api.post('auth/refresh', { refreshToken: r.tokens.refreshToken }).expect(401);
});

test('change password signs out the other devices only', async () => {
  const a = await register();
  const b = await login('chu@example.com');
  const wrong = (await api.post('auth/change-password', { oldPassword: 'sai123456', newPassword: 'moi1234567' }, a.tokens.accessToken).expect(403)).body;
  assert.equal(wrong.code, 'wrong_password');
  const ok = (await api.post('auth/change-password', { oldPassword: PASSWORD, newPassword: 'moi1234567' }, a.tokens.accessToken).expect(200)).body;
  assert.equal(ok.revokedSessions, 1);
  await api.get('me', a.tokens.accessToken).expect(200);
  await api.get('me', b.tokens.accessToken).expect(401);
  await login('chu@example.com', 'moi1234567');
});

test('forgot / reset password (202 always, single-use code, signs out everywhere)', async () => {
  const a = await register();
  const none = (await api.post('auth/forgot', { email: 'ghost@example.com' }).expect(202)).body;
  assert.equal(none.status, 'accepted');
  assert.equal(none.devToken, undefined);

  const f = (await api.post('auth/forgot', { email: 'chu@example.com' }).expect(202)).body;
  assert.match(f.devToken, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal((await api.post('auth/reset', { token: 'AAAA-BBBB', newPassword: 'moi1234567' }).expect(400)).body.code, 'reset_invalid');
  await api.post('auth/reset', { token: f.devToken.toLowerCase(), newPassword: 'moi1234567' }).expect(204);
  await api.post('auth/reset', { token: f.devToken, newPassword: 'khac1234567' }).expect(400);
  await api.get('me', a.tokens.accessToken).expect(401);
  await login('chu@example.com', 'moi1234567');
});

test('"password changed" email after reset and after change, to the registered address', async () => {
  const { testOutbox } = require('../src/lib/mailer');
  testOutbox.length = 0;
  const a = await register('lan@example.com');
  const f = (await api.post('auth/forgot', { email: 'LAN@example.com' }).expect(202)).body;
  assert.equal(testOutbox.at(-1).kind, 'reset_code');
  assert.equal(testOutbox.at(-1).to, 'lan@example.com');
  assert.match(testOutbox.at(-1).subject, new RegExp(`^${f.devToken} là mã đặt lại mật khẩu RoomKeep`));

  // a failed reset sends nothing
  await api.post('auth/reset', { token: 'AAAA-BBBB', newPassword: 'moi1234567' }).expect(400);
  assert.equal(testOutbox.at(-1).kind, 'reset_code');

  await api.post('auth/reset', { token: f.devToken, newPassword: 'moi1234567' }).expect(204);
  const m1 = testOutbox.at(-1);
  assert.equal(m1.kind, 'password_changed');
  assert.equal(m1.to, 'lan@example.com');
  assert.equal(m1.subject, 'Mật khẩu RoomKeep của bạn đã được thay đổi');
  assert.match(m1.text, /Xin chào Chủ trọ,/);
  assert.match(m1.text, /Đặt lại bằng mã gửi qua email/);
  assert.match(m1.text, /Tất cả thiết bị đã được đăng xuất/);
  assert.match(m1.text, /giờ Việt Nam/);
  assert.match(m1.html, /Không phải bạn\?/);

  const s = await login('lan@example.com', 'moi1234567', 'Samsung A55');
  await request(app).post('/v1/auth/change-password').set('Authorization', `Bearer ${s.tokens.accessToken}`).set('Accept-Language', 'en')
    .send({ oldPassword: 'moi1234567', newPassword: 'khac1234567' }).expect(200);
  const m2 = testOutbox.at(-1);
  assert.equal(m2.subject, 'Your RoomKeep password was changed');
  assert.match(m2.text, /Changed in the app/);
  assert.match(m2.text, /Device: Samsung A55/);
  assert.match(m2.text, /Your other devices have been signed out/);

  // wrong old password: no email
  const before = testOutbox.length;
  await api.post('auth/change-password', { oldPassword: 'sai123456', newPassword: 'moi2234567' }, s.tokens.accessToken).expect(403);
  assert.equal(testOutbox.length, before);
  assert.ok(a.account.id);
});

test('reset password lifts the login lockout (forgot after too many wrong passwords)', async () => {
  await register();
  for (let i = 0; i < 5; i += 1) await api.post('auth/login', { email: 'chu@example.com', password: 'sai123456' });
  await api.post('auth/login', { email: 'chu@example.com', password: PASSWORD }).expect(429);
  const f = (await api.post('auth/forgot', { email: 'chu@example.com' }).expect(202)).body;
  await api.post('auth/reset', { token: f.devToken, newPassword: 'moi1234567' }).expect(204);
  await login('chu@example.com', 'moi1234567');
});

test('PATCH /me: profile, language, email needs password, property fields mirrored into AppSettings', async () => {
  const a = await register();
  const t = a.tokens.accessToken;
  const rev0 = a.rev;
  const p = (await api.patch('me', { displayName: 'Cô Lan', preferredLanguage: 'en', propertyName: 'Nhà trọ Sen Vàng', phone: '0909000111' }, t).expect(200)).body;
  assert.equal(p.account.displayName, 'Cô Lan');
  assert.equal(p.account.preferredLanguage, 'en');
  assert.equal(p.property.name, 'Nhà trọ Sen Vàng');

  const pulled = (await api.get(`sync/pull?since=${rev0}`, t).expect(200)).body;
  assert.equal(pulled.changes.length, 1);
  assert.equal(pulled.changes[0].table, 'AppSettings');
  assert.equal(pulled.changes[0].payload.propertyName, 'Nhà trọ Sen Vàng');
  assert.equal(pulled.changes[0].payload.address, '12 Lê Lợi', 'other settings kept');

  assert.equal((await api.patch('me', { email: 'new@example.com' }, t).expect(400)).body.code, 'validation_failed');
  assert.equal((await api.patch('me', { email: 'new@example.com', password: 'sai123456' }, t).expect(403)).body.code, 'wrong_password');
  await register('taken@example.com');
  assert.equal((await api.patch('me', { email: 'taken@example.com', password: PASSWORD }, t).expect(409)).body.code, 'email_taken');
  await api.patch('me', { email: 'new@example.com', password: PASSWORD }, t).expect(200);
  await login('new@example.com');
});

test('devices: list, current flag, remote sign-out', async () => {
  const a = await register();
  const b = await login('chu@example.com', PASSWORD, 'Máy quản lý');
  const list = (await api.get('devices', a.tokens.accessToken).expect(200)).body.devices;
  assert.equal(list.length, 2);
  assert.equal(list.find((d) => d.isCurrent).id, a.tokens.deviceId);
  assert.ok(list.some((d) => d.name === 'Máy quản lý'));
  await api.del(`devices/${b.tokens.deviceId}`, null, a.tokens.accessToken).expect(204);
  await api.get('me', b.tokens.accessToken).expect(401);
  await api.del('devices/unknown', null, a.tokens.accessToken).expect(404);

  // logging in again from the same install replaces its old session
  const c1 = (await api.post('auth/login', { email: 'chu@example.com', password: PASSWORD, deviceId: 'install-x' }).expect(200)).body;
  await api.post('auth/login', { email: 'chu@example.com', password: PASSWORD, deviceId: 'install-x' }).expect(200);
  await api.get('me', c1.tokens.accessToken).expect(401);
});

test('privacy policy page (vi default, en), with owner, contact and deletion link', async () => {
  const vi = await request(app).get('/privacy').expect(200);
  assert.match(vi.headers['content-type'], /html/);
  assert.match(vi.text, /Chính sách quyền riêng tư RoomKeep/);
  assert.match(vi.text, /Pham Dung/);
  assert.match(vi.text, /mailto:2631phamvandung@gmail.com/);
  assert.match(vi.text, /\/account\/delete/);
  const en = await request(app).get('/privacy?lang=en').expect(200);
  assert.match(en.text, /RoomKeep Privacy Policy/);
  assert.match((await request(app).get('/privacy').set('Accept-Language', 'en-US')).text, /RoomKeep Privacy Policy/);
});

test('delete account: password required, owner deletes property data; web deletion page', async () => {
  const a = await register();
  const t = a.tokens.accessToken;
  await api.post('sync/push', { changes: [{ table: 'Tenant', id: 't1', op: 'upsert', baseRev: null, payload: { name: 'Nguyễn Văn A', phone: '0900000000' } }] }, t).expect(200);
  assert.equal((await api.del('me', { password: 'sai123456' }, t).expect(403)).body.code, 'wrong_password');
  await api.del('me', { password: PASSWORD }, t).expect(204);
  await api.post('auth/login', { email: 'chu@example.com', password: PASSWORD }).expect(401);
  const { SyncRecord, Property } = require('../src/models');
  assert.equal(await SyncRecord.countDocuments({}), 0);
  assert.equal(await Property.countDocuments({}), 0);

  await register('web@example.com');
  const pageRes = await request(app).get('/account/delete').expect(200);
  assert.match(pageRes.text, /Xóa tài khoản RoomKeep/);
  await request(app).post('/account/delete').type('form').send({ email: 'web@example.com', password: 'sai123456', confirm: 'yes' }).expect(401);
  const done = await request(app).post('/account/delete?lang=en').type('form').send({ email: 'web@example.com', password: PASSWORD, confirm: 'yes' }).expect(200);
  assert.match(done.text, /have been deleted/);
  await api.post('auth/login', { email: 'web@example.com', password: PASSWORD }).expect(401);
});
