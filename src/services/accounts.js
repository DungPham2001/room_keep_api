/**
 * Accounts, property membership, password flows, invites (features 137-143, 153, 154).
 */
const config = require('../config');
const { Account, Property, Session, PasswordReset, Invite, SyncRecord, Receipt } = require('../models');
const { withTx } = require('../lib/tx');
const { Checker } = require('../lib/validate');
const { AppError, unauthorized, forbidden, conflict, notFound, invalid } = require('../lib/errors');
const { uuid, sha256, humanCode, normalizeCode, iso } = require('../lib/util');
const password = require('../lib/password');
const attempts = require('../lib/attempts');
const mailer = require('../lib/mailer');
const tokens = require('./tokens');
const sync = require('./sync');
const { parseProperty, seedRecords } = require('./onboarding');

const LANGS = ['vi', 'en'];

// ---------- presenters ----------

const presentAccount = (a) => ({
  id: a._id,
  email: a.email,
  displayName: a.displayName,
  preferredLanguage: a.preferredLanguage,
  role: a.role || null,
  propertyId: a.propertyId || null,
  createdAt: iso(a.createdAt),
});

const presentProperty = (p) => (p ? {
  id: p._id,
  name: p.name,
  address: p.address || '',
  phone: p.phone || '',
  ownerId: p.ownerId,
  createdAt: iso(p.createdAt),
} : null);

async function profile(account) {
  const property = account.propertyId ? await Property.findById(account.propertyId).lean() : null;
  return { account: presentAccount(account), property: presentProperty(property), role: account.role || null };
}

const loadAccount = (id) => Account.findById(id).lean();

const deviceOf = (c, body) => ({
  deviceName: c.str(body, 'deviceName', { max: 80 }) || '',
  clientDeviceId: c.str(body, 'deviceId', { max: 100 }) || null,
});

// ---------- property creation (sign-up or later) ----------

/** Creates the property + seed records inside `session`; returns { property, records }. */
async function createProperty(account, input, session) {
  const propertyId = uuid();
  const [property] = await Property.create([{
    _id: propertyId, name: input.name, address: input.address, phone: input.phone, ownerId: account._id, rev: 0,
  }], { session });
  const records = await sync.writeServerRecords(propertyId, seedRecords(input, { language: account.preferredLanguage }), account._id, session);
  return { property: property.toObject ? property.toObject() : property, records };
}

/** Is the property still empty (only sign-up seed, no other member)? Used before an owner joins another property. */
async function isDisposable(propertyId, ownerId) {
  const seedTables = ['AppSettings', 'OnboardingStep', 'ElectricityTier', 'WaterRate', 'Service', 'ServicePrice', 'Block', 'Floor', 'Room', 'RoomPrice'];
  const [members, data] = await Promise.all([
    Account.countDocuments({ propertyId, _id: { $ne: ownerId } }),
    SyncRecord.countDocuments({ propertyId, table: { $nin: seedTables } }),
  ]);
  return members === 0 && data === 0;
}

async function purgeProperty(propertyId, session) {
  await SyncRecord.deleteMany({ propertyId }, { session });
  await Receipt.deleteMany({ _id: { $regex: `^${propertyId}\\|` } }, { session });
  await Invite.deleteMany({ propertyId }, { session });
  await Account.updateMany({ propertyId }, { $set: { propertyId: null, role: null, joinedAt: null, updatedAt: new Date() } }, { session });
  await Property.deleteOne({ _id: propertyId }, { session });
}

/** Finds a usable invite by code (inside `session`). */
async function findInvite(code, session) {
  const c = normalizeCode(code);
  if (c.length !== 8) return null;
  const inv = await Invite.findOne({ code: c }).session(session).lean();
  if (!inv || inv.usedAt || inv.revokedAt || inv.expiresAt <= new Date()) return null;
  const prop = await Property.findById(inv.propertyId).session(session).lean();
  return prop ? inv : null;
}

// ---------- register / login ----------

/**
 * POST /v1/auth/register — one request creates the account and the property in one transaction
 * (or joins an existing property with `inviteCode`). Idempotent by `idempotencyKey`.
 */
