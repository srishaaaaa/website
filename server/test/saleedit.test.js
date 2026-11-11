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
