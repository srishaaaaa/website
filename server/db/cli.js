import { loadConfig } from '../config.js';
import { createDb, migrate } from './index.js';
import { seed, seedDemoReviews } from './seed.js';

const cmd = process.argv[2];
const cfg = loadConfig();
const db = await createDb(cfg);
try {
  await migrate(db);
  if (cmd === 'seed') { await seed(db, cfg); if (process.argv.includes('--no-sample-reviews') === false) await seedDemoReviews(db) }
  console.log(`Done (${db.kind}).`);
} finally { await db.close() }
