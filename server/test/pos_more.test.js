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
let n = 0; const k = () => `more-key-${Date.now()}-${++n}`;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const owner = async () => { const c = client(); await c('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' }); return c };
const asRole = async (email, role) => { const c = client(); await c('POST', '/auth/register', { email, password: 'Password123!' }); await db.query('UPDATE profiles SET role = $2 WHERE email = $1', [email, role]); return c };

before(async () => { db = await createDb(cfg); await migrate(db, () => {}); await seed(db, cfg, () => {}); server = createApp({ db, cfg }).listen(0); base = `http://localhost:${server.address().port}/api` });
after(async () => { server.close(); await db.close() });

test('bill details: past date, online source, flat GST, address; customer is saved; future date refused', async () => {
  const o = await owner(); const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 3);
  const mk = x => o('POST', '/admin/pos/sales', { idempotencyKey: k(), items: [{ variantId: v.variantId, qty: 1 }], paymentMode: 'upi', ...x });
  assert.equal((await mk({ billDate: '2999-01-01' })).status, 400);
  const s = await mk({ billDate: '2026-03-05', source: 'online', isGst: true, gstRate: 12, customerName: 'Asha Rao', customerPhone: '+91 98765-43210', customerAddress: '12 Temple Rd, Kumbakonam' });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.equal(s.body.billDate, '2026-03-05'); assert.equal(s.body.source, 'online'); assert.equal(s.body.gstRate, 12); assert.equal(s.body.tax, Math.round(v.price * 0.12)); assert.equal(s.body.customerAddress, '12 Temple Rd, Kumbakonam');
  const c = (await o('GET', '/admin/pos/customers/lookup?phone=9876543210')).body;
  assert.equal(c.name, 'Asha Rao'); assert.equal(c.phone, '9876543210', 'stored as the last 10 digits');
  const nongst = await mk({ isGst: false, gstRate: 18 });
  assert.equal(nongst.body.tax, 0); assert.equal(nongst.body.gstRate, null, 'GST rate is ignored on a non-GST bill');
});

test('analytics: GST / non-GST split, offline vs online, expenses and net earnings, charts, coupon usage', async () => {
  const o = await owner(); const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 6);
  const mk = x => o('POST', '/admin/pos/sales', { idempotencyKey: k(), items: [{ variantId: v.variantId, qty: 1 }], paymentMode: 'cash', ...x });
  const g = (await mk({ isGst: true, customerName: 'G Customer', customerPhone: '9000000001' })).body, ng = (await mk({ isGst: false, source: 'online' })).body;
  assert.equal((await o('POST', '/admin/pos/expenses', { title: 'Packing material', amount: 25000, date: today })).status, 201);
  const rep = (await o('GET', `/admin/pos/reports?from=${today}&to=${today}`)).body;
  assert.ok(rep.gstSales >= g.total && rep.nonGstSales >= ng.total); assert.equal(rep.revenue, rep.gstSales + rep.nonGstSales);
  assert.ok(rep.onlineBills >= 1 && rep.offlineBills >= 1 && rep.onlineSales >= ng.total);
  assert.equal(rep.expenses, 25000); assert.equal(rep.net, rep.revenue - 25000);
  assert.equal(rep.monthly.length, 12); assert.equal(rep.week.length, 7); assert.ok(rep.weekNo >= 1 && rep.topProduct);
  const only = (await o('GET', `/admin/pos/reports?from=${today}&to=${today}&gst=gst`)).body; assert.equal(only.nonGstBills, 0); assert.ok(only.gstBills >= 1);
  const list = (await o('GET', '/admin/pos/sales?gst=nongst')).body; assert.ok(list.length && list.every(r => r.isGst === false));
  assert.equal((await o('GET', `/admin/pos/reports?from=${today}&to=${today}&channel=wholesale`)).body.expenses, 0, 'expenses belong to retail');
});

test('expenses: manager only, validated, deletable', async () => {
  const o = await owner(), cashier = await asRole('exp-cashier@test.dev', 'cashier');
  assert.equal((await cashier('POST', '/admin/pos/expenses', { title: 'x', amount: 100 })).status, 403);
  assert.equal((await cashier('GET', `/admin/pos/expenses?from=${today}&to=${today}`)).status, 403);
  assert.equal((await o('POST', '/admin/pos/expenses', { title: 'Bad', amount: 0 })).status, 400);
  assert.equal((await o('POST', '/admin/pos/expenses', { title: 'Future', amount: 100, date: '2999-01-01' })).status, 400);
  const id = (await o('POST', '/admin/pos/expenses', { title: 'Tea', amount: 5000, paymentMode: 'upi' })).body.id;
  assert.ok((await o('GET', `/admin/pos/expenses?from=${today}&to=${today}`)).body.some(e => e.id === id));
  assert.equal((await o('DELETE', `/admin/pos/expenses/${id}`)).status, 200); assert.equal((await o('DELETE', `/admin/pos/expenses/${id}`)).status, 404);
});

