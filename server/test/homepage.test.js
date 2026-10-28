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
    const r = await fetch(base + path, {
      method, body: body && JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'dhanya', Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); v ? jar.set(k, v) : jar.delete(k) }
    return { status: r.status, body: await r.json().catch(() => null) };
  };
}

before(async () => {
  db = await createDb(cfg); await migrate(db, () => {}); await seed(db, cfg, () => {});
  server = createApp({ db, cfg, payments: {} }).listen(0); base = `http://localhost:${server.address().port}/api`;
});
after(async () => { server.close(); await db.close() });

test('homepage picks: staff only, validated, and served with the public store settings', async () => {
  const pub = client();
  assert.deepEqual((await pub('GET', '/store')).body.homepage, { trending: [], collections: [], categories: [] });
  assert.ok([401, 403].includes((await pub('PUT', '/admin/settings/homepage', { trending: [], collections: [], categories: [] })).status), 'visitors cannot change it');

  const owner = client(); await owner('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const picks = { trending: ['dusk-silk-dress'], collections: ['festive-edit'], categories: ['sarees', 'kurtas'] };
  assert.equal((await owner('PUT', '/admin/settings/homepage', picks)).status, 200);
  assert.deepEqual((await pub('GET', '/store')).body.homepage, picks);
  assert.equal((await owner('PUT', '/admin/settings/homepage', { trending: Array(5).fill('a'), collections: [], categories: [] })).status, 400, 'at most 4 trending products');
  assert.equal((await pub('GET', '/products?slugs=dusk-silk-dress')).body.items[0].slug, 'dusk-silk-dress');
});

test('gallery and videos: up to 6 photos and 6 videos, no more', async () => {
  const owner = client(); await owner('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const social = (await owner('GET', '/store')).body.social;
  const photo = i => ({ image: `/api/media/${i}`, alt: 'p' }), video = i => ({ video: `https://example.com/v${i}.mp4`, alt: 'v' });
  const put = posts => owner('PUT', '/admin/settings/social', { ...social, instagram: { ...social.instagram, posts } });
  const six = f => [1, 2, 3, 4, 5, 6].map(f);
  assert.equal((await put([...six(photo), ...six(video)])).status, 200, '6 photos + 6 videos');
  assert.equal((await put([...six(photo), photo(7)])).status, 400, 'a 7th photo is refused');
  assert.equal((await put([...six(video), video(7)])).status, 400, 'a 7th video is refused');
});

test('collection and category pieces: staff edit membership, order and description; New Arrivals is editable', async () => {
  const pub = client();
  const owner = client(); await owner('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const tx = (await owner('GET', '/admin/taxonomy')).body;
  const festive = tx.collections.find(c => c.slug === 'festive-edit');
  assert.ok(tx.collections.some(c => c.slug === 'new-arrivals'), 'New Arrivals collection exists');
  assert.ok((await owner('GET', `/admin/collections/${tx.collections.find(c => c.slug === 'new-arrivals').id}/products`)).body.length > 0, 'New Arrivals starts with the newest pieces');
  assert.ok([401, 403].includes((await pub('PUT', `/admin/collections/${festive.id}/products`, { slugs: [] })).status), 'visitors cannot change it');

  assert.equal((await owner('PUT', `/admin/collections/${festive.id}/products`, { slugs: ['dusk-silk-dress', 'banarasi-silk-saree'] })).status, 200);
  assert.deepEqual((await owner('GET', `/admin/collections/${festive.id}/products`)).body.map(p => p.slug), ['dusk-silk-dress', 'banarasi-silk-saree']);
  assert.equal((await owner('PATCH', `/admin/collections/${festive.id}`, { description: 'Lights and colour.' })).status, 200);
  assert.equal((await owner('GET', '/admin/taxonomy')).body.collections.find(c => c.id === festive.id).description, 'Lights and colour.');

  const kurtas = tx.categories.find(c => c.slug === 'kurtas');
  const before = (await owner('GET', `/admin/categories/${kurtas.id}/products`)).body.map(p => p.slug);
  assert.equal((await owner('PUT', `/admin/categories/${kurtas.id}/products`, { slugs: [...before, 'dusk-silk-dress'] })).status, 200);
  assert.ok((await owner('GET', `/admin/categories/${kurtas.id}/products`)).body.some(p => p.slug === 'dusk-silk-dress'));
});

test('site text, full product edit, sizes, and stitching measurements on a bill', async () => {
  const pub = client();
  const owner = client(); await owner('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  // Site text
  assert.ok([401, 403].includes((await pub('PUT', '/admin/settings/content', { storyTitle: 'x' })).status));
  assert.equal((await owner('PUT', '/admin/settings/content', { storyTitle: 'Our Story', story: ['One.', 'Two.'], contactTitle: null })).status, 200);
  const c = (await pub('GET', '/store')).body.content;
  assert.equal(c.storyTitle, 'Our Story'); assert.deepEqual(c.story, ['One.', 'Two.']);

  // Product details, collections, sizes
  const p = (await owner('GET', '/admin/pos/products?q=dusk')).body.find(x => x.slug === 'dusk-silk-dress');
  const body = { name: p.name, price: p.price, taxRate: p.taxRate, categorySlug: p.categorySlug, status: p.status, description: 'Soft silk.', material: 'Silk', featured: true, collections: ['evening-edit'] };
  assert.equal((await owner('PATCH', `/admin/pos/products/${p.id}`, body)).status, 200);
  const after = (await owner('GET', `/admin/pos/products/${p.id}`)).body;
  assert.equal(after.description, 'Soft silk.'); assert.equal(after.material, 'Silk'); assert.equal(after.featured, true); assert.deepEqual(after.collections, ['evening-edit']);
  const v = after.variants[0];
  assert.equal((await owner('PATCH', `/admin/pos/products/${p.id}/variants/${v.id}`, { price: 12345, active: false })).status, 200);
  const v2 = (await owner('GET', `/admin/pos/products/${p.id}`)).body.variants.find(x => x.id === v.id);
  assert.equal(v2.priceOverride, 12345); assert.equal(v2.active, false);
  assert.equal((await owner('PATCH', `/admin/pos/products/${p.id}/variants/${v.id}`, { price: null, active: true })).status, 200);
  assert.equal((await owner('GET', `/admin/pos/products/${p.id}`)).body.variants.find(x => x.id === v.id).priceOverride, null);

  // Measurements travel with a service line onto the bill
  const measure = { frontNeck: 'V Neck', backNeck: 'U Neck', sleeveType: 'Puff', sleeveLength: 'Elbow', dueDate: '2026-11-20', cm: { chest: 86, waist: 72.5 }, remarks: ['Cotton lining'] };
  const sale = await owner('POST', '/admin/pos/sales', { idempotencyKey: 'measure-test-key-1', items: [{ name: 'Blouse stitching', price: 80000, qty: 1, taxRate: 5, measure }], paymentMode: 'cash' });
  assert.equal(sale.status, 201, JSON.stringify(sale.body));
  const got = (await owner('GET', `/admin/pos/sales/${sale.body.invoiceNo}`)).body;
  assert.deepEqual((got.sale || got).items[0].variant.measure, measure);
});
