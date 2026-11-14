/**
 * MongoDB collections of the `roomkeep` database.
 *
 * The app is offline-first: every business table of the Room schema (rooms, tenants, contracts, meter readings,
 * statements...) is stored as one generic document in `sync_records`, keyed by (propertyId, table, recordId) and
 * ordered by a per-property revision counter (`properties.rev`). Accounts, sessions, invites and resets are
 * first-class collections because the server owns them.
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const make = (name, collection, def, indexes = []) => {
  const s = new Schema(def, { collection, versionKey: false, minimize: false });
  for (const [spec, opts] of indexes) s.index(spec, opts);
  return mongoose.model(name, s);
};

/** One login. An account belongs to at most one property (owner or manager). */
const Account = make('Account', 'accounts', {
  _id: String, // uuid
  email: { type: String, required: true },
  phone: { type: String, default: null }, // normalized login phone (0xxxxxxxxx), unique when set
  passwordHash: { type: String, required: true },
  displayName: { type: String, required: true },
  preferredLanguage: { type: String, enum: ['vi', 'en'], default: 'vi' },
  propertyId: { type: String, default: null },
  role: { type: String, enum: ['owner', 'manager', null], default: null },
  joinedAt: { type: Date, default: null },
  termsAcceptedAt: Date,
  passwordChangedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, [
  [{ email: 1 }, { unique: true }],
  [{ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } }],
  [{ propertyId: 1, role: 1 }, {}],
]);

/** The rental property (nhà trọ). `rev` is the sync revision counter, bumped once per accepted change. */
const Property = make('Property', 'properties', {
  _id: String, // uuid
  name: { type: String, required: true },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  ownerId: { type: String, required: true },
  rev: { type: Number, default: 0 },
  purgedRev: { type: Number, default: 0 }, // tombstones with rev <= this were hard-deleted
  lockedAt: Date, // written at the start of every push transaction to serialize writers per property
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, [[{ ownerId: 1 }, {}]]);

/** A signed-in device (feature 153). Holds the hash of the current refresh token and of the previous one. */
const Session = make('Session', 'sessions', {
  _id: String, // uuid, also the server device id
  accountId: { type: String, required: true },
  propertyId: { type: String, default: null },
  name: { type: String, default: '' }, // deviceName
  clientDeviceId: { type: String, default: null },
  refreshHash: { type: String, required: true },
  prevRefreshHash: { type: String, default: null },
  refreshExpiresAt: { type: Date, required: true },
  absoluteExpiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  revokedAt: { type: Date, default: null },
  revokeReason: { type: String, default: null },
  expireAt: { type: Date, required: true }, // TTL cleanup
}, [
  [{ accountId: 1, revokedAt: 1 }, {}],
  [{ expireAt: 1 }, { expireAfterSeconds: 0 }],
]);

/** Password reset code sent by email (feature 140). Only the hash is stored. */
const PasswordReset = make('PasswordReset', 'password_resets', {
  _id: String,
  accountId: { type: String, required: true },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
}, [
  [{ codeHash: 1 }, { unique: true }],
  [{ accountId: 1 }, {}],
  [{ expiresAt: 1 }, { expireAfterSeconds: 86400 }],
]);

/** Invite code for a manager to join the property (feature 154). Single use. */
const Invite = make('Invite', 'invites', {
  _id: String,
  propertyId: { type: String, required: true },
  code: { type: String, required: true },
  role: { type: String, enum: ['manager'], default: 'manager' },
  createdBy: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  usedBy: { type: String, default: null },
  usedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
}, [
  [{ code: 1 }, { unique: true }],
  [{ propertyId: 1, createdAt: -1 }, {}],
  [{ expiresAt: 1 }, { expireAfterSeconds: 7 * 86400 }],
]);

/** One record of one Room table of one property. Soft-deleted records stay as tombstones until purged. */
const SyncRecord = make('SyncRecord', 'sync_records', {
  propertyId: { type: String, required: true },
  table: { type: String, required: true },
  recordId: { type: String, required: true },
  rev: { type: Number, required: true },
  isDeleted: { type: Boolean, default: false },
  payload: { type: Schema.Types.Mixed, default: {} },
  clientUpdatedAt: { type: Schema.Types.Mixed, default: null }, // as sent by the app (display / tie-break only)
  updatedBy: { type: String, default: null }, // accountId
  deviceId: { type: String, default: null },
  serverUpdatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  search: { type: String, default: '' }, // accent-free text of the table's search fields (REST ?q=)
}, [
  [{ propertyId: 1, table: 1, recordId: 1 }, { unique: true }],
  [{ propertyId: 1, table: 1, isDeleted: 1, createdAt: -1 }, {}],
  [{ propertyId: 1, rev: 1 }, {}],
  [{ propertyId: 1, table: 1, 'payload.cycle': 1 }, { partialFilterExpression: { table: 'BillingCycle' } }],
  [{ isDeleted: 1, serverUpdatedAt: 1 }, { partialFilterExpression: { isDeleted: true } }],
]);

/** Idempotency receipts: `<propertyId>|<idempotencyKey>` for sync changes, `register|<key>` for sign-up. */
const Receipt = make('Receipt', 'receipts', {
  _id: String,
  result: Schema.Types.Mixed,
  expireAt: { type: Date, required: true },
}, [[{ expireAt: 1 }, { expireAfterSeconds: 0 }]]);

/** Counters for rate limits and failed-password attempts; expire on their own. */
const RateHit = make('RateHit', 'rate_hits', {
  _id: String,
  count: { type: Number, default: 0 },
  expireAt: Date,
}, [[{ expireAt: 1 }, { expireAfterSeconds: 0 }]]);

module.exports = { Account, Property, Session, PasswordReset, Invite, SyncRecord, Receipt, RateHit };
