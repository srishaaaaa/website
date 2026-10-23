import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadConfig } from '../config.js';
import { createDb, migrate } from '../db/index.js';
import { seed } from '../db/seed.js';
import { createApp } from '../app.js';

const cfg = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'test-secret-test-secret-123456', PGLITE_DIR: 'memory', ADMIN_EMAIL: 'owner@test.dev', ADMIN_PASSWORD: 'OwnerPass123!' });
const SECRET = 'stub-secret';
// Stand-in provider: real HMAC verification, no network.
const payments = {
  name: 'stub', testMode: true, publicConfig: () => ({ keyId: 'stub' }),
  createOrder: async ({ receipt }) => ({ providerOrderId: 'po_' + receipt }),
  verifySignature: ({ orderId, paymentId, signature }) => crypto.createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex') === signature,
  parseWebhook: () => null,
};
let db, server, base;

// Minimal cookie-aware client.
function client() {
  const jar = new Map();
  return async (method, path, body, headers = {}) => {
    const r = await fetch(base + path, {
      method, body: body && JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'dhanya', Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...headers },
    });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); v ? jar.set(k, v) : jar.delete(k) }
    return { status: r.status, body: await r.json().catch(() => null) };
  };
}
const address = { name: 'Test', phone: '9999999999', line1: '1 Main Road', city: 'Bengaluru', state: 'KA', pin: '560001' };
const variantOf = async (slug, size) => (await db.query('SELECT v.id FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.slug = $1 AND v.size = $2 LIMIT 1', [slug, size])).rows[0].id;

before(async () => {
  db = await createDb(cfg); await migrate(db, () => {}); await seed(db, cfg, () => {});
  server = createApp({ db, cfg, payments }).listen(0); base = `http://localhost:${server.address().port}/api`;
});
after(async () => { server.close(); await db.close() });

test('catalog: filters, sort, pagination and facets come from the database', async () => {
  const c = client();
  const all = await c('GET', '/products?limit=48&facets=1');
  assert.equal(all.body.total, 9); assert.ok(all.body.facets.categories.length >= 5);
  const sarees = await c('GET', '/products?category=sarees');
  assert.deepEqual(sarees.body.items.map(p => p.category_slug), ['sarees', 'sarees']);
  const cheap = await c('GET', '/products?sort=price-asc&limit=3');
  assert.ok(cheap.body.items[0].price <= cheap.body.items[1].price); assert.equal(cheap.body.pages, 3);
  const inStock = await c('GET', '/products?stock=1&limit=48');
  assert.ok(!inStock.body.items.some(p => p.slug === 'onyx-anarkali-kurta'), 'sold-out product excluded');
  const sizeL = await c('GET', '/products?size=L&category=kurtas');
  assert.ok(!sizeL.body.items.some(p => p.slug === 'midnight-kurta-set'), 'size L is sold out for that kurta');
  const q = await c('GET', "/products?q=100%25_'"); assert.equal(q.status, 200); assert.equal(q.body.total, 0);
  assert.equal((await c('GET', '/products/nope')).status, 404);
});

test('cart: server-priced, stock-capped, persistent across requests', async () => {
  const c = client(); const v = await variantOf('dusk-silk-dress', 'M'); // stock 3
  assert.equal((await c('POST', '/cart/items', { variantId: v, quantity: 2 })).body.count, 2);
  const cart = (await c('GET', '/cart')).body;
  assert.equal(cart.items[0].price, 1150000); assert.equal(cart.subtotal, 2300000);
  const over = await c('POST', '/cart/items', { variantId: v, quantity: 2 });
  assert.equal(over.status, 409); assert.equal((await c('GET', '/cart')).body.count, 2);
  assert.equal((await c('PATCH', `/cart/items/${v}`, { quantity: 1 })).body.count, 1);
  assert.equal((await c('DELETE', `/cart/items/${v}`)).body.count, 0);
  const soldOut = await variantOf('onyx-anarkali-kurta', 'S');
  assert.equal((await c('POST', '/cart/items', { variantId: soldOut })).status, 409);
});

test('security: CSRF header required, admin routes need a staff role', async () => {
  const c = client();
  assert.equal((await c('POST', '/cart/items', { variantId: 1 }, { 'X-Requested-With': '' })).status, 403);
  assert.equal((await c('GET', '/admin/orders')).status, 401);
  await c('POST', '/auth/register', { email: 'shopper@test.dev', password: 'Password123!' });
  assert.equal((await c('GET', '/admin/orders')).status, 403, 'a signed-in customer is not an admin');
  assert.equal((await c('GET', '/auth/me')).body.user.role, 'customer');
  const staff = client();
  assert.equal((await staff('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' })).status, 200);
  assert.equal((await staff('GET', '/admin/orders')).status, 200);
  assert.equal((await client()('POST', '/auth/login', { email: 'owner@test.dev', password: 'wrong-password' })).status, 401);
});

test('guest cart merges into the customer cart on sign-in', async () => {
  const c = client(); const v = await variantOf('champagne-co-ord', 'S');
  await c('POST', '/cart/items', { variantId: v, quantity: 2 });
  await c('POST', '/auth/register', { email: 'merge@test.dev', password: 'Password123!' });
  assert.equal((await c('GET', '/cart')).body.count, 2);
  const again = client(); await again('POST', '/auth/login', { email: 'merge@test.dev', password: 'Password123!' });
  assert.equal((await again('GET', '/cart')).body.count, 2, 'cart persisted server-side');
});

