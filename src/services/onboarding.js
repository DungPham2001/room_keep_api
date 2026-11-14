/**
 * Sign-up steps 2-5 (feature 137): property info, billing rules, rates, initial layout.
 * Steps 3-5 are optional. The input becomes ordinary sync records (AppSettings, ElectricityTier, WaterRate,
 * Service/ServicePrice, Block/Floor/Room/RoomPrice, OnboardingStep) so the app writes them straight into Room.
 */
const { uuid, noAccent, today } = require('../lib/util');
const { isObj } = require('../lib/validate');
const { APP_SETTINGS_ID } = require('./tables');

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const MONEY_MAX = 10_000_000_000; // 10 tỷ đồng per unit price: generous upper bound
const DAY_COUNT = ['fixed30', 'actual'];
const ELECTRIC_MODES = ['flat', 'tiered'];
const WATER_MODES = ['per_m3', 'per_person'];
const SERVICE_MODES = ['per_room', 'per_person', 'per_use'];
const LIMITS = { blocks: 20, floors: 200, rooms: 1000, services: 30, tiers: 10 };

const optId = (c, obj, key, field) => {
  const v = obj?.[key];
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string' || !ID.test(v)) return c.fail(field, 'invalid_format');
  return v;
};

/**
 * Validates `property` with Checker `c`; returns a normalized object (or undefined when invalid).
 * `seed: false` (in the property or passed by the caller from the request root): the server creates no records at
 * all (not even AppSettings / OnboardingStep); the app pushes its own after sign-up.
 */
function parseProperty(c, body, prefix = 'property', { seed } = {}) {
  const p = c.obj({ body }, 'body', { field: prefix, required: true });
  if (!p) return undefined;
  const out = {
    name: c.str(p, 'name', { field: `${prefix}.name`, required: true, max: 100 }),
    address: c.str(p, 'address', { field: `${prefix}.address`, max: 200 }) || '',
    phone: c.phone(p, 'phone', { field: `${prefix}.phone` }) || '',
    seed: true,
  };
  const seedIn = p.seed !== undefined ? p.seed : seed;
  if (seedIn !== undefined) {
    if (typeof seedIn !== 'boolean') c.fail('seed', 'invalid_type');
    else out.seed = seedIn;
  }
  if (out.seed === false) {
    // nothing would be created from these: refuse instead of silently dropping what the app sent
    for (const k of ['billing', 'rates', 'layout']) if (p[k] !== undefined && p[k] !== null) c.fail(`${prefix}.${k}`, 'not_allowed');
    return c.ok ? out : undefined;
  }

  const b = c.obj(p, 'billing', { field: `${prefix}.billing` });
  if (b) {
    out.billing = {
      meterDay: c.int(b, 'meterDay', { field: `${prefix}.billing.meterDay`, min: 1, max: 31 }) ?? 1,
      cycleStartDay: c.int(b, 'cycleStartDay', { field: `${prefix}.billing.cycleStartDay`, min: 1, max: 31 }) ?? 1,
      dueDay: c.int(b, 'dueDay', { field: `${prefix}.billing.dueDay`, min: 1, max: 31 }) ?? 5,
      dayCountMode: c.oneOf(b, 'dayCountMode', DAY_COUNT, { field: `${prefix}.billing.dayCountMode`, def: 'fixed30' }),
      roundingStep: c.int(b, 'roundingStep', { field: `${prefix}.billing.roundingStep`, min: 1, max: 100000 }) ?? 1000,
    };
  }

  const r = c.obj(p, 'rates', { field: `${prefix}.rates` });
  if (r) {
    out.rates = {};
    const e = c.obj(r, 'electric', { field: `${prefix}.rates.electric` });
    if (e) {
      const mode = c.oneOf(e, 'mode', ELECTRIC_MODES, { field: `${prefix}.rates.electric.mode`, def: 'flat' });
      if (mode === 'flat') {
        const price = c.int(e, 'price', { field: `${prefix}.rates.electric.price`, required: true, max: MONEY_MAX });
        out.rates.electric = { mode, tiers: [{ fromKwh: 0, toKwh: null, pricePerKwh: price }] };
      } else if (mode === 'tiered') {
        const tiers = c.arr(e, 'tiers', { field: `${prefix}.rates.electric.tiers`, required: true, max: LIMITS.tiers }) || [];
        if (Array.isArray(e.tiers) && !tiers.length) c.fail(`${prefix}.rates.electric.tiers`, 'required');
        const parsed = tiers.map((tr, i) => {
          const f = `${prefix}.rates.electric.tiers[${i}]`;
          return {
            name: c.str(tr, 'name', { field: `${f}.name`, max: 40 }) || `Bậc ${i + 1}`,
            fromKwh: c.int(tr, 'fromKwh', { field: `${f}.fromKwh`, required: true, max: 1e7 }),
            toKwh: c.int(tr, 'toKwh', { field: `${f}.toKwh`, max: 1e7 }) ?? null,
            pricePerKwh: c.int(tr, 'pricePerKwh', { field: `${f}.pricePerKwh`, required: true, max: MONEY_MAX }),
          };
        });
        // contiguous [from, to) starting at 0, only the last may be open-ended
        parsed.forEach((tr, i) => {
          const f = `${prefix}.rates.electric.tiers[${i}]`;
          if (i === 0 && tr.fromKwh !== 0) c.fail(`${f}.fromKwh`, 'out_of_range');
          if (i > 0 && tr.fromKwh !== parsed[i - 1].toKwh) c.fail(`${f}.fromKwh`, 'out_of_range');
          if (tr.toKwh === null && i !== parsed.length - 1) c.fail(`${f}.toKwh`, 'required');
          if (tr.toKwh !== null && tr.toKwh <= tr.fromKwh) c.fail(`${f}.toKwh`, 'out_of_range');
        });
        out.rates.electric = { mode, tiers: parsed };
      }
    }
    const w = c.obj(r, 'water', { field: `${prefix}.rates.water` });
    if (w) {
      out.rates.water = {
        mode: c.oneOf(w, 'mode', WATER_MODES, { field: `${prefix}.rates.water.mode`, def: 'per_m3' }),
        price: c.int(w, 'price', { field: `${prefix}.rates.water.price`, required: true, max: MONEY_MAX }),
      };
    }
    const services = c.arr(r, 'services', { field: `${prefix}.rates.services`, max: LIMITS.services }) || [];
    out.rates.services = services.map((s, i) => {
      const f = `${prefix}.rates.services[${i}]`;
      return {
        id: optId(c, s, 'id', `${f}.id`),
        name: c.str(s, 'name', { field: `${f}.name`, required: true, max: 60 }),
        calcMode: c.oneOf(s, 'calcMode', SERVICE_MODES, { field: `${f}.calcMode`, def: 'per_room' }),
        price: c.int(s, 'price', { field: `${f}.price`, required: true, max: MONEY_MAX }),
        isFixedFee: s?.isFixedFee === undefined ? true : !!s.isFixedFee,
      };
    });
  }

  const l = c.obj(p, 'layout', { field: `${prefix}.layout` });
  if (l) out.layout = parseLayout(c, l, `${prefix}.layout`);
  return c.ok ? out : undefined;
}

