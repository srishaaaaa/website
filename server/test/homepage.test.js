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
  assert.equal((await owner('PUT', '/admin/settings/homepage', { trending: Array(6).fill('a'), collections: [], categories: [] })).status, 400, 'at most 5 trending products');
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
