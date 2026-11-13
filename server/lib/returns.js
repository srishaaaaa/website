import crypto from 'node:crypto';
import { rows, one } from '../db/index.js';
import { HttpError } from './http.js';
import bcrypt from 'bcryptjs';
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

// A refund needs an admin's approval. An owner / admin approves their own return by ticking the box; any other staff member must type an
// admin's password. The approving admin is stored on the return.
async function approver(db, user, approval = {}) {
  if (['owner', 'admin'].includes(user.role)) {
    if (approval.approved !== true) throw new HttpError(403, 'Tick the box to confirm this refund as admin', 'approval_needed');
    return user.id;
  }
  if (!approval.adminPassword) throw new HttpError(403, 'An admin must approve this refund: type the admin password', 'approval_needed');
  for (const a of await rows(db, "SELECT id, password_hash FROM profiles WHERE role IN ('owner','admin') AND password_hash IS NOT NULL")) {
    if (await bcrypt.compare(String(approval.adminPassword), a.password_hash)) return a.id;
  }
  throw new HttpError(403, 'That admin password is not correct', 'approval_denied');
}

export async function createReturn(db, user, invoiceNo, { items, reason = '', refundMode, refundSplit, approval }) {
  const approvedBy = await approver(db, user, approval);
  const no = await db.tx(async t => {
    const s = await one(t, 'SELECT id, status FROM pos_sales WHERE invoice_no = $1 FOR UPDATE', [invoiceNo]);
    if (!s) throw new HttpError(404, 'Invoice not found');
    if (s.status !== 'completed') throw new HttpError(409, 'Only a completed bill can have items returned', 'not_returnable');
    const lines = await lineRows(t, s.id), byId = new Map(lines.map(l => [l.id, l]));
    const merged = new Map();
    const restockOf = new Map();
    for (const it of items) { merged.set(it.itemId, (merged.get(it.itemId) ?? 0) + it.qty); restockOf.set(it.itemId, it.restock !== false) }
    let subtotal = 0, discount = 0, tax = 0; const out = [];
    for (const [itemId, qty] of merged) {
      const l = byId.get(itemId);
      if (!l) throw new HttpError(400, 'That item is not on this bill', 'bad_item');
      if (qty < 1 || qty > l.quantity - l.returnedQty) throw new HttpError(409, `Only ${l.quantity - l.returnedQty} of ${l.name} can still be returned`, 'over_return');
      const prior = await one(t, 'SELECT COALESCE(SUM(line_total),0)::int AS lt, COALESCE(SUM(discount),0)::int AS d, COALESCE(SUM(tax),0)::int AS x FROM pos_return_items WHERE sale_item_id = $1', [itemId]);
      const lt = share(l.lineTotal, qty, l.quantity, l.returnedQty, prior.lt), d = share(l.discount, qty, l.quantity, l.returnedQty, prior.d), x = share(l.tax, qty, l.quantity, l.returnedQty, prior.x);
      subtotal += lt; discount += d; tax += x; out.push({ l, qty, lt, d, x, restock: restockOf.get(itemId) });
    }
    if (!out.length) throw new HttpError(400, 'Choose at least one item to return', 'nothing_to_return');
    const total = subtotal - discount + tax;
    let code = '';
    code = `RTN-${String((await one(t, "SELECT nextval('pos_return_seq')::int AS n")).n).padStart(8, '0')}`;
    // How the refund is paid: one method, or a split that adds up to the refund total.
    const parts = refundMode === 'split' ? { cash: refundSplit?.cash || 0, upi: refundSplit?.upi || 0, card: refundSplit?.card || 0 } : { cash: 0, upi: 0, card: 0, [refundMode]: total };
    if (parts.cash + parts.upi + parts.card !== total) throw new HttpError(400, 'The split refund must add up to the refund total', 'bad_split');
    const ret = await one(t, `INSERT INTO pos_returns (return_no, sale_id, reason, refund_mode, subtotal, discount, tax, total, share_token, created_by, refund_cash, refund_upi, refund_card, approved_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`, [code, s.id, reason, refundMode, subtotal, discount, tax, total, crypto.randomBytes(16).toString('base64url'), user.id, parts.cash, parts.upi, parts.card, approvedBy]);
    for (const { l, qty, lt, d, x, restock } of out) {
      await t.query('INSERT INTO pos_return_items (return_id, sale_item_id, quantity, line_total, discount, tax, restock) VALUES ($1,$2,$3,$4,$5,$6,$7)', [ret.id, l.id, qty, lt, d, x, !!(restock && l.variantId)]);
      if (l.variantId && restock) { // only ticked items go back into stock; manual items (no variant) never touch it
        await t.query('UPDATE product_variants SET stock_quantity = stock_quantity + $1 WHERE id = $2', [qty, l.variantId]);
        await t.query('INSERT INTO inventory_movements (variant_id, quantity_change, reason, reference_id) VALUES ($1,$2,$3,$4)', [l.variantId, qty, 'pos_return', code]);
      }
    }
    await audit(t, user.id, 'pos.return', 'pos_return', code, { invoice: invoiceNo, total, approvedBy });
    return code;
  });
  return getReturn(db, no);
}

