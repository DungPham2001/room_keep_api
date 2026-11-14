/**
 * Gives existing owners their login phone = the property phone (accounts created before phone login existed).
 * Skips numbers that are not phone numbers or already used by another account. Safe to re-run.
 *   node scripts/backfill-phones.js [--dry]
 */
const mongoose = require('mongoose');
const config = require('../src/config');
const { Account, Property } = require('../src/models');
const { normalizePhone } = require('../src/lib/util');

async function main() {
  const dry = process.argv.includes('--dry');
  await mongoose.connect(config.mongoUri);
  const owners = await Account.find({ role: 'owner', propertyId: { $ne: null } }).lean();
  for (const a of owners) {
    const p = await Property.findById(a.propertyId).lean();
    const phone = normalizePhone(p?.phone || '') || null;
    if ((a.phone || null) === phone) {
      console.log(`  ${a.email}: already ${phone}`);
      continue;
    }
    if (phone && (await Account.exists({ phone, _id: { $ne: a._id } }))) {
      console.log(`  ${a.email}: ${phone} is used by another account, skipped`);
      continue;
    }
    if (!dry) await Account.updateOne({ _id: a._id }, { $set: { phone, updatedAt: new Date() } });
    console.log(`  ${a.email}: phone -> ${phone}${dry ? ' (dry run)' : ''}`);
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