/** Either explicit blocks/floors/rooms (as previewed and edited in the app) or `generate` counts. */
function parseLayout(c, l, f) {
  const g = c.obj(l, 'generate', { field: `${f}.generate` });
  if (g) {
    const blocks = c.int(g, 'blocks', { field: `${f}.generate.blocks`, required: true, min: 1, max: LIMITS.blocks });
    const floorsPerBlock = c.int(g, 'floorsPerBlock', { field: `${f}.generate.floorsPerBlock`, required: true, min: 1, max: 50 });
    const roomsPerFloor = c.int(g, 'roomsPerFloor', { field: `${f}.generate.roomsPerFloor`, required: true, min: 1, max: 99 });
    const defaultRent = c.int(g, 'defaultRent', { field: `${f}.generate.defaultRent`, max: MONEY_MAX }) ?? 0;
    const capacity = c.int(g, 'capacity', { field: `${f}.generate.capacity`, min: 1, max: 50 }) ?? null;
    if (!c.ok) return undefined;
    if (blocks * floorsPerBlock * roomsPerFloor > LIMITS.rooms) return c.fail(`${f}.generate`, 'out_of_range');
    return generateLayout({ blocks, floorsPerBlock, roomsPerFloor, defaultRent, capacity });
  }

  const blocksIn = c.arr(l, 'blocks', { field: `${f}.blocks`, max: LIMITS.blocks }) || [];
  const floorsIn = c.arr(l, 'floors', { field: `${f}.floors`, max: LIMITS.floors }) || [];
  const roomsIn = c.arr(l, 'rooms', { field: `${f}.rooms`, max: LIMITS.rooms }) || [];
  const blocks = blocksIn.map((b, i) => ({
    id: optId(c, b, 'id', `${f}.blocks[${i}].id`) || uuid(),
    name: c.str(b, 'name', { field: `${f}.blocks[${i}].name`, required: true, max: 40 }),
    sortOrder: i,
  }));
  const ref = (list, obj, idKey, idxKey, field) => {
    if (typeof obj?.[idKey] === 'string') {
      const hit = list.find((x) => x.id === obj[idKey]);
      return hit ? hit.id : c.fail(field, 'not_found');
    }
    if (Number.isInteger(obj?.[idxKey]) && list[obj[idxKey]]) return list[obj[idxKey]].id;
    return c.fail(field, 'required');
  };
  const floors = floorsIn.map((fl, i) => ({
    id: optId(c, fl, 'id', `${f}.floors[${i}].id`) || uuid(),
    blockId: ref(blocks, fl, 'blockId', 'blockIndex', `${f}.floors[${i}].blockId`),
    label: c.str(fl, 'label', { field: `${f}.floors[${i}].label`, required: true, max: 40 }),
    sortOrder: i,
  }));
  const rooms = roomsIn.map((rm, i) => ({
    id: optId(c, rm, 'id', `${f}.rooms[${i}].id`) || uuid(),
    floorId: ref(floors, rm, 'floorId', 'floorIndex', `${f}.rooms[${i}].floorId`),
    name: c.str(rm, 'name', { field: `${f}.rooms[${i}].name`, required: true, max: 40 }),
    monthlyRent: c.int(rm, 'monthlyRent', { field: `${f}.rooms[${i}].monthlyRent`, max: MONEY_MAX }) ?? 0,
    areaSqm: c.num(rm, 'areaSqm', { field: `${f}.rooms[${i}].areaSqm`, max: 10000 }) ?? null,
    capacity: c.int(rm, 'capacity', { field: `${f}.rooms[${i}].capacity`, min: 1, max: 50 }) ?? null,
  }));
  const ids = new Set();
  for (const x of [...blocks, ...floors, ...rooms]) {
    if (ids.has(x.id)) c.fail(`${f}`, 'duplicate_id');
    ids.add(x.id);
  }
  return { blocks, floors, rooms };
}

