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
  return async (method, path, body, withHeaders) => {
    const r = await fetch(base + path, { method, body: body && JSON.stringify(body), headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'dhanya', Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); v ? jar.set(k, v) : jar.delete(k) }
    return { status: r.status, body: await r.json().catch(() => null), headers: withHeaders ? Object.fromEntries(r.headers) : undefined };
  };
}
before(async () => { db = await createDb(cfg); await migrate(db, () => {}); await seed(db, cfg, () => {}); server = createApp({ db, cfg }).listen(0); base = `http://localhost:${server.address().port}/api` });
after(async () => { server.close(); await db.close() });

test('photo focus: staff set / clear the part of a photo that stays visible; the storefront receives it', async () => {
  const o = client(); await o('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  await o('POST', '/admin/products', { slug: 'focus-test-saree', name: 'Focus Test Saree', description: '', price: 100000, gst_rate: 5, status: 'active', featured: false, variants: [{ sku: 'FOC-1', size: 'Free Size', color: 'Default', stock: 2 }] });
  const pid = (await o('GET', '/admin/products?q=focus-test')).body.find(p => p.slug === 'focus-test-saree').id;
  const img = (await o('POST', `/admin/products/${pid}/images`, { url: '/api/media/1', alt: 'front' })).body[0];
  assert.equal(img.focusX, null);

  const set = await o('PATCH', `/admin/images/${img.id}`, { focusX: 42, focusY: 18 });
  assert.equal(set.status, 200); assert.deepEqual([set.body[0].focusX, set.body[0].focusY], [42, 18]);
  assert.equal((await o('PATCH', `/admin/images/${img.id}`, { focusX: 42 })).status, 400, 'one value alone is refused');
  assert.equal((await o('PATCH', `/admin/images/${img.id}`, { focusX: 101, focusY: 5 })).status, 400, 'out of range');
  assert.equal((await o('PATCH', `/admin/images/${img.id}`, { alt: 'renamed' })).body[0].focusX, 42, 'changing other fields keeps the focus');
  assert.equal((await o('GET', '/products/focus-test-saree')).body.images[0].focusX, 42);
  assert.equal((await o('GET', '/products?q=Focus%20Test')).body.items.find(p => p.slug === 'focus-test-saree').image_pos, '42% 18%', 'cards get the focus as a CSS position');
  const cleared = await o('PATCH', `/admin/images/${img.id}`, { focusX: null, focusY: null });
  assert.deepEqual([cleared.body[0].focusX, cleared.body[0].focusY], [null, null]);
  assert.equal((await o('GET', '/products?q=Focus%20Test')).body.items.find(p => p.slug === 'focus-test-saree').image_pos, null);
});

test('hero photo focus is validated; product detail endpoint serves colours and sizes to the admin', async () => {
  const o = client(); await o('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const cur = (await o('GET', '/store')).body.branding;
  assert.equal((await o('PUT', '/admin/settings/branding', { ...cur, heroModelPos: '40% 12%' })).status, 200);
  assert.equal((await o('GET', '/store')).body.branding.heroModelPos, '40% 12%');
  assert.equal((await o('PUT', '/admin/settings/branding', { ...cur, heroModelPos: 'top left' })).status, 400);
  await o('PUT', '/admin/settings/branding', { ...cur, heroModelPos: null });

  const list = (await o('GET', '/admin/pos/products?q=Focus%20Test')).body[0];
  const one = await o('GET', `/admin/pos/products/${list.id}`);
  assert.equal(one.status, 200); assert.equal(one.body.slug, 'focus-test-saree'); assert.equal(one.body.variants.length, 1);
  assert.equal((await o('GET', '/admin/pos/products/99999999')).status, 404);
  const shopper = client(); await shopper('POST', '/auth/register', { email: 'focus-shopper@test.dev', password: 'Password123!' });
  assert.equal((await shopper('GET', `/admin/pos/products/${list.id}`)).status, 403);
});

test('CDN caching: public catalogue reads are cacheable, personal and admin responses are not', async () => {
  const c = client();
  for (const path of ['/store', '/categories', '/collections', '/products?limit=3', '/products/focus-test-saree', '/reviews?page=1&limit=3']) {
    const r = await c('GET', path, undefined, true);
    assert.match(r.headers['cache-control'] ?? '', /s-maxage=30/, path);
  }
  for (const path of ['/cart', '/auth/me', '/wishlist', '/reviews/eligible', '/admin/orders', '/health']) {
    const r = await c('GET', path, undefined, true);
    assert.doesNotMatch(r.headers['cache-control'] ?? '', /s-maxage/, path + ' must not be edge-cached');
  }
  const fresh = await c('GET', '/store?_=123', undefined, true);
  assert.equal(fresh.headers['cache-control'], 'no-store', 'a request asking for fresh data is never cached');
  const post = await c('POST', '/newsletter', { email: 'cache@test.dev' }, true);
  assert.doesNotMatch(post.headers['cache-control'] ?? '', /s-maxage/, 'writes are never cached');
});

test('cover positions: staff set the visible part of category / collection covers and storefront photos; the site receives them', async () => {
  const o = client(); await o('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  const cat = (await o('GET', '/admin/categories')).body[0];
  assert.ok('pos' in cat && 'fallback' in cat, 'admin list shows the position and the product photo being used');
  assert.equal((await o('PUT', `/admin/categories/${cat.id}/focus`, { pos: '40% 12%' })).status, 200);
  assert.equal((await o('PUT', `/admin/categories/${cat.id}/focus`, { pos: 'top' })).status, 400);
  assert.equal((await o('PUT', '/admin/categories/99999999/focus', { pos: '1% 1%' })).status, 404);
  assert.equal((await o('GET', '/categories')).body.find(c => c.id === cat.id).image_pos, '40% 12%');
  assert.equal((await o('PUT', `/admin/categories/${cat.id}/focus`, { pos: null })).status, 200);
  assert.equal((await o('GET', '/categories')).body.find(c => c.id === cat.id).image_pos, null);

  const col = (await o('GET', '/admin/collections')).body[0];
  assert.equal((await o('PUT', `/admin/collections/${col.id}/focus`, { pos: '55% 30%' })).status, 200);
  assert.equal((await o('GET', '/admin/collections')).body.find(c => c.id === col.id).pos, '55% 30%');
  assert.equal((await o('GET', '/collections')).body.find(c => c.id === col.id)?.hero_pos ?? '55% 30%', '55% 30%');

  const cur = (await o('GET', '/store')).body.branding;
  assert.equal((await o('PUT', '/admin/settings/branding', { ...cur, textilePos: '30% 70%', editorialPos: '50% 20%', storyPos: '12% 60%' })).status, 200);
  const b = (await o('GET', '/store')).body.branding; assert.deepEqual([b.textilePos, b.editorialPos, b.storyPos], ['30% 70%', '50% 20%', '12% 60%']);
  assert.equal((await o('PUT', '/admin/settings/branding', { ...cur, storyPos: 'left' })).status, 400);
  const shopper = client(); await shopper('POST', '/auth/register', { email: 'cover-shopper@test.dev', password: 'Password123!' });
  assert.equal((await shopper('PUT', `/admin/categories/${cat.id}/focus`, { pos: '1% 1%' })).status, 403);
});
