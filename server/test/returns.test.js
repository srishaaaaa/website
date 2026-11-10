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

test('returns: partial then final return add up to the original bill, stock goes back, over-return is refused', async () => {
  const o = await login();
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 6), before = await stockOf(v.variantId);
  const s = (await sale(o, [{ variantId: v.variantId, qty: 3 }], { discountType: 'fixed', discountValue: 1001 })).body;
  assert.equal(s.items[0].returnedQty, 0);
  const itemId = s.items[0].id;
  assert.equal((await o('POST', `/admin/pos/sales/${s.invoiceNo}/returns`, { items: [{ itemId, qty: 4 }], refundMode: 'cash' })).status, 409, 'cannot return more than was sold');
  const r1 = await o('POST', `/admin/pos/sales/${s.invoiceNo}/returns`, { items: [{ itemId, qty: 1 }], reason: 'Wrong size', refundMode: 'upi' });
  assert.equal(r1.status, 201, JSON.stringify(r1.body));
  assert.match(r1.body.returnNo, /^RET-\d{4}-/); assert.equal(r1.body.kept[0].qty, 2); assert.equal(await stockOf(v.variantId), before - 3 + 1);
  const r2 = await o('POST', `/admin/pos/sales/${s.invoiceNo}/returns`, { items: [{ itemId, qty: 2 }], refundMode: 'cash' });
  assert.equal(r2.status, 201); assert.equal(r2.body.kept.length, 0); assert.equal(await stockOf(v.variantId), before);
  assert.equal(r1.body.subtotal + r2.body.subtotal, s.subtotal, 'line values add up');
  assert.equal(r1.body.discount + r2.body.discount, s.discount, 'discount reversed adds up');
  assert.equal(r1.body.tax + r2.body.tax, s.tax, 'tax reversed adds up');
  assert.equal(r1.body.total + r2.body.total, s.total - s.deliveryFee, 'refunds add up to the bill (delivery is not refunded)');
  const again = (await o('GET', `/admin/pos/sales/${s.invoiceNo}`)).body;
  assert.equal(again.items[0].returnedQty, 3); assert.equal(again.returns.length, 2);
  assert.equal((await o('POST', `/admin/pos/sales/${s.invoiceNo}/void`, { reason: 'mistake' })).status, 409, 'a bill with returns cannot be voided');
  assert.equal((await o('POST', `/admin/pos/sales/${s.invoiceNo}/returns`, { items: [{ itemId, qty: 1 }], refundMode: 'cash' })).status, 409);
});

test('returns: public credit note link carries no internal ids; a voided bill cannot take returns', async () => {
  const o = await login(), anon = client();
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 3);
  const s = (await sale(o, [{ variantId: v.variantId, qty: 2 }])).body;
  const ret = (await o('POST', `/admin/pos/sales/${s.invoiceNo}/returns`, { items: [{ itemId: s.items[0].id, qty: 1 }], refundMode: 'card' })).body;
  const pub = await anon('GET', `/invoice/${ret.shareToken}`);
  assert.equal(pub.status, 200); assert.equal(pub.body.kind, 'return'); assert.equal(pub.body.ret.returnNo, ret.returnNo);
  assert.ok(!('id' in pub.body.ret) && !('saleId' in pub.body.ret));
  const orig = (await anon('GET', `/invoice/${s.shareToken}`)).body;
  assert.ok(orig.sale.items.every(i => !('id' in i)), 'original invoice lines have no ids'); assert.equal(orig.sale.returns.length, 1);
  const s2 = (await sale(o, [{ name: 'Custom item', price: 5000, qty: 1, taxRate: 0 }])).body;
  await o('POST', `/admin/pos/sales/${s2.invoiceNo}/void`, { reason: 'test' });
  assert.equal((await o('POST', `/admin/pos/sales/${s2.invoiceNo}/returns`, { items: [{ itemId: s2.items[0].id, qty: 1 }], refundMode: 'cash' })).status, 409);
});
