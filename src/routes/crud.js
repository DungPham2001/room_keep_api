/**
 * REST CRUD for every business table (see src/resources/schema.js):
 *   GET    /v1/<path>            list: ?q= (accent-insensitive), field filters, ?from=&to= (main date), ?sort=, ?limit=&offset=
 *   GET    /v1/<path>/<id>
 *   POST   /v1/<path>            create (optional client `id`)
 *   PATCH  /v1/<path>/<id>       partial update (optional `rev` -> 409 version_conflict when stale)
 *   DELETE /v1/<path>/<id>       soft delete (optional ?rev=); restrict / cascade rules of the schema
 * AppSettings is a singleton: GET/PATCH /v1/settings.
 *
 * Writes go through the same path as /v1/sync/push (revisions, locked cycles, owner-only tables), so the Android
 * app receives them on its next pull.
 */
const express = require('express');
const { RESOURCES, REFERENCED_BY } = require('../resources/schema');
const { RESERVED } = require('../resources/validate');
const { SyncRecord } = require('../models');
const { OWNER_ONLY } = require('../services/tables');
const sync = require('../services/sync');
const { AppError, asyncHandler, forbidden, notFound, invalid } = require('../lib/errors');
const { uuid, noAccent, iso } = require('../lib/util');
const { isObj } = require('../lib/validate');
const { authenticate, requireProperty } = require('../middleware/auth');

// Auth per route (not router-wide), so unknown paths still answer 404.
const pre = [authenticate, requireProperty];

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const FILTER_TYPES = new Set(['ref', 'enum', 'bool', 'month', 'date', 'string']);

// ---------- presenters ----------

function presentRecord(r, doc, extra = {}) {
  const p = doc.payload || {};
  const out = { id: doc.recordId };
  for (const k of Object.keys(r.fields)) out[k] = p[k] === undefined ? null : p[k];
  Object.assign(out, extra);
  out.isDemo = !!p.isDemo;
  out.rev = doc.rev;
  out.createdAt = iso(doc.createdAt || doc.serverUpdatedAt);
  out.updatedAt = iso(doc.serverUpdatedAt);
  return out;
}

/** Computed fields (never stored, never accepted): RoomStatement paidAmount + collectStatus from Collections. */
async function computed(r, docs, propertyId) {
  const extra = new Map(docs.map((d) => [d.recordId, {}]));
  if (r.table === 'RoomStatement' && docs.length) {
    const rows = await SyncRecord.aggregate([
      { $match: { propertyId, table: 'Collection', isDeleted: false, 'payload.statementId': { $in: docs.map((d) => d.recordId) } } },
      { $group: { _id: '$payload.statementId', paid: { $sum: '$payload.amount' } } },
    ]);
    const paid = new Map(rows.map((x) => [x._id, x.paid]));
    for (const d of docs) {
      const p = paid.get(d.recordId) || 0;
      const total = d.payload?.totalAmount || 0;
      extra.get(d.recordId).paidAmount = p;
      extra.get(d.recordId).collectStatus = p <= 0 ? 'unpaid' : p < total ? 'partial' : 'paid';
    }
  }
  return extra;
}

async function presentMany(r, docs, propertyId) {
  const extra = await computed(r, docs, propertyId);
  return docs.map((d) => presentRecord(r, d, extra.get(d.recordId)));
}

// ---------- checks run inside the write transaction ----------

const fail = (code, extra = {}) => ({ code, ...extra });

function writeCheck(r, id) {
  return async (view, payload, existing) => {
    const fields = [];
    // references must point to live records of this property
    for (const [k, f] of Object.entries(r.fields)) {
      if (f.type !== 'ref' || payload[k] === null || payload[k] === undefined) continue;
      if (existing && existing.payload?.[k] === payload[k]) continue;
      const target = await view.get(f.table, payload[k]);
      if (!target || target.isDeleted) fields.push({ field: k, code: 'not_found' });
    }
    if (fields.length) return fail('validation_failed', { field: fields[0].field, fields });

    for (const set of r.unique) {
      if (set.some((k) => payload[k] === null || payload[k] === undefined)) continue;
      const others = (await view.findLive(r.table, Object.fromEntries(set.map((k) => [k, payload[k]])))).filter((d) => d.recordId !== id);
      if (others.length) return fail('duplicate', { field: set[0], fields: set.map((k) => ({ field: k, code: 'duplicate' })), existingId: others[0].recordId });
    }

    // one running contract per room at a time: startA < endB && startB < endA (open end = forever)
    if (r.table === 'Contract' && ['draft', 'active'].includes(payload.status)) {
      const end = (x) => x || '9999-12-31';
      const others = (await view.findLive('Contract', { roomId: payload.roomId }))
        .filter((d) => d.recordId !== id && ['draft', 'active'].includes(d.payload?.status))
        .filter((d) => payload.startDate < end(d.payload.endDate) && d.payload.startDate < end(payload.endDate));
      if (others.length) return fail('contract_overlap', { field: 'startDate', conflictWith: others[0].recordId });
    }
    if (r.table === 'Contract' && payload.endDate && payload.endDate < payload.startDate) {
      return fail('validation_failed', { field: 'endDate', fields: [{ field: 'endDate', code: 'out_of_range' }] });
    }
    return null;
  };
}