test('customers: cashier can add, only a manager can edit/delete; duplicates by mobile are refused; birthdays come from saved dates', async () => {
  const o = await owner(), cashier = await asRole('cust-cashier@test.dev', 'cashier');
  const near = new Date(Date.now() + 3 * 86400000 + 5.5 * 3600000).toISOString().slice(5, 10);
  const add = await cashier('POST', '/admin/pos/customers', { name: 'Birthday Soon', phone: '98 000 11122', dob: `1992-${near}` });
  assert.equal(add.status, 201);
  assert.equal((await cashier('POST', '/admin/pos/customers', { name: 'Dup', phone: '9800011122' })).status, 409);
  assert.equal((await cashier('PATCH', `/admin/pos/customers/${add.body.id}`, { name: 'Hacked', phone: '9800011122' })).status, 403);
  assert.equal((await cashier('DELETE', `/admin/pos/customers/${add.body.id}`)).status, 403);
  assert.equal((await o('POST', '/admin/pos/customers', { name: 'No phone', phone: 'abc' })).status, 400);
  assert.ok((await o('GET', '/admin/pos/birthdays?days=30')).body.some(b => b.phone === '9800011122' && b.daysAway >= 2 && b.daysAway <= 4));
  assert.equal((await o('PATCH', `/admin/pos/customers/${add.body.id}`, { name: 'Renamed', phone: '9800011122', dob: null })).status, 200);
  const row = (await o('GET', '/admin/pos/customers?q=9800011122')).body[0]; assert.equal(row.name, 'Renamed'); assert.equal(row.bills, 0);
  assert.equal((await o('DELETE', `/admin/pos/customers/${add.body.id}`)).status, 200);
});

test('stock adjustment: restock / return add, loss deducts, reconcile sets; cannot go negative; roles enforced; movements logged', async () => {
  const o = await owner(), inv = await asRole('inv-user@test.dev', 'inventory'), cashier = await asRole('stock-cashier@test.dev', 'cashier');
  const v = (await o('GET', '/admin/pos/catalog')).body.find(x => x.stock >= 5), id = v.variantId, start = await stockOf(id);
  const adj = (c, type, qty, note) => c('POST', '/admin/pos/stock', { variantId: id, type, qty, ...(note ? { note } : {}) });
  assert.equal((await adj(cashier, 'restock', 1)).status, 403);
  assert.equal((await adj(o, 'restock', 10, 'Shipment')).body.stock, start + 10);
  assert.equal((await adj(inv, 'return', 2)).body.stock, start + 12);
  assert.equal((await adj(o, 'loss', 3, 'Damaged')).body.stock, start + 9);
  assert.equal((await adj(o, 'loss', start + 1000)).status, 400); assert.equal(await stockOf(id), start + 9, 'failed deduction changes nothing');
  assert.equal((await adj(o, 'reconcile', 7)).body.stock, 7); assert.equal(await stockOf(id), 7);
  assert.equal((await adj(o, 'restock', 0)).status, 400);
  const mv = (await db.query("SELECT reason, quantity_change FROM inventory_movements WHERE variant_id = $1 AND reason IN ('pos_restock','pos_return','pos_loss','pos_reconcile') ORDER BY id", [id])).rows.map(r => `${r.reason}:${r.quantity_change}`);
  assert.deepEqual(mv, ['pos_restock:10', 'pos_return:2', 'pos_loss:-3', `pos_reconcile:${7 - (start + 9)}`]);
});

test('products: add via admin API, shows in POS catalogue and inventory with variants; edit; add size; sales still work', async () => {
  const o = await owner(), cashier = await asRole('prod-cashier@test.dev', 'cashier');
  const cat = (await o('GET', '/admin/pos/categories')).body[0];
  const made = await o('POST', '/admin/products', { slug: 'pos-test-kurta', name: 'POS Test Kurta', description: '', category: cat.slug, price: 129900, gst_rate: 5, status: 'active', featured: false, variants: [{ sku: 'POS-TEST-M', size: 'M', color: 'Default', stock: 4 }] });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const find = async () => (await o('GET', '/admin/pos/products?q=POS%20Test')).body.find(p => p.slug === 'pos-test-kurta');
  let p = await find(); assert.equal(p.stock, 4); assert.equal(p.variants.length, 1); assert.equal(p.categorySlug, cat.slug);
  assert.ok((await o('GET', '/admin/pos/catalog?q=POS-TEST')).body.some(x => x.sku === 'POS-TEST-M'));
  assert.equal((await cashier('PATCH', `/admin/pos/products/${p.id}`, { name: 'x', price: 1, taxRate: 5, status: 'active' })).status, 403);
  assert.equal((await o('PATCH', `/admin/pos/products/${p.id}`, { name: 'POS Test Kurta Edited', price: 149900, taxRate: 12, categorySlug: null, status: 'active' })).status, 200);
  assert.equal((await o('PATCH', `/admin/pos/products/${p.id}`, { name: 'x', price: 1, taxRate: 5, categorySlug: 'nope', status: 'active' })).status, 400);
  assert.equal((await o('POST', `/admin/pos/products/${p.id}/variants`, { size: 'L', sku: 'POS-TEST-L', stock: 6 })).status, 201);
  assert.equal((await o('POST', `/admin/pos/products/${p.id}/variants`, { size: 'L', sku: 'POS-TEST-L2', stock: 1 })).status, 409, 'same size/colour twice');
  p = await find(); assert.equal(p.name, 'POS Test Kurta Edited'); assert.equal(p.price, 149900); assert.equal(p.taxRate, 12); assert.equal(p.stock, 10); assert.equal(p.categorySlug, null);
  const sale = await o('POST', '/admin/pos/sales', { idempotencyKey: k(), items: [{ variantId: p.variants[0].id, qty: 2 }], paymentMode: 'cash' });
  assert.equal(sale.status, 201); assert.equal(sale.body.items[0].taxRate, 12);
});

