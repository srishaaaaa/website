import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../config.js';
import { createDb, migrate } from '../db/index.js';
import { seed } from '../db/seed.js';
import { createApp } from '../app.js';
import { addDays, checkDates, deliveryWarnings, validateMeasure } from '../lib/stitching.js';

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
let n = 0; const key = () => `stitch-test-${Date.now()}-${++n}`;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

test('pure rules: measurement validation, date checks and delivery warnings', () => {
  assert.deepEqual(validateMeasure('blouse', 'in', { bust: 36.456 }).values, { bust: 36.46 });
  assert.throws(() => validateMeasure('blouse', 'in', { bust: -2 }), /bust|Bust/);
  assert.throws(() => validateMeasure('blouse', 'in', { bust: 400 }), /up to 120/);
  assert.throws(() => validateMeasure('blouse', 'cm', { hip: 90 }), /Unknown/);
  assert.throws(() => validateMeasure('blouse', 'in', {}), /at least one/);
  assert.equal(validateMeasure('misc', 'cm', {}, [{ label: 'Cape drop', value: 55 }]).custom[0].value, 55);
  assert.throws(() => checkDates({ orderDate: '2026-05-10', deliveryDate: '2026-05-09' }), /before the order date/);
  assert.throws(() => checkDates({ orderDate: '2026-05-10', trialDate: '2026-05-20', deliveryDate: '2026-05-15' }), /trial date/);
  assert.equal(deliveryWarnings({ orderDate: '2026-05-10', deliveryDate: '2026-05-11', priority: 'normal', garments: 1 }).length, 1, 'one day for a normal order is unrealistic');
  assert.equal(deliveryWarnings({ orderDate: '2026-05-10', deliveryDate: '2026-05-11', priority: 'express', garments: 1 }).length, 0);
});