function deleteCheck(r) {
  return async (view, _payload, existing) => {
    const blockedBy = [];
    for (const ref of REFERENCED_BY[r.table] || []) {
      if (ref.onDelete !== 'restrict') continue;
      const n = (await view.findLive(ref.table, { [ref.field]: existing.recordId })).length;
      if (n) blockedBy.push({ resource: RESOURCES[ref.table].path, field: ref.field, count: n });
    }
    return blockedBy.length ? fail('has_dependents', { blockedBy }) : null;
  };
}

// ---------- result -> HTTP ----------

const STATUS = {
  validation_failed: 400, invalid_change: 400, not_found: 404, duplicate: 409, forbidden_table: 403,
  period_locked: 409, has_dependents: 409, contract_overlap: 409, payload_too_large: 413,
};

function outcome(r, id, result) {
  const mine = (x) => x.table === r.table && x.id === id;
  const rej = result.rejected.find(mine);
  if (rej) {
    const { code, table, id: _i, idempotencyKey, field, ...extra } = rej;
    if (code === 'forbidden_table') throw forbidden('forbidden');
    if (code === 'not_found') throw notFound();
    if (code === 'validation_failed') throw invalid(extra.fields || [{ field, code }]);
    if (code === 'invalid_change') throw invalid([{ field, code: 'invalid_format' }]);
    throw new AppError(STATUS[code] || 400, code, { field, ...extra });
  }
  const con = result.conflicts.find(mine);
  if (con) throw new AppError(409, 'version_conflict', { current: presentRecord(r, { ...con.server, recordId: con.server.id, serverUpdatedAt: con.server.serverUpdatedAt }) });
  return result.accepted.find(mine);
}

// ---------- list query ----------

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function listQuery(r, q, propertyId) {
  const fields = [];
  const filter = { propertyId, table: r.table, isDeleted: false };
  for (const [k, f] of Object.entries(r.fields)) {
    if (q[k] === undefined || !FILTER_TYPES.has(f.type)) continue;
    const raw = String(q[k]);
    if (f.type === 'bool') {
      if (raw !== 'true' && raw !== 'false') fields.push({ field: k, code: 'invalid_type' });
      else filter[`payload.${k}`] = raw === 'true';
    } else if (f.type === 'enum') {
      const vals = raw.split(',');
      if (vals.some((v) => !f.values.includes(v))) fields.push({ field: k, code: 'invalid_enum' });
      else filter[`payload.${k}`] = vals.length > 1 ? { $in: vals } : vals[0];
    } else {
      filter[`payload.${k}`] = raw === 'null' ? null : raw;
    }
  }
  if (q.isDemo !== undefined) filter['payload.isDemo'] = q.isDemo === 'true' ? true : { $ne: true };
  if (q.q) {
    const term = noAccent(String(q.q)).slice(0, 100);
    if (term) filter.search = { $regex: escapeRe(term) };
    if (!r.search.length) fields.push({ field: 'q', code: 'not_supported' });
  }
  if ((q.from || q.to) && !r.date) fields.push({ field: 'from', code: 'not_supported' });
  if (r.date && (q.from || q.to)) {
    const range = {};
    for (const [key, op] of [['from', '$gte'], ['to', '$lte']]) {
      if (!q[key]) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(q[key])) fields.push({ field: key, code: 'invalid_format' });
      else range[op] = q[key];
    }
    filter[`payload.${r.date}`] = range;
  }
  const limit = q.limit === undefined ? 50 : Number(q.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) fields.push({ field: 'limit', code: 'out_of_range' });
  const offset = q.offset === undefined ? 0 : Number(q.offset);
  if (!Number.isInteger(offset) || offset < 0) fields.push({ field: 'offset', code: 'out_of_range' });

  let sort = r.sort ? { [`payload.${r.sort}`]: 1, createdAt: 1 } : { createdAt: -1 };
  if (q.sort) {
    const desc = String(q.sort).startsWith('-');
    const key = String(q.sort).replace(/^-/, '');
    if (key === 'createdAt' || key === 'updatedAt') sort = { [key === 'createdAt' ? 'createdAt' : 'serverUpdatedAt']: desc ? -1 : 1 };
    else if (r.fields[key]) sort = { [`payload.${key}`]: desc ? -1 : 1, createdAt: 1 };
    else fields.push({ field: 'sort', code: 'invalid_enum' });
  }
  if (fields.length) throw invalid(fields);
  return { filter, sort, limit, offset };
}

