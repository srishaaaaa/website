import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// One interface over two drivers:
//   DATABASE_URL set  -> node-postgres pool (Neon, Supabase, RDS, ...)
//   otherwise         -> PGlite, a real Postgres running in-process (zero-install dev + tests)
// Handles expose query(sql, params) -> { rows } and exec(sql). tx(fn) runs fn atomically.
export async function createDb(cfg) {
  if (cfg.DATABASE_URL) {
    const { default: pg } = await import('pg');
    pg.types.setTypeParser(20, v => parseInt(v, 10));   // int8 -> number
    pg.types.setTypeParser(1700, v => parseFloat(v));    // numeric -> number
    const url = new URL(cfg.DATABASE_URL);
    url.searchParams.delete('channel_binding'); // not supported by node-postgres; TLS is still enforced via sslmode
    const opts = { max: 8, idleTimeoutMillis: 30_000 };
    if (cfg.DB_SCHEMA !== 'public') {
      // A dedicated schema keeps DHANYA apart from anything else in the database. search_path is a
      // connection startup option, which poolers (e.g. Neon's -pooler host) reject, so use the direct host.
      url.hostname = url.hostname.replace('-pooler', '');
      const admin = new pg.Client({ connectionString: url.toString() });
      await admin.connect(); await admin.query(`CREATE SCHEMA IF NOT EXISTS ${cfg.DB_SCHEMA}`); await admin.end();
      opts.options = `-c search_path=${cfg.DB_SCHEMA}`;
    }
    const pool = new pg.Pool({ connectionString: url.toString(), ...opts, keepAlive: true, max: Number(process.env.PG_POOL_MAX) || opts.max });
    // Managed Postgres (e.g. Neon) closes idle connections. Without this handler an idle-client reset is an unhandled
    // 'error' event that crashes the whole process; with it the pool simply drops the dead client and reconnects.
    pool.on('error', err => console.error('Idle Postgres client dropped (a new one will be opened):', err.code || err.message));
    const wrap = c => ({ query: (s, p) => c.query(s, p), exec: s => c.query(s) });
    return {
      kind: 'postgres', ...wrap(pool),
      async tx(fn) {
        const c = await pool.connect();
        try { await c.query('BEGIN'); const r = await fn(wrap(c)); await c.query('COMMIT'); return r }
        catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e }
        finally { c.release() }
      },
      close: () => pool.end(),
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = cfg.PGLITE_DIR === 'memory' ? undefined : cfg.PGLITE_DIR;
  if (dir) await fs.mkdir(path.dirname(path.resolve(dir)), { recursive: true });
  const pg = new PGlite(dir); await pg.waitReady;
  const wrap = c => ({ query: (s, p) => c.query(s, p), exec: s => c.exec(s) });
  return { kind: 'pglite', ...wrap(pg), tx: fn => pg.transaction(t => fn(wrap(t))), close: () => pg.close() };
}

// Applies db/migrations/*.sql in order, each in its own transaction, recorded in schema_migrations.
export async function migrate(db, log = console.log) {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const done = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
  const dir = path.join(here, 'migrations');
  const files = (await fs.readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await fs.readFile(path.join(dir, f), 'utf8');
    await db.tx(async t => { await t.exec(sql); await t.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]) });
    log(`migrated ${f}`);
  }
}

export const rows = async (q, sql, params) => (await q.query(sql, params)).rows;
export const one = async (q, sql, params) => (await q.query(sql, params)).rows[0] ?? null;
