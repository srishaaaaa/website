import crypto from 'node:crypto';
import { rows, one } from '../db/index.js';
import { HttpError } from './http.js';
import { hasCostColumns } from './cost.js';
import { audit } from './orders.js';

const TZ = 'Asia/Kolkata';
const istDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const istYear = () => Number(istDate().slice(0, 4));
const PREFIX = { retail: 'DP', wholesale: 'DW', advance: 'AO' };
// Last 10 digits, so formatting differences never create duplicate customers. Returns '' when there is no usable number.
export const normPhone = v => { const d = String(v ?? '').replace(/\D/g, ''); return d.length >= 7 ? d.slice(-10) : '' };
export const PHONE_SQL = c => `right(regexp_replace(${c}, '\\D', '', 'g'), 10)`;

// Bill maths, all in integer paise. Mirrors IGMOLS: taxable = subtotal - discount; total = taxable + GST + delivery.
// The bill discount is shared across lines in proportion to their value (remainder paise go to the first lines) so GST
// is charged on what the customer actually pays, line by line.
export function computeBill(lines, { isGst = true, gstRate = null, discountType = 'fixed', discountValue = 0, deliveryFee = 0 } = {}) {
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const discount = discountType === 'percent' ? Math.round(subtotal * discountValue / 100) : discountValue;
  if (discountType === 'percent' && discountValue > 100) throw new HttpError(400, 'Discount cannot exceed 100%', 'bad_discount');
  if (discount > subtotal) throw new HttpError(400, 'Discount cannot exceed the bill subtotal', 'bad_discount');
  const out = lines.map(l => ({ ...l, lineTotal: l.price * l.qty, alloc: subtotal ? Math.floor(discount * l.price * l.qty / subtotal) : 0 }));
  let rest = discount - out.reduce((s, l) => s + l.alloc, 0);
  for (let i = 0; rest > 0; i = (i + 1) % out.length, rest--) out[i].alloc++;
  for (const l of out) { if (isGst && gstRate != null) l.taxRate = gstRate; l.tax = isGst ? Math.round((l.lineTotal - l.alloc) * l.taxRate / 100) : 0 }
  const tax = out.reduce((s, l) => s + l.tax, 0);
  return { lines: out, subtotal, discount, tax, deliveryFee, total: subtotal - discount + tax + deliveryFee };
}

// Splits the bill total over payment methods and validates it. Returns the amounts to store.
export function settle(total, { mode, cash = 0, upi = 0, card = 0, tendered }) {
  if (mode === 'split') {
    if (cash + upi + card !== total) throw new HttpError(400, 'Split payments must add up exactly to the bill total', 'bad_split');
    return { cash, upi, card, tendered: cash, change: 0 };
  }
  if (mode === 'cash') {
    const given = tendered ?? total;
    if (given < total) throw new HttpError(400, 'Cash received is less than the bill total', 'short_cash');
    return { cash: total, upi: 0, card: 0, tendered: given, change: given - total };
  }
  return { cash: 0, upi: mode === 'upi' ? total : 0, card: mode === 'card' ? total : 0, tendered: 0, change: 0 };
}

// Returns the reason a coupon cannot be used for this subtotal, or null if it is valid.
export function couponProblem(c, subtotal) {
  if (!c || !c.active) return 'That coupon code is not valid';
  if (c.expires_on && String(c.expires_on).slice(0, 10) < istDate()) return 'That coupon has expired';
  if (c.usage_limit != null && c.used_count >= c.usage_limit) return 'That coupon has reached its usage limit';
  if (subtotal < c.min_order) return `This coupon needs a minimum bill of ₹${(c.min_order / 100).toLocaleString('en-IN')}`;
  return null;
}

// Short, easy-to-read references: INV-2026-G3AKL for bills, DEP-20261026-8207 for advance orders. Look-alike characters (0/O, 1/I) are left out.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randCode = n => Array.from(crypto.randomBytes(n), b => CODE_CHARS[b % CODE_CHARS.length]).join('');
const invoiceNo = async (t, channel) => {
  const y = istYear();
  if (channel === 'wholesale') { // older wholesale bills keep their numbered series
    const { last } = await one(t, 'INSERT INTO pos_counters (year, channel, last) VALUES ($1, $2, 1) ON CONFLICT (year, channel) DO UPDATE SET last = pos_counters.last + 1 RETURNING last', [y, channel]);
    return `${PREFIX[channel]}-${y}-${String(last).padStart(6, '0')}`;
  }
  for (let i = 0; i < 12; i++) {
    const no = `INV-${y}-${randCode(5)}`;
    if (!await one(t, 'SELECT 1 AS x FROM pos_sales WHERE invoice_no = $1', [no])) return no;
  }
  throw new HttpError(500, 'Could not create an invoice number. Please try again.');
};

// Variants for the retail billing screen and inventory panel: price and stock come straight from the shared catalogue tables.
export const searchVariants = (db, q = '', limit = 40) => {
  limit = Math.min(Math.max(limit, 1), 300);
  const like = `%${q.replace(/[\\%_]/g, m => '\\' + m)}%`;
  return rows(db, `
    SELECT v.id AS "variantId", p.id AS "productId", p.name, v.sku, v.size, v.color, c.name AS category,
           COALESCE(v.price_override, p.base_price) AS price, v.stock_quantity AS stock, p.tax_rate AS "taxRate",
           (SELECT image_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.display_order, i.id LIMIT 1) AS image
    FROM product_variants v JOIN products p ON p.id = v.product_id LEFT JOIN categories c ON c.id = p.category_id
    WHERE v.active AND p.status = 'active'
      AND ($1 = '' OR p.name ILIKE $2 OR v.sku ILIKE $2 OR v.size ILIKE $2 OR v.color ILIKE $2 OR c.name ILIKE $2)
    ORDER BY p.name, v.size, v.color LIMIT $3`, [q.trim(), like, limit]);
};

