const express = require('express');
const mongoose = require('mongoose');
const config = require('../config');
const { asyncHandler, AppError } = require('../lib/errors');
const { authenticate, requireProperty, requireOwner } = require('../middleware/auth');
const accounts = require('../services/accounts');
const sync = require('../services/sync');
const jobs = require('../services/jobs');
const { iso, safeEqual } = require('../lib/util');

const r = express.Router();
const h = asyncHandler;

// ---------- health (146) ----------
r.get('/health', (_req, res) => {
  const up = mongoose.connection.readyState === 1;
  res.status(up ? 200 : 503).json({
    status: up ? 'ok' : 'degraded',
    apiVersion: config.apiVersion,
    minAppVersion: config.minAppVersion,
    latestAppVersion: config.latestAppVersion,
    serverTime: iso(new Date()),
  });
});

// ---------- auth (137-141, 144) ----------
r.post('/auth/register', h(async (req, res) => {
  const out = await accounts.register(req.body, { lang: req.lang, idempotencyKey: req.get('idempotency-key') });
  res.status(out.status).json(out.body);
}));
r.post('/auth/login', h(async (req, res) => res.json(await accounts.login(req.body))));
r.post('/auth/refresh', h(async (req, res) => res.json(await accounts.refresh(req.body))));
r.post('/auth/logout', h(async (req, res) => {
  // Bearer is optional: an expired access token must not prevent logging out with the refresh token.
  let auth = null;
  if (req.get('authorization')) {
    await new Promise((resolve) => authenticate(req, res, () => resolve()));
    auth = req.auth || null;
  }
  await accounts.logout(req.body, auth);
  res.status(204).end();
}));
r.post('/auth/forgot', h(async (req, res) => res.status(202).json(await accounts.forgot(req.body, { lang: req.lang }))));
r.post('/auth/reset', h(async (req, res) => {
  await accounts.reset(req.body, { lang: req.lang });
  res.status(204).end();
}));
r.post('/auth/change-password', authenticate, h(async (req, res) => res.json(await accounts.changePassword(req.auth, req.body, { lang: req.lang }))));

// ---------- me (142, 143, 159) ----------
r.get('/me', authenticate, h(async (req, res) => res.json(await accounts.profile(req.auth.account))));
r.patch('/me', authenticate, h(async (req, res) => res.json(await accounts.updateMe(req.auth, req.body))));
r.delete('/me', authenticate, h(async (req, res) => {
  await accounts.deleteAccount(req.auth.account, req.body?.password);
  res.status(204).end();
}));
r.post('/me/property', authenticate, h(async (req, res) => res.status(201).json(await accounts.createOwnProperty(req.auth, req.body?.property ?? req.body))));

// ---------- sync (145-152) ----------
r.post('/sync/push', authenticate, requireProperty, h(async (req, res) => res.json(await sync.push(req.auth, req.body))));
r.get('/sync/pull', authenticate, requireProperty, h(async (req, res) => res.json(await sync.pull(req.auth, req.query))));
r.get('/sync/summary', authenticate, requireProperty, h(async (req, res) => res.json(await sync.summary(req.auth))));

// ---------- devices (153) ----------
r.get('/devices', authenticate, h(async (req, res) => res.json(await accounts.listDevices(req.auth))));
r.delete('/devices/:id', authenticate, h(async (req, res) => {
  await accounts.removeDevice(req.auth, req.params.id);
  res.status(204).end();
}));

// ---------- invites & members (154) ----------
r.post('/invites/accept', authenticate, h(async (req, res) => res.json(await accounts.acceptInvite(req.auth, req.body))));
r.post('/invites', authenticate, requireProperty, requireOwner, h(async (req, res) => res.status(201).json(await accounts.createInvite(req.auth, req.body))));
r.get('/invites', authenticate, requireProperty, requireOwner, h(async (req, res) => res.json(await accounts.listInvites(req.auth))));
r.delete('/invites/:id', authenticate, requireProperty, requireOwner, h(async (req, res) => {
  await accounts.revokeInvite(req.auth, req.params.id);
  res.status(204).end();
}));
r.get('/members', authenticate, requireProperty, requireOwner, h(async (req, res) => res.json(await accounts.listMembers(req.auth))));
r.delete('/members/:accountId', authenticate, requireProperty, h(async (req, res) => {
  await accounts.removeMember(req.auth, req.params.accountId);
  res.status(204).end();
}));

// ---------- web deletion request (Google Play), JSON variant ----------
r.post('/account-deletion', h(async (req, res) => {
  await accounts.deleteByCredentials(req.body);
  res.status(204).end();
}));

// ---------- daily job (Vercel Cron) ----------
r.get('/jobs/daily', h(async (req, res) => {
  if (config.cronSecret) {
    const m = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');
    if (!m || !safeEqual(m[1], config.cronSecret)) throw new AppError(401, 'unauthorized');
  }
  res.json(await jobs.daily());
}));

// ---------- CRUD of every business table (rooms, tenants, contracts...) ----------
r.use(require('./crud'));

module.exports = r;
