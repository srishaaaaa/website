import { Router } from 'express';
import { z } from 'zod';
import { one, rows } from '../db/index.js';
import { HttpError, wrap } from '../lib/http.js';
import { audit } from '../lib/orders.js';
import { hasCostColumns, hasBestSeller } from '../lib/cost.js';
import { createReturn, getReturn } from '../lib/returns.js';
import { listMeasurements, setTailoring, stitchingOrders, stitchingOverview } from '../lib/measurements.js';
import { DEFAULT_RULES, loadRules } from '../lib/delivery.js';
import { loadAccess, pagesFor, CAN, PAGES } from '../lib/staffAccess.js';
import { syncWebInvoices } from '../lib/webInvoices.js';
import { editSale, stockMovements, adjustStock, createAdvance, finalizeAdvance, getAdvance, listAdvances, setAdvanceStatus, shopInfo, birthdays, couponProblem, couponAccessProblem, createSale, getSale, getSetting, listCustomers, listExpenses, listProducts, listSales, normPhone, PHONE_SQL, putSetting, report, searchVariants, voidSale } from '../lib/pos.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const paise = z.number().int().min(0).max(100_000_000);
const text = n => z.string().trim().max(n);
const channel = z.enum(['retail', 'wholesale']).default('retail');
const gstFilter = z.enum(['all', 'gst', 'nongst']).default('all');
const payFilter = z.enum(['all', 'cash', 'upi', 'card', 'split']).default('all');
const csvCell = v => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

