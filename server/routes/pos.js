import { Router } from 'express';
import { z } from 'zod';
import { one, rows } from '../db/index.js';
import { HttpError, wrap } from '../lib/http.js';
import { audit } from '../lib/orders.js';
import { birthdays, couponProblem, createSale, getSale, getSetting, listSales, putSetting, report, searchVariants, voidSale } from '../lib/pos.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const paise = z.number().int().min(0).max(100_000_000);
const text = n => z.string().trim().max(n);
const channel = z.enum(['retail', 'wholesale']).default('retail');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

const item = z.union([
  z.object({ variantId: z.number().int().positive(), qty: z.number().int().min(1).max(999) }),
  // free-text line (retail "Item name / description" and every wholesale line): cashier-entered price, no stock
  z.object({ name: text(160).min(1), sku: text(60).optional(), price: paise, qty: z.number().int().min(1).max(99999), taxRate: z.number().int().min(0).max(28).default(0) }),
]);
const saleBody = z.object({
  idempotencyKey: z.string().min(8).max(80),
  channel,
  items: z.array(item).min(1).max(100),
  customerName: text(120).default(''),
  customerPhone: text(20).regex(/^[0-9+\-\s]*$/, 'Phone may only contain digits').default(''),
  customerDob: date.optional(),
  isGst: z.boolean().default(true),
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
});
const couponBody = z.object({
  code: text(40).regex(/^[A-Za-z0-9_-]{3,40}$/, 'Use 3-40 letters, digits, - or _'),
  discountType: z.enum(['percent', 'fixed']), discountValue: z.number().int().min(1).max(100_000_000),
  minOrder: paise.default(0), expiresOn: date.nullable().default(null), usageLimit: z.number().int().min(1).nullable().default(null),
}).refine(c => c.discountType !== 'percent' || c.discountValue <= 100, { message: 'Percent discount cannot exceed 100', path: ['discountValue'] });
const wsItem = z.object({ code: text(60).min(1), company: text(120).default(''), colour: text(60).default('') });
const id = z.coerce.number().int().positive();

const SETTINGS_DEFAULT = settingsBody.parse({});

// Dhanya POS API. Roles are enforced here on the server (and re-read from the database on every request by auth.role):
// owner/admin/cashier may bill and look things up; only owner/admin may void bills, view reports and manage coupons,
// settings and the wholesale catalogue.
export default function pos({ db, auth }) {
  const r = Router();
  const biller = auth.role('owner', 'admin', 'cashier');
  const manager = auth.role('owner', 'admin');

  r.get('/pos/shop', biller, wrap(async (_req, res) => {
    const s = (await one(db, "SELECT value FROM store_settings WHERE key = 'store'"))?.value ?? {};
    const cfg = await getSetting(db, 'invoice', SETTINGS_DEFAULT);
    res.json({
      name: s.name || 'DHANYA', address: s.address ?? [], phone: s.phone ?? null, email: s.email ?? null,
      gstin: cfg.gstin || '', showGst: { retail: !!cfg.showGstRetail, wholesale: !!cfg.showGstWholesale },
      deliveryPresets: cfg.deliveryPresets ?? [],
    });
  }));
  r.get('/pos/settings', manager, wrap(async (_req, res) => res.json({ ...SETTINGS_DEFAULT, ...(await getSetting(db, 'invoice', {})) })));
  r.put('/pos/settings', manager, wrap(async (req, res) => {
    const v = settingsBody.parse(req.body);
    await putSetting(db, 'invoice', v); await audit(db, req.user.id, 'pos.settings', 'pos_settings', 'invoice');
    res.json(v);
  }));

  // ---- retail catalogue / inventory view (shared with the online store) ----
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
    const f = z.object({ q: text(80).default(''), from: date.optional(), to: date.optional(), channel }).parse(req.query);
    // Cashiers only see today's bills; owner/admin can search the full history.
    if (req.user.role === 'cashier') f.from = f.to = today();
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
  r.get('/pos/reports', manager, wrap(async (req, res) => {
    const { from, to, channel: ch } = z.object({ from: date, to: date, channel }).parse(req.query);
    if (from > to) throw new HttpError(400, 'From date is after To date');
    res.json(await report(db, from, to, ch));
  }));

  // ---- coupons ----
  r.get('/pos/coupons', manager, wrap(async (_req, res) => res.json(await rows(db, `
    SELECT id, code, discount_type AS "discountType", discount_value AS "discountValue", min_order AS "minOrder", expires_on::text AS "expiresOn",
           usage_limit AS "usageLimit", used_count AS "usedCount", active FROM pos_coupons ORDER BY id DESC`))));
  // Cashiers can validate a code at the till; the final check is repeated inside the sale transaction.
  r.get('/pos/coupons/check', biller, wrap(async (req, res) => {
    const q = z.object({ code: text(40).min(1), subtotal: z.coerce.number().int().min(0) }).parse(req.query);
    const c = await one(db, 'SELECT * FROM pos_coupons WHERE upper(code) = upper($1)', [q.code]);
    const problem = couponProblem(c, q.subtotal);
    if (problem) throw new HttpError(400, problem, 'bad_coupon');
    res.json({ code: c.code, discountType: c.discount_type, discountValue: c.discount_value });
  }));
  r.post('/pos/coupons', manager, wrap(async (req, res) => {
    const c = couponBody.parse(req.body);
    const row = await one(db, `INSERT INTO pos_coupons (code, discount_type, discount_value, min_order, expires_on, usage_limit) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [c.code, c.discountType, c.discountValue, c.minOrder, c.expiresOn, c.usageLimit]).catch(e => { if (e.code === '23505') throw new HttpError(409, 'That coupon code already exists'); throw e });
    await audit(db, req.user.id, 'pos.coupon.create', 'pos_coupon', row.id, { code: c.code });
    res.status(201).json({ id: row.id });
  }));
  r.patch('/pos/coupons/:id', manager, wrap(async (req, res) => {
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    const u = await db.query('UPDATE pos_coupons SET active = $2 WHERE id = $1 RETURNING id', [id.parse(req.params.id), active]);
    if (!u.rows.length) throw new HttpError(404, 'Coupon not found');
    res.json({ ok: true });
  }));
  r.delete('/pos/coupons/:id', manager, wrap(async (req, res) => {
    const d = await db.query('DELETE FROM pos_coupons WHERE id = $1 RETURNING code', [id.parse(req.params.id)]);
    if (!d.rows.length) throw new HttpError(404, 'Coupon not found');
    await audit(db, req.user.id, 'pos.coupon.delete', 'pos_coupon', req.params.id, { code: d.rows[0].code });
    res.json({ ok: true });
  }));

  // ---- customer birthdays (derived from bills that captured a date of birth) ----
  r.get('/pos/birthdays', manager, wrap(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(366).default(30) }).parse(req.query);
    res.json(await birthdays(db, days));
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
