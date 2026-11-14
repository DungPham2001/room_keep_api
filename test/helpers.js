process.env.NODE_ENV = 'test';
const fs = require('fs');
// Offline machines: reuse a locally installed mongod instead of downloading one.
if (!process.env.MONGOMS_SYSTEM_BINARY && fs.existsSync('/opt/homebrew/bin/mongod')) {
  process.env.MONGOMS_SYSTEM_BINARY = '/opt/homebrew/bin/mongod';
  process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '9.0.4';
}

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const app = require('../src/app');
require('../src/models');

let rs;

async function start() {
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, configSettings: { electionTimeoutMillis: 10000 } } });
  await mongoose.connect(rs.getUri());
  for (const name of mongoose.modelNames()) await mongoose.model(name).syncIndexes();
}
async function stop() {
  await mongoose.disconnect();
  await rs.stop();
}
async function reset() {
  for (const c of await mongoose.connection.db.collections()) await c.deleteMany({});
}

const bearer = (token) => (token ? { Authorization: `Bearer ${token}` } : {});
const api = {
  get: (p, token) => request(app).get(`/v1/${p}`).set(bearer(token)),
  post: (p, body, token) => request(app).post(`/v1/${p}`).set(bearer(token)).send(body || {}),
  patch: (p, body, token) => request(app).patch(`/v1/${p}`).set(bearer(token)).send(body || {}),
  del: (p, body, token) => request(app).delete(`/v1/${p}`).set(bearer(token)).send(body || {}),
};

const PASSWORD = 'matkhau123';

/** Registers an owner; returns the response body (account, property, tokens, changes, rev). */
async function register(email = 'chu@example.com', extra = {}) {
  const res = await api.post('auth/register', {
    account: { email, password: PASSWORD, displayName: 'Chủ trọ' },
    acceptTerms: true,
    property: { name: 'Nhà trọ Hoa Sen', address: '12 Lê Lợi', phone: '0901234567' },
    deviceName: 'Pixel 8',
    ...extra,
  });
  if (res.status !== 201) throw new Error(`register -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

async function login(email, password = PASSWORD, deviceName = 'Phone 2') {
  const res = await api.post('auth/login', { email, password, deviceName });
  if (res.status !== 200) throw new Error(`login -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

module.exports = { start, stop, reset, api, app, register, login, PASSWORD };
