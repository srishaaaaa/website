import { loadConfig } from './config.js';
import { createDb, migrate } from './db/index.js';
import { createApp } from './app.js';
import { releaseExpired } from './lib/orders.js';

const cfg = loadConfig();
const db = await createDb(cfg);
await migrate(db); // migrations are applied automatically at startup
console.log(`Database: ${db.kind}`);

const app = createApp({ db, cfg });
app.listen(cfg.PORT, () => console.log(`API on :${cfg.PORT}`));

// Reservation policy: unpaid orders give their stock back when the window lapses.
setInterval(() => releaseExpired(db).catch(e => console.error('release failed', e.message)), 5 * 60_000).unref();
