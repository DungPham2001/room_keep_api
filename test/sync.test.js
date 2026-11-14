const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, reset, api, register, login, PASSWORD } = require('./helpers');
const { SyncRecord, Property } = require('../src/models');
const jobs = require('../src/services/jobs');

before(start);
after(stop);
beforeEach(reset);

const tenant = (id, name, extra = {}) => ({ table: 'Tenant', id, op: 'upsert', baseRev: null, updatedAt: '2026-11-13T08:00:00Z', payload: { id, name, phone: '0900000000', ...extra } });

async function owner() {
  const r = await register();
  return { t: r.tokens.accessToken, rev: r.rev, body: r };
}

async function managerOf(ownerToken) {
  const inv = (await api.post('invites', { role: 'manager' }, ownerToken).expect(201)).body;
  const m = (await api.post('auth/register', {
    account: { email: 'ql@example.com', password: PASSWORD, displayName: 'Quản lý' }, acceptTerms: true, inviteCode: inv.code, deviceName: 'Máy QL',
  }).expect(201)).body;
  return { t: m.tokens.accessToken, body: m };
}

test('push requires auth; validates envelope; per-change rejects', async () => {
  const { t } = await owner();
  await api.post('sync/push', { changes: [] }).expect(401);
  assert.equal((await api.post('sync/push', {}, t).expect(400)).body.fields[0].field, 'changes');
  const res = (await api.post('sync/push', {
    deviceId: 'dev-1',
    changes: [
      tenant('t1', 'An'),
      { table: 'SyncOutbox', id: 'x', op: 'upsert', payload: {} },
      { table: 'Tenant', id: 'bad id!', op: 'upsert', payload: {} },
      { table: 'Tenant', id: 't2', op: 'merge', payload: {} },
      { table: 'Tenant', id: 't3', op: 'upsert', payload: { id: 'other' } },
      { table: 'AppSettings', id: 'not-main', op: 'upsert', payload: {} },
      { table: 'Tenant', id: 't4', op: 'upsert', payload: { blob: 'x'.repeat(70 * 1024) } },
    ],
  }, t).expect(200)).body;
  assert.equal(res.accepted.length, 1);
  assert.deepEqual(res.rejected.map((r) => r.code), ['unknown_table', 'invalid_change', 'invalid_change', 'invalid_change', 'invalid_change', 'payload_too_large']);
  assert.equal(res.conflicts.length, 0);
});

test('push then pull: revisions, cursor paging, tombstones, first download skips tombstones', async () => {
  const { t, rev } = await owner();
  const p1 = (await api.post('sync/push', { changes: [tenant('t1', 'An'), tenant('t2', 'Bình'), tenant('t3', 'Chi')] }, t).expect(200)).body;
  assert.deepEqual(p1.accepted.map((a) => a.rev), [rev + 1, rev + 2, rev + 3]);
  assert.equal(p1.newRev, rev + 3);

  const del = (await api.post('sync/push', { changes: [{ table: 'Tenant', id: 't2', op: 'delete', baseRev: rev + 2 }] }, t).expect(200)).body;
  assert.equal(del.accepted[0].rev, rev + 4);

  const page1 = (await api.get(`sync/pull?since=${rev}&limit=2`, t).expect(200)).body;
  assert.equal(page1.changes.length, 2);
  assert.equal(page1.hasMore, true);
  assert.equal(page1.nextRev, rev + 3);
  const page2 = (await api.get(`sync/pull?since=${page1.nextRev}&limit=2`, t).expect(200)).body;
  assert.equal(page2.hasMore, false);
  assert.equal(page2.nextRev, rev + 4);
  assert.deepEqual(page2.changes.map((c) => [c.id, c.op]), [['t2', 'delete']]);
  assert.equal(page2.changes[0].payload.name, 'Bình', 'tombstone keeps last payload');

  const full = (await api.get('sync/pull?since=0&limit=1000', t).expect(200)).body;
  assert.ok(!full.changes.some((c) => c.id === 't2'), 'first download has no tombstones');
  assert.equal(full.nextRev, rev + 4);

  const only = (await api.get('sync/pull?since=0&tables=Tenant', t).expect(200)).body;
  assert.deepEqual(only.changes.map((c) => c.id).sort(), ['t1', 't3']);
  assert.equal((await api.get('sync/pull?tables=Nope', t).expect(400)).body.code, 'validation_failed');
  assert.equal((await api.get('sync/pull?since=99999', t).expect(409)).body.code, 'resync_required');

  const s = (await api.get('sync/summary', t).expect(200)).body;
  assert.equal(s.tables.Tenant, 2);
  assert.equal(s.serverRev, rev + 4);
});

