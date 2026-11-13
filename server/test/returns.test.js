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
  assert.equal((await o('POST', `/admin/pos/sales/${s.invoiceNo}/returns`, { items: [{ itemId, qty: 4 }], refundMode: 'cash', approval: { approved: true } })).status, 409, 'cannot return more than was sold');
  const r1 = await o('POST', `/admin/pos/sales/${s.invoiceNo}/returns`, { items: [{ itemId, qty: 1 }], reason: 'Wrong size', refundMode: 'upi', approval: { approved: true } });
  assert.equal(r1.status, 201, JSON.stringify(r1.body));
  assert.match(r1.body.returnNo, /^RTN-\d{8}$/); assert.equal(r1.body.kept[0].qty, 2); assert.equal(await stockOf(v.variantId), before - 3 + 1);
  const r2 = await o('POST', `/admin/pos/sales/${s.invoiceNo}/returns`, { items: [{ itemId, qty: 2 }], refundMode: 'cash', approval: { approved: true } });
  assert.equal(r2.status, 201); assert.equal(r2.body.kept.length, 0); assert.equal(await stockOf(v.variantId), before);
  assert.equal(r1.body.subtotal + r2.body.subtotal, s.subtotal, 'line values add up');
  assert.equal(r1.body.discount + r2.body.discount, s.discount, 'discount reversed adds up');
  assert.equal(r1.body.tax + r2.body.tax, s.tax, 'tax reversed adds up');
  assert.equal(r1.body.total + r2.body.total, s.total - s.deliveryFee, 'refunds add up to the bill (delivery is not refunded)');
  const again = (await o('GET', `/admin/pos/sales/${s.invoiceNo}`)).body;
  assert.equal(again.items[0].returnedQty, 3); assert.equal(again.returns.length, 2);
  assert.equal((await o('POST', `/admin/pos/sales/${s.invoiceNo}/void`, { reason: 'mistake' })).status, 409, 'a bill with returns cannot be voided');
  assert.equal((await o('POST', `/admin/pos/sales/${s.invoiceNo}/returns`, { items: [{ itemId, qty: 1 }], refundMode: 'cash', approval: { approved: true } })).status, 409);
});

test('returns: public credit note link carries no internal ids; a voided bill cannot take returns', async () => {
  const o = await login(), anon = client();
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 3);
  const s = (await sale(o, [{ variantId: v.variantId, qty: 2 }])).body;
  const ret = (await o('POST', `/admin/pos/sales/${s.invoiceNo}/returns`, { items: [{ itemId: s.items[0].id, qty: 1 }], refundMode: 'card', approval: { approved: true } })).body;
  const pub = await anon('GET', `/invoice/${ret.shareToken}`);
  assert.equal(pub.status, 200); assert.equal(pub.body.kind, 'return'); assert.equal(pub.body.ret.returnNo, ret.returnNo);
  assert.ok(!('id' in pub.body.ret) && !('saleId' in pub.body.ret));
  const orig = (await anon('GET', `/invoice/${s.shareToken}`)).body;
  assert.ok(orig.sale.items.every(i => !('id' in i)), 'original invoice lines have no ids'); assert.equal(orig.sale.returns.length, 1);
  const s2 = (await sale(o, [{ name: 'Custom item', price: 5000, qty: 1, taxRate: 0 }])).body;
  await o('POST', `/admin/pos/sales/${s2.invoiceNo}/void`, { reason: 'test' });
  assert.equal((await o('POST', `/admin/pos/sales/${s2.invoiceNo}/returns`, { items: [{ itemId: s2.items[0].id, qty: 1 }], refundMode: 'cash', approval: { approved: true } })).status, 409);
});

