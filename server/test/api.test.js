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
  assert.ok(all.body.total >= 45, 'full sample catalogue is seeded'); assert.ok(all.body.facets.materials.includes('Kanjivaram silk')); assert.ok(all.body.facets.categories.length >= 5);
  const sarees = await c('GET', '/products?category=sarees');
  assert.ok(sarees.body.items.length >= 2 && sarees.body.items.every(p => p.category_slug === 'sarees'));
  const silk = (await c('GET', '/products?material=Kanjivaram%20silk&limit=48')).body; assert.ok(silk.total >= 2 && silk.items.every(p => p.material === 'Kanjivaram silk'));
  const cheap = await c('GET', '/products?sort=price-asc&limit=3');
  assert.ok(cheap.body.items[0].price <= cheap.body.items[1].price); assert.equal(cheap.body.pages, Math.ceil(cheap.body.total / 3));
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

test('store settings: empty by default, staff-only to edit, map only for a configured address', async () => {
  const c = client();
  let s = (await c('GET', '/store')).body;
  assert.equal(s.store.address, null); assert.equal(s.map, null, 'no invented location');
  assert.equal((await c('PUT', '/admin/settings/store', { name: 'DHANYA', address: ['1 Main Road'] })).status, 401);
  const shopper = client(); await shopper('POST', '/auth/register', { email: 'nostaff@test.dev', password: 'Password123!' });
  assert.equal((await shopper('PUT', '/admin/settings/store', { name: 'DHANYA', address: ['1 Main Road'] })).status, 403);
  const staff = client(); await staff('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  assert.equal((await staff('PUT', '/admin/settings/store', { name: 'DHANYA', hours: { label: 'x', open: '25:00', close: '20:00', days: [1] } })).status, 400, 'invalid hours rejected');
  const ok = await staff('PUT', '/admin/settings/store', { name: 'DHANYA', address: ['1 Main Road', 'Bengaluru 560001'], phone: '+91 99999 00000', hours: { label: 'Mon–Sun · 10AM–8PM', open: '10:00', close: '20:00', days: [0, 1, 2, 3, 4, 5, 6] } });
  assert.equal(ok.status, 200);
  s = (await c('GET', '/store')).body;
  assert.deepEqual(s.store.address, ['1 Main Road', 'Bengaluru 560001']);
  assert.match(s.map.embedUrl, /google\.com\/maps/); assert.match(s.map.directionsUrl, /destination=/);
  assert.equal((await c('GET', '/pages/privacy')).status, 404, 'unpublished policy is not invented');
  assert.equal((await staff('PUT', '/admin/pages/privacy', { title: 'Privacy', body: 'Policy text' })).status, 200);
  assert.equal((await c('GET', '/pages/privacy')).body.title, 'Privacy');
});

test('catalog exposes a direct-add variant only for single-variant pieces; reviews paginate', async () => {
  const c = client();
  await db.query(`UPDATE product_variants SET stock_quantity = 0 WHERE product_id = (SELECT id FROM products WHERE slug = 'rose-organza-dress') AND size <> 'M'`);
  const p = (await c('GET', '/products?q=Rose%20Organza')).body.items[0];
  assert.equal(p.single_variant, await variantOf('rose-organza-dress', 'M'));
  const multi = (await c('GET', '/products?q=Champagne')).body.items[0];
  assert.equal(multi.single_variant, null);
  const r = (await c('GET', '/reviews?limit=1&page=1')).body;
  assert.equal(r.items.length, 1); assert.equal(r.hasMore, false);
});

test('collections: trending and bridal sarees exist; sample reviews are flagged, labelled and switchable', async () => {
  const c = client();
  const cols = (await c('GET', '/collections')).body.map(x => x.slug);
  assert.ok(cols.includes('trending-sarees') && cols.includes('bridal-silk-sarees'));
  assert.ok((await c('GET', '/products?collection=bridal-silk-sarees&limit=48')).body.total >= 3);
  assert.ok((await c('GET', '/products?category=couple-combos')).body.total >= 5 && (await c('GET', '/products?category=lehengas')).body.total >= 5);
  const { seedDemoReviews } = await import('../db/seed.js');
  await seedDemoReviews(db, () => {}); // also switches the flag on
  const on = (await c('GET', '/reviews?limit=24')).body;
  assert.ok(on.count >= 10 && on.items.some(i => i.demo === true && i.verified === false), 'sample reviews are labelled, never "verified"');
  const staff = client(); await staff('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  assert.equal((await staff('PUT', '/admin/settings/flags', { demoReviews: false })).status, 200);
  const off = (await c('GET', '/reviews?limit=24')).body;
  assert.ok(off.items.every(i => !i.demo), 'switching the flag off hides every sample review');
});

test('store location: exact coordinates drive the map pin and directions', async () => {
  const staff = client(); await staff('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const put = await staff('PUT', '/admin/settings/store', { name: 'DHANYA', address: ['Dhanyas Boutique', 'Kumbakonam'], location: { lat: 10.955736, lng: 79.3927131 }, mapsUrl: 'https://maps.app.goo.gl/w29JhPYvqcJgynb56' });
  assert.equal(put.status, 200);
  const { map } = (await client()('GET', '/store')).body;
  assert.match(map.embedUrl, /10\.955736%2C79\.3927131/); assert.match(map.directionsUrl, /destination=10\.955736%2C79\.3927131/);
  assert.equal(map.placeUrl, 'https://maps.app.goo.gl/w29JhPYvqcJgynb56');
  assert.equal((await staff('PUT', '/admin/settings/store', { name: 'DHANYA', location: { lat: 999, lng: 0 } })).status, 400, 'impossible coordinates rejected');
});

test('admin media: staff-only validated uploads, product galleries, covers and branding', async () => {
  // 1x1 PNG and a few non-images
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  const raw = jar => async (path, body, type) => { const r = await fetch(base + path, { method: 'POST', body, headers: { 'Content-Type': type, 'X-Requested-With': 'dhanya', Cookie: jar() } }); return { status: r.status, body: await r.json().catch(() => null) } };
  const login = async () => { const r = await fetch(base + '/auth/login', { method: 'POST', body: JSON.stringify({ email: 'owner@test.dev', password: 'OwnerPass123!' }), headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'dhanya' } }); return r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') };
  const cookie = await login(); const staff = raw(() => cookie), anon = raw(() => '');
  assert.equal((await anon('/admin/media', PNG, 'image/png')).status, 401);
  const shopper = client(); await shopper('POST', '/auth/register', { email: 'media-shopper@test.dev', password: 'Password123!' });
  assert.equal((await staff('/admin/media', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png')).status, 400, 'fake image rejected');
  assert.equal((await staff('/admin/media', PNG, 'image/jpeg')).status, 400, 'declared type must match the real type');
  const up = await staff('/admin/media?name=test.png', PNG, 'image/png');
  assert.equal(up.status, 201); assert.match(up.body.url, /^\/api\/media\/\d+$/);
  const got = await fetch(base + up.body.url.replace('/api', ''));
  assert.equal(got.status, 200); assert.equal(got.headers.get('content-type'), 'image/png'); assert.match(got.headers.get('cache-control'), /immutable/);
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), PNG, 'served bytes equal uploaded bytes');

  const api = client(); await api('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const list = (await api('GET', '/admin/products?q=Banarasi')).body; assert.ok(list.length >= 1);
  const pId = list.find(p => p.slug === 'banarasi-silk-saree').id;
  const a1 = await api('POST', `/admin/products/${pId}/images`, { url: up.body.url, alt: 'Front' });
  assert.equal(a1.status, 201); assert.equal(a1.body.length, 1);
  const up2 = await staff('/admin/media', PNG, 'image/png');
  const a2 = await api('POST', `/admin/products/${pId}/images`, { url: up2.body.url, alt: 'Detail' });
  assert.deepEqual(a2.body.map(i => i.alt), ['Front', 'Detail']);
  const reordered = await api('PUT', `/admin/products/${pId}/images/order`, { ids: [a2.body[1].id, a2.body[0].id] });
  assert.deepEqual(reordered.body.map(i => i.alt), ['Detail', 'Front']);
  assert.equal((await api('POST', `/admin/products/${pId}/images`, { url: 'javascript:alert(1)' })).status, 400, 'unsafe URLs rejected');
  const pub = (await client()('GET', '/products/banarasi-silk-saree')).body;
  assert.equal(pub.images.length, 2);
  const card = (await client()('GET', '/products?q=Banarasi%20Silk')).body.items.find(p => p.slug === 'banarasi-silk-saree');
  assert.ok(card.image && card.image2, 'cards get a hover image from the second photo');
  const rem = await api('DELETE', `/admin/images/${reordered.body[0].id}`); assert.equal(rem.body.length, 1);
  assert.equal((await fetch(base + up2.body.url.replace('/api', ''))).status, 404, 'orphaned upload is cleaned up');

  const cats = (await api('GET', '/admin/categories')).body; assert.ok(cats.length >= 10);
  assert.equal((await api('PUT', `/admin/categories/${cats[0].id}/image`, { url: up.body.url })).status, 200);
  assert.equal((await client()('GET', '/categories')).body[0].image_url, up.body.url);
  assert.equal((await api('PUT', '/admin/settings/branding', { heroCutout: up.body.url, heroAlt: 'Model' })).status, 200);
  assert.equal((await client()('GET', '/store')).body.branding.heroCutout, up.body.url);
  assert.equal((await shopper('GET', '/admin/products')).status, 403, 'customers cannot manage images');
});
