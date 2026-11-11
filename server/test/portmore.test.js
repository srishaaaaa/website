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
const login = async () => { const o = client(); await o('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' }); return o };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

test('reports: a return comes off revenue, GST, payments and units; the bill count stays', async () => {
  const o = await login();
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 4);
  const mk = () => o('POST', '/admin/pos/sales', { idempotencyKey: 'rr-' + Math.random().toString(36).slice(2), channel: 'retail', items: [{ variantId: v.variantId, qty: 2 }], customerName: 'R', customerPhone: '90000 44444', isGst: true, paymentMode: 'cash' });
  const range = `from=${today()}&to=${today()}`;
  const before = (await o('GET', `/admin/pos/reports?${range}`)).body;
  const s = (await mk()).body;
  const mid = (await o('GET', `/admin/pos/reports?${range}`)).body;
  assert.equal(mid.revenue - before.revenue, s.total);
  const ret = (await o('POST', `/admin/pos/sales/${s.invoiceNo}/returns`, { items: [{ itemId: s.items[0].id, qty: 1 }], refundMode: 'cash' })).body;
  const after = (await o('GET', `/admin/pos/reports?${range}`)).body;
  assert.equal(after.revenue, mid.revenue - ret.total, 'revenue is after returns');
  assert.equal(after.grossRevenue, mid.revenue); assert.equal(after.returned.total - before.returned.total, ret.total);
  assert.equal(after.cash, mid.cash - ret.total, 'cash is after the cash refund');
  assert.equal(after.tax, mid.tax - ret.tax); assert.equal(after.units, mid.units - 1); assert.equal(after.bills, mid.bills, 'a return does not change the bill count');
  const pay = (await o('GET', `/admin/pos/reports?${range}&payment=card`)).body; assert.equal(pay.cash, 0, 'payment filter applies');
});

test('delivery rules: PIN zones, order tiers, free-over and blocked PINs change the cart and the order total', async () => {
  const o = await login(), c = client();
  const off = await o('PUT', '/admin/pos/delivery-rules', { enabled: false, defaultFee: 9900, freeOver: 500000, zones: [], orderTiers: [], blockedPrefixes: [] });
  assert.equal(off.status, 200);
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 2 && x.price < 400000);
  await c('POST', '/cart/items', { variantId: v.variantId, quantity: 1 });
  const flat = (await c('GET', '/cart?pin=600001')).body.shipping.amount;
  assert.ok(flat >= 0);
  await o('PUT', '/admin/pos/delivery-rules', { enabled: true, defaultFee: 15000, freeOver: 9_000_000, zones: [{ name: 'Chennai', prefixes: ['600'], fee: 4000 }], orderTiers: [{ minOrder: 1, fee: 12000 }], blockedPrefixes: ['999'] });
  assert.equal((await c('GET', '/cart?pin=600042')).body.shipping.amount, 4000, 'zone fee');
  assert.equal((await c('GET', '/cart?pin=110001')).body.shipping.amount, 12000, 'order tier lowers the default fee');
  assert.equal((await c('GET', '/cart?pin=110001')).body.total, (await c('GET', '/cart?pin=110001')).body.subtotal + 12000);
  const co = await c('POST', '/checkout', { email: 'pin@test.dev', address: { name: 'A', phone: '9000000000', line1: 'x', city: 'y', state: 'z', pin: '999111' } });
  assert.equal(co.status, 400, 'blocked PIN is refused at checkout');
  await o('PUT', '/admin/pos/delivery-rules', { enabled: false, defaultFee: 9900, freeOver: 500000, zones: [], orderTiers: [], blockedPrefixes: [] });
});

test('catalogue: best sellers flag, more-from-category is the same category only, suggestions, customer history', async () => {
  const o = await login(), anon = client();
  const list = (await o('GET', '/admin/pos/products')).body;
  const withCat = list.filter(p => p.categorySlug).slice(0, 2); const p1 = withCat[0];
  assert.equal((await o('PATCH', `/admin/pos/products/${p1.id}`, { name: p1.name, price: p1.price, taxRate: p1.taxRate, categorySlug: p1.categorySlug, status: 'active', bestSeller: true, lowAlert: 7 })).status, 200);
  const best = (await anon('GET', '/products?flag=best')).body;
  assert.ok(best.items.some(i => i.id === p1.id) && best.items.every(i => i.best_seller), 'best sellers filter');
  assert.equal((await o('GET', `/admin/pos/products/${p1.id}`)).body.lowAlert, 7);
  const detail = (await anon('GET', `/products/${p1.slug}`)).body;
  assert.ok(detail.related.every(r => r.category_slug === p1.categorySlug) && detail.related.length <= 8, 'same category only');
  const other = list.find(p => p.id !== p1.id);
  assert.equal((await o('PUT', `/admin/pos/products/${p1.id}/suggested`, { ids: [other.id] })).status, 200);
  assert.deepEqual((await anon('GET', `/products/${p1.slug}`)).body.suggested.map(x => x.id), [other.id]);
  assert.equal((await o('PUT', `/admin/pos/products/${p1.id}/suggested`, { ids: [p1.id] })).status, 400, 'not itself');
  await o('POST', '/admin/pos/sales', { idempotencyKey: 'hist-' + Math.random().toString(36).slice(2), channel: 'retail', items: [{ name: 'Hem', price: 5000, qty: 1, taxRate: 0 }], customerName: 'Hist Customer', customerPhone: '91111 55555', isGst: false, paymentMode: 'cash' });
  const cust = (await o('GET', '/admin/pos/customers?q=Hist')).body.find(c => c.name === 'Hist Customer');
  const h = (await o('GET', `/admin/pos/customers/${cust.id}/history`)).body;
  assert.equal(h.totals.bills, 1); assert.equal(h.invoices.length, 1);
});

