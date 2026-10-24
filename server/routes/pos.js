import { Router } from 'express';
import { z } from 'zod';
import { one, rows } from '../db/index.js';
import { HttpError, wrap } from '../lib/http.js';
import { audit } from '../lib/orders.js';
import { adjustStock, birthdays, couponProblem, createSale, getSale, getSetting, listCustomers, listExpenses, listProducts, listSales, normPhone, putSetting, report, searchVariants, voidSale } from '../lib/pos.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const paise = z.number().int().min(0).max(100_000_000);
const text = n => z.string().trim().max(n);
const channel = z.enum(['retail', 'wholesale']).default('retail');
const gstFilter = z.enum(['all', 'gst', 'nongst']).default('all');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

const item = z.union([
  z.object({ variantId: z.number().int().positive(), qty: z.number().int().min(1).max(999) }),
  // free-text line (retail "Item name / description", services, and every wholesale line): cashier-entered price, no stock
  z.object({ name: text(160).min(1), sku: text(60).optional(), price: paise, qty: z.number().int().min(1).max(99999), taxRate: z.number().int().min(0).max(28).default(0) }),
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
});
const couponBody = z.object({
  code: text(40).regex(/^[A-Za-z0-9_-]{3,40}$/, 'Use 3-40 letters, digits, - or _'),
  discountType: z.enum(['percent', 'fixed']), discountValue: z.number().int().min(1).max(100_000_000),
  minOrder: paise.default(0), expiresOn: date.nullable().default(null), usageLimit: z.number().int().min(1).nullable().default(null),
}).refine(c => c.discountType !== 'percent' || c.discountValue <= 100, { message: 'Percent discount cannot exceed 100', path: ['discountValue'] });
const wsItem = z.object({ code: text(60).min(1), company: text(120).default(''), colour: text(60).default('') });
const customerBody = z.object({ name: text(120).default(''), phone: text(20).regex(/^[0-9+\-\s]*$/, 'Phone may only contain digits'), dob: date.nullable().default(null), notes: text(300).nullable().default(null) });
const expenseBody = z.object({ title: text(120).min(1), category: text(60).default('General'), amount: z.number().int().min(1).max(100_000_000), paymentMode: z.enum(['cash', 'upi', 'card']).default('cash'), notes: text(300).nullable().default(null), date: date.optional() });
const productPatch = z.object({ name: text(160).min(1), price: paise, taxRate: z.number().int().min(0).max(28), categorySlug: text(80).nullable().default(null), status: z.enum(['draft', 'active', 'archived']) });
const variantBody = z.object({ size: text(40).min(1), color: text(40).default('Default'), sku: text(80).min(1), stock: z.number().int().min(0).max(1_000_000).default(0) });
const stockBody = z.object({ variantId: z.number().int().positive(), type: z.enum(['restock', 'return', 'loss', 'reconcile']), qty: z.number().int().min(0).max(1_000_000), note: text(100).optional() })
  .refine(b => b.type === 'reconcile' || b.qty >= 1, { message: 'Enter a quantity of at least 1', path: ['qty'] });
const id = z.coerce.number().int().positive();

const SETTINGS_DEFAULT = settingsBody.parse({});

// Dhanya POS API. Roles are enforced here on the server (and re-read from the database on every request by auth.role):
// owner/admin/cashier may bill and look things up; only owner/admin may void bills, view reports and manage coupons, settings,
// customers' edits, expenses, products and the wholesale catalogue; inventory staff may also adjust stock.
export default function pos({ db, auth }) {
  const r = Router();
  const biller = auth.role('owner', 'admin', 'cashier');
  const manager = auth.role('owner', 'admin');
  const stockers = auth.role('owner', 'admin', 'inventory');

  r.get('/pos/shop', biller, wrap(async (_req, res) => {
    const s = (await one(db, "SELECT value FROM store_settings WHERE key = 'store'"))?.value ?? {};
    const logo = (await one(db, "SELECT value FROM store_settings WHERE key = 'branding'"))?.value?.logo ?? null;
    const cfg = await getSetting(db, 'invoice', SETTINGS_DEFAULT);
    res.json({
      name: s.name || 'DHANYA', address: s.address ?? [], phone: s.phone ?? null, email: s.email ?? null, logo,
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
    const f = z.object({ q: text(80).default(''), from: date.optional(), to: date.optional(), channel, gst: gstFilter }).parse(req.query);
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
    const { from, to, channel: ch, gst } = z.object({ from: date, to: date, channel, gst: gstFilter }).parse(req.query);
    if (from > to) throw new HttpError(400, 'From date is after To date');
    res.json(await report(db, from, to, ch, gst));
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
  r.get('/pos/birthdays', manager, wrap(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(366).default(30) }).parse(req.query);
    res.json(await birthdays(db, days));
  }));

  // ---- inventory: products with variants, stock adjustments (new products use the existing POST /admin/products) ----
  r.get('/pos/categories', biller, wrap(async (_req, res) => res.json(await rows(db, 'SELECT id, name, slug FROM categories WHERE active ORDER BY display_order, name'))));
  r.get('/pos/products', biller, wrap(async (req, res) => res.json(await listProducts(db, z.object({ q: text(80).default('') }).parse(req.query).q))));
  r.patch('/pos/products/:id', manager, wrap(async (req, res) => {
    const d = productPatch.parse(req.body);
    const cat = d.categorySlug ? await one(db, 'SELECT id FROM categories WHERE slug = $1', [d.categorySlug]) : null;
    if (d.categorySlug && !cat) throw new HttpError(400, 'Unknown category');
    const u = await db.query('UPDATE products SET name = $2, base_price = $3, tax_rate = $4, category_id = $5, status = $6, updated_at = now() WHERE id = $1 RETURNING id', [id.parse(req.params.id), d.name, d.price, d.taxRate, cat?.id ?? null, d.status]);
    if (!u.rows.length) throw new HttpError(404, 'Product not found');
    await audit(db, req.user.id, 'pos.product.edit', 'product', req.params.id, { name: d.name });
    res.json({ ok: true });
  }));
  r.post('/pos/products/:id/variants', manager, wrap(async (req, res) => {
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
  r.post('/pos/stock', stockers, wrap(async (req, res) => res.json(await adjustStock(db, req.user, stockBody.parse(req.body)))));

  // ---- expenses (money out, subtracted in analytics) ----
  r.get('/pos/expenses', manager, wrap(async (req, res) => {
    const { from, to } = z.object({ from: date, to: date }).parse(req.query);
    res.json(await listExpenses(db, from, to));
  }));
  r.post('/pos/expenses', manager, wrap(async (req, res) => {
    const e = expenseBody.parse(req.body);
    if (e.date && e.date > today()) throw new HttpError(400, 'Expense date cannot be in the future');
    const row = await one(db, 'INSERT INTO pos_expenses (title, category, amount, payment_mode, notes, expense_date, created_by) VALUES ($1,$2,$3,$4,$5,COALESCE($6::date, (now() AT TIME ZONE \'Asia/Kolkata\')::date),$7) RETURNING id',
      [e.title, e.category, e.amount, e.paymentMode, e.notes, e.date ?? null, req.user.id]);
    await audit(db, req.user.id, 'pos.expense.create', 'pos_expense', row.id, { amount: e.amount });
    res.status(201).json({ id: row.id });
  }));
  r.delete('/pos/expenses/:id', manager, wrap(async (req, res) => {
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
