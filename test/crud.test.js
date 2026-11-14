const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, reset, api, register, PASSWORD } = require('./helpers');
const { RESOURCES } = require('../src/resources/schema');

before(start);
after(stop);
beforeEach(reset);

const ok = async (req, status) => {
  const res = await req;
  if (res.status !== status) throw new Error(`${res.req.method} ${res.req.path} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
};

/** Owner with one block/floor and returns ids. */
async function setup() {
  const r = await register();
  const t = r.tokens.accessToken;
  const block = await ok(api.post('blocks', { name: 'Dãy A' }, t), 201);
  const floor = await ok(api.post('floors', { blockId: block.id, label: 'Tầng 1' }, t), 201);
  return { t, rev: r.rev, block, floor };
}

test('every resource has list + 404 for an unknown id; unknown routes stay 404', async () => {
  const { t } = await setup();
  for (const r of Object.values(RESOURCES)) {
    const res = await api.get(r.path, t);
    assert.equal(res.status, 200, `${r.path} -> ${res.status} ${JSON.stringify(res.body)}`);
    if (r.singleton) {
      assert.equal(res.body.id, r.singleton);
      continue;
    }
    assert.ok(Array.isArray(res.body.data), r.path);
    assert.equal(typeof res.body.page.total, 'number');
    assert.equal((await api.get(`${r.path}/nope`, t)).status, 404, r.path);
  }
  await api.get('rooms').expect(401);
  assert.equal((await api.get('no-such-thing').expect(404)).body.code, 'not_found');
});

test('rooms: create with defaults, validation, refs, get, patch, list filters, search without accents, paging', async () => {
  const { t, floor } = await setup();
  const bad = await ok(api.post('rooms', { name: '', floorId: 'missing', status: 'broken', areaSqm: -1, capacity: 1.5 }, t), 400);
  const codes = Object.fromEntries(bad.fields.map((f) => [f.field, f.code]));
  // field errors come first; references are checked only once the fields themselves are valid
  assert.deepEqual(codes, { name: 'required', status: 'invalid_enum', areaSqm: 'out_of_range', capacity: 'invalid_type' });
  const ref = await ok(api.post('rooms', { name: 'A101', floorId: 'missing' }, t), 400);
  assert.deepEqual(ref.fields, [{ field: 'floorId', code: 'not_found' }]);

  const room = await ok(api.post('rooms', { name: 'Phòng Đẹp', floorId: floor.id, areaSqm: 18.5, capacity: 2, id: 'room-1', rev: 99, createdAt: 'x' }, t), 201);
  assert.equal(room.id, 'room-1');
  assert.equal(room.status, 'vacant', 'default applied');
  assert.equal(room.typeId, null);
  assert.equal(room.isDemo, false);
  assert.ok(room.rev > 0 && room.rev !== 99);
  assert.match(room.createdAt, /Z$/);
  assert.equal((await ok(api.post('rooms', { name: 'X', floorId: floor.id, id: 'room-1' }, t), 409)).code, 'duplicate');

  for (const n of ['A102', 'A103', 'B201']) await ok(api.post('rooms', { name: n, floorId: floor.id, status: n === 'B201' ? 'occupied' : 'vacant' }, t), 201);

  const got = await ok(api.get('rooms/room-1', t), 200);
  assert.equal(got.name, 'Phòng Đẹp');
  const patched = await ok(api.patch('rooms/room-1', { status: 'maintenance', note: 'Sửa trần' }, t), 200);
  assert.equal(patched.status, 'maintenance');
  assert.equal(patched.name, 'Phòng Đẹp', 'other fields kept');
  assert.ok(patched.rev > got.rev);
  assert.equal((await ok(api.patch('rooms/room-1', { status: 'x' }, t), 400)).fields[0].code, 'invalid_enum');
  assert.equal((await ok(api.patch('rooms/room-1', { name: null }, t), 400)).fields[0].code, 'required');

  // optimistic concurrency with rev
  const stale = await ok(api.patch('rooms/room-1', { note: 'cũ', rev: got.rev }, t), 409);
  assert.equal(stale.code, 'version_conflict');
  assert.equal(stale.current.status, 'maintenance');
  await ok(api.patch('rooms/room-1', { note: 'mới', rev: patched.rev }, t), 200);

  const all = await ok(api.get('rooms', t), 200);
  assert.deepEqual(all.data.map((x) => x.name), ['A102', 'A103', 'B201', 'Phòng Đẹp'], 'sorted by name');
  assert.equal(all.page.total, 4);
  assert.equal((await ok(api.get('rooms?status=vacant', t), 200)).page.total, 2);
  assert.equal((await ok(api.get('rooms?status=vacant,occupied', t), 200)).page.total, 3);
  assert.equal((await ok(api.get('rooms?status=nope', t), 400)).fields[0].code, 'invalid_enum');
  assert.deepEqual((await ok(api.get('rooms?q=phong dep', t), 200)).data.map((x) => x.id), ['room-1'], 'search ignores accents');
  const page2 = await ok(api.get('rooms?limit=2&offset=2&sort=-name', t), 200);
  assert.deepEqual(page2.data.map((x) => x.name), ['A103', 'A102']);
  assert.equal((await ok(api.get('rooms?sort=hack', t), 400)).fields[0].field, 'sort');
});

test('REST writes reach the app through sync pull (and nameNoAccent is computed)', async () => {
  const { t, rev, floor } = await setup();
  const room = await ok(api.post('rooms', { name: 'Phòng Ánh', floorId: floor.id }, t), 201);
  const pulled = await ok(api.get(`sync/pull?since=${rev}`, t), 200);
  const rec = pulled.changes.find((c) => c.id === room.id);
  assert.equal(rec.table, 'Room');
  assert.equal(rec.payload.nameNoAccent, 'phong anh');
  assert.equal(rec.payload.status, 'vacant');
  await ok(api.del(`rooms/${room.id}`, null, t), 204);
  const after = await ok(api.get(`sync/pull?since=${rec.rev}`, t), 200);
  assert.deepEqual(after.changes.map((c) => [c.id, c.op]), [[room.id, 'delete']]);
});

test('delete rules: restrict while dependents exist, cascade owned children', async () => {
  const { t, block, floor } = await setup();
  assert.deepEqual((await ok(api.del(`blocks/${block.id}`, null, t), 409)).blockedBy, [{ resource: 'floors', field: 'blockId', count: 1 }]);

  const room = await ok(api.post('rooms', { name: 'A101', floorId: floor.id }, t), 201);
  const price = await ok(api.post('room-prices', { roomId: room.id, monthlyRent: 2500000, effectiveFrom: '2026-11-01' }, t), 201);
  const item = await ok(api.post('room-items', { roomId: room.id, name: 'Giường' }, t), 201);
  assert.equal(item.qty, 1);
  const tenant = await ok(api.post('tenants', { name: 'Nguyễn Văn A', phone: '0900000000' }, t), 201);
  const contract = await ok(api.post('contracts', { roomId: room.id, leaderTenantId: tenant.id, startDate: '2026-11-01', monthlyRent: 2500000 }, t), 201);
  assert.equal(contract.status, 'active');
  const occ = await ok(api.post('occupants', { contractId: contract.id, tenantId: tenant.id, isLeader: true }, t), 201);

  const blocked = await ok(api.del(`rooms/${room.id}`, null, t), 409);
  assert.equal(blocked.code, 'has_dependents');
  assert.deepEqual(blocked.blockedBy.map((b) => b.resource), ['contracts']);
  assert.equal((await ok(api.del(`tenants/${tenant.id}`, null, t), 409)).blockedBy.length, 2, 'leader of a contract and occupant');

  // deleting the contract takes its occupants with it
  await ok(api.del(`contracts/${contract.id}`, null, t), 204);
  await ok(api.get(`occupants/${occ.id}`, t), 404);
  // now the room can go, with its prices and items
  await ok(api.del(`rooms/${room.id}`, null, t), 204);
  await ok(api.get(`room-prices/${price.id}`, t), 404);
  await ok(api.get(`room-items/${item.id}`, t), 404);
  await ok(api.del(`rooms/${room.id}`, null, t), 404);
  // after the room is gone the floor and block can be deleted in order
  await ok(api.del(`floors/${floor.id}`, null, t), 204);
  await ok(api.del(`blocks/${block.id}`, null, t), 204);
});

test('contracts: no overlap in one room, end after start', async () => {
  const { t, floor } = await setup();
  const room = await ok(api.post('rooms', { name: 'A101', floorId: floor.id }, t), 201);
  const a = await ok(api.post('tenants', { name: 'A' }, t), 201);
  const c1 = await ok(api.post('contracts', { roomId: room.id, leaderTenantId: a.id, startDate: '2026-01-01', endDate: '2026-12-31', monthlyRent: 1 }, t), 201);
  const overlap = await ok(api.post('contracts', { roomId: room.id, leaderTenantId: a.id, startDate: '2026-06-01', monthlyRent: 1 }, t), 409);
  assert.equal(overlap.code, 'contract_overlap');
  assert.equal(overlap.conflictWith, c1.id);
  await ok(api.post('contracts', { roomId: room.id, leaderTenantId: a.id, startDate: '2026-12-31', monthlyRent: 1 }, t), 201);
  assert.equal((await ok(api.post('contracts', { roomId: room.id, leaderTenantId: a.id, startDate: '2027-05-01', endDate: '2027-01-01', monthlyRent: 1, status: 'ended' }, t), 400)).fields[0].field, 'endDate');
  await ok(api.patch(`contracts/${c1.id}`, { status: 'ended' }, t), 200);
});

test('billing: unique cycle, statement collectStatus from collections, append-only, locked cycle', async () => {
  const { t, floor } = await setup();
  const room = await ok(api.post('rooms', { name: 'A101', floorId: floor.id }, t), 201);
  const tenant = await ok(api.post('tenants', { name: 'B' }, t), 201);
  const contract = await ok(api.post('contracts', { roomId: room.id, leaderTenantId: tenant.id, startDate: '2026-11-01', monthlyRent: 3000000 }, t), 201);
  const cycle = await ok(api.post('billing-cycles', { cycle: '2026-11' }, t), 201);
  assert.equal(cycle.status, 'open');
  assert.equal((await ok(api.post('billing-cycles', { cycle: '2026-11' }, t), 409)).code, 'duplicate');
  assert.equal((await ok(api.post('billing-cycles', { cycle: '2026-13' }, t), 400)).fields[0].code, 'invalid_format');

  const st = await ok(api.post('room-statements', { cycleId: cycle.id, roomId: room.id, contractId: contract.id, rentAmount: 3000000, totalAmount: 3500000, collectStatus: 'paid' }, t), 201);
  assert.equal(st.collectStatus, 'unpaid', 'computed, never taken from the body');
  assert.equal(st.paidAmount, 0);
  assert.equal((await ok(api.post('room-statements', { cycleId: cycle.id, roomId: room.id, contractId: contract.id, totalAmount: 1 }, t), 409)).code, 'duplicate');

  const c1 = await ok(api.post('collections', { statementId: st.id, amount: 1500000, paidAt: '2026-11-05', methodNote: 'tiền mặt' }, t), 201);
  assert.equal((await ok(api.get(`room-statements/${st.id}`, t), 200)).collectStatus, 'partial');
  await ok(api.post('collections', { statementId: st.id, amount: 2000000, paidAt: '2026-11-10' }, t), 201);
  const full = await ok(api.get(`room-statements?cycleId=${cycle.id}`, t), 200);
  assert.equal(full.data[0].collectStatus, 'paid');
  assert.equal(full.data[0].paidAmount, 3500000);
  assert.equal((await ok(api.patch(`collections/${c1.id}`, { amount: 1 }, t), 409)).code, 'append_only');
  assert.equal((await ok(api.get('collections?from=2026-11-06&to=2026-11-30', t), 200)).page.total, 1);
  assert.equal((await ok(api.del(`room-statements/${st.id}`, null, t), 409)).blockedBy[0].resource, 'collections');

  await ok(api.patch(`billing-cycles/${cycle.id}`, { status: 'locked' }, t), 200);
  assert.equal((await ok(api.patch(`room-statements/${st.id}`, { totalAmount: 1 }, t), 409)).code, 'period_locked');
  assert.equal((await ok(api.post('statement-lines', { statementId: st.id, kind: 'adjust', amount: -50000 }, t), 409)).code, 'period_locked');
  await ok(api.post('collections', { statementId: st.id, amount: 1000, paidAt: '2026-12-01' }, t), 201);
});

test('manager: owner-only resources are 403, shared ones work; settings singleton', async () => {
  const { t } = await setup();
  const inv = await ok(api.post('invites', {}, t), 201);
  const m = await ok(api.post('auth/register', { account: { email: 'ql@example.com', password: PASSWORD, displayName: 'QL' }, acceptTerms: true, inviteCode: inv.code }), 201);
  const mt = m.tokens.accessToken;
  for (const p of ['expenses', 'staff-pays', 'investments', 'cash-entries', 'utility-bills', 'reserve-fund-entries', 'targets']) {
    assert.equal((await api.get(p, mt)).status, 403, p);
  }
  assert.equal((await api.post('expenses', { category: 'Điện', amount: 1, date: '2026-11-01' }, mt)).status, 403);
  await ok(api.post('expenses', { category: 'Điện tổng', amount: 9000000, date: '2026-11-01' }, t), 201);
  await ok(api.post('tenants', { name: 'Khách do quản lý nhập' }, mt), 201);

  const s = await ok(api.get('settings', t), 200);
  assert.equal(s.propertyName, 'Nhà trọ Hoa Sen');
  const s2 = await ok(api.patch('settings', { dueDay: 10, propertyName: 'Trọ Mới', theme: 'dark' }, t), 200);
  assert.equal(s2.dueDay, 10);
  assert.equal(s2.address, '12 Lê Lợi');
  assert.equal((await ok(api.get('me', t), 200)).property.name, 'Trọ Mới', 'mirrored to the property');
  assert.equal((await api.patch('settings', { dueDay: 1 }, mt)).status, 403);
  assert.equal((await ok(api.get('settings', mt), 200)).dueDay, 10);
});

test('sync push applies the same schema (bad enum is rejected, unknown app columns are kept)', async () => {
  const { t, floor } = await setup();
  const res = await ok(api.post('sync/push', { changes: [
    { table: 'Room', id: 'r1', op: 'upsert', payload: { name: 'A1', floorId: floor.id, status: 'flying' } },
    { table: 'Room', id: 'r2', op: 'upsert', payload: { name: 'A2', floorId: floor.id, status: 'vacant', futureColumn: 42 } },
    { table: 'Tenant', id: 'x', op: 'upsert', payload: { phone: '0900' } },
  ] }, t), 200);
  assert.equal(res.rejected[0].code, 'validation_failed');
  assert.deepEqual(res.rejected[0].fields, [{ field: 'status', code: 'invalid_enum' }]);
  assert.deepEqual(res.rejected[1].fields.map((f) => f.field).sort(), ['name', 'phone']);
  assert.equal(res.accepted.length, 1);
  const pulled = await ok(api.get('sync/pull?since=0&tables=Room', t), 200);
  assert.equal(pulled.changes.find((c) => c.id === 'r2').payload.futureColumn, 42);
  // the REST view shows only documented fields
  const room = await ok(api.get('rooms/r2', t), 200);
  assert.equal(room.futureColumn, undefined);
});
