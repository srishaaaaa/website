import crypto from 'node:crypto';
import { rows, one } from '../db/index.js';
import { HttpError } from './http.js';
import { audit } from './orders.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randCode = n => Array.from(crypto.randomBytes(n), b => CODE_CHARS[b % CODE_CHARS.length]).join('');

// Every line of a sale with how much of it has already come back.
const lineRows = (q, saleId) => rows(q, `
  SELECT i.id, i.name_snapshot AS name, i.sku_snapshot AS sku, i.variant_snapshot AS variant, i.unit_price AS "unitPrice", i.quantity, i.line_total AS "lineTotal",
         i.discount_alloc AS discount, i.tax_rate AS "taxRate", i.tax_amount AS tax, i.variant_id AS "variantId",
         COALESCE((SELECT SUM(ri.quantity) FROM pos_return_items ri WHERE ri.sale_item_id = i.id), 0)::int AS "returnedQty"
  FROM pos_sale_items i WHERE i.sale_id = $1 ORDER BY i.id`, [saleId]);

// Part of `whole` that belongs to `qty` of `total` units. The last unit takes the remainder, so the parts of all returns add up exactly.
const share = (whole, qty, total, alreadyQty, alreadyAmt) => (alreadyQty + qty === total ? whole - alreadyAmt : Math.floor(whole * qty / total));

export async function createReturn(db, user, invoiceNo, { items, reason = '', refundMode }) {
  const no = await db.tx(async t => {
    const s = await one(t, 'SELECT id, status FROM pos_sales WHERE invoice_no = $1 FOR UPDATE', [invoiceNo]);
    if (!s) throw new HttpError(404, 'Invoice not found');
    if (s.status !== 'completed') throw new HttpError(409, 'Only a completed bill can have items returned', 'not_returnable');
    const lines = await lineRows(t, s.id), byId = new Map(lines.map(l => [l.id, l]));
    const merged = new Map();
    for (const it of items) merged.set(it.itemId, (merged.get(it.itemId) ?? 0) + it.qty);
    let subtotal = 0, discount = 0, tax = 0; const out = [];
    for (const [itemId, qty] of merged) {
      const l = byId.get(itemId);
      if (!l) throw new HttpError(400, 'That item is not on this bill', 'bad_item');
      if (qty < 1 || qty > l.quantity - l.returnedQty) throw new HttpError(409, `Only ${l.quantity - l.returnedQty} of ${l.name} can still be returned`, 'over_return');
      const prior = await one(t, 'SELECT COALESCE(SUM(line_total),0)::int AS lt, COALESCE(SUM(discount),0)::int AS d, COALESCE(SUM(tax),0)::int AS x FROM pos_return_items WHERE sale_item_id = $1', [itemId]);
      const lt = share(l.lineTotal, qty, l.quantity, l.returnedQty, prior.lt), d = share(l.discount, qty, l.quantity, l.returnedQty, prior.d), x = share(l.tax, qty, l.quantity, l.returnedQty, prior.x);
      subtotal += lt; discount += d; tax += x; out.push({ l, qty, lt, d, x });
    }
    if (!out.length) throw new HttpError(400, 'Choose at least one item to return', 'nothing_to_return');
    const total = subtotal - discount + tax;
    let code = '';
    for (let i = 0; i < 12 && !code; i++) { const c = `RET-${new Date().getFullYear()}-${randCode(5)}`; if (!await one(t, 'SELECT 1 AS x FROM pos_returns WHERE return_no = $1', [c])) code = c }
    const ret = await one(t, `INSERT INTO pos_returns (return_no, sale_id, reason, refund_mode, subtotal, discount, tax, total, share_token, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [code, s.id, reason, refundMode, subtotal, discount, tax, total, crypto.randomBytes(16).toString('base64url'), user.id]);
    for (const { l, qty, lt, d, x } of out) {
      await t.query('INSERT INTO pos_return_items (return_id, sale_item_id, quantity, line_total, discount, tax) VALUES ($1,$2,$3,$4,$5,$6)', [ret.id, l.id, qty, lt, d, x]);
      if (l.variantId) {
        await t.query('UPDATE product_variants SET stock_quantity = stock_quantity + $1 WHERE id = $2', [qty, l.variantId]);
        await t.query('INSERT INTO inventory_movements (variant_id, quantity_change, reason, reference_id) VALUES ($1,$2,$3,$4)', [l.variantId, qty, 'pos_return', code]);
      }
    }
    await audit(t, user.id, 'pos.return', 'pos_return', code, { invoice: invoiceNo, total });
    return code;
  });
  return getReturn(db, no);
}

const retCols = `r.id, r.return_no AS "returnNo", r.reason, r.refund_mode AS "refundMode", r.subtotal, r.discount, r.tax, r.total, r.share_token AS "shareToken", r.created_at AS "createdAt",
  s.invoice_no AS "invoiceNo", s.bill_date::text AS "billDate", s.customer_name AS "customerName", s.customer_phone AS "customerPhone", s.customer_address AS "customerAddress",
  s.is_gst AS "isGst", s.coupon_code AS "couponCode", s.id AS "saleId"`;

// A return with what came back (`returned`), what the customer kept after every return (`kept`) and the other returns on the same bill.
export async function getReturn(q, key, { byToken = false } = {}) {
  const r = await one(q, `SELECT ${retCols} FROM pos_returns r JOIN pos_sales s ON s.id = r.sale_id WHERE ${byToken ? 'r.share_token' : 'r.return_no'} = $1`, [String(key).slice(0, 64)]);
  if (!r) return null;
  r.returned = await rows(q, `
    SELECT i.name_snapshot AS name, i.sku_snapshot AS sku, i.variant_snapshot AS variant, i.unit_price AS "unitPrice", ri.quantity AS qty, i.quantity AS sold, ri.line_total AS amount, i.tax_rate AS "taxRate"
    FROM pos_return_items ri JOIN pos_sale_items i ON i.id = ri.sale_item_id WHERE ri.return_id = $1 ORDER BY ri.id`, [r.id]);
  const lines = await lineRows(q, r.saleId);
  r.kept = lines.filter(l => l.quantity - l.returnedQty > 0).map(l => ({ name: l.name, sku: l.sku, variant: l.variant, unitPrice: l.unitPrice, qty: l.quantity - l.returnedQty, sold: l.quantity }));
  r.otherReturns = await rows(q, 'SELECT return_no AS "returnNo", total, created_at AS "createdAt" FROM pos_returns WHERE sale_id = $1 AND id <> $2 ORDER BY id', [r.saleId, r.id]);
  delete r.id; delete r.saleId;
  return r;
}

// The returns made against one sale (used by getSale and the bill rows).
export const returnsFor = (q, saleId) => rows(q, 'SELECT return_no AS "returnNo", total, tax, refund_mode AS "refundMode", created_at AS "createdAt", share_token AS "shareToken" FROM pos_returns WHERE sale_id = $1 ORDER BY id', [saleId]);