async function register(body, { lang, idempotencyKey: headerKey }) {
  const c = new Checker();
  const acc = c.obj(body, 'account', { required: true }) || {};
  const email = c.email(acc, 'email', { field: 'account.email', required: true });
  const plain = c.password(acc, 'password', { field: 'account.password' });
  const displayName = c.str(acc, 'displayName', { field: 'account.displayName', required: true, max: 60 });
  const preferredLanguage = c.oneOf(acc, 'preferredLanguage', LANGS, { field: 'account.preferredLanguage', def: lang });
  const accepted = body?.acceptTerms === true || acc.acceptTerms === true;
  if (!accepted) c.fail('acceptTerms', 'terms_required');
  const inviteCode = c.str(body, 'inviteCode', { max: 20 });
  const input = inviteCode ? undefined : parseProperty(c, body?.property, 'property');
  const device = deviceOf(c, body);
  const idemKey = c.str(body, 'idempotencyKey', { max: 100 }) || (typeof headerKey === 'string' ? headerKey.slice(0, 100) : null);
  c.done();

  // Retried sign-up (network dropped after the server committed): same key + same credentials = same account.
  if (idemKey) {
    const receipt = await Receipt.findById(`register|${sha256(idemKey)}`).lean();
    if (receipt) {
      const account = await loadAccount(receipt.result.accountId);
      if (!account || account.email !== email || !(await password.verify(plain, account.passwordHash))) throw conflict('email_taken');
      return finishRegister(account, device, { replay: true });
    }
  }

  if (await Account.exists({ email })) throw conflict('email_taken');
  const passwordHash = await password.hash(plain);

  let account;
  try {
    account = await withTx(async (session) => {
      const now = new Date();
      const doc = {
        _id: uuid(), email, passwordHash, displayName, preferredLanguage,
        propertyId: null, role: null, joinedAt: null, termsAcceptedAt: now, passwordChangedAt: now, createdAt: now, updatedAt: now,
      };
      if (inviteCode) {
        const inv = await findInvite(inviteCode, session);
        if (!inv) throw invalid([{ field: 'inviteCode', code: 'invite_invalid' }]);
        const used = await Invite.updateOne({ _id: inv._id, usedAt: null }, { $set: { usedAt: now, usedBy: doc._id } }, { session });
        if (!used.modifiedCount) throw invalid([{ field: 'inviteCode', code: 'invite_invalid' }]);
        Object.assign(doc, { propertyId: inv.propertyId, role: inv.role, joinedAt: now });
        await Account.create([doc], { session });
      } else {
        await Account.create([doc], { session });
        const { property } = await createProperty(doc, input, session);
        Object.assign(doc, { propertyId: property._id, role: 'owner', joinedAt: now });
        await Account.updateOne({ _id: doc._id }, { $set: { propertyId: doc.propertyId, role: 'owner', joinedAt: now } }, { session });
      }
      if (idemKey) {
        await Receipt.create([{ _id: `register|${sha256(idemKey)}`, result: { accountId: doc._id }, expireAt: new Date(Date.now() + 86400000) }], { session });
      }
      return doc;
    });
  } catch (err) {
    if (err.code === 11000) throw conflict('email_taken');
    throw err;
  }
  return finishRegister(account, device, { replay: false });
}

/**
 * First page of the property's data, so the app writes it straight into Room and continues pulling from `rev`
 * (only when `hasMore`: a very large initial layout).
 */
async function firstPage(account) {
  if (!account.propertyId) return { changes: [], rev: 0, hasMore: false };
  const data = await sync.pull({ propertyId: account.propertyId, role: account.role }, { since: 0, limit: config.sync.pullMax });
  return { changes: data.changes, rev: data.nextRev, hasMore: data.hasMore };
}

async function finishRegister(account, device, { replay }) {
  const t = await tokens.openSession(account, device);
  const prof = await profile(account);
  const data = await firstPage(account);
  return { status: replay ? 200 : 201, body: { ...prof, tokens: t, ...data } };
}

/** POST /v1/auth/login */
async function login(body) {
  const c = new Checker();
  const email = c.email(body, 'email', { required: true });
  const plain = c.secret(body, 'password');
  const device = deviceOf(c, body);
  c.done();

  await attempts.assertNotLocked('login', email);
  const account = await Account.findOne({ email }).lean();
  const ok = await password.verify(plain, account?.passwordHash);
  if (!ok) {
    await attempts.recordFailure('login', email);
    throw unauthorized('invalid_credentials');
  }
  await attempts.clearFailures('login', email);
  const t = await tokens.openSession(account, device);
  return { ...(await profile(account)), tokens: t };
}

/** POST /v1/auth/refresh */
async function refresh(body) {
  const c = new Checker();
  const rt = c.str(body, 'refreshToken', { required: true, max: 200, trim: false });
  c.done();
  return { tokens: await tokens.refresh(rt, loadAccount) };
}

