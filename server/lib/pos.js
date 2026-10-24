import { rows, one } from '../db/index.js';
import { HttpError } from './http.js';
import { audit } from './orders.js';

const TZ = 'Asia/Kolkata';
const istDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const istYear = () => Number(istDate().slice(0, 4));
const PREFIX = { retail: 'DP', wholesale: 'DW' };

// Bill maths, all in integer paise. Mirrors IGMOLS: taxable = subtotal - discount; total = taxable + GST + delivery.
// The bill discount is shared across lines in proportion to their value (remainder paise go to the first lines) so GST
// is charged on what the customer actually pays, line by line.
export function computeBill(lines, { isGst = true, discountType = 'fixed', discountValue = 0, deliveryFee = 0 } = {}) {
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const discount = discountType === 'percent' ? Math.round(subtotal * discountValue / 100) : discountValue;
  if (discountType === 'percent' && discountValue > 100) throw new HttpError(400, 'Discount cannot exceed 100%', 'bad_discount');
  if (discount > subtotal) throw new HttpError(400, 'Discount cannot exceed the bill subtotal', 'bad_discount');
  const out = lines.map(l => ({ ...l, lineTotal: l.price * l.qty, alloc: subtotal ? Math.floor(discount * l.price * l.qty / subtotal) : 0 }));
  let rest = discount - out.reduce((s, l) => s + l.alloc, 0);
  for (let i = 0; rest > 0; i = (i + 1) % out.length, rest--) out[i].alloc++;
  for (const l of out) l.tax = isGst ? Math.round((l.lineTotal - l.alloc) * l.taxRate / 100) : 0;
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

const invoiceNo = async (t, channel) => {
  const y = istYear();
  const { last } = await one(t, 'INSERT INTO pos_counters (year, channel, last) VALUES ($1, $2, 1) ON CONFLICT (year, channel) DO UPDATE SET last = pos_counters.last + 1 RETURNING last', [y, channel]);
  return `${PREFIX[channel]}-${y}-${String(last).padStart(6, '0')}`;
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

export async function getSale(q, invoice) {
  const sale = await one(q, `
    SELECT s.id, s.invoice_no AS "invoiceNo", s.channel, s.status, s.customer_name AS "customerName", s.customer_phone AS "customerPhone",
           s.is_gst AS "isGst", s.subtotal, s.discount_type AS "discountType", s.discount_value AS "discountValue", s.discount_amount AS discount,
           s.tax_amount AS tax, s.delivery_fee AS "deliveryFee", s.total_amount AS total, s.payment_mode AS "paymentMode",
           s.pay_cash AS "payCash", s.pay_upi AS "payUpi", s.pay_card AS "payCard", s.cash_tendered AS "cashTendered", s.change_given AS change,
           s.payment_ref AS "paymentRef", s.customer_dob::text AS "customerDob", s.coupon_code AS "couponCode", s.notes,
           s.created_at AS "createdAt", s.voided_at AS "voidedAt", s.void_reason AS "voidReason", pr.full_name AS cashier
    FROM pos_sales s LEFT JOIN profiles pr ON pr.id = s.cashier_id WHERE s.invoice_no = $1`, [invoice]);
  if (!sale) return null;
  sale.items = await rows(q, `
    SELECT name_snapshot AS name, sku_snapshot AS sku, variant_snapshot AS variant, unit_price AS "unitPrice", quantity,
           line_total AS "lineTotal", discount_alloc AS discount, tax_rate AS "taxRate", tax_amount AS tax
    FROM pos_sale_items WHERE sale_id = $1 ORDER BY id`, [sale.id]);
  return sale;
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
      // Merge repeated variants, then lock in a stable order (no deadlocks between two cashiers).
      const want = new Map(), custom = [];
      for (const it of d.items) {
        if (it.variantId) want.set(it.variantId, (want.get(it.variantId) ?? 0) + it.qty);
        else custom.push({ variantId: null, product_id: null, name: it.name, sku: it.sku ?? '', size: '', color: '', price: it.price, qty: it.qty, taxRate: it.taxRate ?? 0, stock: null });
      }
      const ids = [...want.keys()].sort((a, b) => a - b);
      const info = ids.length ? await rows(t, `
        SELECT v.id, v.product_id, p.name, v.sku, v.size, v.color, v.stock_quantity AS stock, p.tax_rate AS "taxRate",
               COALESCE(v.price_override, p.base_price) AS price
        FROM product_variants v JOIN products p ON p.id = v.product_id
        WHERE v.id = ANY($1) AND v.active AND p.status = 'active'`, [ids]) : [];
      const byId = new Map(info.map(r => [r.id, r]));
      const lines = ids.map(id => {
        const r = byId.get(id);
        if (!r) throw new HttpError(409, 'An item on this bill is no longer available', 'unavailable');
        return { ...r, variantId: id, qty: want.get(id) };
      }).concat(custom);

      let { discountType, discountValue } = d, couponCode = null;
      if (d.couponCode) {
        const c = await one(t, 'SELECT * FROM pos_coupons WHERE upper(code) = upper($1) FOR UPDATE', [d.couponCode]);
        const problem = couponProblem(c, lines.reduce((s, l) => s + l.price * l.qty, 0));
        if (problem) throw new HttpError(400, problem, 'bad_coupon');
        ({ discount_type: discountType, discount_value: discountValue, code: couponCode } = c);
        await t.query('UPDATE pos_coupons SET used_count = used_count + 1 WHERE id = $1', [c.id]);
      }
      const bill = computeBill(lines, { isGst: d.isGst, discountType, discountValue, deliveryFee: d.deliveryFee });
      const pay = settle(bill.total, { mode: d.paymentMode, ...d.payments, tendered: d.cashTendered });
      const number = await invoiceNo(t, d.channel);
      const sale = await one(t, `
        INSERT INTO pos_sales (invoice_no, idempotency_key, channel, customer_name, customer_phone, customer_dob, is_gst, subtotal, discount_type, discount_value, discount_amount,
          tax_amount, delivery_fee, total_amount, payment_mode, pay_cash, pay_upi, pay_card, cash_tendered, change_given, payment_ref, notes, cashier_id, coupon_code)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) RETURNING id`,
        [number, d.idempotencyKey, d.channel, d.customerName, d.customerPhone, d.customerDob ?? null, d.isGst, bill.subtotal, discountType, discountValue, bill.discount,
          bill.tax, bill.deliveryFee, bill.total, d.paymentMode, pay.cash, pay.upi, pay.card, pay.tendered, pay.change, d.paymentRef ?? null, d.notes ?? null, user.id, couponCode]);
      for (const l of bill.lines) {
        if (l.variantId) {
          const u = await t.query('UPDATE product_variants SET stock_quantity = stock_quantity - $1 WHERE id = $2 AND stock_quantity >= $1 RETURNING stock_quantity', [l.qty, l.variantId]);
          if (!u.rows.length) throw new HttpError(409, `Only ${l.stock} left of ${l.name} (${l.size}${l.color !== 'Default' ? ', ' + l.color : ''})`, 'insufficient_stock');
        }
        await t.query(`INSERT INTO pos_sale_items (sale_id, product_id, variant_id, name_snapshot, sku_snapshot, variant_snapshot, unit_price, quantity, line_total, discount_alloc, tax_rate, tax_amount)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [sale.id, l.product_id, l.variantId, l.name, l.sku, JSON.stringify(l.variantId ? { size: l.size, color: l.color } : {}), l.price, l.qty, l.lineTotal, l.alloc, l.taxRate, l.tax]);
        if (l.variantId) await t.query('INSERT INTO inventory_movements (variant_id, quantity_change, reason, reference_id) VALUES ($1,$2,$3,$4)', [l.variantId, -l.qty, 'pos_sale', number]);
      }
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

const dayExpr = `(s.created_at AT TIME ZONE '${TZ}')::date`;

export function listSales(db, { q = '', from, to, channel = 'retail', limit = 100 }) {
  const w = [], a = [];
  const add = v => { a.push(v); return '$' + a.length };
  w.push(`s.channel = ${add(channel)}`);
  if (q.trim()) { const p = add(`%${q.trim().replace(/[\\%_]/g, m => '\\' + m)}%`); w.push(`(s.invoice_no ILIKE ${p} OR s.customer_name ILIKE ${p} OR s.customer_phone ILIKE ${p})`) }
  if (from) w.push(`${dayExpr} >= ${add(from)}::date`);
  if (to) w.push(`${dayExpr} <= ${add(to)}::date`);
  return rows(db, `
    SELECT s.invoice_no AS "invoiceNo", s.status, s.customer_name AS "customerName", s.customer_phone AS "customerPhone", s.total_amount AS total,
           s.payment_mode AS "paymentMode", s.created_at AS "createdAt", (SELECT COALESCE(SUM(quantity), 0)::int FROM pos_sale_items i WHERE i.sale_id = s.id) AS "itemCount"
    FROM pos_sales s WHERE ${w.join(' AND ')} ORDER BY s.id DESC LIMIT ${Math.min(limit, 500)}`, a);
}

// Sales report for an inclusive IST date range and one channel. Voided bills are excluded from revenue and counted separately.
export async function report(db, from, to, channel = 'retail') {
  const range = `s.channel = $3 AND ${dayExpr} BETWEEN $1::date AND $2::date`, p = [from, to, channel];
  const totals = await one(db, `
    SELECT COUNT(*) FILTER (WHERE s.status = 'completed')::int AS bills, COALESCE(SUM(s.total_amount) FILTER (WHERE s.status = 'completed'), 0)::int AS revenue,
           COALESCE(SUM(s.tax_amount) FILTER (WHERE s.status = 'completed'), 0)::int AS tax, COALESCE(SUM(s.discount_amount) FILTER (WHERE s.status = 'completed'), 0)::int AS discounts,
           COALESCE(SUM(s.pay_cash) FILTER (WHERE s.status = 'completed'), 0)::int AS cash, COALESCE(SUM(s.pay_upi) FILTER (WHERE s.status = 'completed'), 0)::int AS upi,
           COALESCE(SUM(s.pay_card) FILTER (WHERE s.status = 'completed'), 0)::int AS card, COUNT(*) FILTER (WHERE s.status = 'voided')::int AS voided,
           COUNT(DISTINCT COALESCE(NULLIF(s.customer_phone, ''), NULLIF(lower(s.customer_name), ''))) FILTER (WHERE s.status = 'completed')::int AS customers,
           COALESCE((SELECT SUM(i.quantity) FROM pos_sale_items i JOIN pos_sales s2 ON s2.id = i.sale_id WHERE s2.status = 'completed' AND s2.channel = $3
                     AND (s2.created_at AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date), 0)::int AS units
    FROM pos_sales s WHERE ${range}`, p);
  const daily = await rows(db, `SELECT ${dayExpr}::text AS day, COUNT(*)::int AS bills, SUM(s.total_amount)::int AS revenue FROM pos_sales s WHERE s.status = 'completed' AND ${range} GROUP BY 1 ORDER BY 1`, p);
  const products = await rows(db, `
    SELECT i.name_snapshot AS name, SUM(i.quantity)::int AS qty, SUM(i.line_total - i.discount_alloc)::int AS revenue
    FROM pos_sale_items i JOIN pos_sales s ON s.id = i.sale_id WHERE s.status = 'completed' AND ${range}
    GROUP BY i.name_snapshot ORDER BY qty DESC, revenue DESC LIMIT 15`, p);
  return { from, to, channel, ...totals, average: totals.bills ? Math.round(totals.revenue / totals.bills) : 0, daily, products };
}

export const getSetting = async (db, key, fallback) => (await one(db, 'SELECT value FROM pos_settings WHERE key = $1', [key]))?.value ?? fallback;
export const putSetting = (db, key, value) => db.query('INSERT INTO pos_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()', [key, JSON.stringify(value)]);

// Customers (latest details per phone) whose birthday falls within the next `days` days, for birthday offers.
export function birthdays(db, days = 30) {
  const today = `(now() AT TIME ZONE '${TZ}')::date`;
  const nb = y => `make_date(EXTRACT(year FROM ${today})::int + ${y}, EXTRACT(month FROM dob)::int, LEAST(EXTRACT(day FROM dob)::int, CASE WHEN EXTRACT(month FROM dob) = 2 THEN 28 ELSE 28 END))`;
  return rows(db, `
    WITH latest AS (
      SELECT DISTINCT ON (customer_phone) customer_phone AS phone, customer_name AS name, customer_dob AS dob
      FROM pos_sales WHERE customer_dob IS NOT NULL AND customer_phone <> '' AND status = 'completed'
      ORDER BY customer_phone, id DESC
    ), nxt AS (
      SELECT *, CASE WHEN ${nb(0)} >= ${today} THEN ${nb(0)} ELSE ${nb(1)} END AS next_birthday FROM latest
    )
    SELECT phone, name, dob::text AS dob, next_birthday::text AS "nextBirthday", (next_birthday - ${today})::int AS "daysAway"
    FROM nxt WHERE next_birthday - ${today} <= $1 ORDER BY next_birthday, name`, [days]);
}
