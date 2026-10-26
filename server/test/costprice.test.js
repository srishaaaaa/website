import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../config.js';
import { createDb, migrate } from '../db/index.js';
import { seed } from '../db/seed.js';
import { createApp } from '../app.js';
import { resetCostCheck } from '../lib/cost.js';

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
const day = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

test('cost price: stock value, cost of goods sold and margin come from the prices you enter, and net profit subtracts them and expenses', async () => {
  const o = client(); await o('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const d = day(); const rep = async () => (await o('GET', `/admin/pos/reports?from=${d}&to=${d}`)).body;
  const r0 = await rep(); assert.equal(r0.costs.enabled, true);

  const created = await o('POST', '/admin/products', { slug: 'cost-test-saree', name: 'Cost Test Saree', price: 100000, cost_price: 60000, gst_rate: 5, status: 'active', variants: [{ sku: 'COST-TEST-1', size: 'Free', color: 'Default', stock: 10 }] });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const p = (await o('GET', '/admin/pos/products?q=cost-test')).body[0];
  assert.equal(p.costPrice, 60000);
  const r1 = await rep();
  assert.equal(r1.costs.stockCost - r0.costs.stockCost, 10 * 60000, 'stock in hand is valued at cost price x quantity');
  assert.equal(r1.costs.stockProducts - r0.costs.stockProducts, 1);

  const v = p.variants[0];
  const sale = await o('POST', '/admin/pos/sales', { idempotencyKey: `cost-${Date.now()}`, items: [{ variantId: v.id, qty: 2 }], paymentMode: 'cash', cashTendered: 100_000_000, isGst: false, discountType: 'fixed', discountValue: 0, deliveryFee: 0 });
  assert.equal(sale.status, 201, JSON.stringify(sale.body));
  const r2 = await rep();
  assert.equal(r2.costs.soldCost - r1.costs.soldCost, 2 * 60000, 'cost of goods sold = cost price x quantity sold');
  assert.equal(r2.costs.margin - r1.costs.margin, 2 * 100000 - 2 * 60000, 'margin = what it sold for - what it cost');
  assert.equal(r2.costs.stockCost, r1.costs.stockCost - 2 * 60000, 'sold units leave the stock value');

  // changing the cost later never rewrites profit already made
  assert.equal((await o('PATCH', `/admin/pos/products/${p.id}`, { name: p.name, price: p.price, costPrice: 90000, taxRate: p.taxRate, categorySlug: p.categorySlug, status: 'active' })).status, 200);
  const r3 = await rep(); assert.equal(r3.costs.soldCost, r2.costs.soldCost, 'past sales keep the cost they were made at');
  assert.equal(r3.costs.stockCost - r2.costs.stockCost, 8 * 30000, 'but stock still in hand is valued at the new cost');

  await o('POST', '/admin/pos/expenses', { title: 'Rent', category: 'Rent', amount: 25000, date: d });
  const r4 = await rep();
  assert.equal(r4.net, r4.revenue - r4.costs.soldCost - r4.expenses, 'net profit = sales - cost of goods - expenses');
  assert.equal(r4.gross, r4.revenue - r4.costs.soldCost);
});

test('cost price: before migration 019 everything still works and cost boxes simply show nothing', async () => {
  const o = client(); await o('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  await db.query('ALTER TABLE products DROP COLUMN cost_price'); await db.query('ALTER TABLE pos_sale_items DROP COLUMN cost_snapshot'); resetCostCheck();
  const d = day();
  const rep = (await o('GET', `/admin/pos/reports?from=${d}&to=${d}`)).body;
  assert.equal(rep.costs.enabled, false); assert.equal(rep.costs.soldCost, 0); assert.equal(rep.net, rep.revenue - rep.expenses);
  const list = (await o('GET', '/admin/pos/products?q=')).body; assert.equal(list[0].costPrice, 0);
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 1);
  assert.equal((await o('POST', '/admin/pos/sales', { idempotencyKey: `nocost-${Date.now()}`, items: [{ variantId: v.variantId, qty: 1 }], paymentMode: 'cash', cashTendered: 100_000_000, isGst: false, discountType: 'fixed', discountValue: 0, deliveryFee: 0 })).status, 201, 'billing still works');
  const p = list[0];
  const clear = await o('PATCH', `/admin/pos/products/${p.id}`, { name: p.name, price: p.price, costPrice: 5000, taxRate: p.taxRate, categorySlug: p.categorySlug, status: p.status });
  assert.equal(clear.status, 409); assert.equal(clear.body.code, 'cost_not_ready', 'saving a cost explains that the update is needed instead of failing silently');
});
