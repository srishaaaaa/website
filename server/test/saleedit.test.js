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