// Stitching measurements on a service line (Billing → Add service → Measurements). Sizes are in cm.
const cm = z.number().min(0).max(500);
const measure = z.object({
  frontNeck: text(60).optional(), backNeck: text(60).optional(), sleeveType: text(40).optional(), sleeveLength: text(40).optional(), dueDate: date.optional(),
  cm: z.object({ front_neck: cm, back_neck: cm, shoulder: cm, sleeve_length: cm, arm_hole_curve: cm, shoulder_to_waist: cm, chest: cm, waist: cm, blouse_length: cm, side_cut: cm, front_cut: cm, back_cut: cm }).partial().default({}),
  remarks: z.array(text(200).min(1)).max(20).default([]),
});
const item = z.union([
  z.object({ variantId: z.number().int().positive(), qty: z.number().int().min(1).max(999) }),
  // free-text line (retail "Item name / description", services, and every wholesale line): cashier-entered price, no stock
  z.object({ name: text(160).min(1), sku: text(60).optional(), price: paise, qty: z.number().int().min(1).max(99999), taxRate: z.number().int().min(0).max(28).default(0), measure: measure.optional() }),
]);
const saleBody = z.object({
  idempotencyKey: z.string().min(8).max(80),
  channel,
  source: z.enum(['offline', 'online']).default('offline'),
  billDate: date.optional(),
  items: z.array(item).min(1).max(100),
  customerName: text(120).default(''),
  customerPhone: text(20).regex(/^[0-9+\-\s]*$/, 'Phone may only contain digits').default(''),
  customerAddress: text(300).default(''),
  customerDob: date.optional(),
  isGst: z.boolean().default(true),
  gstRate: z.number().int().min(0).max(28).optional(), // flat GST % for the whole bill; omitted = each item's own rate
  discountType: z.enum(['percent', 'fixed']).default('fixed'),
  discountValue: paise.default(0),
  couponCode: text(40).optional(),
  deliveryFee: paise.default(0),
  paymentMode: z.enum(['cash', 'upi', 'card', 'split']),
  cashTendered: paise.optional(),
  payments: z.object({ cash: paise.default(0), upi: paise.default(0), card: paise.default(0) }).default({}),
  paymentRef: text(80).optional(),
  notes: text(500).optional(),
});
const settingsBody = z.object({
  gstin: text(15).regex(/^([0-9A-Za-z]{15})?$/, 'GSTIN must be exactly 15 characters').default(''),
  showGstRetail: z.boolean().default(false),
  showGstWholesale: z.boolean().default(false),
  deliveryPresets: z.array(z.object({ name: text(60).min(1), fee: paise })).max(20).default([]),
  state: text(60).default('Tamil Nadu (33)'),
  terms: text(600).default('Custom-stitched and altered garments are made to order and are non-returnable.'),
  // Shop details printed on POS bills. Blank means "use the website's store details".
  shopName: text(80).default(''), shopAddress: text(400).default(''), shopPhone: text(30).default(''), shopEmail: text(120).default(''),
  ownerName: text(80).default(''), ownerPhone: text(30).default(''), whatsapp: text(30).default(''), city: text(80).default(''), hours: text(120).default(''), shopNameTamil: text(80).default(''), instagram: text(60).default(''),
  accent: z.string().regex(/^(#[0-9a-fA-F]{6})?$/, 'Pick a colour').default(''), // one accent colour for the POS; blank = the default
});
const couponBody = z.object({
  code: text(40).regex(/^[A-Za-z0-9_-]{3,40}$/, 'Use 3-40 letters, digits, - or _'),
  discountType: z.enum(['percent', 'fixed']), discountValue: z.number().int().min(1).max(100_000_000),
  minOrder: paise.default(0), expiresOn: date.nullable().default(null), usageLimit: z.number().int().min(1).nullable().default(null), sentOnly: z.boolean().default(false),
}).refine(c => c.discountType !== 'percent' || c.discountValue <= 100, { message: 'Percent discount cannot exceed 100', path: ['discountValue'] });
const wsItem = z.object({ code: text(60).min(1), company: text(120).default(''), colour: text(60).default('') });
const customerBody = z.object({ name: text(120).default(''), phone: text(20).regex(/^[0-9+\-\s]*$/, 'Phone may only contain digits'), dob: date.nullable().default(null), notes: text(300).nullable().default(null) });
const expenseBody = z.object({ title: text(120).min(1), category: text(60).default('General'), amount: z.number().int().min(1).max(100_000_000), paymentMode: z.enum(['cash', 'upi', 'card']).default('cash'), notes: text(300).nullable().default(null), date: date.optional() });
const productPatch = z.object({ name: text(160).min(1), price: paise, costPrice: paise.optional(), taxRate: z.number().int().min(0).max(28), categorySlug: text(80).nullable().default(null), status: z.enum(['draft', 'active', 'archived']),
  description: text(4000).optional(), material: text(80).optional(), featured: z.boolean().optional(), bestSeller: z.boolean().optional(), lowAlert: z.number().int().min(0).max(100000).optional(), weightGrams: z.number().int().min(0).max(1_000_000).optional(), collections: z.array(text(120).min(1)).max(50).optional() });
const variantPatch = z.object({ size: text(40).min(1), color: text(40).min(1), sku: text(80).min(1), price: paise.nullable(), cost: paise.nullable(), weight: z.number().int().min(0).max(1_000_000).nullable(), active: z.boolean() }).partial();
const variantBody = z.object({ size: text(40).min(1), color: text(40).default('Default'), sku: text(80).min(1), stock: z.number().int().min(0).max(1_000_000).default(0) });
const colourBody = z.object({ color: text(40).min(1), price: paise.nullable().default(null),
  sizes: z.array(z.object({ size: text(40).min(1), stock: z.number().int().min(0).max(1_000_000).default(0), sku: text(80).optional() })).min(1).max(30) });
const slugify = x => String(x).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const stockBody = z.object({ variantId: z.number().int().positive(), type: z.enum(['restock', 'return', 'loss', 'reconcile']), qty: z.number().int().min(0).max(1_000_000), note: text(100).optional() })
  .refine(b => b.type === 'reconcile' || b.qty >= 1, { message: 'Enter a quantity of at least 1', path: ['qty'] });
const advanceBody = z.object({
  items: z.array(item).min(1).max(100), customerDob: date.optional(),
  customerName: text(120).default(''), customerPhone: text(20).regex(/^[0-9+\-\s]*$/, 'Phone may only contain digits').default(''), customerAddress: text(300).default(''),
  isGst: z.boolean().default(false), gstRate: z.number().int().min(0).max(28).optional(),
  discountType: z.enum(['percent', 'fixed']).default('fixed'), discountValue: paise.default(0), deliveryFee: paise.default(0),
  deposit: paise, depositMode: z.enum(['cash', 'upi', 'card', 'split']).default('cash'), depositSplit: z.object({ cash: paise.default(0), upi: paise.default(0), card: paise.default(0) }).optional(), deliveryDate: date.nullable().optional(), notes: text(500).optional(),
});
const id = z.coerce.number().int().positive();

const SETTINGS_DEFAULT = settingsBody.parse({});
const DEFAULT_BDAY = { offers: [{ id: 'o1', text: '10% off on your next purchase' }], selected: 'o1',
  message: 'Hi {name}! 🎂 Happy Birthday!\n\nHere\'s a special treat from {shop}:\n🎁 {offer}\n\nVisit us in store or call {phone}.\nFollow us on Instagram @{instagram}\n\n– {shop}' };
const bdayBody = z.object({ offers: z.array(z.object({ id: text(20).min(1), text: text(120).min(1) })).max(20), selected: text(20).default(''), message: text(1000).min(1) });
const DEFAULT_EXPENSE_CATEGORIES = ['Electricity', 'Marketing', 'Miscellaneous', 'Packing', 'Rent', 'Repairs & Maintenance', 'Salaries', 'Stationery', 'Tea & Snacks', 'Transport'];

// Dhanya POS API. Roles are enforced here on the server (and re-read from the database on every request by auth.role):
// owner/admin/cashier may bill and look things up; only owner/admin may void bills, view reports and manage coupons, settings,
// customers' edits, expenses, products and the wholesale catalogue; inventory staff may also adjust stock.
export default function pos({ db, auth }) {
  const r = Router();
  const biller = auth.role('owner', 'admin', 'cashier');
  const manager = auth.role('owner', 'admin');
  const stockers = auth.role('owner', 'admin', 'inventory');
  const reader = auth.role('owner', 'admin', 'cashier', 'inventory'); // may look products up (stock staff need the list to adjust stock)

  // Staff access: which admin pages each kind of staff member sees. Everyone signed in as staff can read their own list; the owner and admins (who are equal here) change it.
  const anyStaff = auth.role('owner', 'admin', 'cashier', 'inventory');
  // Page-based access: owner/admin always pass; a cashier or stock staff member passes when the admin ticked that page for their role (POS Settings → Staff dashboard).
  const area = (page, { not = [] } = {}) => [anyStaff, wrap(async (req, _res, next) => {
    if (not.includes(req.user.role)) throw new HttpError(403, 'Not allowed for your role');
    if (['owner', 'admin'].includes(req.user.role)) return next();
    if ((await loadAccess(db))[req.user.role]?.includes(page)) return next();
    throw new HttpError(403, 'Not allowed for your role');
  })];
  r.get('/pos/staff-access', anyStaff, wrap(async (req, res) => {
    const access = await loadAccess(db);
    res.json({ role: req.user.role, pages: pagesFor(access, req.user.role), ...(['owner', 'admin'].includes(req.user.role) ? { config: access, can: CAN, all: PAGES } : {}) });
  }));
  r.put('/pos/staff-access', manager, wrap(async (req, res) => {
    const v = z.object({ admin: z.array(z.string()).max(60).optional(), cashier: z.array(z.string()).max(60), inventory: z.array(z.string()).max(60) }).parse(req.body);
    const clean = {}; for (const role of Object.keys(CAN)) clean[role] = [...new Set(v[role] || [])].filter(x => CAN[role].includes(x));
    await putSetting(db, 'staff_access', clean); await audit(db, req.user.id, 'pos.staff_access', 'pos_settings', 'staff_access');
    res.json(await loadAccess(db));
  }));

  r.get('/pos/shop', biller, wrap(async (_req, res) => res.json(await shopInfo(db))));
  r.get('/pos/settings', manager, wrap(async (_req, res) => res.json({ ...SETTINGS_DEFAULT, ...(await getSetting(db, 'invoice', {})) })));
  r.put('/pos/settings', manager, wrap(async (req, res) => {
    const v = settingsBody.parse(req.body);
    await putSetting(db, 'invoice', v); await audit(db, req.user.id, 'pos.settings', 'pos_settings', 'invoice');
    res.json(v);
  }));

  // ---- retail catalogue (billing search) ----
  r.get('/pos/catalog', biller, wrap(async (req, res) => {
    const { q, limit } = z.object({ q: text(80).default(''), limit: z.coerce.number().int().min(1).max(300).default(40) }).parse(req.query);
    res.json(await searchVariants(db, q, limit));
  }));

  // ---- sales ----
  r.post('/pos/sales', biller, wrap(async (req, res) => {
    const sale = await createSale(db, req.user, saleBody.parse(req.body));
    res.status(sale.duplicate ? 200 : 201).json(sale);
  }));
  r.get('/pos/sales', biller, wrap(async (req, res) => {
    const f = z.object({ q: text(80).default(''), name: text(80).default(''), phone: text(20).default(''), source: z.enum(['all', 'offline', 'online']).default('all'), from: date.optional(), to: date.optional(), channel, gst: gstFilter, payment: payFilter }).parse(req.query);
    // Cashiers only see today's bills; owner/admin can search the full history.
    if (req.user.role === 'cashier') f.from = f.to = today();
    if (f.source !== 'offline') await syncWebInvoices(db).catch(() => {}); // paid website orders always have an invoice
    res.json(await listSales(db, f));
  }));
  r.get('/pos/sales/:invoice', biller, wrap(async (req, res) => {
    const sale = await getSale(db, req.params.invoice);
    if (!sale) throw new HttpError(404, 'Invoice not found');
    res.json(sale);
  }));
  r.post('/pos/sales/:invoice/void', manager, wrap(async (req, res) => {
    const { reason } = z.object({ reason: text(200).min(3, 'Give a reason') }).parse(req.body);
    res.json(await voidSale(db, req.user, req.params.invoice, reason));
  }));
  r.get('/pos/reports', area('/admin/billing/analytics'), wrap(async (req, res) => {
    const { from, to, channel: ch, gst, source, payment } = z.object({ from: date, to: date, channel, gst: gstFilter, source: z.enum(['all', 'offline', 'online']).default('all'), payment: payFilter }).parse(req.query);
    if (from > to) throw new HttpError(400, 'From date is after To date');
    res.json(await report(db, from, to, ch, gst, source, payment));
  }));

  // ---- return invoices (credit notes) ----
  r.post('/pos/sales/:invoice/returns', biller, wrap(async (req, res) => {
    const d = z.object({ items: z.array(z.object({ itemId: z.number().int().positive(), qty: z.number().int().min(1).max(99999), restock: z.boolean().default(true) })).min(1).max(100), reason: text(300).default(''), refundMode: z.enum(['cash', 'upi', 'card', 'split']).default('cash'),
      refundSplit: z.object({ cash: paise.default(0), upi: paise.default(0), card: paise.default(0) }).optional(), approval: z.object({ approved: z.boolean().optional(), adminPassword: z.string().max(200).optional() }).default({}) }).parse(req.body);
    res.status(201).json(await createReturn(db, req.user, req.params.invoice, d));
  }));
  r.get('/pos/returns/:no', biller, wrap(async (req, res) => {
    const ret = await getReturn(db, req.params.no);
    if (!ret) throw new HttpError(404, 'Return invoice not found');
    res.json(ret);
  }));

  // ---- measurements: bills with stitching lines, and their tailoring progress ----
  r.get('/pos/measurements', biller, wrap(async (req, res) => {
    const f = z.object({ q: text(80).default(''), name: text(80).default(''), phone: text(20).default(''), status: z.enum(['all', 'pending', 'completed', 'cancelled']).default('all'), from: date.optional(), to: date.optional() }).parse(req.query);
    res.json(await listMeasurements(db, f));
  }));
  r.get('/pos/stitching/orders', biller, wrap(async (req, res) => {
    const f = z.object({ q: text(80).default(''), name: text(80).default(''), phone: text(20).default(''), status: z.enum(['all', 'pending', 'completed', 'cancelled']).default('all'), from: date.optional(), to: date.optional() }).parse(req.query);
    res.json(await stitchingOrders(db, f));
  }));
  r.get('/pos/stitching/overview', biller, wrap(async (req, res) => {
    const f = z.object({ from: date.optional(), to: date.optional() }).parse(req.query);
    res.json(await stitchingOverview(db, f));
  }));
  // Best Sellers shelf: flag / unflag one product (the shelf keeps the 10 newest flagged pieces).
  r.patch('/pos/products/:id/best-seller', area('/admin/billing/inventory', { not: ['inventory'] }), wrap(async (req, res) => {
    const { value } = z.object({ value: z.boolean() }).parse(req.body); const pid = id.parse(req.params.id);
    if (!(await hasBestSeller(db))) throw new HttpError(409, 'Best Sellers need a one-time database update first (migration 028).', 'best_not_ready');
    const u = await db.query('UPDATE products SET best_seller = $2, updated_at = now() WHERE id = $1 RETURNING id', [pid, value]);
    if (!u.rows.length) throw new HttpError(404, 'Product not found');
    await db.query('UPDATE products SET best_seller = false WHERE best_seller AND id NOT IN (SELECT id FROM products WHERE best_seller ORDER BY updated_at DESC, id DESC LIMIT 10)');
    res.json({ ok: true });
  }));
  r.patch('/pos/sales/:invoice', manager, wrap(async (req, res) => {
    const d = z.object({ customerName: text(120).optional(), customerPhone: text(20).optional(), customerAddress: text(300).optional(), billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), notes: text(300).optional() }).parse(req.body);
    res.json(await editSale(db, req.user, req.params.invoice, d));
  }));
  r.patch('/pos/sales/:invoice/tailoring', biller, wrap(async (req, res) => {
    const { status } = z.object({ status: z.enum(['pending', 'completed']) }).parse(req.body);
    res.json(await setTailoring(db, req.user, req.params.invoice, status));
  }));

  // ---- advance orders (deposit now, bill on collection) ----
  r.post('/pos/advances', biller, wrap(async (req, res) => res.status(201).json(await createAdvance(db, req.user, advanceBody.parse(req.body)))));
  r.get('/pos/advances', biller, wrap(async (req, res) => res.json(await listAdvances(db, z.object({ status: z.enum(['all', 'pending', 'ready', 'completed', 'cancelled']).default('all'), q: text(80).default('') }).parse(req.query)))));
  r.get('/pos/advances/:code', biller, wrap(async (req, res) => {
    const a = await getAdvance(db, req.params.code);
    if (!a) throw new HttpError(404, 'Advance order not found');
    res.json(a);
  }));
  r.patch('/pos/advances/:code/status', biller, wrap(async (req, res) => {
    const { status } = z.object({ status: z.enum(['pending', 'ready', 'cancelled']) }).parse(req.body);
    if (status === 'cancelled' && !['owner', 'admin'].includes(req.user.role)) throw new HttpError(403, 'Only an owner or admin can cancel an advance order');
    res.json(await setAdvanceStatus(db, req.user, req.params.code, status));
  }));
  r.post('/pos/advances/:code/finalize', biller, wrap(async (req, res) => {
    const d = z.object({ balanceMode: z.enum(['cash', 'upi', 'card', 'split']).default('cash'), balanceSplit: z.object({ cash: paise.default(0), upi: paise.default(0), card: paise.default(0) }).optional(), paymentRef: text(80).optional() }).parse(req.body);
    res.json(await finalizeAdvance(db, req.user, req.params.code, d));
  }));

  // ---- coupons ----
  r.get('/pos/coupons', area('/admin/billing/coupons'), wrap(async (_req, res) => res.json(await rows(db, `
    SELECT c.id, c.code, c.discount_type AS "discountType", c.discount_value AS "discountValue", c.min_order AS "minOrder", c.expires_on::text AS "expiresOn",
           c.usage_limit AS "usageLimit", c.used_count AS "usedCount", c.active, c.sent_only AS "sentOnly",
           (SELECT COUNT(*) FROM pos_coupon_sends s WHERE s.coupon_id = c.id)::int AS "sentCount" FROM pos_coupons c ORDER BY c.id DESC`))));
  r.get('/pos/coupons/export', area('/admin/billing/coupons'), wrap(async (_req, res) => {
    const list = await rows(db, 'SELECT code, discount_type, discount_value, min_order, expires_on::text AS expires_on, usage_limit, used_count, active, sent_only FROM pos_coupons ORDER BY id DESC');
    const head = ['Code', 'Discount', 'Minimum order', 'Expires', 'Usage limit', 'Used', 'Status', 'Only sent customers'];
    const lines = list.map(c => [c.code, c.discount_type === 'percent' ? `${c.discount_value}%` : (c.discount_value / 100).toFixed(2), (c.min_order / 100).toFixed(2), c.expires_on ?? '', c.usage_limit ?? '', c.used_count, c.active ? 'Active' : 'Inactive', c.sent_only ? 'Yes' : 'No']);
    res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="coupons.csv"').send('\ufeff' + [head, ...lines].map(l => l.map(csvCell).join(',')).join('\n'));
  }));
  // Cashiers can validate a code at the till; the final check is repeated inside the sale transaction.
  r.get('/pos/coupons/check', biller, wrap(async (req, res) => {
    const q = z.object({ code: text(40).min(1), subtotal: z.coerce.number().int().min(0), phone: text(20).default('') }).parse(req.query);
    const c = await one(db, 'SELECT * FROM pos_coupons WHERE upper(code) = upper($1)', [q.code]);
    const problem = couponProblem(c, q.subtotal) ?? await couponAccessProblem(db, c, q.phone);
    if (problem) throw new HttpError(400, problem, 'bad_coupon');
    res.json({ code: c.code, discountType: c.discount_type, discountValue: c.discount_value });
  }));
  r.post('/pos/coupons', area('/admin/billing/coupons'), wrap(async (req, res) => {
    const c = couponBody.parse(req.body);
    const row = await one(db, `INSERT INTO pos_coupons (code, discount_type, discount_value, min_order, expires_on, usage_limit, sent_only) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [c.code, c.discountType, c.discountValue, c.minOrder, c.expiresOn, c.usageLimit, c.sentOnly]).catch(e => { if (e.code === '23505') throw new HttpError(409, 'That coupon code already exists'); throw e });
    await audit(db, req.user.id, 'pos.coupon.create', 'pos_coupon', row.id, { code: c.code });
    res.status(201).json({ id: row.id });
  }));
  // Either switch it on/off ({ active }) or edit it (everything except the code).
  r.patch('/pos/coupons/:id', area('/admin/billing/coupons'), wrap(async (req, res) => {
    const cid = id.parse(req.params.id);
    if (Object.keys(req.body ?? {}).length === 1 && 'active' in req.body) {
      const { active } = z.object({ active: z.boolean() }).parse(req.body);
      const u = await db.query('UPDATE pos_coupons SET active = $2 WHERE id = $1 RETURNING id', [cid, active]);
      if (!u.rows.length) throw new HttpError(404, 'Coupon not found');
      return res.json({ ok: true });
    }
    const c = z.object({ discountType: z.enum(['percent', 'fixed']), discountValue: z.number().int().min(1).max(100_000_000), minOrder: paise.default(0), expiresOn: date.nullable().default(null), usageLimit: z.number().int().min(1).nullable().default(null), sentOnly: z.boolean().default(false) })
      .refine(x => x.discountType !== 'percent' || x.discountValue <= 100, { message: 'Percent discount cannot exceed 100', path: ['discountValue'] }).parse(req.body);
    const u = await db.query('UPDATE pos_coupons SET discount_type = $2, discount_value = $3, min_order = $4, expires_on = $5, usage_limit = $6, sent_only = $7 WHERE id = $1 RETURNING id', [cid, c.discountType, c.discountValue, c.minOrder, c.expiresOn, c.usageLimit, c.sentOnly]);
    if (!u.rows.length) throw new HttpError(404, 'Coupon not found');
    res.json({ ok: true });
  }));
  // Record that a coupon was sent to a customer (the WhatsApp message itself is opened by the browser). onlyThis = make the coupon sent-only.
  r.post('/pos/coupons/:id/sends', area('/admin/billing/coupons'), wrap(async (req, res) => {
    const d = z.object({ phone: text(20).min(1), name: text(120).default(''), onlyThis: z.boolean().default(false) }).parse(req.body);
    const cid = id.parse(req.params.id), ph = normPhone(d.phone);
    if (!ph) throw new HttpError(400, 'Enter a valid mobile number');
    if (!(await one(db, 'SELECT 1 AS x FROM pos_coupons WHERE id = $1', [cid]))) throw new HttpError(404, 'Coupon not found');
    await db.query(`INSERT INTO pos_coupon_sends (coupon_id, phone, name) VALUES ($1,$2,$3) ON CONFLICT (coupon_id, phone) DO UPDATE SET sent_at = now(), name = COALESCE(NULLIF(EXCLUDED.name, ''), pos_coupon_sends.name)`, [cid, ph, d.name]);
    if (d.onlyThis) await db.query('UPDATE pos_coupons SET sent_only = true WHERE id = $1', [cid]);
    res.status(201).json({ ok: true, sentOnly: !!(await one(db, 'SELECT 1 AS x FROM pos_coupons WHERE id = $1 AND sent_only', [cid])) });
  }));
  // Every customer with a phone number, and whether this coupon was already sent to them.
  r.get('/pos/coupons/:id/recipients', area('/admin/billing/coupons'), wrap(async (req, res) => {
    const cid = id.parse(req.params.id);
    res.json(await rows(db, `
      SELECT c.name, c.phone, EXISTS (SELECT 1 FROM pos_coupon_sends s WHERE s.coupon_id = $1 AND s.phone = c.phone) AS sent
      FROM pos_customers c ORDER BY sent DESC, c.name, c.id LIMIT 1000`, [cid]));
  }));
  r.delete('/pos/coupons/:id', area('/admin/billing/coupons'), wrap(async (req, res) => {
    const d = await db.query('DELETE FROM pos_coupons WHERE id = $1 RETURNING code', [id.parse(req.params.id)]);
    if (!d.rows.length) throw new HttpError(404, 'Coupon not found');
    await audit(db, req.user.id, 'pos.coupon.delete', 'pos_coupon', req.params.id, { code: d.rows[0].code });
    res.json({ ok: true });
  }));

  // ---- customers (name, mobile, date of birth) ----
  r.get('/pos/customers', biller, wrap(async (req, res) => res.json(await listCustomers(db, z.object({ q: text(80).default('') }).parse(req.query).q))));
  r.get('/pos/customers/lookup', biller, wrap(async (req, res) => {
    const { phone } = z.object({ phone: text(20) }).parse(req.query);
    const p = normPhone(phone);
    res.json(p ? (await one(db, 'SELECT id, name, phone, dob::text AS dob FROM pos_customers WHERE phone = $1', [p])) : null);
  }));
  const dupCustomer = e => { if (e.code === '23505') throw new HttpError(409, 'A customer with that mobile number already exists'); throw e };
  r.post('/pos/customers', biller, wrap(async (req, res) => {
    const c = customerBody.parse(req.body); const p = normPhone(c.phone);
    if (!p) throw new HttpError(400, 'Enter a valid mobile number');
    const row = await one(db, 'INSERT INTO pos_customers (name, phone, dob, notes) VALUES ($1,$2,$3,$4) RETURNING id', [c.name, p, c.dob, c.notes]).catch(dupCustomer);
    res.status(201).json({ id: row.id });
  }));
  r.patch('/pos/customers/:id', manager, wrap(async (req, res) => {
    const c = customerBody.parse(req.body); const p = normPhone(c.phone);
    if (!p) throw new HttpError(400, 'Enter a valid mobile number');
    const row = await one(db, 'UPDATE pos_customers SET name = $2, phone = $3, dob = $4, notes = $5, updated_at = now() WHERE id = $1 RETURNING id', [id.parse(req.params.id), c.name, p, c.dob, c.notes]).catch(dupCustomer);
    if (!row) throw new HttpError(404, 'Customer not found');
    res.json({ ok: true });
  }));
  r.delete('/pos/customers/:id', manager, wrap(async (req, res) => {
    const d = await db.query('DELETE FROM pos_customers WHERE id = $1 RETURNING id', [id.parse(req.params.id)]);
    if (!d.rows.length) throw new HttpError(404, 'Customer not found');
    res.json({ ok: true });
  }));
  // Everything one customer has bought: bills, advance orders and stitching bills, with totals.
  r.get('/pos/customers/:id/history', biller, wrap(async (req, res) => {
    const c = await one(db, 'SELECT id, name, phone, dob::text AS dob, notes, created_at AS "createdAt" FROM pos_customers WHERE id = $1', [id.parse(req.params.id)]);
    if (!c) throw new HttpError(404, 'Customer not found');
    const invoices = await rows(db, `SELECT s.invoice_no AS "invoiceNo", s.status, s.bill_date::text AS "billDate", s.total_amount AS total, s.payment_mode AS "paymentMode", s.share_token AS "shareToken",
        EXISTS (SELECT 1 FROM pos_sale_items i WHERE i.sale_id = s.id AND i.variant_snapshot ? 'measure') AS stitching
      FROM pos_sales s WHERE ${PHONE_SQL('s.customer_phone')} = $1 ORDER BY s.id DESC LIMIT 200`, [c.phone]);
    const advances = await rows(db, `SELECT a.code, a.status, a.total_amount AS total, a.deposit, a.delivery_date::text AS "deliveryDate", a.finalized_invoice AS "invoiceNo"
      FROM pos_advances a WHERE ${PHONE_SQL('a.customer_phone')} = $1 ORDER BY a.id DESC LIMIT 100`, [c.phone]);
    const done = invoices.filter(i => i.status === 'completed');
    res.json({ customer: c, totals: { bills: done.length, spent: done.reduce((s, i) => s + i.total, 0), advances: advances.length }, invoices, advances, stitching: invoices.filter(i => i.stitching) });
  }));
  // Delivery charge rules (by PIN zone and order value).
  r.get('/pos/delivery-rules', manager, wrap(async (_req, res) => res.json(await loadRules(db))));
  r.put('/pos/delivery-rules', manager, wrap(async (req, res) => {
    const v = z.object({
      enabled: z.boolean(), note: text(300).default(''), storePin: z.string().regex(/^(\d{6})?$/, 'Shop PIN code must be 6 digits').default(''),
      defaultFee: paise, freeOver: paise.nullable(), maxKm: z.number().min(0).max(5000).default(0), perKmBeyond: paise.default(0),
      weightMode: z.boolean().default(false), productLines: z.array(text(300)).max(20).default([]),
      weightRegions: z.array(z.object({ name: text(60).min(1), active: z.boolean().default(true), prefixes: z.array(z.string().regex(/^\d{1,6}$/)).max(40).default([]),
        tiers: z.array(z.object({ minGrams: z.number().int().min(0).max(1_000_000), maxGrams: z.number().int().min(1).max(1_000_000).nullable(), fee: paise })).max(20).default([]) })).max(30).default([]),
      bands: z.array(z.object({ upToKm: z.number().positive().max(5000), fee: paise })).max(12).default([]),
      zones: z.array(z.object({ name: text(60).min(1), prefixes: z.array(z.string().regex(/^\d{1,6}$/)).min(1).max(30), fee: paise })).max(30).default([]),
      orderTiers: z.array(z.object({ minOrder: paise, fee: paise })).max(20).default([]),
      blockedPrefixes: z.array(z.string().regex(/^\d{1,6}$/)).max(50).default([]),
    }).parse(req.body);
    await putSetting(db, 'delivery_rules', { ...DEFAULT_RULES, ...v }); await audit(db, req.user.id, 'pos.delivery_rules', 'pos_settings', 'delivery_rules');
    res.json(await loadRules(db));
  }));
  r.get('/pos/birthday-offer', area('/admin/billing/birthdays'), wrap(async (_req, res) => res.json({ ...DEFAULT_BDAY, ...(await getSetting(db, 'birthday_offer', {})) })));
  r.put('/pos/birthday-offer', area('/admin/billing/birthdays'), wrap(async (req, res) => {
    const v = bdayBody.parse(req.body); if (v.selected && !v.offers.some(o => o.id === v.selected)) v.selected = v.offers[0]?.id ?? '';
    await putSetting(db, 'birthday_offer', v); await audit(db, req.user.id, 'pos.birthday_offer', 'pos_settings', 'birthday_offer'); res.json(v);
  }));
  r.get('/pos/birthdays', area('/admin/billing/birthdays'), wrap(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(366).default(30) }).parse(req.query);
    res.json(await birthdays(db, days));
  }));

  r.get('/pos/stock/movements', area('/admin/billing/inventory'), wrap(async (req, res) => {
    const f = z.object({ from: date.default(() => today()), to: date.default(() => today()), q: text(80).default(''), type: z.enum(['all', 'opening', 'sale', 'online', 'restock', 'loss', 'count', 'manual']).default('all') }).parse(req.query);
    res.json(await stockMovements(db, f));
  }));

  // ---- inventory: products with variants, stock adjustments (new products use the existing POST /admin/products) ----
  r.get('/pos/categories', reader, wrap(async (_req, res) => res.json(await rows(db, 'SELECT id, name, slug FROM categories WHERE active ORDER BY display_order, name'))));
  r.get('/pos/products', reader, wrap(async (req, res) => res.json(await listProducts(db, z.object({ q: text(80).default('') }).parse(req.query).q))));
  r.get('/pos/products/:id', reader, wrap(async (req, res) => {
    const p = (await listProducts(db, '', id.parse(req.params.id)))[0];
    if (!p) throw new HttpError(404, 'Product not found');
    res.json(p);
  }));
  r.patch('/pos/products/:id', area('/admin/billing/inventory', { not: ['inventory'] }), wrap(async (req, res) => {
    const d = productPatch.parse(req.body);
    const cat = d.categorySlug ? await one(db, 'SELECT id FROM categories WHERE slug = $1', [d.categorySlug]) : null;
    if (d.categorySlug && !cat) throw new HttpError(400, 'Unknown category');
    const u = await db.query('UPDATE products SET name = $2, base_price = $3, tax_rate = $4, category_id = $5, status = $6, updated_at = now() WHERE id = $1 RETURNING id', [id.parse(req.params.id), d.name, d.price, d.taxRate, cat?.id ?? null, d.status]);
    if (!u.rows.length) throw new HttpError(404, 'Product not found');
    if (d.costPrice !== undefined) {
      if (await hasCostColumns(db)) await db.query('UPDATE products SET cost_price = $2 WHERE id = $1', [id.parse(req.params.id), d.costPrice]);
      else if (d.costPrice > 0) throw new HttpError(409, 'Cost prices need a one-time database update first (migration 019).', 'cost_not_ready');
    }
    const pid = id.parse(req.params.id);
    if (d.description !== undefined || d.material !== undefined || d.featured !== undefined)
      await db.query(`UPDATE products SET description = COALESCE($2, description), material = CASE WHEN $3::text IS NULL THEN material ELSE NULLIF($3, '') END, featured = COALESCE($4, featured) WHERE id = $1`,
        [pid, d.description ?? null, d.material ?? null, d.featured ?? null]);
    if (d.bestSeller !== undefined) {
      await db.query('UPDATE products SET best_seller = $2, updated_at = now() WHERE id = $1', [pid, d.bestSeller]);
      // The Best Sellers shelf keeps only the 10 newest flagged pieces.
      await db.query('UPDATE products SET best_seller = false WHERE best_seller AND id NOT IN (SELECT id FROM products WHERE best_seller ORDER BY updated_at DESC, id DESC LIMIT 10)');
    }
    if (d.lowAlert !== undefined) await db.query('UPDATE products SET low_stock_alert = $2 WHERE id = $1', [pid, d.lowAlert]);
    if (d.weightGrams !== undefined) await db.query('UPDATE products SET weight_grams = $2 WHERE id = $1', [pid, d.weightGrams]);
    // Collections this piece belongs to: added at the end of a new collection, kept in place in ones it was already in.
    if (d.collections) await db.tx(async t => {
      const ids = (await rows(t, 'SELECT id FROM collections WHERE slug = ANY($1)', [d.collections])).map(r => r.id);
      await t.query('DELETE FROM collection_products WHERE product_id = $1 AND NOT (collection_id = ANY($2::int[]))', [pid, ids]);
      for (const c of ids) await t.query(`INSERT INTO collection_products (collection_id, product_id, display_order)
        SELECT $1, $2, COALESCE(MAX(display_order), -1) + 1 FROM collection_products WHERE collection_id = $1 ON CONFLICT (collection_id, product_id) DO NOTHING`, [c, pid]);
    });
    await audit(db, req.user.id, 'pos.product.edit', 'product', req.params.id, { name: d.name });
    res.json({ ok: true });
  }));
  // One size / colour row: rename it, change its SKU or its own price (null = the product price), hide or show it.
  r.patch('/pos/products/:id/variants/:vid', area('/admin/billing/inventory', { not: ['inventory'] }), wrap(async (req, res) => {
    const d = variantPatch.parse(req.body); const pid = id.parse(req.params.id), vid = id.parse(req.params.vid);
    const u = await db.query(`UPDATE product_variants SET size = COALESCE($3, size), color = COALESCE($4, color), sku = COALESCE($5, sku),
        price_override = CASE WHEN $6 THEN $7::int ELSE price_override END, active = COALESCE($8, active),
        cost_override = CASE WHEN $9 THEN $10::int ELSE cost_override END, weight_grams = CASE WHEN $11 THEN $12::int ELSE weight_grams END WHERE id = $2 AND product_id = $1 RETURNING id`,
      [pid, vid, d.size ?? null, d.color ?? null, d.sku ?? null, d.price !== undefined, d.price ?? null, d.active ?? null, d.cost !== undefined, d.cost ?? null, d.weight !== undefined, d.weight ?? null])
      .catch(e => { if (e.code === '23505') throw new HttpError(409, 'That SKU or size/colour already exists for this product'); throw e });
    if (!u.rows.length) throw new HttpError(404, 'Size not found');
    await audit(db, req.user.id, 'pos.variant.edit', 'product', pid, { variant: vid, ...d });
    res.json({ ok: true });
  }));
  r.delete('/pos/products/:id/variants/:vid', area('/admin/billing/inventory', { not: ['inventory'] }), wrap(async (req, res) => {
    const pid = id.parse(req.params.id), vid = id.parse(req.params.vid);
    const n = await one(db, 'SELECT COUNT(*)::int AS n FROM product_variants WHERE product_id = $1', [pid]);
    if (n.n <= 1) throw new HttpError(400, 'A product needs at least one size. Add another before removing this one.', 'last_variant');
    const d = await db.query('DELETE FROM product_variants WHERE id = $2 AND product_id = $1 RETURNING sku', [pid, vid]);
    if (!d.rows.length) throw new HttpError(404, 'Size not found');
    await audit(db, req.user.id, 'pos.variant.delete', 'product', pid, { sku: d.rows[0].sku });
    res.json({ ok: true });
  }));
  r.post('/pos/products/:id/variants', area('/admin/billing/inventory', { not: ['inventory'] }), wrap(async (req, res) => {
    const v = variantBody.parse(req.body); const pid = id.parse(req.params.id);
    const out = await db.tx(async t => {
      if (!(await one(t, 'SELECT 1 AS x FROM products WHERE id = $1', [pid]))) throw new HttpError(404, 'Product not found');
      const row = await one(t, 'INSERT INTO product_variants (product_id, sku, size, color, stock_quantity) VALUES ($1,$2,$3,$4,$5) RETURNING id', [pid, v.sku, v.size, v.color, v.stock]);
      if (v.stock) await t.query('INSERT INTO inventory_movements (variant_id, quantity_change, reason) VALUES ($1,$2,$3)', [row.id, v.stock, 'initial_stock']);
      await audit(t, req.user.id, 'pos.variant.add', 'product', pid, { sku: v.sku });
      return row;
    }).catch(e => { if (e.code === '23505') throw new HttpError(409, 'That SKU or size/colour already exists for this product'); throw e });
    res.status(201).json(out);
  }));
  // A colour option = one new variant per size, all in one transaction, optionally with its own price.
  r.post('/pos/products/:id/colours', area('/admin/billing/inventory', { not: ['inventory'] }), wrap(async (req, res) => {
    const d = colourBody.parse(req.body); const pid = id.parse(req.params.id);
    if (new Set(d.sizes.map(x => x.size.toLowerCase())).size !== d.sizes.length) throw new HttpError(400, 'Each size can only be listed once');
    const out = await db.tx(async t => {
      const p = await one(t, 'SELECT slug FROM products WHERE id = $1', [pid]);
      if (!p) throw new HttpError(404, 'Product not found');
      if (await one(t, 'SELECT 1 AS x FROM product_variants WHERE product_id = $1 AND lower(color) = lower($2)', [pid, d.color])) throw new HttpError(409, 'That colour already exists on this product');
      for (const s of d.sizes) {
        const sku = (s.sku || `${p.slug}-${slugify(d.color)}-${slugify(s.size)}`).toUpperCase();
        const v = await one(t, 'INSERT INTO product_variants (product_id, sku, size, color, price_override, stock_quantity) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [pid, sku, s.size, d.color, d.price, s.stock]);
        if (s.stock) await t.query('INSERT INTO inventory_movements (variant_id, quantity_change, reason) VALUES ($1,$2,$3)', [v.id, s.stock, 'initial_stock']);
      }
      await audit(t, req.user.id, 'pos.colour.add', 'product', pid, { color: d.color, sizes: d.sizes.length });
      return { created: d.sizes.length };
    }).catch(e => { if (e.code === '23505') throw new HttpError(409, 'A SKU for that colour / size already exists'); throw e });
    res.status(201).json(out);
  }));
  r.delete('/pos/products/:id/colours', area('/admin/billing/inventory', { not: ['inventory'] }), wrap(async (req, res) => {
    const { color } = z.object({ color: text(40).min(1) }).parse(req.query); const pid = id.parse(req.params.id);
    await db.tx(async t => {
      const all = await rows(t, 'SELECT id, color FROM product_variants WHERE product_id = $1', [pid]);
      const mine = all.filter(v => v.color.toLowerCase() === color.toLowerCase());
      if (!mine.length) throw new HttpError(404, 'Colour not found');
      if (mine.length === all.length) throw new HttpError(400, 'A product needs at least one colour — add another before removing this one', 'last_colour');
      await t.query('DELETE FROM product_variants WHERE product_id = $1 AND lower(color) = lower($2)', [pid, color]);
      await t.query('UPDATE product_images SET color = NULL WHERE product_id = $1 AND lower(color) = lower($2)', [pid, color]);
      await audit(t, req.user.id, 'pos.colour.remove', 'product', pid, { color });
    });
    res.json({ ok: true });
  }));
  // "Complete the look": up to 4 suggested pieces per product, in order.
  r.get('/pos/products/:id/suggested', reader, wrap(async (req, res) => res.json(await rows(db, `
    SELECT p.id, p.slug, p.name, (SELECT image_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.display_order, i.id LIMIT 1) AS image
    FROM product_suggestions s JOIN products p ON p.id = s.suggested_id WHERE s.product_id = $1 ORDER BY s.display_order`, [id.parse(req.params.id)]))));
  r.put('/pos/products/:id/suggested', area('/admin/billing/inventory', { not: ['inventory'] }), wrap(async (req, res) => {
    const pid = id.parse(req.params.id);
    const { ids } = z.object({ ids: z.array(id).max(4) }).parse(req.body);
    if (new Set(ids).size !== ids.length || ids.includes(pid)) throw new HttpError(400, 'Pick each suggested piece once, and not the product itself');
    await db.tx(async t => {
      await t.query('DELETE FROM product_suggestions WHERE product_id = $1', [pid]);
      for (const [i, sid] of ids.entries()) await t.query('INSERT INTO product_suggestions (product_id, suggested_id, display_order) VALUES ($1,$2,$3)', [pid, sid, i]);
    }).catch(e => { if (e.code === '23503') throw new HttpError(400, 'One of those products does not exist'); throw e });
    res.json({ ok: true });
  }));
  r.post('/pos/stock', area('/admin/billing/inventory'), wrap(async (req, res) => res.json(await adjustStock(db, req.user, stockBody.parse(req.body)))));

  // ---- expenses (money out, subtracted in analytics) ----
  r.get('/pos/expenses', area('/admin/billing/expenses'), wrap(async (req, res) => {
    const { from, to } = z.object({ from: date, to: date }).parse(req.query);
    res.json(await listExpenses(db, from, to));
  }));
  r.post('/pos/expenses', area('/admin/billing/expenses'), wrap(async (req, res) => {
    const e = expenseBody.parse(req.body);
    if (e.date && e.date > today()) throw new HttpError(400, 'Expense date cannot be in the future');
    const row = await one(db, 'INSERT INTO pos_expenses (title, category, amount, payment_mode, notes, expense_date, created_by) VALUES ($1,$2,$3,$4,$5,COALESCE($6::date, (now() AT TIME ZONE \'Asia/Kolkata\')::date),$7) RETURNING id',
      [e.title, e.category, e.amount, e.paymentMode, e.notes, e.date ?? null, req.user.id]);
    await audit(db, req.user.id, 'pos.expense.create', 'pos_expense', row.id, { amount: e.amount });
    res.status(201).json({ id: row.id });
  }));
  // expense categories live in the POS settings (no database change needed). Existing expenses keep the name they were saved with.
  const catName = z.object({ name: text(60).min(1) });
  const loadCats = async () => { const c = await getSetting(db, 'expense_categories', null); return Array.isArray(c) ? c : DEFAULT_EXPENSE_CATEGORIES };
  r.get('/pos/expense-categories', area('/admin/billing/expenses'), wrap(async (_req, res) => res.json(await loadCats())));
  r.post('/pos/expense-categories', area('/admin/billing/expenses'), wrap(async (req, res) => {
    const { name } = catName.parse(req.body); const cats = await loadCats();
    if (cats.some(c => c.toLowerCase() === name.toLowerCase())) throw new HttpError(409, 'That category already exists');
    if (cats.length >= 60) throw new HttpError(400, 'You can keep up to 60 categories');
    const next = [...cats, name].sort((a, b) => a.localeCompare(b)); await putSetting(db, 'expense_categories', next);
    await audit(db, req.user.id, 'pos.expense_category.add', 'pos_settings', name); res.status(201).json(next);
  }));
  r.delete('/pos/expense-categories', area('/admin/billing/expenses'), wrap(async (req, res) => {
    const { name } = catName.parse(req.query); const cats = await loadCats();
    if (!cats.includes(name)) throw new HttpError(404, 'Category not found');
    const next = cats.filter(c => c !== name); await putSetting(db, 'expense_categories', next);
    await audit(db, req.user.id, 'pos.expense_category.remove', 'pos_settings', name); res.json(next);
  }));
  r.delete('/pos/expenses/:id', area('/admin/billing/expenses'), wrap(async (req, res) => {
    const d = await db.query('DELETE FROM pos_expenses WHERE id = $1 RETURNING id', [id.parse(req.params.id)]);
    if (!d.rows.length) throw new HttpError(404, 'Expense not found');
    await audit(db, req.user.id, 'pos.expense.delete', 'pos_expense', req.params.id);
    res.json({ ok: true });
  }));

  // ---- wholesale catalogue ----
  r.get('/pos/ws/items', biller, wrap(async (req, res) => {
    const { q } = z.object({ q: text(80).default('') }).parse(req.query);
    const like = `%${q.replace(/[\\%_]/g, m => '\\' + m)}%`;
    res.json(await rows(db, `SELECT id, code, company, colour FROM pos_ws_items WHERE $1 = '' OR code ILIKE $2 OR company ILIKE $2 OR colour ILIKE $2 ORDER BY upper(code), id LIMIT 500`, [q.trim(), like]));
  }));
  const dup = e => { if (e.code === '23505') throw new HttpError(409, 'That code / company / colour already exists'); throw e };
  r.post('/pos/ws/items', manager, wrap(async (req, res) => {
    const d = wsItem.parse(req.body);
    res.status(201).json(await one(db, 'INSERT INTO pos_ws_items (code, company, colour) VALUES ($1,$2,$3) RETURNING id, code, company, colour', [d.code, d.company, d.colour]).catch(dup));
  }));
  r.patch('/pos/ws/items/:id', manager, wrap(async (req, res) => {
    const d = wsItem.parse(req.body);
    const row = await one(db, 'UPDATE pos_ws_items SET code = $2, company = $3, colour = $4 WHERE id = $1 RETURNING id, code, company, colour', [id.parse(req.params.id), d.code, d.company, d.colour]).catch(dup);
    if (!row) throw new HttpError(404, 'Item not found');
    res.json(row);
  }));
  r.delete('/pos/ws/items/:id', manager, wrap(async (req, res) => {
    const d = await db.query('DELETE FROM pos_ws_items WHERE id = $1 RETURNING id', [id.parse(req.params.id)]);
    if (!d.rows.length) throw new HttpError(404, 'Item not found');
    res.json({ ok: true });
  }));

  return r;
}