test('per-size cost price: a sale line remembers the size cost, falling back to the product cost', async () => {
  const o = await login();
  const p = (await o('GET', '/admin/pos/products')).body.find(x => x.variants.length >= 1 && x.variants[0].stock >= 2);
  const v = p.variants[0];
  await o('PATCH', `/admin/pos/products/${p.id}`, { name: p.name, price: p.price, costPrice: 10000, taxRate: p.taxRate, categorySlug: p.categorySlug, status: 'active' });
  assert.equal((await o('PATCH', `/admin/pos/products/${p.id}/variants/${v.id}`, { cost: 25000 })).status, 200);
  const s = (await o('POST', '/admin/pos/sales', { idempotencyKey: 'vc-' + Math.random().toString(36).slice(2), channel: 'retail', items: [{ variantId: v.id, qty: 1 }], customerName: 'C', customerPhone: '', isGst: false, paymentMode: 'cash' })).body;
  const snap = (await db.query('SELECT cost_snapshot FROM pos_sale_items WHERE sale_id = (SELECT id FROM pos_sales WHERE invoice_no = $1)', [s.invoiceNo])).rows[0].cost_snapshot;
  assert.equal(snap, 25000);
  const back = (await o('GET', `/admin/pos/products/${p.id}`)).body.variants.find(x => x.id === v.id);
  assert.equal(back.costOverride, 25000); assert.equal(back.cost, 25000);
});

test('stitching: overview and orders count bills and open advance orders with measurements', async () => {
  const o = await login();
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d) };
  const line = (name, price, due) => ({ name, price, qty: 1, taxRate: 0, measure: { dueDate: due, cm: { chest: 90 } } });
  const mk = (items, who) => o('POST', '/admin/pos/sales', { idempotencyKey: 'st-' + Math.random().toString(36).slice(2), channel: 'retail', items, customerName: who, customerPhone: '90000 77777', isGst: false, paymentMode: 'cash' });
  const before = (await o('GET', '/admin/pos/stitching/overview')).body;
  const late = (await mk([line('Blouse', 80000, day(-3))], 'Late Lata')).body, today = (await mk([line('Salwar', 90000, day(0))], 'Today Tara')).body;
  await o('POST', '/admin/pos/advances', { items: [line('Bridal blouse', 200000, day(2))], customerName: 'Adv Asha', customerPhone: '90000 88888', isGst: false, deposit: 50000, depositMode: 'cash' });
  const ov = (await o('GET', '/admin/pos/stitching/overview')).body;
  assert.equal(ov.activeOrders - before.activeOrders, 3); assert.equal(ov.overdue - before.overdue, 1); assert.equal(ov.dueToday - before.dueToday, 1);
  assert.equal(ov.openAdvances - before.openAdvances, 1); assert.equal(ov.balanceToCollect - before.balanceToCollect, 150000);
  assert.ok(ov.dueSoon.some(x => x.customerName === 'Adv Asha') && ov.overdueList.some(x => x.customerName === 'Late Lata'));
  await o('PATCH', `/admin/pos/sales/${late.invoiceNo}/tailoring`, { status: 'completed' });
  const ov2 = (await o('GET', `/admin/pos/stitching/overview?from=${day(-1)}&to=${day(0)}`)).body;
  assert.equal(ov2.completed, 1); assert.equal(ov2.stitchingRevenue, 80000); assert.equal(ov2.byGarment[0].name, 'Blouse');
  const list = (await o('GET', '/admin/pos/stitching/orders?name=Today')).body;
  assert.deepEqual(list.orders.map(x => x.ref), [today.invoiceNo]); assert.equal(list.orders[0].status, 'pending');
  assert.ok((await o('GET', '/admin/pos/stitching/orders?status=completed')).body.orders.some(x => x.ref === late.invoiceNo));
});