test('checkout: concurrent buyers cannot oversell the last unit; release restores stock', async () => {
  const v = await variantOf('dusk-silk-dress', 'S'); const stock = async () => (await db.query('SELECT stock_quantity s FROM product_variants WHERE id=$1', [v])).rows[0].s;
  await db.query('UPDATE product_variants SET stock_quantity = 1 WHERE id = $1', [v]);
  const buyers = await Promise.all([1, 2, 3].map(async () => { const c = client(); await c('POST', '/cart/items', { variantId: v }); return c }));
  const results = await Promise.all(buyers.map(c => c('POST', '/checkout', { email: 'x@test.dev', address })));
  const ok = results.filter(r => r.status === 200), failed = results.filter(r => r.status === 409);
  assert.equal(ok.length, 1); assert.equal(failed.length, 2); assert.equal(await stock(), 0);
  const { releaseOrder } = await import('../lib/orders.js');
  assert.equal(await releaseOrder(db, ok[0].body.orderNumber), true); assert.equal(await stock(), 1);
  assert.equal(await releaseOrder(db, ok[0].body.orderNumber), false, 'release is idempotent');
});

test('payments: totals computed server-side; only a valid signature marks an order paid', async () => {
  const c = client(); const v = await variantOf('banarasi-silk-saree', 'M');
  await c('POST', '/cart/items', { variantId: v });
  const co = await c('POST', '/checkout', { email: 'buyer@test.dev', address, total: 1, items: [{ price: 1 }] }); // tampered fields ignored
  assert.equal(co.status, 200); assert.equal(co.body.total, 1850000 + Math.round(1850000 * 0.05)); // free shipping above threshold
  const sign = (o, p) => crypto.createHmac('sha256', SECRET).update(`${o}|${p}`).digest('hex');
  const bad = await c('POST', '/payments/verify', { razorpay_order_id: co.body.providerOrderId, razorpay_payment_id: 'pay_1', razorpay_signature: 'forged' });
  assert.equal(bad.status, 400);
  assert.equal((await db.query('SELECT payment_status p FROM orders WHERE order_number=$1', [co.body.orderNumber])).rows[0].p, 'pending');
  const good = await c('POST', '/payments/verify', { razorpay_order_id: co.body.providerOrderId, razorpay_payment_id: 'pay_1', razorpay_signature: sign(co.body.providerOrderId, 'pay_1') });
  assert.equal(good.body.ok, true);
  assert.equal((await db.query('SELECT payment_status p FROM orders WHERE order_number=$1', [co.body.orderNumber])).rows[0].p, 'paid');
  assert.equal((await c('GET', '/cart')).body.count, 0, 'cart cleared after verified payment');
  const again = await c('POST', '/payments/verify', { razorpay_order_id: co.body.providerOrderId, razorpay_payment_id: 'pay_1', razorpay_signature: sign(co.body.providerOrderId, 'pay_1') });
  assert.equal(again.body.already, true, 'verification is idempotent');
});

test('orders and reviews are scoped to the owner and gated by purchase', async () => {
  const buyer = client(); await buyer('POST', '/auth/register', { email: 'rev@test.dev', password: 'Password123!', name: 'Asha Rao' });
  const v = await variantOf('gold-thread-co-ord', 'M');
  await buyer('POST', '/cart/items', { variantId: v });
  assert.equal((await buyer('POST', '/reviews', { slug: 'gold-thread-co-ord', rating: 5, body: 'Lovely piece, beautifully made.' })).status, 403, 'cannot review before buying');
  const co = await buyer('POST', '/checkout', { email: 'rev@test.dev', address });
  await buyer('POST', '/payments/verify', { razorpay_order_id: co.body.providerOrderId, razorpay_payment_id: 'pay_r', razorpay_signature: crypto.createHmac('sha256', SECRET).update(`${co.body.providerOrderId}|pay_r`).digest('hex') });
  assert.equal((await buyer('GET', '/orders')).body.length, 1);
  const other = client(); await other('POST', '/auth/register', { email: 'other@test.dev', password: 'Password123!' });
  assert.equal((await other('GET', '/orders')).body.length, 0);
  assert.equal((await other('GET', `/orders/${co.body.orderNumber}`)).status, 404);
  assert.equal((await buyer('GET', '/reviews/eligible')).body[0].slug, 'gold-thread-co-ord');
  assert.equal((await buyer('POST', '/reviews', { slug: 'gold-thread-co-ord', rating: 5, body: 'Lovely piece, beautifully made.' })).status, 201);
  assert.equal((await buyer('POST', '/reviews', { slug: 'gold-thread-co-ord', rating: 4, body: 'Second review attempt here.' })).status, 409);
  assert.equal((await client()('GET', '/reviews')).body.count, 0, 'unmoderated reviews are not public');
  const staff = client(); await staff('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const pending = (await staff('GET', '/admin/reviews')).body[0];
  await staff('PATCH', `/admin/reviews/${pending.id}`, { status: 'published' });
  const pub = (await client()('GET', '/reviews')).body;
  assert.equal(pub.count, 1); assert.equal(pub.average, 5); assert.equal(pub.items[0].author, 'Asha R.');
});