export async function getSaleByToken(q, token) {
  const r = await one(q, 'SELECT invoice_no FROM pos_sales WHERE share_token = $1', [String(token).slice(0, 64)]);
  return r ? getSale(q, r.invoice_no) : null;
}

export async function getSale(q, invoice) {
  const sale = await one(q, `
    SELECT s.id, s.invoice_no AS "invoiceNo", s.channel, s.status, s.customer_name AS "customerName", s.customer_phone AS "customerPhone",
           s.is_gst AS "isGst", s.subtotal, s.discount_type AS "discountType", s.discount_value AS "discountValue", s.discount_amount AS discount,
           s.tax_amount AS tax, s.delivery_fee AS "deliveryFee", s.total_amount AS total, s.payment_mode AS "paymentMode",
           s.pay_cash AS "payCash", s.pay_upi AS "payUpi", s.pay_card AS "payCard", s.cash_tendered AS "cashTendered", s.change_given AS change,
           s.payment_ref AS "paymentRef", s.customer_dob::text AS "customerDob", s.coupon_code AS "couponCode", s.notes,
           s.share_token AS "shareToken", s.bill_date::text AS "billDate", s.customer_address AS "customerAddress", s.source, s.gst_rate AS "gstRate", s.created_at AS "createdAt", s.voided_at AS "voidedAt", s.void_reason AS "voidReason", pr.full_name AS cashier
    FROM pos_sales s LEFT JOIN profiles pr ON pr.id = s.cashier_id WHERE s.invoice_no = $1`, [invoice]);
  if (!sale) return null;
  sale.items = await rows(q, `
    SELECT name_snapshot AS name, sku_snapshot AS sku, variant_snapshot AS variant, unit_price AS "unitPrice", quantity,
           line_total AS "lineTotal", discount_alloc AS discount, tax_rate AS "taxRate", tax_amount AS tax
    FROM pos_sale_items WHERE sale_id = $1 ORDER BY id`, [sale.id]);
  return sale;
}

// Turns the items on a bill into priced lines: catalogue items are priced from the database (the client only names variants and quantities),
// free-text items carry the cashier's price. `trusted` lets server-side callers (advance orders) pass the price that was agreed at booking.
async function resolveLines(t, items, { trusted = false, checkStock = false } = {}) {
  // Merge repeated variants, then lock in a stable order (no deadlocks between two cashiers).
  const want = new Map(), prices = new Map(), custom = [];
  for (const it of items) {
    if (it.variantId) { want.set(it.variantId, (want.get(it.variantId) ?? 0) + it.qty); if (trusted && it.price != null) prices.set(it.variantId, it.price) }
    else custom.push({ variantId: null, product_id: null, name: it.name, sku: it.sku ?? '', size: '', color: '', price: it.price, qty: it.qty, taxRate: it.taxRate ?? 0, stock: null, ...(it.measure ? { measure: it.measure } : {}) });
  }
  const ids = [...want.keys()].sort((a, b) => a - b);
  const info = ids.length ? await rows(t, `
    SELECT v.id, v.product_id, p.name, v.sku, v.size, v.color, v.stock_quantity AS stock, p.tax_rate AS "taxRate",
           COALESCE(v.price_override, p.base_price) AS price
    FROM product_variants v JOIN products p ON p.id = v.product_id
    WHERE v.id = ANY($1) AND v.active AND p.status = 'active'`, [ids]) : [];
  const byId = new Map(info.map(r => [r.id, r]));
  return ids.map(id => {
    const r = byId.get(id);
    if (!r) throw new HttpError(409, 'An item on this bill is no longer available', 'unavailable');
    if (checkStock && want.get(id) > r.stock) throw new HttpError(409, `Only ${r.stock} left of ${r.name} (${r.size}${r.color !== 'Default' ? ', ' + r.color : ''})`, 'insufficient_stock');
    return { ...r, variantId: id, qty: want.get(id), ...(prices.has(id) ? { price: prices.get(id) } : {}) };
  }).concat(custom);
}

