/**
 * Daily maintenance (Vercel Cron):
 * - hard-deletes tombstones older than TOMBSTONE_DAYS and raises `purgedRev`, so a device whose cursor is older
 *   gets `409 resync_required` instead of silently missing deletions;
 * - removes revoked sessions older than 30 days (expired ones go by TTL).
 */
const config = require('../config');
const { SyncRecord, Property, Session } = require('../models');

async function purgeTombstones() {
  const cutoff = new Date(Date.now() - config.sync.tombstoneDays * 86400000);
  const groups = await SyncRecord.aggregate([
    { $match: { isDeleted: true, serverUpdatedAt: { $lt: cutoff } } },
    { $group: { _id: '$propertyId', maxRev: { $max: '$rev' } } },
  ]);
  let removed = 0;
  for (const g of groups) {
    // Raise purgedRev first: a device pulling meanwhile is told to resync rather than miss a deletion.
    await Property.updateOne({ _id: g._id }, { $max: { purgedRev: g.maxRev } });
    const r = await SyncRecord.deleteMany({ propertyId: g._id, isDeleted: true, rev: { $lte: g.maxRev }, serverUpdatedAt: { $lt: cutoff } });
    removed += r.deletedCount || 0;
  }
  return { properties: groups.length, removed };
}

async function daily() {
  const tombstones = await purgeTombstones();
  const s = await Session.deleteMany({ revokedAt: { $lt: new Date(Date.now() - 30 * 86400000) } });
  return { ok: true, tombstones, revokedSessionsRemoved: s.deletedCount || 0 };
}

module.exports = { daily, purgeTombstones };