test('conflicts: stale baseRev returns the server copy; resend with the new baseRev wins', async () => {
  const { t } = await owner();
  const a = (await api.post('sync/push', { changes: [tenant('t1', 'An')] }, t).expect(200)).body.accepted[0];
  const second = await login('chu@example.com');
  const t2 = second.tokens.accessToken;

  // device 2 edits first
  await api.post('sync/push', { changes: [{ ...tenant('t1', 'An (máy 2)'), baseRev: a.rev }] }, t2).expect(200);
  // device 1 edits from the old base -> conflict
  const c = (await api.post('sync/push', { changes: [{ ...tenant('t1', 'An (máy 1)'), baseRev: a.rev, idempotencyKey: 'k1' }] }, t).expect(200)).body;
  assert.equal(c.accepted.length, 0);
  assert.equal(c.conflicts.length, 1);
  assert.equal(c.conflicts[0].server.payload.name, 'An (máy 2)');
  assert.equal(c.conflicts[0].idempotencyKey, 'k1');
  // a record created offline (baseRev null) that already exists is a conflict too
  assert.equal((await api.post('sync/push', { changes: [tenant('t1', 'Khác')] }, t).expect(200)).body.conflicts.length, 1);

  // user keeps the local version: resend on top of the server revision
  const keep = (await api.post('sync/push', { changes: [{ ...tenant('t1', 'An (máy 1)'), baseRev: c.conflicts[0].server.rev, idempotencyKey: 'k1' }] }, t).expect(200)).body;
  assert.equal(keep.accepted.length, 1);

  // same content as the server is never a conflict
  const same = (await api.post('sync/push', { changes: [{ ...tenant('t1', 'An (máy 1)'), baseRev: 1 }] }, t2).expect(200)).body;
  assert.equal(same.accepted[0].unchanged, true);

  // two changes to one record in one batch (offline queue): the second builds on the first
  const batch = (await api.post('sync/push', { changes: [tenant('t9', 'V1'), { ...tenant('t9', 'V2') }] }, t).expect(200)).body;
  assert.equal(batch.accepted.length, 2);
  assert.equal((await SyncRecord.findOne({ recordId: 't9' }).lean()).payload.name, 'V2');
});

test('append-only ledgers never conflict; idempotent resend creates no new revision', async () => {
  const { t } = await owner();
  const col = { table: 'Collection', id: 'c1', op: 'upsert', baseRev: null, idempotencyKey: 'col-1', payload: { statementId: 's1', amount: 1500000, paidAt: '2026-11-05', methodNote: 'tiền mặt' } };
  const first = (await api.post('sync/push', { changes: [col] }, t).expect(200)).body.accepted[0];
  const again = (await api.post('sync/push', { changes: [col] }, t).expect(200)).body;
  assert.equal(again.accepted[0].rev, first.rev);
  assert.equal(again.accepted[0].duplicate, true);

  const other = (await api.post('sync/push', { changes: [{ ...col, idempotencyKey: 'col-2', payload: { ...col.payload, amount: 1600000 } }] }, t).expect(200)).body;
  assert.equal(other.conflicts.length, 0, 'append-only: merged, no conflict');
  assert.equal(other.accepted.length, 1);
});