test('categories & collections: staff create / toggle / delete; cashiers refused', async () => {
  const o = await owner(), cashier = await asRole('tax-cashier@test.dev', 'cashier');
  assert.equal((await cashier('GET', '/admin/taxonomy')).status, 403);
  const c = await o('POST', '/admin/categories', { name: 'Test Dupattas' }); assert.equal(c.status, 201);
  assert.equal((await o('POST', '/admin/categories', { name: 'test dupattas' })).status, 409);
  assert.equal((await o('PATCH', `/admin/categories/${c.body.id}`, { active: false })).status, 200);
  let t = (await o('GET', '/admin/taxonomy')).body; assert.equal(t.categories.find(x => x.id === c.body.id).active, false);
  const col = await o('POST', '/admin/collections', { name: 'Test Festive' }); assert.equal(col.status, 201);
  assert.equal(t.collections.length < (await o('GET', '/admin/taxonomy')).body.collections.length, true);
  assert.equal((await o('PATCH', `/admin/collections/${col.body.id}`, { status: 'published' })).status, 200);
  t = (await o('GET', '/admin/taxonomy')).body; assert.equal(t.collections.find(x => x.id === col.body.id).status, 'published');
  assert.equal((await o('DELETE', `/admin/categories/${c.body.id}`)).status, 200); assert.equal((await o('DELETE', `/admin/collections/${col.body.id}`)).status, 200);
  assert.equal((await o('DELETE', `/admin/categories/${c.body.id}`)).status, 404);
});

test('add user: only the owner; duplicate email refused; the new cashier can sign in and use the POS', async () => {
  const o = await owner(), admin = await asRole('plain-admin@test.dev', 'admin');
  assert.equal((await admin('POST', '/admin/users', { email: 'x@test.dev', password: 'Password123!', role: 'cashier' })).status, 403);
  assert.equal((await o('POST', '/admin/users', { email: 'short@test.dev', password: 'short', role: 'cashier' })).status, 400);
  assert.equal((await o('POST', '/admin/users', { email: 'boss@test.dev', password: 'Password123!', role: 'owner' })).status, 400, 'cannot create owners');
  const made = await o('POST', '/admin/users', { name: 'Counter Staff', email: 'counter@test.dev', password: 'Password123!', role: 'cashier' });
  assert.equal(made.status, 201);
  assert.equal((await o('POST', '/admin/users', { email: 'COUNTER@test.dev', password: 'Password123!', role: 'cashier' })).status, 409);
  const staff = client(); assert.equal((await staff('POST', '/auth/login', { email: 'counter@test.dev', password: 'Password123!' })).status, 200);
  assert.equal((await staff('GET', '/admin/pos/catalog')).status, 200); assert.equal((await staff('GET', '/admin/users')).status, 403);
});

test('settings saves clear unused uploads only after a grace period (in-flight uploads are safe)', async () => {
  const o = await owner();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const up = await fetch(base + '/admin/media?name=t.png', { method: 'POST', headers: { 'Content-Type': 'image/png', 'X-Requested-With': 'dhanya', Cookie: await (async () => { const r = await fetch(base + '/auth/login', { method: 'POST', body: JSON.stringify({ email: 'owner@test.dev', password: 'OwnerPass123!' }), headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'dhanya' } }); return r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') })() }, body: png });
  const { id } = await up.json();
  await o('PUT', '/admin/settings/social', { instagram: { handle: null, url: null, posts: [] }, links: [] });
  assert.equal((await db.query('SELECT 1 FROM media_files WHERE id = $1', [id])).rows.length, 1, 'a fresh unreferenced upload survives the sweep');
  await db.query("UPDATE media_files SET created_at = now() - interval '10 minutes' WHERE id = $1", [id]);
  await o('PUT', '/admin/settings/social', { instagram: { handle: null, url: null, posts: [] }, links: [] });
  assert.equal((await db.query('SELECT 1 FROM media_files WHERE id = $1', [id])).rows.length, 0, 'an old unreferenced upload is removed');
});
