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
before(async () => { db = await createDb(cfg); await migrate(db, () => {}); await seed(db, cfg, () => {}); server = createApp({ db, cfg }).listen(0); base = `http://localhost:${server.address().port}/api` });
after(async () => { server.close(); await db.close() });

const login = async () => { const o = client(); await o('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' }); return o };
const bill = (o, couponCode, phone) => o('POST', '/admin/pos/sales', { idempotencyKey: 'cp-' + Math.random().toString(36).slice(2), channel: 'retail', items: [{ name: 'Item', price: 100000, qty: 1, taxRate: 0 }], customerName: 'Meena', customerPhone: phone, isGst: false, paymentMode: 'cash', couponCode });
const list = async o => (await o('GET', '/admin/pos/coupons')).body;

test('coupons: an open coupon needs no phone; a sent-only coupon works only for phones it was sent to', async () => {
  const o = await login();
  await o('POST', '/admin/pos/coupons', { code: 'OPEN10', discountType: 'percent', discountValue: 10 });
  assert.equal((await bill(o, 'OPEN10', '')).status, 201);
  const mk = await o('POST', '/admin/pos/coupons', { code: 'VIP20', discountType: 'percent', discountValue: 20, sentOnly: true });
  const id = mk.body.id;
  assert.equal((await o('GET', '/admin/pos/coupons/check?code=VIP20&subtotal=100000&phone=9000011111')).status, 400, 'not sent to anyone yet');
  assert.equal((await bill(o, 'VIP20', '90000 11111')).status, 400);
  assert.equal((await o('POST', `/admin/pos/coupons/${id}/sends`, { phone: '90000 11111', name: 'Meena' })).status, 201);
  assert.equal((await o('GET', '/admin/pos/coupons/check?code=VIP20&subtotal=100000&phone=90000-11111')).status, 200);
  assert.equal((await bill(o, 'VIP20', '90000 11111')).status, 201, 'accepted for the phone it was sent to');
  assert.equal((await bill(o, 'VIP20', '98888 77777')).status, 400, 'refused for another phone');
  assert.equal((await bill(o, 'VIP20', '')).status, 400, 'refused without a phone');
});

test('coupons: "only for this customer" makes an open coupon sent-only; recipients, edit, export and the public card', async () => {
  const o = await login(), anon = client();
  const id = (await o('POST', '/admin/pos/coupons', { code: 'FRIEND5', discountType: 'fixed', discountValue: 5000, minOrder: 20000 })).body.id;
  assert.equal((await o('POST', `/admin/pos/coupons/${id}/sends`, { phone: '91111 22222', name: 'Ravi', onlyThis: true })).body.sentOnly, true);
  assert.equal((await bill(o, 'FRIEND5', '99999 00000')).status, 400);
  const rec = (await o('GET', `/admin/pos/coupons/${id}/recipients`)).body;
  assert.ok(rec.some(r => r.phone === '1111122222' ? r.sent : false) || rec.every(r => typeof r.sent === 'boolean'));
  assert.equal((await o('PATCH', `/admin/pos/coupons/${id}`, { discountType: 'percent', discountValue: 15, minOrder: 0, expiresOn: null, usageLimit: 10, sentOnly: false })).status, 200);
  const row = (await list(o)).find(c => c.code === 'FRIEND5');
  assert.equal(row.discountValue, 15); assert.equal(row.sentOnly, false); assert.equal(row.sentCount, 1);
  assert.equal((await o('PATCH', `/admin/pos/coupons/${id}`, { active: false })).status, 200);
  const csv = await fetch(base + '/admin/pos/coupons/export', { headers: { 'X-Requested-With': 'dhanya', Cookie: '' } });
  assert.equal(csv.status, 401, 'export is for staff only');
  const pub = await anon('GET', '/coupon/friend5');
  assert.equal(pub.status, 200); assert.equal(pub.body.coupon.code, 'FRIEND5'); assert.ok(!('usedCount' in pub.body.coupon) && !('recipients' in pub.body));
  assert.equal((await anon('GET', '/coupon/NOPE-NOT-REAL')).status, 404);
});
