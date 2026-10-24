import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../config.js';
import { createDb, migrate } from '../db/index.js';
import { seed } from '../db/seed.js';
import { createApp } from '../app.js';
import { computeBill, settle } from '../lib/pos.js';

const cfg = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'test-secret-test-secret-123456', PGLITE_DIR: 'memory', ADMIN_EMAIL: 'owner@test.dev', ADMIN_PASSWORD: 'OwnerPass123!' });
let db, server, base;

function client() {
  const jar = new Map();
  return async (method, path, body) => {
    const r = await fetch(base + path, {
      method, body: body && JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'dhanya', Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); v ? jar.set(k, v) : jar.delete(k) }
    return { status: r.status, body: await r.json().catch(() => null) };
  };
}
const stockOf = async id => (await db.query('SELECT stock_quantity AS s FROM product_variants WHERE id = $1', [id])).rows[0].s;
let key = 0; const k = () => `test-key-${Date.now()}-${++key}`;

before(async () => {
  db = await createDb(cfg); await migrate(db, () => {}); await seed(db, cfg, () => {});
  server = createApp({ db, cfg }).listen(0); base = `http://localhost:${server.address().port}/api`;
});
after(async () => { server.close(); await db.close() });

test('bill maths: discount is shared across lines, GST is charged on the discounted value, totals add up exactly', () => {
  const lines = [{ price: 10000, qty: 1, taxRate: 5 }, { price: 3333, qty: 3, taxRate: 12 }];
  const b = computeBill(lines, { isGst: true, discountType: 'percent', discountValue: 10, deliveryFee: 5000 });
  assert.equal(b.subtotal, 10000 + 9999);
  assert.equal(b.discount, Math.round(19999 * 0.1));
  assert.equal(b.lines.reduce((s, l) => s + l.alloc, 0), b.discount, 'allocation sums to the discount');
  assert.equal(b.total, b.subtotal - b.discount + b.tax + 5000);
  assert.equal(computeBill(lines, { isGst: false }).tax, 0);
  assert.throws(() => computeBill(lines, { discountType: 'fixed', discountValue: 99999999 }), /exceed/);
  assert.throws(() => computeBill(lines, { discountType: 'percent', discountValue: 101 }), /100/);
});

test('payment settlement: cash change, short cash, exact split', () => {
  assert.deepEqual(settle(1000, { mode: 'cash', tendered: 1500 }), { cash: 1000, upi: 0, card: 0, tendered: 1500, change: 500 });
  assert.throws(() => settle(1000, { mode: 'cash', tendered: 900 }), /less than/);
  assert.throws(() => settle(1000, { mode: 'split', cash: 400, upi: 400, card: 100 }), /add up/);
  assert.equal(settle(1000, { mode: 'split', cash: 400, upi: 300, card: 300 }).card, 300);
  assert.equal(settle(1000, { mode: 'upi' }).upi, 1000);
});

