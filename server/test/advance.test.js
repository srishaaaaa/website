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
  return async (method, path, body, headers) => {
    const r = await fetch(base + path, { method, body: body && JSON.stringify(body), headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'dhanya', Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); v ? jar.set(k, v) : jar.delete(k) }
    return { status: r.status, body: await r.json().catch(() => null), headers: headers ? Object.fromEntries(r.headers) : undefined };
  };
}
const stockOf = async id => (await db.query('SELECT stock_quantity AS s FROM product_variants WHERE id = $1', [id])).rows[0].s;
before(async () => { db = await createDb(cfg); await migrate(db, () => {}); await seed(db, cfg, () => {}); server = createApp({ db, cfg }).listen(0); base = `http://localhost:${server.address().port}/api` });
after(async () => { server.close(); await db.close() });

test('advance orders: book with a deposit (no stock taken), then collect the balance: one real invoice, stock taken once, price kept', async () => {
  const o = client(); await o('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 5), before = await stockOf(v.variantId);
  const body = { items: [{ variantId: v.variantId, qty: 2 }, { name: 'Blouse stitching', price: 80000, qty: 1, taxRate: 5 }], customerName: 'Priya', customerPhone: '90000 22222', isGst: true, deposit: 100000, depositMode: 'upi', deliveryDate: '2026-12-01', notes: 'Wedding' };
  assert.equal((await o('POST', '/admin/pos/advances', { ...body, deposit: 999999999 })).status, 400, 'deposit above the total');
  assert.equal((await o('POST', '/admin/pos/advances', { ...body, items: [{ variantId: v.variantId, qty: before + 5 }] })).status, 409, 'not enough stock at booking');
  const adv = await o('POST', '/admin/pos/advances', body);
  assert.equal(adv.status, 201, JSON.stringify(adv.body)); const a = adv.body;
  assert.match(a.code, /^DEP-\d{8}-\d{4}$/); assert.equal(a.status, 'pending'); assert.equal(a.balance, a.total - 100000); assert.equal(a.items.length, 2);
  assert.equal(await stockOf(v.variantId), before, 'booking does not take stock');
  assert.ok((await o('GET', '/admin/pos/advances?status=pending')).body.some(x => x.code === a.code));
  assert.equal((await o('GET', '/admin/pos/sales')).body.length, (await o('GET', '/admin/pos/sales')).body.length);

  assert.equal((await o('PATCH', `/admin/pos/advances/${a.code}/status`, { status: 'ready' })).body.status, 'ready');
  // the catalogue price changes after booking: the booked price still applies
  await db.query('UPDATE products SET base_price = base_price + 50000 WHERE id = $1', [(await db.query('SELECT product_id FROM product_variants WHERE id = $1', [v.variantId])).rows[0].product_id]);
  const fin = await o('POST', `/admin/pos/advances/${a.code}/finalize`, { balanceMode: 'cash' });
  assert.equal(fin.status, 200, JSON.stringify(fin.body));
  assert.equal(fin.body.sale.total, a.total, 'billed at the booked price and terms');
  assert.equal(fin.body.sale.paymentMode, 'split'); assert.equal(fin.body.sale.payUpi, 100000); assert.equal(fin.body.sale.payCash, a.total - 100000);
  assert.equal(fin.body.advance.status, 'completed'); assert.equal(fin.body.advance.invoiceNo, fin.body.sale.invoiceNo);
  assert.equal(await stockOf(v.variantId), before - 2, 'stock is taken when billed');
  assert.match(fin.body.sale.notes, /Advance order DEP-/);
  const again = await o('POST', `/admin/pos/advances/${a.code}/finalize`, { balanceMode: 'cash' });
  assert.equal(again.body.sale.invoiceNo, fin.body.sale.invoiceNo, 'a retry returns the same invoice'); assert.equal(await stockOf(v.variantId), before - 2, 'and does not take stock twice');
  assert.equal((await o('PATCH', `/admin/pos/advances/${a.code}/status`, { status: 'cancelled' })).status, 409, 'a billed order cannot be cancelled');
});

test('advance orders: cancel is owner/admin only; cashiers can book, mark ready and bill', async () => {
  const o = client(); await o('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const cashier = client(); await cashier('POST', '/auth/register', { email: 'adv-cashier@test.dev', password: 'Password123!' }); await db.query("UPDATE profiles SET role = 'cashier' WHERE email = 'adv-cashier@test.dev'");
  const shopper = client(); await shopper('POST', '/auth/register', { email: 'adv-shopper@test.dev', password: 'Password123!' });
  const body = { items: [{ name: 'Lehenga alteration', price: 200000, qty: 1, taxRate: 5 }], deposit: 50000, customerName: 'Meera' };
  assert.equal((await shopper('POST', '/admin/pos/advances', body)).status, 403);
  const a = (await cashier('POST', '/admin/pos/advances', body)).body; assert.equal(a.status, 'pending');
  assert.equal((await cashier('PATCH', `/admin/pos/advances/${a.code}/status`, { status: 'ready' })).status, 200);
  assert.equal((await cashier('PATCH', `/admin/pos/advances/${a.code}/status`, { status: 'cancelled' })).status, 403);
  assert.equal((await o('PATCH', `/admin/pos/advances/${a.code}/status`, { status: 'cancelled' })).body.status, 'cancelled');
  assert.equal((await cashier('POST', `/admin/pos/advances/${a.code}/finalize`, { balanceMode: 'cash' })).status, 409, 'a cancelled order cannot be billed');
  assert.equal((await o('GET', '/admin/pos/advances/DEP-20000101-0001')).status, 404);
  const b = (await cashier('POST', '/admin/pos/advances', { ...body, deposit: 200000, depositMode: 'card' })).body;
  const fin = await cashier('POST', `/admin/pos/advances/${b.code}/finalize`, { balanceMode: 'cash' });
  assert.equal(fin.status, 200); assert.equal(fin.body.sale.paymentMode, 'card', 'fully paid in advance: billed under the deposit mode');
});

test('public invoice link: unguessable token, shows the invoice and shop details, nothing internal, never cached', async () => {
  const o = client(); await o('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 2);
  const s = (await o('POST', '/admin/pos/sales', { idempotencyKey: 'invoice-link-key-1', items: [{ variantId: v.variantId, qty: 1 }], paymentMode: 'cash', customerName: 'Link Customer', customerPhone: '9111100000', customerDob: '1990-01-01', paymentRef: 'secret-ref', isGst: true })).body;
  assert.ok(s.shareToken && s.shareToken.length >= 20 && s.shareToken !== s.invoiceNo, 'token is long and unrelated to the invoice number');
  const anon = client();
  const r = await anon('GET', `/invoice/${s.shareToken}`, undefined, true);
  assert.equal(r.status, 200); assert.equal(r.body.sale.invoiceNo, s.invoiceNo); assert.equal(r.body.sale.items.length, 1); assert.equal(r.headers['cache-control'], 'no-store');
  assert.ok(r.body.shop.name && 'state' in r.body.shop && 'terms' in r.body.shop);
  const text = JSON.stringify(r.body);
  for (const secret of ['secret-ref', '1990-01-01', 'cashier', 'shareToken', 'customerDob', 'paymentRef']) assert.ok(!text.includes(secret), secret + ' must not be exposed');
  assert.equal((await anon('GET', `/invoice/${s.invoiceNo}`)).status, 404, 'the invoice number is not a link');
  assert.equal((await anon('GET', '/invoice/not-a-real-token-123456')).status, 404);
  const other = (await o('POST', '/admin/pos/sales', { idempotencyKey: 'invoice-link-key-2', items: [{ variantId: v.variantId, qty: 1 }], paymentMode: 'upi' })).body;
  assert.notEqual(other.shareToken, s.shareToken);
});

test('invoice settings: state and terms are saved and printed on the shop details', async () => {
  const o = client(); await o('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  assert.equal((await o('GET', '/admin/pos/shop')).body.state, 'Tamil Nadu (33)');
  const cur = (await o('GET', '/admin/pos/settings')).body;
  assert.equal((await o('PUT', '/admin/pos/settings', { ...cur, state: 'Karnataka (29)', terms: 'No returns after 7 days.' })).status, 200);
  const shop = (await o('GET', '/admin/pos/shop')).body; assert.equal(shop.state, 'Karnataka (29)'); assert.equal(shop.terms, 'No returns after 7 days.');
});

test('order history filters and discount report: by name, phone, source; discounted bills listed with their coupon or manual discount', async () => {
  const o = client(); await o('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 6);
  await o('POST', '/admin/pos/coupons', { code: 'HIST10', discountType: 'percent', discountValue: 10 });
  const mk = (key, x) => o('POST', '/admin/pos/sales', { idempotencyKey: key, items: [{ variantId: v.variantId, qty: 1 }], paymentMode: 'cash', ...x });
  const a = (await mk('hist-key-aaa1', { customerName: 'Zoya Khan', customerPhone: '+91 98111 22333', source: 'online', couponCode: 'HIST10' })).body;
  const b = (await mk('hist-key-bbb2', { customerName: 'Ravi', customerPhone: '9000011111', discountType: 'fixed', discountValue: 5000 })).body;
  await mk('hist-key-ccc3', { customerName: 'No Discount' });
  const list = async q => (await o('GET', '/admin/pos/sales?' + q)).body.map(r => r.invoiceNo);
  assert.deepEqual(await list('name=zoya'), [a.invoiceNo]);
  assert.deepEqual(await list('phone=98111'), [a.invoiceNo]);
  assert.deepEqual(await list('phone=9811122333'), [a.invoiceNo], 'formatting of the stored number does not matter');
  assert.ok((await list('source=online')).includes(a.invoiceNo) && !(await list('source=online')).includes(b.invoiceNo));
  assert.ok((await list('source=offline')).includes(b.invoiceNo));
  assert.ok((await o('GET', '/admin/pos/sales?name=zoya')).body[0].shareToken, 'rows carry the link token for WhatsApp / view');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const rep = (await o('GET', `/admin/pos/reports?from=${today}&to=${today}`)).body;
  assert.ok(rep.discountedBills >= 2 && rep.discounts >= a.discount + b.discount);
  const rows = Object.fromEntries(rep.discountedList.map(r => [r.invoiceNo, r]));
  assert.equal(rows[a.invoiceNo].couponCode, 'HIST10'); assert.equal(rows[b.invoiceNo].couponCode, null); assert.equal(rows[b.invoiceNo].discount, 5000);
  assert.ok(!rows[(await list('name=No%20Discount'))[0]], 'bills without a discount are not listed');
});

test('advance orders: split deposit and split balance show on the bill; stock is taken only at completion', async () => {
  const o = client(); await o('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 3), before = await stockOf(v.variantId);
  const body = { items: [{ name: 'Blouse stitching', price: 100000, qty: 1, taxRate: 0 }, { variantId: v.variantId, qty: 1 }], customerName: 'Split Test', customerPhone: '9000033333' };
  // a split that does not add up is refused
  assert.equal((await o('POST', '/admin/pos/advances', { ...body, deposit: 100000, depositMode: 'split', depositSplit: { cash: 50000, upi: 40000 } })).status, 400);
  const adv = (await o('POST', '/admin/pos/advances', { ...body, deposit: 100000, depositMode: 'split', depositSplit: { cash: 50000, upi: 50000 } }));
  assert.equal(adv.status, 201, JSON.stringify(adv.body));
  assert.deepEqual(adv.body.depositSplit, { cash: 50000, upi: 50000, card: 0 });
  assert.equal(await stockOf(v.variantId), before, 'no stock taken at booking');

  const bal = adv.body.total - 100000;
  const split = { cash: Math.floor(bal / 3), upi: Math.floor(bal / 3) }; split.card = bal - split.cash - split.upi;
  const fin = await o('POST', `/admin/pos/advances/${adv.body.code}/finalize`, { balanceMode: 'split', balanceSplit: split });
  assert.equal(fin.status, 200, JSON.stringify(fin.body));
  assert.equal(await stockOf(v.variantId), before - 1, 'stock taken once, at completion');
  const s = fin.body.sale;
  assert.equal(s.paymentMode, 'split');
  assert.deepEqual(s.advance.depositSplit, { cash: 50000, upi: 50000, card: 0 });
  assert.deepEqual(s.advance.balanceSplit, split);
  assert.equal(s.advance.deposit + s.advance.balance, s.total);
  // the public invoice link carries the same breakdown
  const pub = await client()('GET', `/invoice/${s.shareToken}`);
  assert.deepEqual(pub.body.sale.advance.balanceSplit, split);
});
