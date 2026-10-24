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
before(async () => { db = await createDb(cfg); await migrate(db, () => {}); await seed(db, cfg, () => {}); server = createApp({ db, cfg }).listen(0); base = `http://localhost:${server.address().port}/api` });
after(async () => { server.close(); await db.close() });

test('colour options: add a colour with sizes, stock and its own price; shoppers see it; photos can be tagged per colour', async () => {
  const o = client(); await o('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const cashier = client(); await cashier('POST', '/auth/register', { email: 'colour-cashier@test.dev', password: 'Password123!' }); await db.query("UPDATE profiles SET role = 'cashier' WHERE email = 'colour-cashier@test.dev'");
  const made = await o('POST', '/admin/products', { slug: 'colour-test-saree', name: 'Colour Test Saree', description: '', price: 500000, gst_rate: 5, status: 'active', featured: false, variants: [{ sku: 'CTS-RED', size: 'Free Size', color: 'Red', stock: 3 }] });
  assert.equal(made.status, 201);
  const prod = async () => (await o('GET', '/admin/pos/products?q=Colour%20Test')).body.find(p => p.slug === 'colour-test-saree');
  const p = await prod();

  assert.equal((await cashier('POST', `/admin/pos/products/${p.id}/colours`, { color: 'Blue', sizes: [{ size: 'Free Size', stock: 1 }] })).status, 403);
  assert.equal((await o('POST', `/admin/pos/products/${p.id}/colours`, { color: 'Blue', sizes: [] })).status, 400);
  assert.equal((await o('POST', `/admin/pos/products/${p.id}/colours`, { color: 'Blue', sizes: [{ size: 'S', stock: 1 }, { size: 's', stock: 1 }] })).status, 400, 'a size listed twice');
  const add = await o('POST', `/admin/pos/products/${p.id}/colours`, { color: 'Wine Purple', price: 549900, sizes: [{ size: 'Free Size', stock: 7 }, { size: 'Petite', stock: 2 }] });
  assert.equal(add.status, 201, JSON.stringify(add.body)); assert.equal(add.body.created, 2);
  assert.equal((await o('POST', `/admin/pos/products/${p.id}/colours`, { color: 'wine purple', sizes: [{ size: 'Free Size', stock: 1 }] })).status, 409, 'same colour twice (any case)');

  const pdp = (await o('GET', '/products/colour-test-saree')).body;
  assert.deepEqual([...new Set(pdp.variants.map(v => v.color))].sort(), ['Red', 'Wine Purple']);
  assert.equal(pdp.variants.find(v => v.color === 'Wine Purple' && v.size === 'Free Size').price, 549900, 'colour has its own price');
  assert.equal(pdp.variants.find(v => v.color === 'Red').price, 500000);
  assert.equal((await o('GET', '/admin/pos/products?q=Colour%20Test')).body[0].stock, 12);
  assert.ok((await o('GET', '/admin/products?q=colour-test')).body.find(x => x.slug === 'colour-test-saree').colors.includes('Wine Purple'));

  // photos: tag one for a colour, leave one for all colours
  const png = '/api/media/1';
  const base1 = await o('POST', `/admin/products/${p.id}/images`, { url: png, alt: 'front' }); assert.equal(base1.status, 201);
  const img = base1.body[0];
  const tagged = await o('PATCH', `/admin/images/${img.id}`, { color: 'Wine Purple' }); assert.equal(tagged.status, 200); assert.equal(tagged.body[0].color, 'Wine Purple');
  assert.equal((await o('PATCH', `/admin/images/${img.id}`, { alt: 'renamed' })).body[0].color, 'Wine Purple', 'changing alt text keeps the colour');
  assert.equal((await o('PATCH', `/admin/images/${img.id}`, {})).status, 400);
  assert.equal((await o('GET', '/products/colour-test-saree')).body.images[0].color, 'Wine Purple');
  assert.equal((await o('PATCH', `/admin/images/${img.id}`, { color: null })).body[0].color, null);

  // billing sells the new colour at its own price
  const v = pdp.variants.find(x => x.color === 'Wine Purple' && x.size === 'Free Size');
  const sale = await o('POST', '/admin/pos/sales', { idempotencyKey: 'colour-sale-key-1', items: [{ variantId: v.id, qty: 1 }], paymentMode: 'upi', isGst: false });
  assert.equal(sale.status, 201); assert.equal(sale.body.subtotal, 549900); assert.equal(sale.body.items[0].variant.color, 'Wine Purple');

  // removing a colour: its sizes go, its photos fall back to "all colours"; the last colour cannot be removed
  await o('PATCH', `/admin/images/${img.id}`, { color: 'Wine Purple' });
  assert.equal((await cashier('DELETE', `/admin/pos/products/${p.id}/colours?color=Red`)).status, 403);
  assert.equal((await o('DELETE', `/admin/pos/products/${p.id}/colours?color=Nope`)).status, 404);
  assert.equal((await o('DELETE', `/admin/pos/products/${p.id}/colours?color=wine%20purple`)).status, 200);
  assert.deepEqual([...new Set((await prod()).variants.map(x => x.color))], ['Red']);
  assert.equal((await o('GET', `/admin/products/${p.id}/images`)).body[0].color, null);
  const last = await o('DELETE', `/admin/pos/products/${p.id}/colours?color=Red`); assert.equal(last.status, 400); assert.equal(last.body.code, 'last_colour');
  assert.equal((await db.query("SELECT COUNT(*)::int n FROM pos_sale_items WHERE name_snapshot = 'Colour Test Saree'")).rows[0].n, 1, 'the past bill is untouched');
});
