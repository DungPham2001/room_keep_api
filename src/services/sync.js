/**
 * Offline-first sync (features 145-152).
 *
 * Change sent by the app: { table, id, op: "upsert"|"delete", updatedAt, baseRev, payload, idempotencyKey }.
 * - Ordering is by server revision (`rev`), never by the phone clock. Every accepted change gets the next
 *   `properties.rev`; pull returns records with rev > since.
 * - A push runs in one transaction that first writes the property document, so concurrent pushes of the same
 *   property are serialized and a pull never sees rev N+1 committed before rev N.
 * - Conflict: the server has a newer revision than `baseRev` -> the change is not applied and the server copy is
 *   returned so the app can show the compare screen (feature 150). Append-only ledgers never conflict.
 * - Idempotency: an accepted change with an idempotencyKey is remembered 7 days; sending it again returns the same
 *   result without a new revision.
 * - Locked billing cycle: changes to records of a locked cycle are rejected (period_locked). Only the owner can
 *   change a locked BillingCycle (unlock).
 * - Manager: owner-only tables are rejected on push and never returned on pull.
 */
const config = require('../config');
const { Property, SyncRecord, Receipt } = require('../models');
const { withTx } = require('../lib/tx');
const { Checker, isObj } = require('../lib/validate');
const { AppError, conflict, notFound } = require('../lib/errors');
const { iso } = require('../lib/util');
const { SYNC_TABLES, APPEND_ONLY, OWNER_ONLY, CYCLE_BOUND, APP_SETTINGS_ID, visibleTables } = require('./tables');
const { validate, derive, searchText } = require('../resources/validate');
const { REFERENCED_BY } = require('../resources/schema');

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const RECEIPT_DAYS = 7;
const SERVER_FIELDS = ['serverRev'];

const keyOf = (table, id) => `${table}|${id}`;

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Wire format of one record (pull, conflict, register). */
function present(r) {
  return {
    table: r.table,
    id: r.recordId,
    rev: r.rev,
    op: r.isDeleted ? 'delete' : 'upsert',
    isDeleted: !!r.isDeleted,
    updatedAt: r.clientUpdatedAt ?? null,
    serverUpdatedAt: iso(r.serverUpdatedAt),
    payload: r.payload || {},
  };
}

/** Validates the envelope and each change shape. Bad changes are rejected individually, not the whole batch. */
function parsePush(body) {
  const c = new Checker();
  const deviceId = c.str(body, 'deviceId', { max: 100 }) || null;
  const changes = c.arr(body, 'changes', { required: true, max: config.sync.maxChanges });
  c.done();
  return { deviceId, changes };
}

function checkChange(ch, role) {
  if (!isObj(ch)) return { code: 'invalid_change', field: 'change' };
  const { table, id, op, baseRev, payload, idempotencyKey } = ch;
  if (typeof table !== 'string' || !SYNC_TABLES.has(table)) return { code: 'unknown_table', field: 'table' };
  if (typeof id !== 'string' || !ID.test(id)) return { code: 'invalid_change', field: 'id' };
  if (op !== 'upsert' && op !== 'delete') return { code: 'invalid_change', field: 'op' };
  if (baseRev !== undefined && baseRev !== null && !(Number.isInteger(baseRev) && baseRev >= 0)) return { code: 'invalid_change', field: 'baseRev' };
  if (idempotencyKey !== undefined && idempotencyKey !== null && (typeof idempotencyKey !== 'string' || idempotencyKey.length > 100)) return { code: 'invalid_change', field: 'idempotencyKey' };
  if (op === 'upsert' && !isObj(payload)) return { code: 'invalid_change', field: 'payload' };
  if (payload !== undefined && payload !== null && !isObj(payload)) return { code: 'invalid_change', field: 'payload' };
  if (isObj(payload) && payload.id !== undefined && payload.id !== id) return { code: 'invalid_change', field: 'payload.id' };
  if (isObj(payload) && Buffer.byteLength(JSON.stringify(payload)) > config.sync.maxRecordBytes) return { code: 'payload_too_large', field: 'payload' };
  if (table === 'AppSettings' && id !== APP_SETTINGS_ID) return { code: 'invalid_change', field: 'id' };
  if (role !== 'owner' && OWNER_ONLY.has(table)) return { code: 'forbidden_table', field: 'table' };
  return null;
}

