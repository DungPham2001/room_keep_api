/**
 * Validates one record against its table schema.
 *   mode 'create' : required fields must be present, defaults applied, unknown fields dropped
 *   mode 'patch'  : only the fields sent are checked, unknown fields dropped
 *   mode 'sync'   : like create without defaults; unknown fields are kept (an app version newer than the server
 *                   must not lose columns)
 * Field error codes: required, invalid_type, too_long, out_of_range, invalid_format, invalid_enum.
 */
const { RESOURCES } = require('./schema');
const { noAccent } = require('../lib/util');

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH = /^(\d{4})-(\d{2})$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})$/;

/** Keys owned by the server or by the sync envelope: never taken from a REST body. */
const RESERVED = new Set(['id', 'rev', 'serverRev', 'createdAt', 'updatedAt', 'isDeleted', 'nameNoAccent']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function validDate(s) {
  const m = DATE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** Returns [value, errorCode|null]. */
function checkValue(f, v) {
  switch (f.type) {
    case 'string': {
      if (typeof v !== 'string') return [v, 'invalid_type'];
      const s = f.multiline ? v.replace(/\s+$/, '') : v.trim();
      if (s.length > f.max) return [s, 'too_long'];
      if (f.pattern && s && !f.pattern.test(s)) return [s, 'invalid_format'];
      return [s, null];
    }
    case 'int':
      if (typeof v !== 'number' || !Number.isInteger(v)) return [v, 'invalid_type'];
      return [v, v < f.min || v > f.max ? 'out_of_range' : null];
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) return [v, 'invalid_type'];
      return [v, v < f.min || v > f.max ? 'out_of_range' : null];
    case 'bool':
      return typeof v === 'boolean' ? [v, null] : [v, 'invalid_type'];
    case 'date':
      if (typeof v !== 'string') return [v, 'invalid_type'];
      return [v, validDate(v) ? null : 'invalid_format'];
    case 'month': {
      if (typeof v !== 'string') return [v, 'invalid_type'];
      const m = MONTH.exec(v);
      return [v, m && +m[2] >= 1 && +m[2] <= 12 ? null : 'invalid_format'];
    }
    case 'datetime':
      if (typeof v === 'number') return [v, Number.isInteger(v) && v >= 0 ? null : 'invalid_format'];
      if (typeof v !== 'string') return [v, 'invalid_type'];
      return [v, ISO.test(v) && !Number.isNaN(Date.parse(v)) ? null : 'invalid_format'];
    case 'enum':
      return [v, f.values.includes(v) ? null : 'invalid_enum'];
    case 'ref':
      if (typeof v !== 'string') return [v, 'invalid_type'];
      return [v, ID.test(v) ? null : 'invalid_format'];
    case 'json':
      return [v, null];
    default:
      return [v, null];
  }
}

function validate(table, input, mode) {
  const r = RESOURCES[table];
  const fields = [];
  if (!isObj(input)) return { values: {}, fields: [{ field: 'body', code: 'invalid_type' }] };
  const values = {};

  for (const [key, f] of Object.entries(r.fields)) {
    let v = input[key];
    if (v === undefined) {
      if (mode === 'patch') continue;
      if (mode === 'create' && f.default !== undefined) {
        values[key] = f.default;
        continue;
      }
      if (f.required) fields.push({ field: key, code: 'required' });
      continue;
    }
    if (v === null || (typeof v === 'string' && v.trim() === '' && (f.required || f.type !== 'string'))) {
      if (f.required) fields.push({ field: key, code: 'required' });
      else values[key] = null;
      continue;
    }
    const [clean, code] = checkValue(f, v);
    if (code) fields.push({ field: key, code });
    else values[key] = clean;
    v = clean;
  }
  if (input.isDemo !== undefined) {
    if (typeof input.isDemo === 'boolean') values.isDemo = input.isDemo;
    else fields.push({ field: 'isDemo', code: 'invalid_type' });
  }

  if (mode === 'sync') {
    // keep app-only columns as they are
    for (const [k, v] of Object.entries(input)) if (!(k in values) && !(k in r.fields) && !r.computed.includes(k)) values[k] = v;
  }
  return { values, fields };
}

/** Server-computed columns stored in the payload (the app's own normalization of names). */
function derive(table, payload) {
  const r = RESOURCES[table];
  if (r?.noAccent && typeof payload[r.noAccent] === 'string') payload.nameNoAccent = noAccent(payload[r.noAccent]);
  return payload;
}

/** Text used by `?q=` search: accent-insensitive concatenation of the search fields. */
function searchText(table, payload) {
  const r = RESOURCES[table];
  if (!r?.search?.length || !isObj(payload)) return '';
  return noAccent(r.search.map((k) => (typeof payload[k] === 'string' ? payload[k] : '')).filter(Boolean).join(' '));
}

module.exports = { validate, derive, searchText, RESERVED };
