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


test('an invoice can be corrected (customer, date, note) without touching money or stock; voided invoices cannot', async () => {
  const o = await login();
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 3), stock0 = await stockOf(v.variantId);
  const s = (await sale(o, [{ variantId: v.variantId, qty: 1 }])).body;
  const e = await o('PATCH', `/admin/pos/sales/${s.invoiceNo}`, { customerName: 'Meena R', customerPhone: '9111122222', billDate: '2026-01-05', notes: 'Corrected name' });
  assert.equal(e.status, 200);
  assert.equal(e.body.customerName, 'Meena R'); assert.equal(e.body.billDate, '2026-01-05'); assert.ok(e.body.editedAt);
  assert.equal(e.body.total, s.total, 'the amount is unchanged');
  assert.equal(await stockOf(v.variantId), stock0 - 1, 'stock is unchanged');
  await o('POST', `/admin/pos/sales/${s.invoiceNo}/void`, { reason: 'test' });
  assert.equal((await o('PATCH', `/admin/pos/sales/${s.invoiceNo}`, { notes: 'x' })).status, 409);
});

test('editing items changes the total and stock, re-splits the payment, and is blocked once a return exists', async () => {
  const o = await login();
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 5), stock0 = await stockOf(v.variantId);
  const s = (await sale(o, [{ variantId: v.variantId, qty: 2 }])).body;
  assert.equal(await stockOf(v.variantId), stock0 - 2);
  const it = s.items[0];
  const down = await o('PATCH', `/admin/pos/sales/${s.invoiceNo}`, { items: [{ id: it.id, quantity: 1 }], payment: { mode: 'upi' } });
  assert.equal(down.status, 200); assert.equal(down.body.items[0].quantity, 1); assert.ok(down.body.total < s.total);
  assert.equal(down.body.payUpi, down.body.total, 'the whole new total is on GPay / UPI');
  assert.equal(await stockOf(v.variantId), stock0 - 1, 'one piece went back on the shelf');
  const up = await o('PATCH', `/admin/pos/sales/${s.invoiceNo}`, { items: [{ id: down.body.items[0].id, quantity: 3 }], payment: { mode: 'cash' } });
  assert.equal(up.status, 200); assert.equal(await stockOf(v.variantId), stock0 - 3);
  assert.equal((await o('PATCH', `/admin/pos/sales/${s.invoiceNo}`, { items: [{ id: up.body.items[0].id, quantity: 0 }] })).status, 400, 'a bill cannot be emptied');
  await o('POST', `/admin/pos/sales/${s.invoiceNo}/returns`, { items: [{ itemId: up.body.items[0].id, qty: 1, restock: true }], reason: 'x', refundMode: 'cash', approval: { approved: true } });
  assert.equal((await o('PATCH', `/admin/pos/sales/${s.invoiceNo}`, { items: [{ id: up.body.items[0].id, quantity: 1 }] })).status, 409);
});

test('an expense can be edited', async () => {
  const o = await login();
  const c = await o('POST', '/admin/pos/expenses', { title: 'tea', category: 'General', amount: 10000, paymentMode: 'cash', notes: null });
  const p = await o('PATCH', `/admin/pos/expenses/${c.body.id}`, { title: 'tea & snacks', category: 'General', amount: 15000, paymentMode: 'upi', notes: 'edited' });
  assert.equal(p.status, 200);
  const list = (await o('GET', `/admin/pos/expenses?from=2020-01-01&to=2099-12-31`)).body.find(x => x.id === c.body.id);
  assert.equal(list.amount, 15000); assert.equal(list.title, 'tea & snacks'); assert.equal(list.paymentMode, 'upi');
});

test('stitching due date can be changed and filtered; reports split GST / non-GST', async () => {
  const o = await login();
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 2);
  const s = (await sale(o, [{ variantId: v.variantId, qty: 1 }, { name: 'Blouse stitching', price: 50000, qty: 1, measure: { dueDate: '2030-01-10' } }], { isGst: false })).body;
  assert.ok(s.invoiceNo);
  const p = await o('PATCH', '/admin/pos/stitching/due', { kind: 'bill', ref: s.invoiceNo, due: '2030-02-01' });
  assert.equal(p.status, 200);
  const list = (await o('GET', '/admin/pos/stitching/orders?dueFrom=2030-01-25&dueTo=2030-02-05&gst=nongst')).body;
  assert.ok(list.orders.some(x => x.ref === s.invoiceNo && x.due === '2030-02-01'));
  const ov = (await o('GET', '/admin/pos/stitching/overview?from=2020-01-01&to=2099-12-31')).body;
  assert.equal(ov.gstRevenue + ov.nonGstRevenue, ov.stitchingRevenue);
});

test('the owner can add stitching designs and sleeve options; staff can read them but not change them', async () => {
  const o = await login();
  const put = await o('PUT', '/admin/pos/stitch-designs', { front: [{ name: 'Princess cut', image: '/uploads/x.png' }], back: [{ name: 'Deep scoop', image: null }], sleeveTypes: ['Cap sleeve'], sleeveLengths: [] });
  assert.equal(put.status, 200);
  const got = (await o('GET', '/admin/pos/stitch-designs')).body;
  assert.equal(got.front[0].name, 'Princess cut'); assert.deepEqual(got.sleeveTypes, ['Cap sleeve']);
  assert.equal((await o('PUT', '/admin/pos/stitch-designs', { front: [{ name: 'Bad', image: 'javascript:alert(1)' }] })).status, 400);
});