test('locked billing cycle rejects statement changes; collections still allowed; only owner unlocks', async () => {
  const { t } = await owner();
  const m = await managerOf(t);
  const cyc = { table: 'BillingCycle', id: 'cy11', op: 'upsert', baseRev: null, payload: { cycle: '2026-11', status: 'open' } };
  const st = { table: 'RoomStatement', id: 'st1', op: 'upsert', baseRev: null, payload: { cycleId: 'cy11', roomId: 'r1', totalAmount: 3000000 } };
  const r = (await api.post('sync/push', { changes: [cyc, st] }, t).expect(200)).body;
  assert.equal(r.accepted.length, 2);

  // lock and, in the same batch, try to edit a statement line: the lock applies immediately
  const lock = (await api.post('sync/push', { changes: [
    { ...cyc, baseRev: r.accepted[0].rev, payload: { cycle: '2026-11', status: 'locked' } },
    { table: 'StatementLine', id: 'l1', op: 'upsert', payload: { statementId: 'st1', kind: 'other', amount: 100 } },
  ] }, t).expect(200)).body;
  assert.equal(lock.accepted.length, 1);
  assert.equal(lock.rejected[0].code, 'period_locked');

  const edit = (await api.post('sync/push', { changes: [{ ...st, baseRev: r.accepted[1].rev, payload: { ...st.payload, totalAmount: 1 } }] }, t).expect(200)).body;
  assert.equal(edit.rejected[0].code, 'period_locked');
  const shared = (await api.post('sync/push', { changes: [{ table: 'SharedCost', id: 'sc1', op: 'upsert', payload: { cycle: '2026-11', name: 'Điện hành lang', amount: 200000, splitMode: 'equal' } }] }, t).expect(200)).body;
  assert.equal(shared.rejected[0].code, 'period_locked');
  // moving a statement into a locked cycle is rejected too
  const move = (await api.post('sync/push', { changes: [{ table: 'RoomStatement', id: 'st2', op: 'upsert', payload: { cycleId: 'cy11', roomId: 'r2', totalAmount: 0 } }] }, t).expect(200)).body;
  assert.equal(move.rejected[0].code, 'period_locked');

  const pay = (await api.post('sync/push', { changes: [{ table: 'Collection', id: 'c1', op: 'upsert', payload: { statementId: 'st1', amount: 3000000, paidAt: '2026-11-20' } }] }, t).expect(200)).body;
  assert.equal(pay.accepted.length, 1, 'recording a payment after locking is fine');

  const lockedRev = lock.accepted[0].rev;
  const mgrUnlock = (await api.post('sync/push', { changes: [{ ...cyc, baseRev: lockedRev, payload: { cycle: '2026-11', status: 'open' } }] }, m.t).expect(200)).body;
  assert.equal(mgrUnlock.rejected[0].code, 'period_locked');
  const ownUnlock = (await api.post('sync/push', { changes: [{ ...cyc, baseRev: lockedRev, payload: { cycle: '2026-11', status: 'open' } }] }, t).expect(200)).body;
  assert.equal(ownUnlock.accepted.length, 1);
});

test('manager: joins by invite, never sees or writes owner-only tables, limited endpoints', async () => {
  const { t } = await owner();
  await api.post('sync/push', { changes: [
    tenant('t1', 'An'),
    { table: 'StaffPay', id: 'pay1', op: 'upsert', payload: { staffId: 's1', cycle: '2026-11', amount: 5000000 } },
    { table: 'Expense', id: 'e1', op: 'upsert', payload: { category: 'Điện tổng', amount: 9000000 } },
  ] }, t).expect(200);

  const m = await managerOf(t);
  assert.equal(m.body.role, 'manager');
  assert.equal(m.body.property.name, 'Nhà trọ Hoa Sen');
  const seen = m.body.changes.map((c) => c.table);
  assert.ok(seen.includes('Tenant'));
  assert.ok(!seen.includes('StaffPay') && !seen.includes('Expense'), 'owner-only data is not sent to a manager');

  const w = (await api.post('sync/push', { changes: [{ table: 'Investment', id: 'i1', op: 'upsert', payload: { amount: 1 } }, tenant('t2', 'Bình')] }, m.t).expect(200)).body;
  assert.equal(w.rejected[0].code, 'forbidden_table');
  assert.equal(w.accepted.length, 1);

  assert.equal((await api.post('invites', {}, m.t).expect(403)).body.code, 'forbidden');
  await api.get('members', m.t).expect(403);
  await api.patch('me', { propertyName: 'Đổi tên' }, m.t).expect(403);

  const members = (await api.get('members', t).expect(200)).body.members;
  assert.deepEqual(members.map((x) => x.role).sort(), ['manager', 'owner']);
});