/**
 * Batch-local view of records: starts from the DB (within the transaction) and reflects changes already applied
 * earlier in the same batch, so lock checks and conflicts see the batch's own writes.
 */
class View {
  constructor(propertyId, session) {
    this.propertyId = propertyId;
    this.session = session;
    this.map = new Map();
  }

  async preload(changes) {
    const byTable = new Map();
    for (const ch of changes) {
      if (!isObj(ch) || typeof ch.table !== 'string' || typeof ch.id !== 'string') continue;
      if (!byTable.has(ch.table)) byTable.set(ch.table, new Set());
      byTable.get(ch.table).add(ch.id);
    }
    if (!byTable.size) return;
    const or = [...byTable].map(([table, ids]) => ({ table, recordId: { $in: [...ids] } }));
    const docs = await SyncRecord.find({ propertyId: this.propertyId, $or: or }).session(this.session).lean();
    for (const d of docs) this.map.set(keyOf(d.table, d.recordId), d);
    for (const [table, ids] of byTable) for (const id of ids) if (!this.map.has(keyOf(table, id))) this.map.set(keyOf(table, id), null);
  }

  async get(table, id) {
    if (typeof id !== 'string') return null;
    const k = keyOf(table, id);
    if (this.map.has(k)) return this.map.get(k);
    const d = await SyncRecord.findOne({ propertyId: this.propertyId, table, recordId: id }).session(this.session).lean();
    this.map.set(k, d || null);
    return d || null;
  }

  set(doc) {
    this.map.set(keyOf(doc.table, doc.recordId), doc);
  }

  /**
   * Live records of `table` whose payload matches `match` (field -> value), seen through this batch.
   * Used for delete restrictions, cascades and uniqueness.
   */
  async findLive(table, match, { limit = 0 } = {}) {
    const filter = { propertyId: this.propertyId, table, isDeleted: false };
    for (const [k, v] of Object.entries(match)) filter[`payload.${k}`] = v;
    let q = SyncRecord.find(filter).session(this.session);
    if (limit) q = q.limit(limit + 50);
    const out = new Map((await q.lean()).map((d) => [d.recordId, d]));
    for (const [k, d] of this.map) {
      if (!k.startsWith(`${table}|`)) continue;
      const id = k.slice(table.length + 1);
      const hit = d && !d.isDeleted && Object.entries(match).every(([f, v]) => d.payload?.[f] === v);
      if (hit) out.set(id, d);
      else out.delete(id);
    }
    return [...out.values()];
  }

  /** Records to delete with (table, id): fields declared `ref(table, 'cascade')`. */
  async cascadeChildren(table, id) {
    const out = [];
    for (const r of REFERENCED_BY[table] || []) {
      if (r.onDelete !== 'cascade') continue;
      out.push(...await this.findLive(r.table, { [r.field]: id }));
    }
    return out;
  }

  /** Live BillingCycle records for a 'yyyy-MM' string. */
  async cyclesByMonth(month) {
    if (typeof month !== 'string') return [];
    const fromDb = await SyncRecord.find({ propertyId: this.propertyId, table: 'BillingCycle', 'payload.cycle': month }).session(this.session).lean();
    const out = new Map(fromDb.map((d) => [d.recordId, this.map.get(keyOf('BillingCycle', d.recordId)) || d]));
    for (const [k, d] of this.map) if (d && k.startsWith('BillingCycle|') && d.payload?.cycle === month) out.set(d.recordId, d);
    return [...out.values()].filter((d) => d && !d.isDeleted);
  }
}

const isLockedCycle = (d) => !!d && !d.isDeleted && d.payload?.status === 'locked';

/** Is this payload (of a cycle-bound table) attached to a locked billing cycle? */
async function touchesLockedCycle(view, table, payload) {
  if (!isObj(payload)) return false;
  switch (table) {
    case 'RoomStatement':
      return isLockedCycle(await view.get('BillingCycle', payload.cycleId));
    case 'StatementLine':
    case 'StatementAdjust': {
      const st = await view.get('RoomStatement', payload.statementId);
      return !!st && isLockedCycle(await view.get('BillingCycle', st.payload?.cycleId));
    }
    case 'SharedCost':
    case 'UsageLog':
      return (await view.cyclesByMonth(payload.cycle)).some(isLockedCycle);
    case 'SharedCostShare': {
      const sc = await view.get('SharedCost', payload.sharedCostId);
      return !!sc && (await view.cyclesByMonth(sc.payload?.cycle)).some(isLockedCycle);
    }
    default:
      return false;
  }
}

