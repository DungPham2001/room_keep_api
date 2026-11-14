/**
 * Identity comes only from the access token (never from accountId/propertyId in the request).
 * The session and the account are re-read on every request, so logout, password change, device removal,
 * member removal and role changes take effect immediately, before the access token expires.
 */
const { Account, Session } = require('../models');
const { verifyAccess } = require('../services/tokens');
const { asyncHandler, unauthorized, forbidden } = require('../lib/errors');

const TOUCH_MS = 5 * 60 * 1000;

const authenticate = asyncHandler(async (req, _res, next) => {
  const m = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');
  if (!m) throw unauthorized('unauthorized');
  const claims = verifyAccess(m[1]);

  const [session, account] = await Promise.all([
    Session.findById(claims.sid).lean(),
    Account.findById(claims.sub).lean(),
  ]);
  if (!session || session.revokedAt || session.accountId !== claims.sub || !account) throw unauthorized('session_revoked');
  if (session.absoluteExpiresAt <= new Date()) throw unauthorized('session_expired');

  if (Date.now() - new Date(session.lastSeenAt).getTime() > TOUCH_MS) {
    Session.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
  }

  req.auth = {
    accountId: account._id,
    account,
    sessionId: session._id,
    deviceName: session.name || '',
    propertyId: account.propertyId || null, // current value from the DB, not the claim
    role: account.role || null,
  };
  next();
});

const requireProperty = (req, _res, next) => next(req.auth?.propertyId ? undefined : forbidden('no_property'));
const requireOwner = (req, _res, next) => next(req.auth?.role === 'owner' ? undefined : forbidden('forbidden'));

module.exports = { authenticate, requireProperty, requireOwner };
