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
const stockOf = async id => (await db.query('SELECT stock_quantity AS s FROM product_variants WHERE id = $1', [id])).rows[0].s;
before(async () => { db = await createDb(cfg); await migrate(db, () => {}); await seed(db, cfg, () => {}); server = createApp({ db, cfg }).listen(0); base = `http://localhost:${server.address().port}/api` });
after(async () => { server.close(); await db.close() });

const login = async () => { const o = client(); await o('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' }); return o };
const sale = (o, items, extra = {}) => o('POST', '/admin/pos/sales', { idempotencyKey: 'ret-' + Math.random().toString(36).slice(2), channel: 'retail', items, customerName: 'Asha', customerPhone: '90000 11111', isGst: true, paymentMode: 'cash', ...extra });


test('product weight is saved, and the bag is priced by its total weight through the admin delivery rules', async () => {
  const o = await login();
  const list = (await o('GET', '/admin/pos/products')).body;
  assert.ok(list.every(p => Number.isInteger(p.weightGrams) && p.weightGrams > 0), 'every product has a weight');
  const p = list.find(x => x.stock >= 3 && x.price < 400000) || list[0];
  const body = { name: p.name, price: p.price, taxRate: p.taxRate, categorySlug: p.categorySlug, status: 'active', weightGrams: 700 };
  assert.equal((await o('PATCH', `/admin/pos/products/${p.id}`, body)).status, 200);
  assert.equal((await o('GET', '/admin/pos/products')).body.find(x => x.id === p.id).weightGrams, 700);
  const rules = { enabled: true, note: '', storePin: '', defaultFee: 9900, freeOver: 90_000_000, maxKm: 0, perKmBeyond: 0, bands: [], zones: [], orderTiers: [], blockedPrefixes: [], weightMode: true,
    weightRegions: [{ name: 'All India', active: true, prefixes: [], tiers: [{ minGrams: 0, maxGrams: 1000, fee: 8000 }, { minGrams: 1000, maxGrams: null, fee: 14000 }] }] };
  assert.equal((await o('PUT', '/admin/pos/delivery-rules', rules)).status, 200);
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.productId === p.id && x.stock >= 2);
  const shop = client();
  await shop('POST', '/cart/items', { variantId: v.variantId, quantity: 1 });
  let c = (await shop('GET', '/cart?pin=600028')).body;
  assert.equal(c.shipping.weightGrams, 700); assert.equal(c.shipping.amount, 8000);
  await shop('PATCH', `/cart/items/${v.variantId}`, { quantity: 2 });
  c = (await shop('GET', '/cart?pin=600028')).body;
  assert.equal(c.shipping.weightGrams, 1400); assert.equal(c.shipping.amount, 14000, 'two pieces weigh over 1 kg');
  await o('PUT', '/admin/pos/delivery-rules', { ...rules, enabled: false, weightMode: false });
});
