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

test('POS settings: shop profile and accent colour are saved and used on bills', async () => {
  const o = client(); await o('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const cur = (await o('GET', '/admin/pos/settings')).body;
  const saved = await o('PUT', '/admin/pos/settings', { ...cur, shopName: 'Dhanya Test Shop', shopAddress: '12 Main Road\nChennai - 600001', shopPhone: '98765 43210', ownerName: 'Asha', accent: '#7e22ce', city: 'Chennai', instagram: 'dhanya.test' });
  assert.equal(saved.status, 200);
  const shop = (await o('GET', '/admin/pos/shop')).body;
  assert.equal(shop.name, 'Dhanya Test Shop'); assert.deepEqual(shop.address, ['12 Main Road', 'Chennai - 600001']); assert.equal(shop.phone, '98765 43210'); assert.equal(shop.accent, '#7e22ce'); assert.equal(shop.ownerName, 'Asha');
  assert.equal((await o('PUT', '/admin/pos/settings', { ...cur, accent: 'purple' })).status, 400, 'only a hex colour is accepted');
  await o('PUT', '/admin/pos/settings', { ...cur, shopName: '', shopAddress: '' });
  assert.notEqual((await o('GET', '/admin/pos/shop')).body.name, 'Dhanya Test Shop', 'blank falls back to the website store details');
  const cashier = client();
  assert.ok([401, 403].includes((await cashier('PUT', '/admin/pos/settings', cur)).status), 'visitors cannot change settings');
});