/** POST /v1/auth/logout — with a refresh token or the bearer session; always 204. */
async function logout(body, auth) {
  const rt = typeof body?.refreshToken === 'string' ? body.refreshToken : '';
  if (rt.includes('.')) {
    const [sid] = rt.split('.');
    await Session.updateOne({ _id: sid, refreshHash: sha256(rt), revokedAt: null }, { $set: { revokedAt: new Date(), revokeReason: 'logout' } });
  }
  if (auth?.sessionId) await tokens.revoke({ _id: auth.sessionId }, 'logout');
}

// ---------- password ----------

/** POST /v1/auth/forgot — always 202 (does not reveal whether the email exists). */
async function forgot(body, { lang }) {
  const c = new Checker();
  const email = c.email(body, 'email', { required: true });
  c.done();
  const out = { status: 'accepted' };

  // At most 3 codes per email per hour, silently.
  const n = await attempts.bump(`forgot|${sha256(email)}`, 3600);
  if (n > 3) return out;
  const account = await Account.findOne({ email }).lean();
  if (!account) return out;

  const code = humanCode(8);
  await PasswordReset.updateMany({ accountId: account._id, usedAt: null }, { $set: { usedAt: new Date() } });
  await PasswordReset.create({ _id: uuid(), accountId: account._id, codeHash: sha256(code), expiresAt: new Date(Date.now() + config.resetCodeSec * 1000) });
  const sent = await mailer.sendResetCode(account.email, code, lang || account.preferredLanguage, account.displayName);
  if (!sent && !mailer.enabled() && config.env !== 'production') out.devToken = mailer.pretty(code);
  return out;
}

/** POST /v1/auth/reset { token, newPassword } — signs out every device. */
async function reset(body, { lang } = {}) {
  const c = new Checker();
  const code = c.str(body, 'token', { required: true, max: 20 });
  const plain = c.password(body, 'newPassword');
  c.done();
  const now = new Date();
  const r = await PasswordReset.findOneAndUpdate(
    { codeHash: sha256(normalizeCode(code)), usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: true },
  ).lean();
  if (!r) throw new AppError(400, 'reset_invalid');
  const passwordHash = await password.hash(plain);
  const account = await Account.findOneAndUpdate({ _id: r.accountId }, { $set: { passwordHash, passwordChangedAt: now, updatedAt: now } }, { new: true }).lean();
  await tokens.revoke({ accountId: r.accountId }, 'password_reset');
  // Whoever just proved access to the mailbox must be able to sign in now, not after the lockout window.
  if (account) {
    await Promise.all([attempts.clearFailures('login', account.email), attempts.clearFailures('confirm', account._id)]);
    await mailer.sendPasswordChanged(account, { via: 'reset', lang });
  }
}

/** Checks the password of the signed-in account (with failed-attempt lock). */
async function confirmPassword(account, plain, field = 'password') {
  await attempts.assertNotLocked('confirm', account._id);
  if (!(await password.verify(plain, account.passwordHash))) {
    await attempts.recordFailure('confirm', account._id);
    throw new AppError(403, 'wrong_password', { fields: [{ field, code: 'wrong_password' }] });
  }
  await attempts.clearFailures('confirm', account._id);
}

/** POST /v1/auth/change-password — other devices are signed out (feature 141). */
async function changePassword(auth, body, { lang } = {}) {
  const c = new Checker();
  const oldPassword = c.secret(body, 'oldPassword');
  const plain = c.password(body, 'newPassword');
  c.done();
  await confirmPassword(auth.account, oldPassword, 'oldPassword');
  if (oldPassword === plain) throw invalid([{ field: 'newPassword', code: 'same_as_old' }]);
  const now = new Date();
  await Account.updateOne({ _id: auth.accountId }, { $set: { passwordHash: await password.hash(plain), passwordChangedAt: now, updatedAt: now } });
  const r = await tokens.revoke({ accountId: auth.accountId, _id: { $ne: auth.sessionId } }, 'password_changed');
  await mailer.sendPasswordChanged(auth.account, { via: 'change', deviceName: auth.deviceName, lang });
  return { status: 'ok', revokedSessions: r.modifiedCount || 0 };
}

// ---------- me ----------