// Creates a bill atomically. Catalogue items are priced from the database (the client only names variants and quantities),
// stock is decremented with a guarded UPDATE so concurrent bills or online checkouts can never oversell, and any failure rolls
// the whole sale back. Free-text lines (and every wholesale line) carry a cashier-entered price and touch no stock.
// The idempotency key makes retries/double-clicks return the original bill.
export async function createSale(db, user, d) {
  const existing = await one(db, 'SELECT invoice_no FROM pos_sales WHERE idempotency_key = $1', [d.idempotencyKey]);
  if (existing) return { ...(await getSale(db, existing.invoice_no)), duplicate: true };
  if (d.channel === 'wholesale' && d.items.some(i => i.variantId)) throw new HttpError(400, 'Wholesale bills use wholesale items only', 'bad_items');
  try {
    const invoice = await db.tx(async t => {
      const lines = await resolveLines(t, d.items, { trusted: !!d.trusted });

      let { discountType, discountValue } = d, couponCode = null;
      if (d.couponCode) {
        const c = await one(t, 'SELECT * FROM pos_coupons WHERE upper(code) = upper($1) FOR UPDATE', [d.couponCode]);
        const problem = couponProblem(c, lines.reduce((s, l) => s + l.price * l.qty, 0));
        if (problem) throw new HttpError(400, problem, 'bad_coupon');
        ({ discount_type: discountType, discount_value: discountValue, code: couponCode } = c);
        await t.query('UPDATE pos_coupons SET used_count = used_count + 1 WHERE id = $1', [c.id]);
      }
      const bill = computeBill(lines, { isGst: d.isGst, gstRate: d.gstRate ?? null, discountType, discountValue, deliveryFee: d.deliveryFee });
      const pay = settle(bill.total, { mode: d.paymentMode, ...d.payments, tendered: d.cashTendered });
      const billDate = d.billDate ?? istDate();
      if (billDate > istDate()) throw new HttpError(400, 'Bill date cannot be in the future', 'bad_date');
      const number = await invoiceNo(t, d.channel);
      const sale = await one(t, `
        INSERT INTO pos_sales (invoice_no, idempotency_key, channel, customer_name, customer_phone, customer_dob, is_gst, subtotal, discount_type, discount_value, discount_amount,
          tax_amount, delivery_fee, total_amount, payment_mode, pay_cash, pay_upi, pay_card, cash_tendered, change_given, payment_ref, notes, cashier_id, coupon_code,
          bill_date, customer_address, source, gst_rate, share_token)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29) RETURNING id`,
        [number, d.idempotencyKey, d.channel, d.customerName, d.customerPhone, d.customerDob ?? null, d.isGst, bill.subtotal, discountType, discountValue, bill.discount,
          bill.tax, bill.deliveryFee, bill.total, d.paymentMode, pay.cash, pay.upi, pay.card, pay.tendered, pay.change, d.paymentRef ?? null, d.notes ?? null, user.id, couponCode, billDate, d.customerAddress ?? '', d.source ?? 'offline', d.isGst ? (d.gstRate ?? null) : null, crypto.randomBytes(16).toString('base64url')]);
      for (const l of bill.lines) {
        if (l.variantId) {
          const u = await t.query('UPDATE product_variants SET stock_quantity = stock_quantity - $1 WHERE id = $2 AND stock_quantity >= $1 RETURNING stock_quantity', [l.qty, l.variantId]);
          if (!u.rows.length) throw new HttpError(409, `Only ${l.stock} left of ${l.name} (${l.size}${l.color !== 'Default' ? ', ' + l.color : ''})`, 'insufficient_stock');
        }
        await t.query(`INSERT INTO pos_sale_items (sale_id, product_id, variant_id, name_snapshot, sku_snapshot, variant_snapshot, unit_price, quantity, line_total, discount_alloc, tax_rate, tax_amount)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [sale.id, l.product_id, l.variantId, l.name, l.sku, JSON.stringify(l.variantId ? { size: l.size, color: l.color } : l.measure ? { measure: l.measure } : {}), l.price, l.qty, l.lineTotal, l.alloc, l.taxRate, l.tax]);
        if (l.variantId) await t.query('INSERT INTO inventory_movements (variant_id, quantity_change, reason, reference_id) VALUES ($1,$2,$3,$4)', [l.variantId, -l.qty, 'pos_sale', number]);
      }
      if (await hasCostColumns(t)) await t.query('UPDATE pos_sale_items i SET cost_snapshot = p.cost_price FROM products p WHERE i.sale_id = $1 AND i.product_id = p.id', [sale.id]);
      const ph = normPhone(d.customerPhone);
      if (ph) await t.query(`INSERT INTO pos_customers (name, phone, dob) VALUES ($1,$2,$3)
        ON CONFLICT (phone) DO UPDATE SET name = COALESCE(NULLIF(EXCLUDED.name, ''), pos_customers.name), dob = COALESCE(EXCLUDED.dob, pos_customers.dob), updated_at = now()`, [d.customerName, ph, d.customerDob ?? null]);
      await audit(t, user.id, 'pos.sale', 'pos_sale', number, { total: bill.total, mode: d.paymentMode, channel: d.channel });
      return number;
    });
    return await getSale(db, invoice);
  } catch (e) {
    if (e.code === '23505' && String(e.constraint ?? e.detail ?? e.message).includes('idempotency_key')) {
      const again = await one(db, 'SELECT invoice_no FROM pos_sales WHERE idempotency_key = $1', [d.idempotencyKey]);
      if (again) return { ...(await getSale(db, again.invoice_no)), duplicate: true };
    }
    throw e;
  }
}

// Voids a completed bill, returns its stock and frees its coupon use. Safe to call twice.
export async function voidSale(db, user, invoice, reason) {
  await db.tx(async t => {
    const s = await one(t, 'SELECT id, status, coupon_code FROM pos_sales WHERE invoice_no = $1 FOR UPDATE', [invoice]);
    if (!s) throw new HttpError(404, 'Invoice not found');
    if (s.status === 'voided') throw new HttpError(409, 'This invoice is already voided', 'already_voided');
    for (const i of await rows(t, 'SELECT variant_id, quantity FROM pos_sale_items WHERE sale_id = $1 AND variant_id IS NOT NULL ORDER BY variant_id', [s.id])) {
      await t.query('UPDATE product_variants SET stock_quantity = stock_quantity + $1 WHERE id = $2', [i.quantity, i.variant_id]);
      await t.query('INSERT INTO inventory_movements (variant_id, quantity_change, reason, reference_id) VALUES ($1,$2,$3,$4)', [i.variant_id, i.quantity, 'pos_void', invoice]);
    }
    if (s.coupon_code) await t.query('UPDATE pos_coupons SET used_count = GREATEST(used_count - 1, 0) WHERE upper(code) = upper($1)', [s.coupon_code]);
    await t.query(`UPDATE pos_sales SET status = 'voided', voided_at = now(), voided_by = $2, void_reason = $3 WHERE id = $1`, [s.id, user.id, reason]);
    await audit(t, user.id, 'pos.void', 'pos_sale', invoice, { reason });
  });
  return getSale(db, invoice);
}

const dayExpr = 's.bill_date';

export function listSales(db, { q = '', name = '', phone = '', source = 'all', from, to, channel = 'retail', gst = 'all', limit = 100 }) {
  const w = [], a = [];
  const add = v => { a.push(v); return '$' + a.length };
  w.push(`s.channel = ${add(channel)}`);
  if (q.trim()) { const p = add(`%${q.trim().replace(/[\\%_]/g, m => '\\' + m)}%`); w.push(`(s.invoice_no ILIKE ${p} OR s.customer_name ILIKE ${p} OR s.customer_phone ILIKE ${p})`) }
  if (name.trim()) w.push(`s.customer_name ILIKE ${add(`%${name.trim().replace(/[\\%_]/g, m => '\\' + m)}%`)}`);
  if (phone.trim()) w.push(`regexp_replace(s.customer_phone, '\\D', '', 'g') LIKE ${add(`%${phone.replace(/\D/g, '')}%`)}`);
  if (source === 'offline' || source === 'online') w.push(`s.source = ${add(source)}`);
  if (gst === 'gst') w.push('s.is_gst'); else if (gst === 'nongst') w.push('NOT s.is_gst');
  if (from) w.push(`${dayExpr} >= ${add(from)}::date`);
  if (to) w.push(`${dayExpr} <= ${add(to)}::date`);
  return rows(db, `
    SELECT s.invoice_no AS "invoiceNo", s.status, s.customer_name AS "customerName", s.customer_phone AS "customerPhone", s.total_amount AS total,
           s.payment_mode AS "paymentMode", s.created_at AS "createdAt", s.bill_date::text AS "billDate", s.is_gst AS "isGst", s.source, s.share_token AS "shareToken", (SELECT COALESCE(SUM(quantity), 0)::int FROM pos_sale_items i WHERE i.sale_id = s.id) AS "itemCount"
    FROM pos_sales s WHERE ${w.join(' AND ')} ORDER BY s.id DESC LIMIT ${Math.min(limit, 500)}`, a);
}

// Sales report for an inclusive date range, one channel, optionally GST-only / non-GST-only. Voided bills are excluded from revenue and counted
// separately. Expenses (retail) are subtracted for net earnings. The monthly and weekly charts always show the current year / week.
export async function report(db, from, to, channel = 'retail', gst = 'all') {
  const g = gst === 'gst' ? ' AND s.is_gst' : gst === 'nongst' ? ' AND NOT s.is_gst' : '';
  const range = `s.channel = $3 AND ${dayExpr} BETWEEN $1::date AND $2::date${g}`, p = [from, to, channel];
  const done = "s.status = 'completed'";
  const totals = await one(db, `
    SELECT COUNT(*) FILTER (WHERE ${done})::int AS bills, COALESCE(SUM(s.total_amount) FILTER (WHERE ${done}), 0)::int AS revenue,
           COALESCE(SUM(s.tax_amount) FILTER (WHERE ${done}), 0)::int AS tax, COALESCE(SUM(s.discount_amount) FILTER (WHERE ${done}), 0)::int AS discounts,
           COALESCE(SUM(s.pay_cash) FILTER (WHERE ${done}), 0)::int AS cash, COALESCE(SUM(s.pay_upi) FILTER (WHERE ${done}), 0)::int AS upi,
           COALESCE(SUM(s.pay_card) FILTER (WHERE ${done}), 0)::int AS card, COUNT(*) FILTER (WHERE s.status = 'voided')::int AS voided, COUNT(*) FILTER (WHERE ${done} AND s.discount_amount > 0)::int AS "discountedBills",
           COUNT(*) FILTER (WHERE ${done} AND s.is_gst)::int AS "gstBills", COALESCE(SUM(s.total_amount) FILTER (WHERE ${done} AND s.is_gst), 0)::int AS "gstSales",
           COUNT(*) FILTER (WHERE ${done} AND NOT s.is_gst)::int AS "nonGstBills", COALESCE(SUM(s.total_amount) FILTER (WHERE ${done} AND NOT s.is_gst), 0)::int AS "nonGstSales",
           COUNT(*) FILTER (WHERE ${done} AND s.source = 'offline')::int AS "offlineBills", COALESCE(SUM(s.total_amount) FILTER (WHERE ${done} AND s.source = 'offline'), 0)::int AS "offlineSales",
           COUNT(*) FILTER (WHERE ${done} AND s.source = 'online')::int AS "onlineBills", COALESCE(SUM(s.total_amount) FILTER (WHERE ${done} AND s.source = 'online'), 0)::int AS "onlineSales",
           COUNT(DISTINCT COALESCE(NULLIF(s.customer_phone, ''), NULLIF(lower(s.customer_name), ''))) FILTER (WHERE ${done})::int AS customers
    FROM pos_sales s WHERE ${range}`, p);
  const units = (await one(db, `SELECT COALESCE(SUM(i.quantity), 0)::int AS n FROM pos_sale_items i JOIN pos_sales s ON s.id = i.sale_id WHERE ${done} AND ${range}`, p)).n;
  const expenses = channel === 'retail' ? (await one(db, 'SELECT COALESCE(SUM(amount), 0)::int AS n FROM pos_expenses WHERE expense_date BETWEEN $1::date AND $2::date', [from, to])).n : 0;
  let costs = { enabled: false, stockCost: 0, stockProducts: 0, soldCost: 0, soldUnits: units, margin: 0 };
  if (await hasCostColumns(db)) {
    const st = await one(db, `SELECT COALESCE(SUM(v.stock_quantity::bigint * p.cost_price), 0)::text AS cost, COUNT(DISTINCT p.id) FILTER (WHERE v.stock_quantity > 0)::int AS n
      FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.active AND p.status <> 'archived'`);
    const sold = await one(db, `SELECT COALESCE(SUM(i.quantity::bigint * i.cost_snapshot), 0)::text AS cost, COALESCE(SUM((i.line_total - i.discount_alloc)::bigint), 0)::text AS rev
      FROM pos_sale_items i JOIN pos_sales s ON s.id = i.sale_id WHERE ${done} AND ${range}`, p);
    costs = { enabled: true, stockCost: Number(st.cost), stockProducts: st.n, soldCost: Number(sold.cost), soldUnits: units, margin: Number(sold.rev) - Number(sold.cost) };
  }
  const expenseByCategory = channel === 'retail' ? await rows(db, 'SELECT category, SUM(amount)::int AS amount, COUNT(*)::int AS entries FROM pos_expenses WHERE expense_date BETWEEN $1::date AND $2::date GROUP BY category ORDER BY amount DESC', [from, to]) : [];
  const daily = await rows(db, `SELECT ${dayExpr}::text AS day, COUNT(*)::int AS bills, SUM(s.total_amount)::int AS revenue FROM pos_sales s WHERE ${done} AND ${range} GROUP BY 1 ORDER BY 1`, p);
  const products = await rows(db, `
    SELECT i.name_snapshot AS name, SUM(i.quantity)::int AS qty, SUM(i.line_total - i.discount_alloc)::int AS revenue
    FROM pos_sale_items i JOIN pos_sales s ON s.id = i.sale_id WHERE ${done} AND ${range}
    GROUP BY i.name_snapshot ORDER BY revenue DESC, qty DESC LIMIT 15`, p);
  const coupons = await rows(db, `
    SELECT s.coupon_code AS code, COUNT(*)::int AS uses, SUM(s.discount_amount)::int AS discount, SUM(s.total_amount)::int AS revenue
    FROM pos_sales s WHERE ${done} AND s.coupon_code IS NOT NULL AND ${range} GROUP BY s.coupon_code ORDER BY uses DESC`, p);
  const discountedList = await rows(db, `
    SELECT s.invoice_no AS "invoiceNo", s.bill_date::text AS "billDate", s.customer_name AS "customerName", s.customer_phone AS "customerPhone", s.coupon_code AS "couponCode",
           s.discount_amount AS discount, s.total_amount AS total, s.share_token AS "shareToken"
    FROM pos_sales s WHERE ${done} AND s.discount_amount > 0 AND ${range} ORDER BY s.id DESC LIMIT 300`, p);
  // current year by month and current week (Mon-Sun), independent of the selected period
  const today = istDate(), year = Number(today.slice(0, 4));
  const months = await rows(db, `SELECT EXTRACT(month FROM ${dayExpr})::int AS m, SUM(s.total_amount)::int AS revenue FROM pos_sales s WHERE ${done} AND s.channel = $1 AND ${dayExpr} BETWEEN $2::date AND $3::date${g} GROUP BY 1`, [channel, `${year}-01-01`, `${year}-12-31`]);
  const monthly = Array.from({ length: 12 }, (_, i) => months.find(r => r.m === i + 1)?.revenue ?? 0);
  const t = new Date(today + 'T00:00:00Z'), mon = new Date(t); mon.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6);
  const iso = x => x.toISOString().slice(0, 10);
  const wk = await rows(db, `SELECT ${dayExpr}::text AS day, SUM(s.total_amount)::int AS revenue FROM pos_sales s WHERE ${done} AND s.channel = $1 AND ${dayExpr} BETWEEN $2::date AND $3::date${g} GROUP BY 1`, [channel, iso(mon), iso(sun)]);
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setUTCDate(mon.getUTCDate() + i); return wk.find(r => r.day === iso(d))?.revenue ?? 0 });
  const jan1 = new Date(Date.UTC(year, 0, 1)), weekNo = Math.ceil(((t - jan1) / 86400000 + ((jan1.getUTCDay() + 6) % 7) + 1) / 7);
  return { from, to, channel, gst, ...totals, units, expenses, expenseByCategory, costs, cogs: costs.soldCost, gross: totals.revenue - costs.soldCost, net: totals.revenue - costs.soldCost - expenses, average: totals.bills ? Math.round(totals.revenue / totals.bills) : 0,
    topProduct: products[0]?.name ?? null, daily, products, coupons, discountedList, year, monthly, week, weekNo };
}

// ---- expenses ----
export const listExpenses = (db, from, to) => rows(db, `SELECT id, title, category, amount, payment_mode AS "paymentMode", notes, expense_date::text AS date FROM pos_expenses WHERE expense_date BETWEEN $1::date AND $2::date ORDER BY expense_date DESC, id DESC LIMIT 500`, [from, to]);

export const getSetting = async (db, key, fallback) => (await one(db, 'SELECT value FROM pos_settings WHERE key = $1', [key]))?.value ?? fallback;
export const putSetting = (db, key, value) => db.query('INSERT INTO pos_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()', [key, JSON.stringify(value)]);

// Customers whose birthday falls within the next `days` days, for birthday offers (from the Customers list).
export function birthdays(db, days = 30) {
  const today = `(now() AT TIME ZONE '${TZ}')::date`;
  // Day is clamped to the month's real length, so only a 29 Feb birthday moves (to 28 Feb in non-leap years).
  const nb = y => {
    const yr = `EXTRACT(year FROM ${today})::int + ${y}`, mo = 'EXTRACT(month FROM dob)::int';
    return `make_date(${yr}, ${mo}, LEAST(EXTRACT(day FROM dob)::int, EXTRACT(day FROM (make_date(${yr}, ${mo}, 1) + interval '1 month' - interval '1 day'))::int))`;
  };
  return rows(db, `
    WITH nxt AS (
      SELECT phone, name, dob, CASE WHEN ${nb(0)} >= ${today} THEN ${nb(0)} ELSE ${nb(1)} END AS next_birthday FROM pos_customers WHERE dob IS NOT NULL
    )
    SELECT phone, name, dob::text AS dob, next_birthday::text AS "nextBirthday", (next_birthday - ${today})::int AS "daysAway"
    FROM nxt WHERE next_birthday - ${today} <= $1 ORDER BY next_birthday, name`, [days]);
}

// ---- customers ----
export const listCustomers = (db, q = '') => {
  const like = `%${q.replace(/[\\%_]/g, m => '\\' + m)}%`;
  return rows(db, `
    SELECT c.id, c.name, c.phone, c.dob::text AS dob, c.notes, c.created_at AS "createdAt",
           COALESCE(st.bills, 0)::int AS bills, COALESCE(st.spent, 0)::int AS spent
    FROM pos_customers c
    LEFT JOIN LATERAL (SELECT COUNT(*) AS bills, SUM(s.total_amount) AS spent FROM pos_sales s WHERE s.status = 'completed' AND ${PHONE_SQL('s.customer_phone')} = c.phone) st ON true
    WHERE $1 = '' OR c.name ILIKE $2 OR c.phone LIKE $2 ORDER BY c.id DESC LIMIT 500`, [q.trim(), like]);
};

// ---- stock adjustments (Restock / Return add, Loss deducts, Reconcile sets the exact count) ----
export async function adjustStock(db, user, { variantId, type, qty, note }) {
  return db.tx(async t => {
    const v = await one(t, 'SELECT stock_quantity AS stock FROM product_variants WHERE id = $1 FOR UPDATE', [variantId]);
    if (!v) throw new HttpError(404, 'Variant not found');
    const next = type === 'reconcile' ? qty : type === 'loss' ? v.stock - qty : v.stock + qty;
    if (next < 0) throw new HttpError(400, `Only ${v.stock} in stock, cannot remove ${qty}`, 'insufficient_stock');
    const delta = next - v.stock;
    await t.query('UPDATE product_variants SET stock_quantity = $2 WHERE id = $1', [variantId, next]);
    if (delta) await t.query('INSERT INTO inventory_movements (variant_id, quantity_change, reason, reference_id) VALUES ($1,$2,$3,$4)', [variantId, delta, 'pos_' + type, note ? note.slice(0, 100) : null]);
    await audit(t, user.id, 'pos.stock', 'variant', variantId, { type, from: v.stock, to: next, note: note || undefined });
    return { stock: next, before: v.stock };
  });
}

// ---- stock movements: every change to stock, with the level before and after ----
const KNOWN_REASONS = ['initial_stock', 'pos_sale', 'pos_void', 'pos_restock', 'pos_return', 'pos_loss', 'pos_reconcile', 'order_reserved', 'order_released'];
const MOVE_TYPES = { opening: ['initial_stock'], sale: ['pos_sale'], online: ['order_reserved', 'order_released'], restock: ['pos_restock', 'pos_return', 'pos_void'], loss: ['pos_loss'], count: ['pos_reconcile'] };
export async function stockMovements(db, { from, to, q = '', type = 'all', limit = 500 }) {
  const like = `%${q.replace(/[\\%_]/g, m => '\\' + m)}%`;
  const reasons = MOVE_TYPES[type] ?? null;
  const base = `
    WITH m AS (
      SELECT im.id, im.created_at, im.variant_id, im.quantity_change, im.reason, im.reference_id, v.stock_quantity AS stock_now,
             SUM(im.quantity_change) OVER (PARTITION BY im.variant_id ORDER BY im.id) AS cum, SUM(im.quantity_change) OVER (PARTITION BY im.variant_id) AS total
      FROM inventory_movements im JOIN product_variants v ON v.id = im.variant_id),
    r AS (
      SELECT m.id, m.created_at AS "at", p.name, v.size, v.color, v.sku, m.reason, m.quantity_change AS change, m.reference_id AS ref,
             (m.stock_now - (m.total - m.cum))::int AS after, (m.stock_now - (m.total - m.cum) - m.quantity_change)::int AS before
      FROM m JOIN product_variants v ON v.id = m.variant_id JOIN products p ON p.id = v.product_id
      WHERE (m.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
        AND ($3 = '' OR p.name ILIKE $4 OR v.sku ILIKE $4 OR COALESCE(m.reference_id, '') ILIKE $4)
        AND ($5::text[] IS NULL OR m.reason = ANY($5))
        AND ($6::boolean IS NOT TRUE OR m.reason <> ALL($7)))`;
  const args = [from, to, q.trim(), like, reasons, type === 'manual', KNOWN_REASONS];
  const list = await rows(db, base + ` SELECT * FROM r ORDER BY id DESC LIMIT ${Math.min(limit, 2000)}`, args);
  const s = await one(db, base + `
    SELECT COALESCE(SUM(change) FILTER (WHERE change > 0 AND reason NOT IN ('pos_void', 'order_released')), 0)::int AS incoming,
           COALESCE(-SUM(change) FILTER (WHERE reason IN ('pos_sale', 'pos_void')), 0)::int AS sold,
           COALESCE(-SUM(change) FILTER (WHERE reason = 'pos_loss'), 0)::int AS lost,
           COALESCE(SUM(change), 0)::int AS net, COUNT(*)::int AS count FROM r`, args);
  return { summary: s, rows: list };
}

// ---- products with their variants (inventory screen) ----
export const listProducts = async (db, q = '', onlyId = null) => {
  const costSql = (await hasCostColumns(db)) ? 'p.cost_price' : '0';
  const like = `%${q.replace(/[\\%_]/g, m => '\\' + m)}%`;
  return rows(db, `
    SELECT p.id, p.slug, p.name, p.status, p.base_price AS price, ${costSql}::int AS "costPrice", p.tax_rate AS "taxRate", p.description, p.material, p.featured, p.is_sample AS "isSample",
           COALESCE((SELECT json_agg(col.slug ORDER BY col.display_order) FROM collection_products cp JOIN collections col ON col.id = cp.collection_id WHERE cp.product_id = p.id), '[]'::json) AS collections,
           c.name AS category, c.slug AS "categorySlug",
           (SELECT image_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.display_order, i.id LIMIT 1) AS image,
           COALESCE((SELECT SUM(v.stock_quantity) FROM product_variants v WHERE v.product_id = p.id), 0)::int AS stock,
           COALESCE((SELECT json_agg(json_build_object('id', v.id, 'sku', v.sku, 'size', v.size, 'color', v.color, 'stock', v.stock_quantity, 'price', COALESCE(v.price_override, p.base_price), 'priceOverride', v.price_override, 'active', v.active) ORDER BY v.id)
                     FROM product_variants v WHERE v.product_id = p.id), '[]'::json) AS variants
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE ($3::int IS NULL OR p.id = $3) AND ($1 = '' OR p.name ILIKE $2 OR c.name ILIKE $2 OR EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.sku ILIKE $2))
    ORDER BY p.name, p.id LIMIT 400`, [q.trim(), like, onlyId]);
};

// ---- shop details printed on invoices (also used by the public invoice page) ----
const INVOICE_DEFAULTS = { gstin: '', showGstRetail: false, showGstWholesale: false, deliveryPresets: [], state: 'Tamil Nadu (33)',
  terms: 'Custom-stitched and altered garments are made to order and are non-returnable.',
  shopName: '', shopAddress: '', shopPhone: '', shopEmail: '', ownerName: '', ownerPhone: '', whatsapp: '', city: '', hours: '', shopNameTamil: '', instagram: '', accent: '' };
export const invoiceDefaults = INVOICE_DEFAULTS;
export async function shopInfo(db) {
  const st = (await one(db, "SELECT value FROM store_settings WHERE key = 'store'"))?.value ?? {};
  const logo = (await one(db, "SELECT value FROM store_settings WHERE key = 'branding'"))?.value?.logo ?? null;
  const cfg = { ...INVOICE_DEFAULTS, ...(await getSetting(db, 'invoice', {})) };
  const lines = String(cfg.shopAddress || '').split('\n').map(s => s.trim()).filter(Boolean);
  return { name: cfg.shopName || st.name || 'DHANYA', address: lines.length ? lines : (st.address ?? []), phone: cfg.shopPhone || st.phone || null, email: cfg.shopEmail || st.email || null, logo,
    accent: cfg.accent || '', ownerName: cfg.ownerName || '', city: cfg.city || '', hours: cfg.hours || '', whatsapp: cfg.whatsapp || '', instagram: cfg.instagram || '', shopNameTamil: cfg.shopNameTamil || '',
    gstin: cfg.gstin || '', showGst: { retail: !!cfg.showGstRetail, wholesale: !!cfg.showGstWholesale }, deliveryPresets: cfg.deliveryPresets ?? [], state: cfg.state, terms: cfg.terms };
}

// ---- advance orders: booked with a deposit now, billed (and stock taken) when the customer collects ----
const advCols = `a.code, a.status, a.customer_name AS "customerName", a.customer_phone AS "customerPhone", a.customer_address AS "customerAddress",
  a.is_gst AS "isGst", a.gst_rate AS "gstRate", a.discount_type AS "discountType", a.discount_value AS "discountValue", a.delivery_fee AS "deliveryFee",
  a.subtotal, a.discount_amount AS discount, a.tax_amount AS tax, a.total_amount AS total, a.deposit, (a.total_amount - a.deposit) AS balance, a.deposit_mode AS "depositMode",
  a.delivery_date::text AS "deliveryDate", a.notes, a.finalized_invoice AS "invoiceNo", a.created_at AS "createdAt", a.finalized_at AS "finalizedAt", a.cancelled_at AS "cancelledAt"`;

export async function createAdvance(db, user, d) {
  const code = await db.tx(async t => {
    const lines = await resolveLines(t, d.items, { checkStock: true });
    const bill = computeBill(lines, { isGst: d.isGst, gstRate: d.gstRate ?? null, discountType: d.discountType, discountValue: d.discountValue, deliveryFee: d.deliveryFee });
    if (d.deposit > bill.total) throw new HttpError(400, 'The advance cannot be more than the bill total', 'bad_deposit');
    let number = '';
    for (let i = 0; i < 12 && !number; i++) {
      const c = `DEP-${istDate().replace(/-/g, '')}-${String(crypto.randomInt(0, 10000)).padStart(4, '0')}`;
      if (!await one(t, 'SELECT 1 AS x FROM pos_advances WHERE code = $1', [c])) number = c;
    }
    if (!number) throw new HttpError(500, 'Could not create an advance order number. Please try again.');
    const items = lines.map(l => ({ variantId: l.variantId, name: l.name, sku: l.sku, size: l.size, color: l.color, price: l.price, qty: l.qty, taxRate: l.taxRate, ...(l.measure ? { measure: l.measure } : {}) }));
    await t.query(`INSERT INTO pos_advances (code, customer_name, customer_phone, customer_address, is_gst, gst_rate, discount_type, discount_value, delivery_fee, items,
        subtotal, discount_amount, tax_amount, total_amount, deposit, deposit_mode, delivery_date, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [number, d.customerName, d.customerPhone, d.customerAddress ?? '', d.isGst, d.isGst ? (d.gstRate ?? null) : null, d.discountType, d.discountValue, d.deliveryFee, JSON.stringify(items),
        bill.subtotal, bill.discount, bill.tax, bill.total, d.deposit, d.depositMode, d.deliveryDate ?? null, d.notes ?? null, user.id]);
    const ph = normPhone(d.customerPhone);
    if (ph) await t.query(`INSERT INTO pos_customers (name, phone, dob) VALUES ($1,$2,$3) ON CONFLICT (phone) DO UPDATE SET name = COALESCE(NULLIF(EXCLUDED.name, ''), pos_customers.name), dob = COALESCE(EXCLUDED.dob, pos_customers.dob), updated_at = now()`, [d.customerName, ph, d.customerDob ?? null]);
    await audit(t, user.id, 'pos.advance.create', 'pos_advance', number, { total: bill.total, deposit: d.deposit });
    return number;
  });
  return getAdvance(db, code);
}

export async function getAdvance(q, code) {
  const a = await one(q, `SELECT ${advCols}, a.items FROM pos_advances a WHERE a.code = $1`, [code]);
  return a;
}

export const listAdvances = (db, { status = 'all', q = '' }) => {
  const like = `%${q.replace(/[\\%_]/g, m => '\\' + m)}%`;
  return rows(db, `SELECT ${advCols}, jsonb_array_length(a.items)::int AS "itemCount" FROM pos_advances a
    WHERE ($1 = 'all' OR a.status = $1) AND ($2 = '' OR a.code ILIKE $3 OR a.customer_name ILIKE $3 OR a.customer_phone ILIKE $3 OR a.status ILIKE $3 OR a.items::text ILIKE $3)
    ORDER BY (a.status IN ('pending','ready')) DESC, a.delivery_date NULLS LAST, a.id DESC LIMIT 300`, [status, q.trim(), like]);
};

export async function setAdvanceStatus(db, user, code, status) {
  const a = await one(db, 'SELECT id, status FROM pos_advances WHERE code = $1', [code]);
  if (!a) throw new HttpError(404, 'Advance order not found');
  if (a.status === 'completed') throw new HttpError(409, 'This advance order is already billed', 'already_completed');
  if (a.status === 'cancelled') throw new HttpError(409, 'This advance order was cancelled', 'cancelled');
  await db.query("UPDATE pos_advances SET status = $2, cancelled_at = CASE WHEN $2 = 'cancelled' THEN now() ELSE NULL END WHERE id = $1", [a.id, status]);
  await audit(db, user.id, 'pos.advance.' + status, 'pos_advance', code);
  return getAdvance(db, code);
}

// Collecting the balance bills the order: a real sale is created (stock is taken now, at the price agreed at booking), the deposit is counted
// under the mode it was paid in and the balance under `balanceMode`. A retry returns the same invoice.
export async function finalizeAdvance(db, user, code, { balanceMode, paymentRef }) {
  const a = await one(db, 'SELECT * FROM pos_advances WHERE code = $1', [code]);
  if (!a) throw new HttpError(404, 'Advance order not found');
  if (a.status === 'cancelled') throw new HttpError(409, 'This advance order was cancelled', 'cancelled');
  const balance = a.total_amount - a.deposit;
  const b = { cash: 0, upi: 0, card: 0 }; b[a.deposit_mode] += a.deposit; b[balanceMode] += balance;
  const modes = Object.keys(b).filter(k => b[k] > 0);
  const paymentMode = modes.length > 1 ? 'split' : (modes[0] ?? balanceMode);
  const sale = await createSale(db, user, {
    idempotencyKey: `advance-${a.id}-final`, channel: 'retail', source: 'offline', trusted: true,
    items: a.items.map(i => i.variantId ? { variantId: i.variantId, qty: i.qty, price: i.price } : { name: i.name, sku: i.sku, price: i.price, qty: i.qty, taxRate: i.taxRate, ...(i.measure ? { measure: i.measure } : {}) }),
    customerName: a.customer_name, customerPhone: a.customer_phone, customerAddress: a.customer_address, isGst: a.is_gst, gstRate: a.gst_rate ?? undefined,
    discountType: a.discount_type, discountValue: a.discount_value, deliveryFee: a.delivery_fee, paymentMode, cashTendered: paymentMode === 'cash' ? a.total_amount : undefined,
    payments: { cash: b.cash, upi: b.upi, card: b.card }, paymentRef, notes: `Advance order ${code}${a.notes ? ' · ' + a.notes : ''}`,
  });
  await db.query("UPDATE pos_advances SET status = 'completed', finalized_invoice = $2, finalized_at = COALESCE(finalized_at, now()) WHERE id = $1", [a.id, sale.invoiceNo]);
  await audit(db, user.id, 'pos.advance.finalize', 'pos_advance', code, { invoice: sale.invoiceNo });
  return { advance: await getAdvance(db, code), sale };
}
