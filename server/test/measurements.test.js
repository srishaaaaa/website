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

const sale = (o, items, name) => o('POST', '/admin/pos/sales', { idempotencyKey: 'ms-' + Math.random().toString(36).slice(2), channel: 'retail', items, customerName: name, customerPhone: '90000 33333', isGst: false, paymentMode: 'cash' });
const stitch = { name: 'Blouse stitching', price: 80000, qty: 1, taxRate: 0, measure: { frontNeck: 'Round', backNeck: 'Deep U', sleeveType: 'Short', cm: { chest: 92, waist: 78 }, remarks: ['Extra margin'] } };

test('measurements: only bills with stitching lines are listed, with counts by status; status changes; a voided bill is cancelled', async () => {
  const o = client(); await o('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const plain = (await sale(o, [{ name: 'Plain item', price: 1000, qty: 1, taxRate: 0 }], 'Plain Customer')).body;
  const a = (await sale(o, [stitch], 'Anita Tailor')).body, b = (await sale(o, [stitch], 'Bala Tailor')).body;
  const all = (await o('GET', '/admin/pos/measurements')).body;
  assert.ok(all.bills.some(x => x.invoiceNo === a.invoiceNo)); assert.ok(!all.bills.some(x => x.invoiceNo === plain.invoiceNo), 'a bill without stitching is not listed');
  const got = all.bills.find(x => x.invoiceNo === a.invoiceNo);
  assert.equal(got.status, 'pending'); assert.equal(got.items[0].measure.cm.chest, 92); assert.equal(got.items[0].measure.frontNeck, 'Round');
  assert.equal((await o('PATCH', `/admin/pos/sales/${a.invoiceNo}/tailoring`, { status: 'completed' })).status, 200);
  await o('POST', `/admin/pos/sales/${b.invoiceNo}/void`, { reason: 'test' });
  const after = (await o('GET', '/admin/pos/measurements')).body;
  assert.equal(after.bills.find(x => x.invoiceNo === a.invoiceNo).status, 'completed');
  assert.equal(after.bills.find(x => x.invoiceNo === b.invoiceNo).status, 'cancelled');
  assert.ok(after.counts.completed >= 1 && after.counts.cancelled >= 1 && after.counts.pending >= 0);
  assert.equal((await o('PATCH', `/admin/pos/sales/${b.invoiceNo}/tailoring`, { status: 'pending' })).status, 409, 'a cancelled bill cannot be set back');
  assert.deepEqual((await o('GET', '/admin/pos/measurements?name=Anita')).body.bills.map(x => x.invoiceNo), [a.invoiceNo]);
  assert.deepEqual((await o('GET', '/admin/pos/measurements?status=cancelled')).body.bills.map(x => x.invoiceNo).includes(b.invoiceNo), true);
});
