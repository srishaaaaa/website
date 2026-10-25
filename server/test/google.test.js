import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../config.js';
import { createDb, migrate } from '../db/index.js';
import { seed } from '../db/seed.js';
import { createApp } from '../app.js';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const cfg = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'test-secret-test-secret-123456', PGLITE_DIR: 'memory', ADMIN_EMAIL: 'owner@test.dev', ADMIN_PASSWORD: 'OwnerPass123!', GOOGLE_CLIENT_ID: CLIENT_ID });
let db, server, base, realFetch;
let tokens = {}; // credential -> tokeninfo payload (stands in for Google)

before(async () => {
  db = await createDb(cfg); await migrate(db, () => {}); await seed(db, cfg, () => {});
  server = createApp({ db, cfg, payments: {} }).listen(0); base = `http://localhost:${server.address().port}/api`;
  realFetch = globalThis.fetch;
  globalThis.fetch = (url, opts) => {
    if (String(url).startsWith('https://oauth2.googleapis.com/tokeninfo')) {
      const t = tokens[new URL(url).searchParams.get('id_token')];
      return Promise.resolve(new Response(JSON.stringify(t ?? { error: 'invalid_token' }), { status: t ? 200 : 400 }));
    }
    return realFetch(url, opts);
  };
});
after(async () => { globalThis.fetch = realFetch; server.close(); await db.close() });

const post = (credential) => realFetch(base + '/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'dhanya' }, body: JSON.stringify({ credential }) })
  .then(async r => ({ status: r.status, cookie: r.headers.getSetCookie().join(';'), body: await r.json() }));
const good = (o = {}) => ({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'g-1', email: 'new.shopper@test.dev', email_verified: 'true', name: 'New Shopper', ...o });

test('google sign-in: config is public, a genuine token creates then re-uses the account', async () => {
  assert.equal((await (await realFetch(base + '/auth/google/config')).json()).clientId, CLIENT_ID);
  tokens['a'.repeat(30)] = good();
  const first = await post('a'.repeat(30));
  assert.equal(first.status, 200); assert.equal(first.body.user.email, 'new.shopper@test.dev'); assert.equal(first.body.user.role, 'customer'); assert.match(first.cookie, /dhanya_session=/);
  const again = await post('a'.repeat(30));
  assert.equal(again.body.user.id, first.body.user.id);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM profiles WHERE lower(email) = 'new.shopper@test.dev'")).rows[0].n, 1);
});

test('google sign-in: links an existing email account, and rejects bad tokens', async () => {
  tokens['b'.repeat(30)] = good({ sub: 'g-owner', email: 'owner@test.dev', name: 'Owner' });
  const linked = await post('b'.repeat(30));
  assert.equal(linked.status, 200); assert.equal(linked.body.user.role, 'owner', 'same account, keeps its role');

  tokens['c'.repeat(30)] = good({ aud: 'someone-elses-client' });
  assert.equal((await post('c'.repeat(30))).status, 401, 'token issued for another site');
  tokens['d'.repeat(30)] = good({ sub: 'g-2', email: 'x@test.dev', email_verified: 'false' });
  assert.equal((await post('d'.repeat(30))).status, 401, 'unverified email');
  assert.equal((await post('e'.repeat(30))).status, 401, 'unknown token');
});