/** PATCH /v1/me — displayName, preferredLanguage, email (needs password); property fields (owner only). */
async function updateMe(auth, body) {
  const c = new Checker();
  const set = {};
  const displayName = c.str(body, 'displayName', { max: 60 });
  if (body?.displayName !== undefined && displayName === null) c.fail('displayName', 'required');
  if (displayName) set.displayName = displayName;
  const lang = c.oneOf(body, 'preferredLanguage', LANGS);
  if (lang) set.preferredLanguage = lang;
  const email = c.email(body, 'email');
  const prop = {};
  const name = c.str(body, 'propertyName', { max: 100 });
  if (body?.propertyName !== undefined && !name) c.fail('propertyName', 'required');
  if (name) prop.name = name;
  if (body?.address !== undefined) prop.address = c.str(body, 'address', { max: 200 }) || '';
  if (body?.phone !== undefined) prop.phone = c.phone(body, 'phone') || '';
  c.done();

  if (Object.keys(prop).length) {
    if (!auth.propertyId) throw forbidden('no_property');
    if (auth.role !== 'owner') throw forbidden('forbidden');
  }
  if (email && email !== auth.account.email) {
    if (typeof body.password !== 'string' || !body.password) throw invalid([{ field: 'password', code: 'required' }]);
    await confirmPassword(auth.account, body.password);
    if (await Account.exists({ email, _id: { $ne: auth.accountId } })) throw conflict('email_taken');
    set.email = email;
  }

  try {
    await withTx(async (session) => {
      if (Object.keys(set).length) await Account.updateOne({ _id: auth.accountId }, { $set: { ...set, updatedAt: new Date() } }, { session });
      if (Object.keys(prop).length) {
        await Property.updateOne({ _id: auth.propertyId }, { $set: { ...prop, updatedAt: new Date() } }, { session });
        const fields = {};
        if (prop.name !== undefined) fields.propertyName = prop.name;
        if (prop.address !== undefined) fields.address = prop.address;
        if (prop.phone !== undefined) fields.phone = prop.phone;
        await sync.patchAppSettings(auth.propertyId, fields, auth.accountId, session);
      }
    });
  } catch (err) {
    if (err.code === 11000) throw conflict('email_taken');
    throw err;
  }
  return profile(await loadAccount(auth.accountId));
}

/** DELETE /v1/me — the owner deletes the property and all its data; a manager only their account. */
async function deleteAccount(account, plain) {
  await confirmPassword(account, plain);
  await withTx(async (session) => {
    if (account.role === 'owner' && account.propertyId) await purgeProperty(account.propertyId, session);
    await Session.deleteMany({ accountId: account._id }, { session });
    await PasswordReset.deleteMany({ accountId: account._id }, { session });
    await Account.deleteOne({ _id: account._id }, { session });
  });
}

/** Web deletion request (Google Play): email + password, no app needed. */
async function deleteByCredentials(body) {
  const c = new Checker();
  const email = c.email(body, 'email', { required: true });
  const plain = c.secret(body, 'password');
  c.done();
  await attempts.assertNotLocked('login', email);
  const account = await Account.findOne({ email }).lean();
  if (!(await password.verify(plain, account?.passwordHash))) {
    await attempts.recordFailure('login', email);
    throw unauthorized('invalid_credentials');
  }
  await attempts.clearFailures('login', email);
  await deleteAccount(account, plain);
}

/** POST /v1/me/property — an account without a property (removed manager) creates its own. */
async function createOwnProperty(auth, body) {
  if (auth.propertyId) throw conflict('has_property');
  const c = new Checker();
  const input = parseProperty(c, body, 'property');
  c.done();
  const account = auth.account;
  await withTx(async (session) => {
    const { property } = await createProperty(account, input, session);
    await Account.updateOne({ _id: account._id, propertyId: null }, { $set: { propertyId: property._id, role: 'owner', joinedAt: new Date(), updatedAt: new Date() } }, { session });
  });
  const fresh = await loadAccount(account._id);
  return { ...(await profile(fresh)), tokens: await tokens.reissue(fresh, auth.sessionId), ...(await firstPage(fresh)) };
}

// ---------- devices ----------

async function listDevices(auth) {
  const rows = await Session.find({ accountId: auth.accountId, revokedAt: null, absoluteExpiresAt: { $gt: new Date() } }).sort({ lastSeenAt: -1 }).lean();
  return {
    devices: rows.map((s) => ({
      id: s._id,
      name: s.name || '',
      createdAt: iso(s.createdAt),
      lastSeenAt: iso(s.lastSeenAt),
      expiresAt: iso(s.absoluteExpiresAt),
      isCurrent: s._id === auth.sessionId,
    })),
  };
}

