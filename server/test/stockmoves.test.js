import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../config.js';
import { createDb, migrate } from '../db/index.js';
import { seed } from '../db/seed.js';
import { createApp } from '../app.js';

const cfg = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'test-secret-test-secret-123456', PGLITE_DIR: 'memory', ADMIN_EMAIL: 'owner@test.dev', ADMIN_PASSWORD: 'OwnerPass123!' });
let db, server, base;
function client() {
  const jar = new Map();
  return async (method, path, body) => {
    const r = await fetch(base + path, { method, body: body && JSON.stringify(body), headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'dhanya', Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); v ? jar.set(k, v) : jar.delete(k) }
    return { status: r.status, body: await r.json().catch(() => null) };
  };
}
before(async () => { db = await createDb(cfg); await migrate(db, () => {}); await seed(db, cfg, () => {}); server = createApp({ db, cfg, payments: {} }).listen(0); base = `http://localhost:${server.address().port}/api` });
after(async () => { server.close(); await db.close() });

test('stock movements: every change is listed with the stock before and after, and totals add up', async () => {
  const o = client(); await o('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 5);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const q = `from=${day}&to=${day}&q=${encodeURIComponent(v.sku)}`;
  const before = (await o('GET', `/admin/pos/stock/movements?${q}`)).body;
  assert.equal((await o('POST', '/admin/pos/stock', { variantId: v.variantId, type: 'restock', qty: 7, note: 'delivery' })).status, 200);
  assert.equal((await o('POST', '/admin/pos/stock', { variantId: v.variantId, type: 'loss', qty: 2, note: 'torn' })).status, 200);
  const m = (await o('GET', `/admin/pos/stock/movements?${q}`)).body;
  assert.equal(m.rows.length, before.rows.length + 2);
  const [loss, restock] = m.rows;
  assert.equal(restock.change, 7); assert.equal(restock.after - restock.before, 7); assert.equal(loss.change, -2); assert.equal(loss.before, restock.after, 'levels chain from one movement to the next');
  assert.equal(loss.after, v.stock + 5, 'the last "after" equals the stock now');
  assert.equal(m.summary.lost - before.summary.lost, 2); assert.equal(m.summary.net - before.summary.net, 5);
  assert.equal((await o('GET', `/admin/pos/stock/movements?${q}&type=loss`)).body.rows.every(r => r.reason === 'pos_loss'), true);
  assert.ok([401, 403].includes((await client()('GET', '/admin/pos/stock/movements')).status));
});