const blockLetter = (i) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

/** Dãy A, tầng 1 -> A101, A102... (same naming the app previews). */
function generateLayout({ blocks, floorsPerBlock, roomsPerFloor, defaultRent, capacity }) {
  const out = { blocks: [], floors: [], rooms: [] };
  for (let b = 0; b < blocks; b += 1) {
    const letter = blockLetter(b);
    const block = { id: uuid(), name: `Dãy ${letter}`, sortOrder: b };
    out.blocks.push(block);
    for (let fl = 1; fl <= floorsPerBlock; fl += 1) {
      const floor = { id: uuid(), blockId: block.id, label: `Tầng ${fl}`, sortOrder: fl - 1 };
      out.floors.push(floor);
      for (let r = 1; r <= roomsPerFloor; r += 1) {
        out.rooms.push({ id: uuid(), floorId: floor.id, name: `${letter}${fl}${String(r).padStart(2, '0')}`, monthlyRent: defaultRent, areaSqm: null, capacity });
      }
    }
  }
  return out;
}

/** Turns the normalized input into sync records [{ table, id, payload }]. None when `seed` is false. */
function seedRecords(input, { language = 'vi' } = {}) {
  if (input.seed === false) return [];
  const now = new Date().toISOString();
  const day = today();
  const rec = (table, fields) => ({ table, id: fields.id, payload: { ...fields, updatedAt: now, isDeleted: false, isDemo: false } });
  const out = [];
  const b = input.billing || {};

  out.push(rec('AppSettings', {
    id: APP_SETTINGS_ID,
    language,
    propertyName: input.name,
    address: input.address,
    phone: input.phone,
    meterDay: b.meterDay ?? null,
    cycleStartDay: b.cycleStartDay ?? 1,
    dueDay: b.dueDay ?? null,
    dayCountMode: b.dayCountMode ?? 'fixed30',
    roundingStep: b.roundingStep ?? 1000,
    dateFormat: 'dd/MM/yyyy',
    rulesText: '',
  }));

  const r = input.rates || {};
  for (const tr of r.electric?.tiers || []) {
    out.push(rec('ElectricityTier', { id: uuid(), name: tr.name || (r.electric.mode === 'flat' ? 'Đồng giá' : ''), fromKwh: tr.fromKwh, toKwh: tr.toKwh, pricePerKwh: tr.pricePerKwh, effectiveFrom: day }));
  }
  if (r.water) out.push(rec('WaterRate', { id: uuid(), mode: r.water.mode, pricePerUnit: r.water.price, effectiveFrom: day }));
  for (const s of r.services || []) {
    const id = s.id || uuid();
    out.push(rec('Service', { id, name: s.name, calcMode: s.calcMode, defaultPrice: s.price, isFixedFee: s.isFixedFee }));
    out.push(rec('ServicePrice', { id: uuid(), serviceId: id, price: s.price, effectiveFrom: day }));
  }

  const l = input.layout || { blocks: [], floors: [], rooms: [] };
  for (const bl of l.blocks) out.push(rec('Block', bl));
  for (const fl of l.floors) out.push(rec('Floor', fl));
  for (const rm of l.rooms) {
    out.push(rec('Room', {
      id: rm.id, floorId: rm.floorId, typeId: null, name: rm.name, nameNoAccent: noAccent(rm.name),
      areaSqm: rm.areaSqm, capacity: rm.capacity, status: 'vacant', amenitiesText: '', note: '',
    }));
    out.push(rec('RoomPrice', { id: uuid(), roomId: rm.id, monthlyRent: rm.monthlyRent, effectiveFrom: day }));
  }

  // Setup checklist (feature 5): what was entered at sign-up is already done.
  const steps = [
    ['property_info', true],
    ['billing_rules', !!input.billing],
    ['rates', !!(r.electric || r.water || (r.services || []).length)],
    ['blocks_rooms', l.rooms.length > 0],
    ['first_tenant', false],
  ];
  for (const [key, isDone] of steps) out.push(rec('OnboardingStep', { id: `step_${key}`, key, isDone }));
  return out;
}

module.exports = { parseProperty, seedRecords, generateLayout, isObj };