// ---------- router ----------

function bodyOf(req) {
  if (!isObj(req.body)) throw invalid([{ field: 'body', code: 'invalid_type' }]);
  const out = {};
  for (const [k, v] of Object.entries(req.body)) if (!RESERVED.has(k)) out[k] = v;
  return out;
}

const revOf = (v, field = 'rev') => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw invalid([{ field, code: 'invalid_type' }]);
  return n;
};

function mount(router, r) {
  const base = `/${r.path}`;
  const guard = (req) => {
    if (OWNER_ONLY.has(r.table) && req.auth.role !== 'owner') throw forbidden('forbidden');
  };
  const load = async (req, id) => {
    const doc = await SyncRecord.findOne({ propertyId: req.auth.propertyId, table: r.table, recordId: id, isDeleted: false }).lean();
    if (!doc) throw notFound();
    return (await presentMany(r, [doc], req.auth.propertyId))[0];
  };
  const write = async (req, id, change) => {
    const result = await sync.applyChanges(req.auth, [{ table: r.table, id, ...change }], { deviceId: req.auth.sessionId });
    const ok = outcome(r, id, result);
    const doc = result.view.map.get(`${r.table}|${id}`);
    return { ok, doc };
  };

  if (r.singleton) {
    router.get(base, ...pre, asyncHandler(async (req, res) => {
      guard(req);
      const doc = await SyncRecord.findOne({ propertyId: req.auth.propertyId, table: r.table, recordId: r.singleton }).lean();
      res.json(doc ? (await presentMany(r, [doc], req.auth.propertyId))[0] : presentRecord(r, { recordId: r.singleton, payload: {}, rev: 0 }));
    }));
    router.patch(base, ...pre, asyncHandler(async (req, res) => {
      guard(req);
      if (req.auth.role !== 'owner') throw forbidden('forbidden');
      const body = bodyOf(req);
      const rev = revOf(req.body.rev);
      await write(req, r.singleton, { op: 'upsert', payload: body, mode: 'patch', baseRev: rev, force: rev === undefined, check: writeCheck(r, r.singleton) });
      res.json(await load(req, r.singleton));
    }));
    return;
  }

  router.get(base, ...pre, asyncHandler(async (req, res) => {
    guard(req);
    const { filter, sort, limit, offset } = listQuery(r, req.query, req.auth.propertyId);
    const [docs, total] = await Promise.all([
      SyncRecord.find(filter).sort(sort).skip(offset).limit(limit).lean(),
      SyncRecord.countDocuments(filter),
    ]);
    res.json({ data: await presentMany(r, docs, req.auth.propertyId), page: { limit, offset, total } });
  }));

  router.get(`${base}/:id`, ...pre, asyncHandler(async (req, res) => {
    guard(req);
    res.json(await load(req, req.params.id));
  }));

  router.post(base, ...pre, asyncHandler(async (req, res) => {
    guard(req);
    const body = bodyOf(req);
    const id = req.body.id === undefined || req.body.id === null ? uuid() : req.body.id;
    if (typeof id !== 'string' || !ID.test(id)) throw invalid([{ field: 'id', code: 'invalid_format' }]);
    await write(req, id, { op: 'upsert', payload: body, mode: 'create', mustNotExist: true, force: true, check: writeCheck(r, id) });
    res.status(201).json(await load(req, id));
  }));

  router.patch(`${base}/:id`, ...pre, asyncHandler(async (req, res) => {
    guard(req);
    if (r.appendOnly === true) throw new AppError(409, 'append_only');
    const body = bodyOf(req);
    const rev = revOf(req.body.rev);
    await write(req, req.params.id, { op: 'upsert', payload: body, mode: 'patch', mustExist: true, baseRev: rev, force: rev === undefined, check: writeCheck(r, req.params.id) });
    res.json(await load(req, req.params.id));
  }));

  router.delete(`${base}/:id`, ...pre, asyncHandler(async (req, res) => {
    guard(req);
    const rev = revOf(req.query.rev);
    await write(req, req.params.id, { op: 'delete', mustExist: true, baseRev: rev, force: rev === undefined, cascade: true, check: deleteCheck(r) });
    res.status(204).end();
  }));
}

const router = express.Router();
for (const r of Object.values(RESOURCES)) mount(router, r);

module.exports = router;