test('returns: per-item back-to-stock tick, manual items never touch stock, delivery is not refunded, sequential RTN numbers', async () => {
  const o = await login();
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 6), before = await stockOf(v.variantId);
  const s = (await sale(o, [{ variantId: v.variantId, qty: 2 }, { name: 'Custom stitching', price: 20000, qty: 1, taxRate: 0 }], { deliveryFee: 5000 })).body;
  const a = s.items.find(i => i.name !== 'Custom stitching'), m = s.items.find(i => i.name === 'Custom stitching');
  const post = (items, extra = {}) => o('POST', `/admin/pos/sales/${s.invoiceNo}/returns`, { items, refundMode: 'cash', approval: { approved: true }, ...extra });
  assert.equal((await post([{ itemId: a.id, qty: 1 }], { approval: {} })).status, 403, 'an admin must approve the refund');
  const r1 = await post([{ itemId: a.id, qty: 1, restock: false }, { itemId: m.id, qty: 1, restock: true }]);
  assert.equal(r1.status, 201, JSON.stringify(r1.body));
  assert.equal(await stockOf(v.variantId), before - 2, 'the unticked item stays out of stock and the manual item never touches stock');
  assert.deepEqual(r1.body.returned.map(i => i.backInStock), [false, false]);
  assert.match(r1.body.returnNo, /^RTN-\d{8}$/); assert.ok(r1.body.approvedBy); assert.equal(r1.body.deliveryFee, 5000);
  const r2 = await post([{ itemId: a.id, qty: 1, restock: true }]);
  assert.equal(r2.status, 201); assert.equal(await stockOf(v.variantId), before - 1, 'the ticked item went back');
  assert.equal(Number(r2.body.returnNo.slice(4)), Number(r1.body.returnNo.slice(4)) + 1, 'numbers run in order');
  assert.equal(r1.body.total + r2.body.total, s.total - s.deliveryFee, 'the delivery charge is never refunded');
});

test('returns: split refunds must add up; staff need an admin password; the approving admin is recorded', async () => {
  const o = await login();
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 6);
  const s = (await sale(o, [{ variantId: v.variantId, qty: 2 }])).body;
  const id = s.items[0].id, total = s.total;
  const cash = Math.floor(total / 4);
  const bad = await o('POST', `/admin/pos/sales/${s.invoiceNo}/returns`, { items: [{ itemId: id, qty: 2 }], refundMode: 'split', refundSplit: { cash: 1, upi: 1, card: 1 }, approval: { approved: true } });
  assert.equal(bad.status, 400);
  const staff = client(); await staff('POST', '/auth/register', { email: 'rt-cashier@test.dev', password: 'Password123!' });
  await db.query("UPDATE profiles SET role = 'cashier' WHERE email = 'rt-cashier@test.dev'");
  const items = [{ itemId: id, qty: 2 }], split = { cash, upi: total - cash, card: 0 };
  assert.equal((await staff('POST', `/admin/pos/sales/${s.invoiceNo}/returns`, { items, refundMode: 'split', refundSplit: split })).status, 403, 'no approval');
  assert.equal((await staff('POST', `/admin/pos/sales/${s.invoiceNo}/returns`, { items, refundMode: 'split', refundSplit: split, approval: { adminPassword: 'wrong-password' } })).status, 403);
  const ok = await staff('POST', `/admin/pos/sales/${s.invoiceNo}/returns`, { items, refundMode: 'split', refundSplit: split, approval: { adminPassword: 'OwnerPass123!' } });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.refundCash, cash); assert.equal(ok.body.refundUpi, total - cash); assert.ok(ok.body.approvedBy, 'records who approved');
});

test('returns: the original bill is marked in Order History and on the invoice, and a return links back to it', async () => {
  const o = await login(), anon = client();
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 6);
  const s = (await sale(o, [{ variantId: v.variantId, qty: 2 }])).body;
  const ret = (await o('POST', `/admin/pos/sales/${s.invoiceNo}/returns`, { items: [{ itemId: s.items[0].id, qty: 1 }], refundMode: 'cash', approval: { approved: true } })).body;
  const row = (await o('GET', '/admin/pos/sales?q=' + s.invoiceNo)).body.find(x => x.invoiceNo === s.invoiceNo);
  assert.equal(row.returnCount, 1); assert.equal(row.returnedTotal, ret.total); assert.equal(row.fullyReturned, false, 'one of two came back');
  await o('POST', `/admin/pos/sales/${s.invoiceNo}/returns`, { items: [{ itemId: s.items[0].id, qty: 1 }], refundMode: 'cash', approval: { approved: true } });
  assert.equal((await o('GET', '/admin/pos/sales?q=' + s.invoiceNo)).body[0].fullyReturned, true);
  const orig = (await anon('GET', `/invoice/${s.shareToken}`)).body.sale;
  assert.equal(orig.returns.length, 2); assert.ok(orig.returns.every(r => r.shareToken), 'the original lists its return bills with links');
  assert.equal((await anon('GET', `/invoice/${ret.shareToken}`)).body.ret.origToken, s.shareToken, 'the return links back to the original');
});