test('access control: anonymous and customer accounts are refused; cashier can bill but not void or view reports', async () => {
  const anon = client(), shopper = client(), cashier = client(), owner = client();
  assert.equal((await anon('GET', '/admin/pos/catalog')).status, 401);
  await shopper('POST', '/auth/register', { email: 'pos-shopper@test.dev', password: 'Password123!' });
  for (const [m, p] of [['GET', '/admin/pos/catalog'], ['GET', '/admin/pos/sales'], ['GET', '/admin/pos/reports?from=2026-01-01&to=2026-12-31']]) assert.equal((await shopper(m, p)).status, 403, p);
  assert.equal((await shopper('POST', '/admin/pos/sales', {})).status, 403);

  await cashier('POST', '/auth/register', { email: 'cashier@test.dev', password: 'Password123!' });
  await db.query("UPDATE profiles SET role = 'cashier' WHERE email = 'cashier@test.dev'");
  assert.equal((await cashier('GET', '/admin/pos/catalog')).status, 200);
  assert.equal((await cashier('GET', '/admin/pos/reports?from=2026-01-01&to=2026-12-31')).status, 403);
  assert.equal((await cashier('POST', '/admin/pos/sales/DP-2026-000001/void', { reason: 'nope' })).status, 403);
  // admin pages for the online store stay closed to cashiers
  assert.equal((await cashier('GET', '/admin/orders')).status, 403);
  await owner('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  assert.equal((await owner('GET', '/admin/pos/reports?from=2026-01-01&to=2026-12-31')).status, 200);
});

test('checkout: real catalogue search, server-side pricing, stock decrement, invoice, history, report', async () => {
  const owner = client(); await owner('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const found = (await owner('GET', '/admin/pos/catalog?q=saree')).body;
  assert.ok(found.length > 0, 'search returns seeded products');
  const v = found.find(x => x.stock >= 3), before = await stockOf(v.variantId);

  const res = await owner('POST', '/admin/pos/sales', {
    idempotencyKey: k(), items: [{ variantId: v.variantId, qty: 2 }], customerName: 'Walk In', customerPhone: '9999900000',
    isGst: true, discountType: 'fixed', discountValue: 1000, deliveryFee: 0, paymentMode: 'cash', cashTendered: 100_000_000,
    // a tampered client cannot set prices: unknown fields are ignored, price comes from the database
    items0: [{ price: 1 }],
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const s = res.body;
  assert.match(s.invoiceNo, /^DP-\d{4}-\d{6}$/);
  assert.equal(s.items[0].unitPrice, v.price);
  assert.equal(s.subtotal, v.price * 2);
  assert.equal(s.total, s.subtotal - 1000 + s.tax);
  assert.equal(s.change, 100_000_000 - s.total);
  assert.equal(await stockOf(v.variantId), before - 2, 'shared inventory decremented');
  const mv = await db.query("SELECT quantity_change FROM inventory_movements WHERE reference_id = $1 AND reason = 'pos_sale'", [s.invoiceNo]);
  assert.equal(mv.rows[0].quantity_change, -2);

  assert.equal((await owner('GET', `/admin/pos/sales/${s.invoiceNo}`)).body.invoiceNo, s.invoiceNo);
  assert.ok((await owner('GET', '/admin/pos/sales?q=9999900000')).body.some(x => x.invoiceNo === s.invoiceNo));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const rep = (await owner('GET', `/admin/pos/reports?from=${today}&to=${today}`)).body;
  assert.ok(rep.bills >= 1 && rep.revenue >= s.total && rep.cash >= s.total);
  assert.ok(rep.products.some(p => p.name === s.items[0].name));
});

test('failed checkout leaves no sale, no stock change; oversell and bad payments are rejected', async () => {
  const owner = client(); await owner('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const v = (await owner('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 1);
  const before = await stockOf(v.variantId), count = async () => (await db.query('SELECT COUNT(*)::int n FROM pos_sales')).rows[0].n, n0 = await count();
  const base = { items: [{ variantId: v.variantId, qty: v.stock + 1 }], isGst: true, paymentMode: 'upi' };

  const over = await owner('POST', '/admin/pos/sales', { ...base, idempotencyKey: k() });
  assert.equal(over.status, 409); assert.equal(over.body.code, 'insufficient_stock');
  assert.equal(await stockOf(v.variantId), before); assert.equal(await count(), n0, 'sale row rolled back with the stock failure');

  const short = await owner('POST', '/admin/pos/sales', { ...base, items: [{ variantId: v.variantId, qty: 1 }], idempotencyKey: k(), paymentMode: 'cash', cashTendered: 1 });
  assert.equal(short.status, 400); assert.equal(await count(), n0);
  const badSplit = await owner('POST', '/admin/pos/sales', { ...base, items: [{ variantId: v.variantId, qty: 1 }], idempotencyKey: k(), paymentMode: 'split', payments: { cash: 1, upi: 1, card: 1 } });
  assert.equal(badSplit.status, 400);
  assert.equal((await owner('POST', '/admin/pos/sales', { ...base, items: [{ variantId: 99999999, qty: 1 }], idempotencyKey: k() })).status, 409);
  assert.equal((await owner('POST', '/admin/pos/sales', { ...base, items: [{ variantId: v.variantId, qty: 0 }], idempotencyKey: k() })).status, 400);
  assert.equal(await stockOf(v.variantId), before); assert.equal(await count(), n0);
});

test('idempotency: a retried or concurrent checkout creates one bill and decrements stock once', async () => {
  const owner = client(); await owner('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const v = (await owner('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 4), before = await stockOf(v.variantId);
  const body = { idempotencyKey: k(), items: [{ variantId: v.variantId, qty: 1 }], paymentMode: 'card' };
  const [a, b] = await Promise.all([owner('POST', '/admin/pos/sales', body), owner('POST', '/admin/pos/sales', body)]);
  assert.ok([a.status, b.status].every(s => s === 200 || s === 201));
  assert.equal(a.body.invoiceNo, b.body.invoiceNo);
  const c = await owner('POST', '/admin/pos/sales', body);
  assert.equal(c.status, 200); assert.equal(c.body.duplicate, true);
  assert.equal(await stockOf(v.variantId), before - 1);
});

test('void: restocks once, owner/admin only, voided bills leave revenue', async () => {
  const owner = client(); await owner('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const v = (await owner('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 2), before = await stockOf(v.variantId);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const rev0 = (await owner('GET', `/admin/pos/reports?from=${today}&to=${today}`)).body.revenue;
  const s = (await owner('POST', '/admin/pos/sales', { idempotencyKey: k(), items: [{ variantId: v.variantId, qty: 2 }], paymentMode: 'upi' })).body;
  assert.equal(await stockOf(v.variantId), before - 2);
  assert.equal((await owner('POST', `/admin/pos/sales/${s.invoiceNo}/void`, { reason: 'x' })).status, 400, 'reason required');
  const voided = await owner('POST', `/admin/pos/sales/${s.invoiceNo}/void`, { reason: 'Customer returned' });
  assert.equal(voided.status, 200); assert.equal(voided.body.status, 'voided');
  assert.equal(await stockOf(v.variantId), before);
  assert.equal((await owner('POST', `/admin/pos/sales/${s.invoiceNo}/void`, { reason: 'again' })).status, 409);
  assert.equal(await stockOf(v.variantId), before, 'second void does not restock again');
  assert.equal((await owner('GET', `/admin/pos/reports?from=${today}&to=${today}`)).body.revenue, rev0);
});

test('invoice numbers are sequential and unique', async () => {
  const owner = client(); await owner('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const nums = (await db.query("SELECT invoice_no FROM pos_sales WHERE channel = 'retail' ORDER BY id")).rows.map(r => Number(r.invoice_no.slice(-6)));
  nums.forEach((n, i) => assert.equal(n, i + 1));
});

test('wholesale channel: separate DW series, free-text lines, no stock effect, separate analytics', async () => {
  const owner = client(); await owner('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const it = (await owner('POST', '/admin/pos/ws/items', { code: 'SK-102', company: 'Ravi Textiles', colour: 'Navy' })).body;
  assert.ok(it.id);
  assert.equal((await owner('POST', '/admin/pos/ws/items', { code: 'sk-102', company: 'ravi textiles', colour: 'navy' })).status, 409, 'duplicates are rejected case-insensitively');
  assert.equal((await owner('PATCH', `/admin/pos/ws/items/${it.id}`, { code: 'SK-102', company: 'Ravi Textiles', colour: 'Blue' })).body.colour, 'Blue');
  const v = (await owner('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 1), before = await stockOf(v.variantId);

  const bad = await owner('POST', '/admin/pos/sales', { idempotencyKey: k(), channel: 'wholesale', items: [{ variantId: v.variantId, qty: 1 }], paymentMode: 'upi' });
  assert.equal(bad.status, 400, 'wholesale bills cannot draw retail stock');
  const w = await owner('POST', '/admin/pos/sales', { idempotencyKey: k(), channel: 'wholesale', isGst: true, customerName: 'Mehta Traders',
    items: [{ name: 'SK-102 · Ravi Textiles · Blue', price: 25000, qty: 40, taxRate: 5 }], paymentMode: 'upi' });
  assert.equal(w.status, 201, JSON.stringify(w.body)); assert.match(w.body.invoiceNo, /^DW-\d{4}-000001$/);
  assert.equal(w.body.subtotal, 1_000_000); assert.equal(w.body.tax, 50_000);
  assert.equal(await stockOf(v.variantId), before);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const ws = (await owner('GET', `/admin/pos/reports?from=${today}&to=${today}&channel=wholesale`)).body;
  assert.equal(ws.bills, 1); assert.equal(ws.units, 40); assert.equal(ws.customers, 1); assert.equal(ws.revenue, w.body.total);
  assert.ok((await owner('GET', '/admin/pos/sales?channel=wholesale')).body.every(s => s.invoiceNo.startsWith('DW-')));
  assert.ok((await owner('GET', '/admin/pos/sales')).body.every(s => s.invoiceNo.startsWith('DP-')));
});

test('coupons: validated server-side, usage counted, restored on void; free-text retail line; birthdays; settings', async () => {
  const owner = client(); await owner('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  assert.equal((await owner('POST', '/admin/pos/coupons', { code: 'WELCOME10', discountType: 'percent', discountValue: 10, usageLimit: 1 })).status, 201);
  assert.equal((await owner('POST', '/admin/pos/coupons', { code: 'welcome10', discountType: 'percent', discountValue: 10 })).status, 409);
  assert.equal((await owner('POST', '/admin/pos/coupons', { code: 'BAD', discountType: 'percent', discountValue: 150 })).status, 400);
  const v = (await owner('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 3);
  const mk = extra => owner('POST', '/admin/pos/sales', { idempotencyKey: k(), items: [{ variantId: v.variantId, qty: 1 }, { name: 'Hemming', price: 10000, qty: 1, taxRate: 5 }], paymentMode: 'upi', ...extra });
  const a = await mk({ couponCode: 'welcome10', customerName: 'Asha', customerPhone: '9888877777', customerDob: '1990-06-15' });
  assert.equal(a.status, 201, JSON.stringify(a.body)); assert.equal(a.body.discount, Math.round((v.price + 10000) * 0.1)); assert.equal(a.body.couponCode, 'WELCOME10');
  assert.ok(a.body.items.some(i => i.name === 'Hemming' && i.sku === ''));
  assert.equal((await mk({ couponCode: 'WELCOME10' })).status, 400, 'usage limit reached');
  assert.equal((await owner('GET', '/admin/pos/coupons/check?code=NOPE&subtotal=1000')).status, 400);
  await owner('POST', `/admin/pos/sales/${a.body.invoiceNo}/void`, { reason: 'Test void' });
  assert.equal((await mk({ couponCode: 'WELCOME10' })).status, 201, 'void frees the coupon use');

  const near = new Date(Date.now() + 5 * 86400000 + 5.5 * 3600000).toISOString().slice(5, 10);
  await mk({ customerName: 'Soon', customerPhone: '9000011111', customerDob: `1985-${near}` });
  const bd = (await owner('GET', '/admin/pos/birthdays?days=30')).body;
  assert.ok(bd.some(b => b.phone === '9000011111' && b.daysAway >= 4 && b.daysAway <= 6), JSON.stringify(bd));

  assert.equal((await owner('PUT', '/admin/pos/settings', { gstin: 'short' })).status, 400);
  assert.equal((await owner('PUT', '/admin/pos/settings', { gstin: '33ABCDE1234F1Z5', showGstRetail: true, deliveryPresets: [{ name: 'Local', fee: 5000 }] })).status, 200);
  const shop = (await owner('GET', '/admin/pos/shop')).body; assert.equal(shop.gstin, '33ABCDE1234F1Z5'); assert.equal(shop.showGst.retail, true); assert.equal(shop.deliveryPresets[0].fee, 5000);
});

test('users & roles: staff can list, only an owner can change a role (not their own, not another owner)', async () => {
  const owner = client(), shopper = client(); await owner('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  await shopper('POST', '/auth/register', { email: 'roles-shopper@test.dev', password: 'Password123!' });
  assert.equal((await shopper('GET', '/admin/users')).status, 403);
  const list = (await owner('GET', '/admin/users')).body; const me = list.find(u => u.role === 'owner'), them = list.find(u => u.email === 'roles-shopper@test.dev');
  assert.ok(me && them);
  assert.equal((await shopper('PATCH', `/admin/users/${them.id}/role`, { role: 'admin' })).status, 403);
  assert.equal((await owner('PATCH', `/admin/users/${me.id}/role`, { role: 'customer' })).status, 400);
  assert.equal((await owner('PATCH', `/admin/users/${them.id}/role`, { role: 'owner' })).status, 400, 'owner is not an assignable role');
  assert.equal((await owner('PATCH', `/admin/users/${them.id}/role`, { role: 'cashier' })).status, 200);
  assert.equal((await owner('GET', '/admin/users')).body.find(u => u.id === them.id).role, 'cashier');
  assert.equal((await shopper('GET', '/admin/pos/catalog')).status, 200, 'new cashier gets POS access immediately');
});