const retCols = `r.id, r.return_no AS "returnNo", r.reason, r.refund_mode AS "refundMode", r.subtotal, r.discount, r.tax, r.total, r.share_token AS "shareToken", r.created_at AS "createdAt",
  s.invoice_no AS "invoiceNo", s.bill_date::text AS "billDate", s.customer_name AS "customerName", s.customer_phone AS "customerPhone", s.customer_address AS "customerAddress",
  s.is_gst AS "isGst", s.coupon_code AS "couponCode", s.id AS "saleId", s.share_token AS "origToken", s.delivery_fee AS "deliveryFee",
  r.refund_cash AS "refundCash", r.refund_upi AS "refundUpi", r.refund_card AS "refundCard", (SELECT COALESCE(NULLIF(p.full_name, ''), p.email) FROM profiles p WHERE p.id = r.approved_by) AS "approvedBy"`;

// A return with what came back (`returned`), what the customer kept after every return (`kept`) and the other returns on the same bill.
export async function getReturn(q, key, { byToken = false } = {}) {
  const r = await one(q, `SELECT ${retCols} FROM pos_returns r JOIN pos_sales s ON s.id = r.sale_id WHERE ${byToken ? 'r.share_token' : 'r.return_no'} = $1`, [String(key).slice(0, 64)]);
  if (!r) return null;
  r.returned = await rows(q, `
    SELECT i.name_snapshot AS name, i.sku_snapshot AS sku, i.variant_snapshot AS variant, i.unit_price AS "unitPrice", ri.quantity AS qty, i.quantity AS sold, ri.line_total AS amount, i.tax_rate AS "taxRate", ri.restock AS "backInStock"
    FROM pos_return_items ri JOIN pos_sale_items i ON i.id = ri.sale_item_id WHERE ri.return_id = $1 ORDER BY ri.id`, [r.id]);
  const lines = await lineRows(q, r.saleId);
  r.kept = lines.filter(l => l.quantity - l.returnedQty > 0).map(l => ({ name: l.name, sku: l.sku, variant: l.variant, unitPrice: l.unitPrice, qty: l.quantity - l.returnedQty, sold: l.quantity }));
  r.otherReturns = await rows(q, 'SELECT return_no AS "returnNo", total, created_at AS "createdAt" FROM pos_returns WHERE sale_id = $1 AND id <> $2 ORDER BY id', [r.saleId, r.id]);
  delete r.id; delete r.saleId;
  return r;
}

// The returns made against one sale (used by getSale and the bill rows).
export const returnsFor = (q, saleId) => rows(q, 'SELECT return_no AS "returnNo", total, tax, refund_mode AS "refundMode", created_at AS "createdAt", share_token AS "shareToken" FROM pos_returns WHERE sale_id = $1 ORDER BY id', [saleId]);
