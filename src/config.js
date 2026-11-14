require('dotenv').config();

const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
const env = process.env.NODE_ENV || 'development';

const jwtSecret = process.env.JWT_SECRET || (env === 'production' ? '' : 'roomkeep-dev-only-secret-do-not-use-in-production');
if (!jwtSecret || (env === 'production' && jwtSecret.length < 32)) {
  throw new Error('JWT_SECRET (>= 32 chars) is required in production');
}

module.exports = {
  env,
  isTest: env === 'test',
  port: num(process.env.PORT, 4000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/roomkeep',
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  timezone: process.env.TIMEZONE || 'Asia/Ho_Chi_Minh',
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),

  apiVersion: '1.0.0',
  minAppVersion: process.env.MIN_APP_VERSION || '1.0.0',
  latestAppVersion: process.env.LATEST_APP_VERSION || process.env.MIN_APP_VERSION || '1.0.0',

  jwt: { secret: jwtSecret, issuer: 'roomkeep-api', audience: 'roomkeep-app' },
  session: {
    accessTtlSec: num(process.env.ACCESS_TOKEN_MINUTES, 120) * 60,
    refreshIdleSec: num(process.env.REFRESH_IDLE_MINUTES, 180) * 60,
    maxAgeSec: num(process.env.SESSION_MAX_HOURS, 12) * 3600,
    maxPerAccount: num(process.env.MAX_SESSIONS_PER_ACCOUNT, 10),
  },
  bcryptRounds: env === 'test' ? 4 : 10,
  resetCodeSec: num(process.env.RESET_CODE_MINUTES, 30) * 60,
  inviteSec: num(process.env.INVITE_HOURS, 48) * 3600,

  smtp: {
    host: env === 'test' ? '' : process.env.SMTP_HOST || '', // tests never send real email
    port: num(process.env.SMTP_PORT, 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'RoomKeep <no-reply@example.com>',
  },

  sync: {
    maxChanges: num(process.env.SYNC_MAX_CHANGES, 500),
    maxRecordBytes: num(process.env.SYNC_MAX_RECORD_KB, 64) * 1024,
    pullDefault: 500,
    pullMax: 1000,
    tombstoneDays: num(process.env.TOMBSTONE_DAYS, 90),
  },

  cronSecret: process.env.CRON_SECRET || '',

  rate: {
    enabled: process.env.RATE_LIMIT !== 'off' && env !== 'test',
    readPerMin: num(process.env.RATE_READ_PER_MIN, 120),
    writePerMin: num(process.env.RATE_WRITE_PER_MIN, 60),
    authPerMin: num(process.env.RATE_AUTH_PER_MIN, 10),
    banAfterViolations: num(process.env.RATE_BAN_AFTER, 30),
    banMinutes: num(process.env.RATE_BAN_MINUTES, 15),
  },
  login: {
    maxFailures: num(process.env.LOGIN_MAX_FAILURES, 5),
    lockSec: num(process.env.LOGIN_LOCK_MINUTES, 15) * 60,
  },
};