/**
 * The single write path of business data, used by POST /v1/sync/push and by every REST CRUD endpoint.
 * Runs in one transaction that first writes the property document (serializes writers per property).
 *
 * Change: { table, id, op: 'upsert'|'delete', updatedAt?, baseRev?, payload?, idempotencyKey? }
 * REST-only flags (never accepted from the sync body): mode ('create'|'patch'), mustExist, mustNotExist,
 * force (no baseRev check), check(view, payload, existing) -> rejection|null, cascade (delete children).
 */
async function applyChanges(auth, changes, { deviceId = null } = {}) {
  const { propertyId, role, accountId } = auth;

  return withTx(async (session) => {
    // Write first: takes the property's document lock for the whole transaction (serializes pushes).
    const property = await Property.findOneAndUpdate({ _id: propertyId }, { $set: { lockedAt: new Date() } }, { new: true, session }).lean();
    if (!property) throw notFound();

    const accepted = [];
    const conflicts = [];
    const rejected = [];
    let rev = property.rev;
    const ops = [];
    const receipts = [];
    const writtenHere = new Set();
    let mirrorSettings = null;

    const keys = changes.filter((ch) => isObj(ch) && typeof ch.idempotencyKey === 'string' && ch.idempotencyKey).map((ch) => `${propertyId}|${ch.idempotencyKey}`);
    const seen = new Map(keys.length
      ? (await Receipt.find({ _id: { $in: keys } }).session(session).lean()).map((r) => [r._id, r.result])
      : []);

    const view = new View(propertyId, session);
    await view.preload(changes);

    const queue = [...changes];
    for (let qi = 0; qi < queue.length; qi += 1) {
      const ch = queue[qi];
      const ref = { table: ch?.table ?? null, id: ch?.id ?? null, idempotencyKey: ch?.idempotencyKey ?? null };
      const bad = checkChange(ch, role);
      if (bad) {
        rejected.push({ ...ref, ...bad });
        continue;
      }
      const rk = ch.idempotencyKey ? `${propertyId}|${ch.idempotencyKey}` : null;
      if (rk && seen.has(rk)) {
        accepted.push({ ...ref, ...seen.get(rk), duplicate: true });
        continue;
      }

      const k = keyOf(ch.table, ch.id);
      const existing = await view.get(ch.table, ch.id);
      const live = existing && !existing.isDeleted ? existing : null;
      if (ch.mustExist && !live) {
        rejected.push({ ...ref, code: 'not_found', field: 'id' });
        continue;
      }
      if (ch.mustNotExist && live) {
        rejected.push({ ...ref, code: 'duplicate', field: 'id' });
        continue;
      }
      const baseRev = ch.baseRev ?? null;
      const isDeleted = ch.op === 'delete' || ch.payload?.isDeleted === true;

      let payload;
      if (ch.op === 'delete') {
        payload = { ...(ch.payload || existing?.payload || {}) };
      } else {
        const mode = ch.mode || 'sync';
        const v = validate(ch.table, ch.payload, mode);
        if (v.fields.length) {
          rejected.push({ ...ref, code: 'validation_failed', field: v.fields[0].field, fields: v.fields });
          continue;
        }
        payload = mode === 'patch' ? { ...(existing?.payload || {}), ...v.values } : v.values;
        if (mode !== 'sync') payload.updatedAt = new Date().toISOString();
        else if (ch.payload.updatedAt !== undefined) payload.updatedAt = ch.payload.updatedAt;
        if (payload.isDemo === undefined) payload.isDemo = existing?.payload?.isDemo ?? false;
        derive(ch.table, payload);
      }
      for (const f of SERVER_FIELDS) delete payload[f];
      payload.id = ch.id;
      payload.isDeleted = isDeleted;

      // Same content as the server already has: nothing to do (also resolves "both sides made the same edit").
      if (existing && existing.isDeleted === isDeleted && sameJson(existing.payload, payload)) {
        accepted.push({ ...ref, rev: existing.rev, unchanged: true });
        continue;
      }

      if (existing && !ch.force && !APPEND_ONLY.has(ch.table) && !writtenHere.has(k) && (baseRev === null || baseRev < existing.rev)) {
        conflicts.push({ ...ref, baseRev, server: present(existing) });
        continue;
      }

      if (ch.table === 'BillingCycle' && isLockedCycle(existing) && role !== 'owner') {
        rejected.push({ ...ref, code: 'period_locked', field: 'status' });
        continue;
      }
      if (CYCLE_BOUND.has(ch.table)) {
        const lockedBefore = existing ? await touchesLockedCycle(view, ch.table, existing.payload) : false;
        const lockedAfter = await touchesLockedCycle(view, ch.table, payload);
        if (lockedBefore || lockedAfter) {
          rejected.push({ ...ref, code: 'period_locked', field: 'cycle' });
          continue;
        }
      }

      if (typeof ch.check === 'function') {
        const err = await ch.check(view, payload, existing);
        if (err) {
          rejected.push({ ...ref, ...err });
          continue;
        }
      }

      rev += 1;
      const now = new Date();
      const doc = {
        propertyId,
        table: ch.table,
        recordId: ch.id,
        rev,
        isDeleted,
        payload,
        clientUpdatedAt: ch.updatedAt ?? payload.updatedAt ?? null,
        updatedBy: accountId,
        deviceId,
        serverUpdatedAt: now,
        search: searchText(ch.table, payload),
      };
      view.set({ ...doc, createdAt: existing?.createdAt || now });
      writtenHere.add(k);
      ops.push({ updateOne: { filter: { propertyId, table: ch.table, recordId: ch.id }, update: { $set: doc, $setOnInsert: { createdAt: now } }, upsert: true } });
      const item = { rev };
      accepted.push({ ...ref, ...item });
      if (rk) {
        receipts.push({ _id: rk, result: item, expireAt: new Date(Date.now() + RECEIPT_DAYS * 86400000) });
        seen.set(rk, item);
      }
      if (ch.table === 'AppSettings' && !isDeleted) mirrorSettings = payload;
      if (ch.cascade && isDeleted && existing && !existing.isDeleted) {
        for (const child of await view.cascadeChildren(ch.table, ch.id)) {
          queue.push({ table: child.table, id: child.recordId, op: 'delete', force: true, cascade: true });
        }
      }
    }

    if (ops.length) await SyncRecord.bulkWrite(ops, { session, ordered: true });
    if (receipts.length) await Receipt.insertMany(receipts, { session });

    const set = { rev, updatedAt: new Date() };
    // Property name/address/phone edited in the app's settings are mirrored on the property (shown in /v1/me).
    if (mirrorSettings) {
      if (typeof mirrorSettings.propertyName === 'string' && mirrorSettings.propertyName.trim()) set.name = mirrorSettings.propertyName.trim().slice(0, 100);
      if (typeof mirrorSettings.address === 'string') set.address = mirrorSettings.address.slice(0, 200);
      if (typeof mirrorSettings.phone === 'string') set.phone = mirrorSettings.phone.slice(0, 20);
    }
    await Property.updateOne({ _id: propertyId }, { $set: set }, { session });

    return { accepted, conflicts, rejected, newRev: rev, view };
  });
}