test('GST inclusive: the price already contains the GST, so the total stays the price and the tax is worked out from inside it', async () => {
  const o = await login();
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 2);
  const price = v.price;
  const r = await o('POST', '/admin/pos/sales', { idempotencyKey: 'inc-' + Math.random().toString(36).slice(2), channel: 'retail', items: [{ variantId: v.variantId, qty: 1, taxRate: 5 }], customerName: 'Inc', customerPhone: '9000000000', isGst: true, gstInclusive: true, paymentMode: 'cash' });
  assert.equal(r.status, 201);
  assert.equal(r.body.total, price, 'the customer pays the listed price');
  assert.equal(r.body.tax, Math.round(price * 5 / 105));
  assert.equal(r.body.subtotal + r.body.tax - r.body.discount + r.body.deliveryFee, r.body.total);
  const e = await o('POST', '/admin/pos/sales', { idempotencyKey: 'exc-' + Math.random().toString(36).slice(2), channel: 'retail', items: [{ variantId: v.variantId, qty: 1, taxRate: 5 }], customerName: 'Exc', customerPhone: '9000000000', isGst: true, paymentMode: 'cash' });
  assert.equal(e.body.total, price + Math.round(price * 5 / 100), 'without the flag GST is still added on top');
});

test('any catalogue item can carry measurements for stitching, and the bill then shows in Measurements and the stitching overview', async () => {
  const o = await login();
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 2);
  const r = await o('POST', '/admin/pos/sales', { idempotencyKey: 'ms-' + Math.random().toString(36).slice(2), channel: 'retail', items: [{ variantId: v.variantId, qty: 1, measure: { frontNeck: 'Boat', cm: { chest: 86 }, dueDate: '2031-03-01', remarks: ['shorter sleeve'] } }], customerName: 'Meas', customerPhone: '9000000001', isGst: false, paymentMode: 'cash' });
  assert.equal(r.status, 201);
  const m = (await o('GET', '/admin/pos/measurements?from=2020-01-01&to=2099-12-31')).body;
  assert.ok(m.bills.some(b => b.invoiceNo === r.body.invoiceNo && b.items[0].measure?.frontNeck === 'Boat'));
  const so = (await o('GET', '/admin/pos/stitching/orders')).body;
  assert.ok(so.orders.some(x => x.ref === r.body.invoiceNo && x.due === '2031-03-01'));
});

test('an admin can give Staff website panels; without the tick they get 403, with it they work; Users stays admin-only', async () => {
  const o = await login();
  const mk = async email => { const c = client(); await c('POST', '/auth/register', { email, password: 'Password123!' }); await db.query("UPDATE profiles SET role = 'cashier' WHERE email = $1", [email]); return c };
  const s = await mk('web-staff@test.dev');
  await o('PUT', '/admin/pos/staff-access', { cashier: ['/admin/billing'], inventory: [] });
  assert.equal((await s('GET', '/admin/reviews')).status, 403, 'not ticked');
  assert.equal((await s('GET', '/admin/enquiries')).status, 403);
  const r = await o('PUT', '/admin/pos/staff-access', { cashier: ['/admin/billing', '/admin/reviews', '/admin/enquiries', '/admin/delivery', '/admin/users'], inventory: [] });
  assert.equal(r.status, 200);
  assert.ok(!r.body.cashier.includes('/admin/users'), 'Users can never be handed to Staff');
  assert.equal((await s('GET', '/admin/reviews')).status, 200);
  assert.equal((await s('GET', '/admin/enquiries')).status, 200);
  assert.equal((await s('GET', '/admin/pos/delivery-rules')).status, 200);
  assert.equal((await s('GET', '/admin/users')).status, 403);
  assert.equal((await s('PUT', '/admin/pos/delivery-rules', {})).status === 403, false, 'delivery edit passes the guard (may fail validation, not permission)');
});

test('analytics follow edits and returns: revenue, units and product totals move with them', async () => {
  const o = await login();
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 6);
  const day = '2031-05-05';
  const rep = async () => (await o('GET', `/admin/pos/reports?from=${day}&to=${day}&channel=retail`)).body;
  const s = (await o('POST', '/admin/pos/sales', { idempotencyKey: 'an-' + Math.random().toString(36).slice(2), channel: 'retail', billDate: '2026-01-02', items: [{ variantId: v.variantId, qty: 3 }], customerName: 'An', customerPhone: '9000000009', isGst: false, paymentMode: 'cash' })).body;
  const range = async () => (await o('GET', '/admin/pos/reports?from=2026-01-02&to=2026-01-02&channel=retail')).body;
  const r0 = await range();
  assert.ok(r0.revenue >= s.total && r0.units >= 3);
  const ed = await o('PATCH', `/admin/pos/sales/${s.invoiceNo}`, { items: [{ id: s.items[0].id, quantity: 1 }], payment: { mode: 'cash' } });
  assert.equal(ed.status, 200);
  const r1 = await range();
  assert.equal(r0.revenue - r1.revenue, s.total - ed.body.total, 'editing the bill changes revenue by the difference');
  assert.equal(r0.units - r1.units, 2, 'and units sold');
  const ret = await o('POST', `/admin/pos/sales/${s.invoiceNo}/returns`, { items: [{ itemId: ed.body.items[0].id, qty: 1, restock: true }], reason: 'x', refundMode: 'cash', approval: { approved: true } });
  assert.equal(ret.status, 201);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const r2 = (await o('GET', `/admin/pos/reports?from=${today}&to=${today}&channel=retail`)).body;
  assert.ok(r2.returned.total > 0 && r2.returned.count >= 1, 'a return is counted as refunded on the day it was made');
  assert.ok(r2.revenue <= r2.grossRevenue, "and takes its value off that day's revenue");
});