test('stitching studio: access control, totals, duplicates, workflow, alterations, QC, payments, POS invoice, reports', async () => {
  const anon = client();
  assert.equal((await anon('GET', '/admin/stitching/dashboard')).status, 401, 'signed-out users cannot read stitching data');
  const shopper = client(); await shopper('POST', '/auth/register', { email: 'shopper@test.dev', password: 'ShopperPass123!', name: 'Shopper' });
  assert.equal((await shopper('GET', '/admin/stitching/orders')).status, 403, 'customers cannot read stitching data');
  assert.equal((await shopper('GET', '/admin/stitching/measurements')).status, 403, 'measurements are private');

  const owner = client(); await owner('POST', '/auth/login', { email: 'owner@test.dev', password: 'OwnerPass123!' });
  assert.equal((await owner('POST', '/admin/users', { email: 'till@test.dev', password: 'TillPass12345!', role: 'cashier', name: 'Till' })).status, 201);
  const cashier = client(); await cashier('POST', '/auth/login', { email: 'till@test.dev', password: 'TillPass12345!' });
  const inventory = client(); await owner('POST', '/admin/users', { email: 'stock@test.dev', password: 'StockPass12345!', role: 'inventory', name: 'Stock' });
  await inventory('POST', '/auth/login', { email: 'stock@test.dev', password: 'StockPass12345!' });
  assert.equal((await inventory('GET', '/admin/stitching/orders')).status, 403, 'inventory staff do not see stitching');

  const meta = (await cashier('GET', '/admin/stitching/meta')).body;
  assert.equal(meta.garmentTypes.length, 10); assert.equal(meta.statuses.length, 12);
  const gt = c => meta.garmentTypes.find(g => g.code === c).id;

  assert.equal((await cashier('POST', '/admin/stitching/tailors', { name: 'Meena' })).status, 403, 'only owner/admin manage tailors');
  const tailor = (await owner('POST', '/admin/stitching/tailors', { name: 'Meena', phone: '90000 11111' })).body.id;

  // ---- create an order: server computes the totals ----
  const body = {
    idempotencyKey: key(), customer: { name: 'Anitha R', phone: '98765 43210' }, priority: 'urgent', tailorId: tailor,
    deliveryDate: addDays(today(), 8), trialDate: addDays(today(), 4), isGst: true, gstRate: 5, discount: 10000, urgentCharge: 20000, notes: 'Wedding on the 15th',
    items: [
      { garmentTypeId: gt('saree-blouse'), qty: 1, specs: { neck_design: 'Boat neck', sleeve_style: 'Elbow', bogus_field: 'dropped' }, charges: { base: 80000, embroidery: 30000 },
        measurements: { groups: { blouse: { unit: 'in', values: { bust: 36, waist: 30, blouse_length: 15 }, saveAs: 'Anitha blouse' } } } },
      { garmentTypeId: gt('kurti'), qty: 1, charges: { base: 120000 } },
    ],
    advance: { amount: 50000, mode: 'upi' },
  };
  assert.equal((await cashier('POST', '/admin/stitching/orders', { ...body, idempotencyKey: key(), deliveryDate: addDays(today(), -1) })).status, 400, 'delivery before the order date');
  assert.equal((await cashier('POST', '/admin/stitching/orders', { ...body, idempotencyKey: key(), advance: { amount: 999999999 } })).status, 400, 'advance above the total');
  assert.equal((await cashier('POST', '/admin/stitching/orders', { ...body, idempotencyKey: key(), items: [{ ...body.items[0], measurements: { groups: { blouse: { unit: 'in', values: { bust: -4 } } } } }] })).status, 400, 'negative measurement');
  assert.equal((await cashier('POST', '/admin/stitching/orders', { ...body, idempotencyKey: key(), items: [{ garmentTypeId: gt('churidar'), measurements: { groups: { blouse: { unit: 'in', values: { bust: 30 } } } } }] })).status, 400, 'blouse measurements on a churidar');
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM stitch_orders')).rows[0].n, 0, 'rejected orders leave nothing behind');

  const created = await cashier('POST', '/admin/stitching/orders', body);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const o = created.body.order;
  // subtotal 80000+30000+120000+20000 = 250000; discount 10000; GST 5% of 240000 = 12000; total 252000
  assert.equal(o.subtotal, 250000); assert.equal(o.tax, 12000); assert.equal(o.total, 252000);
  assert.equal(o.paid, 50000); assert.equal(o.balance, 202000); assert.equal(o.paymentStatus, 'partial');
  assert.match(o.orderNo, /^SO-\d{4}-0001$/); assert.equal(o.status, 'received'); assert.equal(o.history.length, 1);
  assert.deepEqual(o.items[0].specs, { neck_design: 'Boat neck', sleeve_style: 'Elbow' }, 'fields the garment does not use are dropped');
  assert.equal(o.items[0].measurements.groups.blouse.values.bust, 36);
  assert.ok(created.body.warnings.length === 0);

  const again = await cashier('POST', '/admin/stitching/orders', body);
  assert.equal(again.status, 200); assert.equal(again.body.order.id, o.id, 'a repeated submit returns the same order');
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM stitch_orders')).rows[0].n, 1);
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM stitch_payments')).rows[0].n, 1, 'and the advance is recorded once');
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM pos_customers WHERE phone = $1', ['9876543210'])).rows[0].n, 1);
  const again2 = await cashier('POST', '/admin/stitching/orders', { ...body, idempotencyKey: key(), customer: { name: 'Anitha Ravi', phone: '+91 98765 43210' }, advance: undefined, items: [{ garmentTypeId: gt('churidar'), charges: { base: 30000 } }] });
  assert.equal(again2.body.order.customerId, o.customerId, 'the same mobile number never creates a second customer');

  // ---- measurement book: saved profile, history, snapshot independence ----
  const profiles = (await cashier('GET', `/admin/stitching/customers/${o.customerId}/measurements`)).body;
  assert.equal(profiles.length, 1); assert.equal(profiles[0].version, 1);
  const edit = await cashier('PATCH', `/admin/stitching/measurements/${profiles[0].id}`, { name: 'Anitha blouse', unit: 'in', values: { bust: 38, waist: 31 }, fitPref: 'Snug', notes: '' });
  assert.equal(edit.body.version, 2);
  assert.equal((await cashier('GET', `/admin/stitching/measurements/${profiles[0].id}/history`)).body.length, 2, 'every change is kept');
  const snap = (await cashier('GET', `/admin/stitching/orders/${o.id}`)).body;
  assert.equal(snap.items[0].measurements.groups.blouse.values.bust, 36, 'a later profile edit never changes an earlier order');
  assert.equal((await cashier('PATCH', `/admin/stitching/measurements/${profiles[0].id}`, { name: 'x', unit: 'in', values: { bust: 0 }, fitPref: '', notes: '' })).status, 400);
  const dup = (await cashier('POST', `/admin/stitching/measurements/${profiles[0].id}/duplicate`)).body;
  assert.equal(dup.values.bust, 38); assert.match(dup.name, /^Copy of/);

  // ---- workflow rules ----
  const st = (c, status, extra = {}) => c('POST', `/admin/stitching/orders/${o.id}/status`, { status, ...extra });
  assert.equal((await st(cashier, 'ready')).status, 409, 'stages cannot be jumped to the end');
  assert.equal((await st(cashier, 'alterations_required')).status, 409, 'alterations are entered only through an alteration round');
  assert.equal((await st(cashier, 'cutting')).status, 409, 'the kurti has no measurements yet');
  const kurtiId = o.items[1].id;
  const withM = await cashier('PATCH', `/admin/stitching/orders/${o.id}/items/${kurtiId}`, { garmentTypeId: gt('kurti'), qty: 1, charges: { base: 120000 }, measurements: { groups: { kurti: { unit: 'cm', values: { bust: 92, length: 105 } } } } });
  assert.equal(withM.status, 200, JSON.stringify(withM.body));
  assert.equal((await st(cashier, 'measurements_confirmed')).status, 200);
  assert.equal((await st(cashier, 'cutting')).status, 200);
  assert.equal((await st(cashier, 'stitching')).status, 200);
  assert.equal((await st(cashier, 'trial_scheduled')).status, 200);
  assert.equal((await st(cashier, 'trial_completed')).status, 200);
  assert.equal((await st(cashier, 'cancelled', { note: 'no' })).status, 403, 'cashiers cannot cancel');

  // alteration round 1: charge changes the total (manager-set charge is allowed at creation)
  const alt = await cashier('POST', `/admin/stitching/orders/${o.id}/alterations`, { reason: 'Sleeves too tight', feedback: 'Customer felt it pinch', corrections: 'Let out 0.5in', charge: 10000 });
  assert.equal(alt.status, 201, JSON.stringify(alt.body));
  assert.equal(alt.body.status, 'alterations_required'); assert.equal(alt.body.alterationTotal, 10000);
  assert.equal(alt.body.total, 262500, '(250000+10000-10000) = 250000 taxable; 12500 GST; 262500');
  assert.equal((await st(cashier, 'finishing_qc')).status, 409, 'finish the open alteration first');
  const a1 = alt.body.alterations[0];
  assert.equal((await cashier('PATCH', `/admin/stitching/orders/${o.id}/alterations/${a1.id}`, { status: 'done', completionNotes: 'Let out' })).status, 200);
  assert.equal((await cashier('PATCH', `/admin/stitching/orders/${o.id}/alterations/${a1.id}`, { status: 'open' })).status, 409, 'a finished round is never overwritten');
  assert.equal((await cashier('POST', `/admin/stitching/orders/${o.id}/alterations`, { reason: 'x' })).status, 400, 'an alteration needs a real reason');
  assert.equal((await cashier('POST', `/admin/stitching/orders/${o.id}/alterations`, { reason: 'Hem too long' })).status, 409, 'alterations are added after a trial, during QC or when ready, not while one is already open');
  assert.equal((await st(cashier, 'finishing_qc')).status, 200);

  // quality check gate
  const ready1 = await st(cashier, 'ready'); assert.equal(ready1.status, 409); assert.equal(ready1.body.code, 'qc_incomplete');
  assert.equal((await st(cashier, 'ready', { override: true, note: 'skip it' })).status, 403, 'only managers can override QC');
  const meta2 = (await cashier('GET', '/admin/stitching/meta')).body;
  const checks = meta2.qcChecks.map(([k]) => ({ key: k, passed: true }));
  checks[2].passed = false;
  await cashier('PUT', `/admin/stitching/orders/${o.id}/qc`, { checks });
  assert.equal((await st(cashier, 'ready')).status, 409, 'a failed check blocks ready');
  checks[2].passed = true;
  assert.equal((await cashier('PUT', `/admin/stitching/orders/${o.id}/qc`, { checks })).status, 200);
  assert.equal((await st(cashier, 'ready')).status, 200);
  const hist = (await cashier('GET', `/admin/stitching/orders/${o.id}`)).body.history;
  assert.ok(hist.every(h => h.by && h.at), 'each change records who and when'); assert.equal(hist.at(-1).to, 'ready');

  // ---- payments ----
  const live = (await cashier('GET', `/admin/stitching/orders/${o.id}`)).body;
  assert.equal(live.balance, 262500 - 50000);
  const pay = { idempotencyKey: key(), kind: 'part', amount: 60000, mode: 'cash' };
  assert.equal((await cashier('POST', `/admin/stitching/orders/${o.id}/payments`, { ...pay, amount: 999999999 })).status, 400, 'cannot pay more than the balance');
  const p1 = await cashier('POST', `/admin/stitching/orders/${o.id}/payments`, pay); assert.equal(p1.status, 201); assert.equal(p1.body.order.paid, 110000);
  const p2 = await cashier('POST', `/admin/stitching/orders/${o.id}/payments`, pay); assert.equal(p2.status, 200); assert.equal(p2.body.order.paid, 110000, 'a double-clicked payment counts once');
  assert.equal((await cashier('POST', `/admin/stitching/orders/${o.id}/payments`, { idempotencyKey: key(), kind: 'refund', amount: 100, mode: 'cash', note: 'oops' })).status, 403, 'refunds are for owner/admin');
  assert.equal((await owner('POST', `/admin/stitching/orders/${o.id}/payments`, { idempotencyKey: key(), kind: 'refund', amount: 100, mode: 'card', note: 'wrong' })).status, 400, 'cannot refund a mode that took nothing');
  assert.equal((await st(cashier, 'delivered')).status, 409, 'delivery is separate from payment: a balance is still due');

  // ---- POS invoice: created once, from the ledger, totals identical ----
  assert.equal((await cashier('POST', `/admin/stitching/orders/${o.id}/invoice`, {})).status, 400, 'choose how the balance is paid');
  const inv = await cashier('POST', `/admin/stitching/orders/${o.id}/invoice`, { balanceMode: 'upi' });
  assert.equal(inv.status, 201, JSON.stringify(inv.body));
  assert.equal(inv.body.sale.total, 262500); assert.equal(inv.body.order.balance, 0); assert.equal(inv.body.order.paymentStatus, 'paid');
  assert.equal(inv.body.sale.paymentMode, 'split'); assert.equal(inv.body.sale.payCash + inv.body.sale.payUpi + inv.body.sale.payCard, 262500);
  assert.equal(inv.body.sale.payCash, 60000);
  const inv2 = await cashier('POST', `/admin/stitching/orders/${o.id}/invoice`, { balanceMode: 'cash' });
  assert.equal(inv2.status, 200); assert.equal(inv2.body.order.invoiceNo, inv.body.order.invoiceNo, 'invoicing twice returns the same invoice');
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM pos_sales WHERE notes LIKE 'Stitching order%'")).rows[0].n, 1, 'exactly one POS invoice');
  assert.equal((await owner('PATCH', `/admin/stitching/orders/${o.id}`, { discount: 0 })).status, 409, 'charges lock once invoiced');
  assert.equal((await st(cashier, 'delivered')).status, 200);
  assert.equal((await st(cashier, 'stitching')).status, 409, 'a delivered order is closed');
  assert.equal((await cashier('PATCH', `/admin/stitching/orders/${o.id}`, { notes: 'late edit' })).status, 409);

  // ---- reassignment, cancel, appointments, dashboard, list, reports ----
  const second = (await cashier('POST', '/admin/stitching/orders', { ...body, idempotencyKey: key(), customer: undefined, customerId: o.customerId, advance: undefined, deliveryDate: addDays(today(), 2), trialDate: null,
    items: [{ garmentTypeId: gt('alteration'), qty: 1, charges: { base: 25000 } }] })).body;
  assert.ok(second.warnings.length >= 1, 'a 2-day urgent order warns');
  const o2 = second.order;
  assert.equal((await cashier('PATCH', `/admin/stitching/orders/${o2.id}`, { tailorId: null })).status, 403, 'only managers reassign work');
  assert.equal((await owner('PATCH', `/admin/stitching/orders/${o2.id}`, { tailorId: null })).status, 200);
  assert.equal((await owner('POST', `/admin/stitching/orders/${o2.id}/status`, { status: 'cancelled' })).status, 400, 'a cancel needs a reason');
  assert.equal((await owner('POST', `/admin/stitching/orders/${o2.id}/status`, { status: 'cancelled', note: 'Customer changed mind' })).status, 200);
  assert.equal((await cashier('POST', `/admin/stitching/orders/${o2.id}/payments`, { idempotencyKey: key(), kind: 'part', amount: 100, mode: 'cash' })).status, 409, 'no payments on a cancelled order');

  const o3 = (await cashier('POST', '/admin/stitching/orders', { ...body, idempotencyKey: key(), customer: undefined, customerId: o.customerId, advance: { amount: 20000, mode: 'cash' }, deliveryDate: addDays(today(), 10), items: [{ garmentTypeId: gt('churidar'), charges: { base: 40000 }, measurements: { groups: { bottom: { unit: 'in', values: { waist: 30, length: 38 } } } } }] })).body.order;
  const at = `${addDays(today(), 3)}T10:00:00+05:30`;
  const a = await cashier('POST', '/admin/stitching/appointments', { orderId: o3.id, kind: 'trial', startsAt: at, minutes: 30, tailorId: tailor });
  assert.equal(a.status, 201); assert.equal(a.body.customerName, 'Anitha R');
  const clash = await cashier('POST', '/admin/stitching/appointments', { orderId: o3.id, kind: 'follow_up_trial', startsAt: `${addDays(today(), 3)}T10:15:00+05:30`, minutes: 30 });
  assert.equal(clash.status, 409); assert.equal(clash.body.conflicts.length, 1, 'overlap warns');
  assert.equal((await cashier('POST', '/admin/stitching/appointments', { orderId: o3.id, kind: 'follow_up_trial', startsAt: `${addDays(today(), 3)}T10:15:00+05:30`, ignoreConflicts: true })).status, 201);
  const moved = await cashier('PATCH', `/admin/stitching/appointments/${a.body.id}`, { startsAt: `${addDays(today(), 3)}T16:00:00+05:30` });
  assert.equal(moved.status, 200);
  assert.equal((await cashier('PATCH', `/admin/stitching/appointments/${a.body.id}`, { status: 'cancelled' })).body.status, 'cancelled');
  assert.equal((await cashier('PATCH', `/admin/stitching/appointments/${a.body.id}`, { startsAt: at })).status, 409, 'a cancelled appointment cannot be rescheduled');

  // ---- dashboard, list, reports: real records only ----
  const dash = (await cashier('GET', '/admin/stitching/dashboard')).body;
  assert.equal(dash.counts.active, 2, 'the delivered and cancelled orders are not active');
  assert.equal(dash.counts.today, 4); assert.equal(dash.counts.awaitingCollection, 0); assert.equal(dash.counts.overdue, 0);
  assert.equal(dash.recent.length, 4); assert.ok(dash.appointments.length >= 1);
  const list = (await cashier('GET', '/admin/stitching/orders?status=active&sort=delivery&dir=asc')).body;
  assert.equal(list.total, 2); assert.ok(list.rows[0].deliveryDate <= list.rows[1].deliveryDate);
  assert.equal((await cashier('GET', '/admin/stitching/orders?q=98765')).body.total, 4, 'search by phone');
  assert.equal((await cashier('GET', `/admin/stitching/orders?q=${o.orderNo}`)).body.rows[0].id, o.id, 'search by order number');
  assert.equal((await cashier('GET', '/admin/stitching/orders?payment=paid')).body.total, 1);
  assert.equal((await cashier('GET', '/admin/stitching/orders?status=bogus')).status, 400);
  const tl = (await cashier('GET', '/admin/stitching/tailors')).body.find(t => t.id === tailor);
  assert.equal(tl.activeOrders, 2, "workload counts the tailor's open orders only (the delivered one and the unassigned cancelled one are not counted)"); assert.equal(tl.completed, 1);
  assert.equal((await cashier('GET', `/admin/stitching/reports?from=${today()}&to=${today()}`)).status, 403, 'reports are for owner/admin');
  const rep = (await owner('GET', `/admin/stitching/reports?from=${today()}&to=${today()}`)).body;
  // collected = advance 50000 + 60000 cash + 152500 final UPI (balance at invoicing) + 20000 advance on o3 = 282500
  assert.equal(rep.collected, 282500); assert.equal(rep.advances, 70000); assert.equal(rep.alterationCharges, 10000);
  assert.equal(rep.delivered, 1); assert.equal(rep.cancelled, 1);
  // order value excludes the cancelled order: 262500 + 42000 + 52500
  assert.equal(rep.orderValue, 357000); assert.equal(rep.outstanding, 42000 + 32500, 'only what is still owed on the two open orders');
  assert.ok(rep.collected < rep.orderValue, 'collected money is never the order value');
});