const SYNC_KEYS = ['table', 'id', 'op', 'updatedAt', 'baseRev', 'payload', 'idempotencyKey'];

/**
 * POST /v1/sync/push
 * Returns { accepted: [{table,id,rev,idempotencyKey}], conflicts: [{table,id,idempotencyKey,baseRev,server}],
 *           rejected: [{table,id,idempotencyKey,code,field,fields?}], newRev }
 */
async function push(auth, body) {
  const { deviceId, changes } = parsePush(body);
  // Only the documented keys: REST-only flags can never come from the app's JSON.
  const clean = changes.map((ch) => (isObj(ch) ? Object.fromEntries(SYNC_KEYS.filter((k) => k in ch).map((k) => [k, ch[k]])) : ch));
  const { accepted, conflicts, rejected, newRev } = await applyChanges(auth, clean, { deviceId });
  return { accepted, conflicts, rejected, newRev };
}

/**
 * GET /v1/sync/pull?since=<rev>&limit=&tables=A,B
 * Returns { changes, nextRev, hasMore, serverRev }. The first download (since=0) skips tombstones.
 */
async function pull(auth, query) {
  const c = new Checker();
  const since = query.since === undefined || query.since === '' ? 0 : Number(query.since);
  if (!Number.isInteger(since) || since < 0) c.fail('since', 'invalid_type');
  const limit = query.limit === undefined || query.limit === '' ? config.sync.pullDefault : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > config.sync.pullMax) c.fail('limit', 'out_of_range');
  let tables = visibleTables(auth.role);
  if (query.tables) {
    const wanted = String(query.tables).split(',').map((s) => s.trim()).filter(Boolean);
    const unknown = wanted.filter((t) => !SYNC_TABLES.has(t));
    if (unknown.length) c.fail('tables', 'unknown_table');
    tables = tables.filter((t) => wanted.includes(t));
  }
  c.done();

  // Read the counter first: every record with rev <= serverRev is committed (same transaction as the counter).
  const property = await Property.findById(auth.propertyId).select('rev purgedRev').lean();
  if (!property) throw notFound();
  if (since > 0 && since < (property.purgedRev || 0)) {
    throw conflict('resync_required', { purgedRev: property.purgedRev, serverRev: property.rev });
  }
  if (since > property.rev) {
    // The app has a cursor from another property or a restored server: start again.
    throw conflict('resync_required', { purgedRev: property.purgedRev || 0, serverRev: property.rev });
  }

  const filter = { propertyId: auth.propertyId, rev: { $gt: since, $lte: property.rev }, table: { $in: tables } };
  if (since === 0) filter.isDeleted = false;
  const docs = await SyncRecord.find(filter).sort({ rev: 1 }).limit(limit + 1).lean();
  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;
  return {
    changes: page.map(present),
    nextRev: hasMore ? page[page.length - 1].rev : property.rev,
    hasMore,
    serverRev: property.rev,
  };
}