async function removeDevice(auth, id) {
  const r = await tokens.revoke({ _id: id, accountId: auth.accountId }, 'removed');
  if (!r.matchedCount) throw notFound();
}

// ---------- invites & members ----------

const presentInvite = (i) => ({
  id: i._id,
  code: i.code,
  role: i.role,
  expiresAt: iso(i.expiresAt),
  createdAt: iso(i.createdAt),
  status: i.revokedAt ? 'revoked' : i.usedAt ? 'used' : i.expiresAt <= new Date() ? 'expired' : 'active',
  usedAt: iso(i.usedAt),
});

async function createInvite(auth, body) {
  const c = new Checker();
  const role = c.oneOf(body, 'role', ['manager'], { def: 'manager' });
  c.done();
  for (let i = 0; i < 5; i += 1) {
    try {
      const inv = await Invite.create({ _id: uuid(), propertyId: auth.propertyId, code: humanCode(8), role, createdBy: auth.accountId, expiresAt: new Date(Date.now() + config.inviteSec * 1000) });
      return presentInvite(inv.toObject());
    } catch (err) {
      if (err.code !== 11000) throw err; // code collision: try another one
    }
  }
  throw new AppError(503, 'service_unavailable');
}

async function listInvites(auth) {
  const rows = await Invite.find({ propertyId: auth.propertyId }).sort({ createdAt: -1 }).limit(50).lean();
  return { invites: rows.map(presentInvite) };
}

async function revokeInvite(auth, id) {
  const r = await Invite.updateOne({ _id: id, propertyId: auth.propertyId, usedAt: null, revokedAt: null }, { $set: { revokedAt: new Date() } });
  if (!r.matchedCount) throw notFound();
}

/** POST /v1/invites/accept { code } — joins the property; returns the new profile and a fresh token pair. */
async function acceptInvite(auth, body) {
  const c = new Checker();
  const code = c.str(body, 'code', { required: true, max: 20 });
  c.done();
  await attempts.assertNotLocked('invite', auth.accountId, 10);
  const account = auth.account;

  await withTx(async (session) => {
    const inv = await findInvite(code, session);
    if (!inv) {
      await attempts.recordFailure('invite', auth.accountId);
      throw invalid([{ field: 'code', code: 'invite_invalid' }]);
    }
    if (account.propertyId === inv.propertyId) throw conflict('already_member');
    if (account.propertyId) {
      // An owner whose property is still empty (just signed up) may leave it; otherwise refuse.
      if (account.role !== 'owner' || !(await isDisposable(account.propertyId, account._id))) throw conflict('already_in_property');
      await purgeProperty(account.propertyId, session);
    }
    const now = new Date();
    const used = await Invite.updateOne({ _id: inv._id, usedAt: null }, { $set: { usedAt: now, usedBy: account._id } }, { session });
    if (!used.modifiedCount) throw invalid([{ field: 'code', code: 'invite_invalid' }]);
    await Account.updateOne({ _id: account._id }, { $set: { propertyId: inv.propertyId, role: inv.role, joinedAt: now, updatedAt: now } }, { session });
  });
  await attempts.clearFailures('invite', auth.accountId);
  const fresh = await loadAccount(account._id);
  return { ...(await profile(fresh)), tokens: await tokens.reissue(fresh, auth.sessionId) };
}

async function listMembers(auth) {
  const rows = await Account.find({ propertyId: auth.propertyId }).sort({ joinedAt: 1 }).lean();
  return {
    members: rows.map((a) => ({ accountId: a._id, displayName: a.displayName, email: a.email, role: a.role, joinedAt: iso(a.joinedAt) })),
  };
}

/** Owner removes a manager, or a manager leaves. Their sessions stay but lose access to the property. */
async function removeMember(auth, accountId) {
  const self = accountId === auth.accountId || accountId === 'me';
  const target = self ? auth.account : await Account.findOne({ _id: accountId, propertyId: auth.propertyId }).lean();
  if (!target) throw notFound();
  if (target.role === 'owner') throw conflict('owner_cannot_leave');
  if (!self && auth.role !== 'owner') throw forbidden('forbidden');
  await Account.updateOne({ _id: target._id, propertyId: auth.propertyId }, { $set: { propertyId: null, role: null, joinedAt: null, updatedAt: new Date() } });
}

module.exports = {
  profile, register, login, refresh, logout, forgot, reset, changePassword, updateMe, deleteAccount, deleteByCredentials,
  createOwnProperty, listDevices, removeDevice, createInvite, listInvites, revokeInvite, acceptInvite, listMembers, removeMember,
};
