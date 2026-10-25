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
const addr = (o = {}) => ({ label: 'Home', name: 'Asha Rao', phone: '9876543210', line1: '12 Temple Road', city: 'Chennai', state: 'Tamil Nadu', pin: '600001', ...o });

before(async () => {
  db = await createDb(cfg); await migrate(db, () => {}); await seed(db, cfg, () => {});
  server = createApp({ db, cfg, payments: {} }).listen(0); base = `http://localhost:${server.address().port}/api`;
});
after(async () => { server.close(); await db.close() });

test('profile: private to the signed-in customer, details save and validate', async () => {
  assert.equal((await client()('GET', '/auth/profile')).status, 401);
  const c = client(); await c('POST', '/auth/register', { email: 'asha@test.dev', password: 'Password123!' });
  const first = await c('GET', '/auth/profile');
  assert.equal(first.body.profile.hasPassword, true); assert.equal(first.body.profile.hasGoogle, false); assert.deepEqual(first.body.addresses, []);

  const saved = await c('PATCH', '/auth/profile', { name: 'Asha Rao', phone: '+91 98765 43210', birthday: '1994-08-15', gender: 'female' });
  assert.equal(saved.status, 200); assert.equal(saved.body.profile.birthday, '1994-08-15'); assert.equal(saved.body.user.name, 'Asha Rao');
  assert.equal((await c('GET', '/auth/me')).body.user.name, 'Asha Rao');
  assert.equal((await c('PATCH', '/auth/profile', { name: '' })).status, 400);
  assert.equal((await c('PATCH', '/auth/profile', { name: 'A', birthday: '2999-01-01' })).status, 400);
  assert.equal((await c('PATCH', '/auth/profile', { name: 'A', phone: 'abc' })).status, 400);
});

test('addresses: first is the default, one default at a time, scoped to the owner', async () => {
  const c = client(); await c('POST', '/auth/register', { email: 'addr@test.dev', password: 'Password123!' });
  const one = (await c('POST', '/auth/addresses', addr())).body.addresses;
  assert.equal(one.length, 1); assert.equal(one[0].isDefault, true);
  const two = (await c('POST', '/auth/addresses', addr({ label: 'Work', isDefault: true, pin: '600002' }))).body.addresses;
  assert.equal(two.filter(x => x.isDefault).length, 1); assert.equal(two[0].label, 'Work');
  assert.equal((await c('POST', '/auth/addresses', addr({ pin: '12' }))).status, 400);

  const home = two.find(x => x.label === 'Home');
  const edited = (await c('PATCH', `/auth/addresses/${home.id}`, addr({ line1: '99 New Street' }))).body.addresses;
  assert.equal(edited.find(x => x.id === home.id).line1, '99 New Street');
  const swapped = (await c('POST', `/auth/addresses/${home.id}/default`)).body.addresses;
  assert.equal(swapped[0].id, home.id);

  const other = client(); await other('POST', '/auth/register', { email: 'other-addr@test.dev', password: 'Password123!' });
  assert.equal((await other('PATCH', `/auth/addresses/${home.id}`, addr())).status, 404);
  assert.equal((await other('DELETE', `/auth/addresses/${home.id}`)).status, 404);

  const after = (await c('DELETE', `/auth/addresses/${home.id}`)).body.addresses;
  assert.equal(after.length, 1); assert.equal(after[0].isDefault, true, 'another address becomes the default');
});

test('password: the current one is required to change it', async () => {
  const c = client(); await c('POST', '/auth/register', { email: 'pw@test.dev', password: 'Password123!' });
  assert.equal((await c('POST', '/auth/password', { current: 'wrong-password', password: 'NewPassword456!' })).status, 400);
  assert.equal((await c('POST', '/auth/password', { password: 'NewPassword456!' })).status, 400);
  assert.equal((await c('POST', '/auth/password', { current: 'Password123!', password: 'NewPassword456!' })).status, 200);
  assert.equal((await client()('POST', '/auth/login', { email: 'pw@test.dev', password: 'NewPassword456!' })).status, 200);
  assert.equal((await client()('POST', '/auth/login', { email: 'pw@test.dev', password: 'Password123!' })).status, 401);
});