/** GET /v1/sync/summary: counters for the connection/status screen (146, 151). */
async function summary(auth) {
  const property = await Property.findById(auth.propertyId).select('rev purgedRev updatedAt').lean();
  if (!property) throw notFound();
  const rows = await SyncRecord.aggregate([
    { $match: { propertyId: auth.propertyId, isDeleted: false, table: { $in: visibleTables(auth.role) } } },
    { $group: { _id: '$table', count: { $sum: 1 } } },
  ]);
  return {
    serverRev: property.rev,
    purgedRev: property.purgedRev || 0,
    lastChangeAt: iso(property.updatedAt),
    tables: Object.fromEntries(rows.sort((a, b) => a._id.localeCompare(b._id)).map((r) => [r._id, r.count])),
  };
}

/**
 * Writes records produced by the server (sign-up seed, profile edits) as normal revisions.
 * Must be called inside a transaction (session may be null on a standalone mongod).
 */
async function writeServerRecords(propertyId, records, accountId, session) {
  if (!records.length) return [];
  const p = await Property.findOneAndUpdate({ _id: propertyId }, { $inc: { rev: records.length }, $set: { updatedAt: new Date() } }, { new: true, session }).lean();
  if (!p) throw new AppError(404, 'not_found');
  let rev = p.rev - records.length;
  const docs = records.map((r) => {
    rev += 1;
    return {
      propertyId, table: r.table, recordId: r.id, rev, isDeleted: false, payload: { ...r.payload, id: r.id, isDeleted: false },
      clientUpdatedAt: r.payload.updatedAt || null, updatedBy: accountId, deviceId: null, serverUpdatedAt: new Date(),
      search: searchText(r.table, r.payload),
    };
  });
  await SyncRecord.bulkWrite(docs.map((d) => ({
    updateOne: { filter: { propertyId, table: d.table, recordId: d.recordId }, update: { $set: d, $setOnInsert: { createdAt: new Date() } }, upsert: true },
  })), { session, ordered: true });
  return docs;
}

/** Updates fields of the AppSettings record from the server side (PATCH /v1/me property fields). */
async function patchAppSettings(propertyId, fields, accountId, session) {
  const cur = await SyncRecord.findOne({ propertyId, table: 'AppSettings', recordId: APP_SETTINGS_ID }).session(session).lean();
  const payload = { ...(cur?.payload || { id: APP_SETTINGS_ID, isDemo: false }), ...fields, updatedAt: new Date().toISOString() };
  return writeServerRecords(propertyId, [{ table: 'AppSettings', id: APP_SETTINGS_ID, payload }], accountId, session);
}

module.exports = { push, pull, summary, writeServerRecords, patchAppSettings, present, applyChanges, View };