test('invites: single use, expiry, revoke, accept by a logged-in account, removal', async () => {
  const { t } = await owner();
  const inv = (await api.post('invites', { role: 'manager' }, t).expect(201)).body;
  assert.match(inv.code, /^[A-Z2-9]{8}$/);
  assert.equal(inv.status, 'active');

  // someone who already signed up with their own (still empty) property can join
  const other = await register('ql2@example.com');
  const joined = (await api.post('invites/accept', { code: inv.code.toLowerCase() }, other.tokens.accessToken).expect(200)).body;
  assert.equal(joined.role, 'manager');
  assert.equal(joined.property.id, (await api.get('me', t)).body.property.id);
  assert.ok(joined.tokens.accessToken);
  assert.equal(await Property.countDocuments({ _id: other.property.id }), 0, 'empty own property was dropped');

  // used code cannot be reused
  const third = await register('ql3@example.com');
  await api.post('sync/push', { changes: [tenant('x1', 'Dữ liệu thật')] }, third.tokens.accessToken).expect(200);
  assert.equal((await api.post('invites/accept', { code: inv.code }, third.tokens.accessToken).expect(400)).body.fields[0].code, 'invite_invalid');
  // an owner with real data cannot leave it by joining another property
  const inv2 = (await api.post('invites', {}, t).expect(201)).body;
  assert.equal((await api.post('invites/accept', { code: inv2.code }, third.tokens.accessToken).expect(409)).body.code, 'already_in_property');

  // revoke
  await api.del(`invites/${inv2.id}`, null, t).expect(204);
  const list = (await api.get('invites', t).expect(200)).body.invites;
  assert.deepEqual(list.map((i) => i.status).sort(), ['revoked', 'used']);

  // owner removes the manager: access is cut immediately
  const mgrToken = joined.tokens.accessToken;
  await api.get('sync/pull', mgrToken).expect(200);
  await api.del(`members/${joined.account.id}`, null, t).expect(204);
  assert.equal((await api.get('sync/pull', mgrToken).expect(403)).body.code, 'no_property');
  const me = (await api.get('me', mgrToken).expect(200)).body;
  assert.equal(me.property, null);
  assert.equal(me.role, null);

  // the removed manager can start their own property
  const own = (await api.post('me/property', { property: { name: 'Trọ mới', layout: { blocks: [{ name: 'A' }], floors: [{ blockIndex: 0, label: 'Tầng 1' }], rooms: [{ floorIndex: 0, name: 'P1', monthlyRent: 2000000 }] } } }, mgrToken).expect(201)).body;
  assert.equal(own.role, 'owner');
  assert.equal(own.changes.filter((c) => c.table === 'Room').length, 1);
  assert.equal((await api.del('members/me', null, own.tokens.accessToken).expect(409)).body.code, 'owner_cannot_leave');
});

test('tombstone purge forces a resync for stale cursors', async () => {
  const { t, rev } = await owner();
  await api.post('sync/push', { changes: [tenant('t1', 'An'), { table: 'Tenant', id: 't1', op: 'delete' }] }, t).expect(200);
  await SyncRecord.updateMany({ isDeleted: true }, { $set: { serverUpdatedAt: new Date(Date.now() - 200 * 86400000) } });
  const out = await jobs.daily();
  assert.equal(out.tombstones.removed, 1);
  assert.equal((await api.get(`sync/pull?since=${rev}`, t).expect(409)).body.code, 'resync_required');
  await api.get(`sync/pull?since=${rev + 2}`, t).expect(200);
  await api.get('sync/pull?since=0', t).expect(200);
  await api.get('jobs/daily').expect(200);
});

test('AppSettings pushed from the app updates the property name shown in /me', async () => {
  const { t, body } = await owner();
  const s = body.changes.find((c) => c.table === 'AppSettings');
  await api.post('sync/push', { changes: [{ table: 'AppSettings', id: 'main', op: 'upsert', baseRev: s.rev, payload: { ...s.payload, propertyName: 'Trọ Bình An' } }] }, t).expect(200);
  assert.equal((await api.get('me', t).expect(200)).body.property.name, 'Trọ Bình An');
});
