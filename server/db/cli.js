import { loadConfig } from '../config.js';
import { createDb, migrate } from './index.js';
import { seed, seedDemoEnquiries, seedDemoReviews } from './seed.js';

const cmd = process.argv[2];
const cfg = loadConfig();
const db = await createDb(cfg);
try {
  await migrate(db);
  // `npm run seed -- --admin-only` creates just the structure and the owner account (no demo products, reviews or enquiries).
  if (cmd === 'seed') {
    const sample = !process.argv.includes('--admin-only');
    await seed(db, cfg, console.log, { sample });
    if (sample) { await seedDemoReviews(db); await seedDemoEnquiries(db) }
  }
  console.log(`Done (${db.kind}).`);
} finally { await db.close() }
