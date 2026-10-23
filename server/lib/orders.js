import crypto from 'node:crypto';
import { rows, one } from '../db/index.js';
import { HttpError } from './http.js';
import { cartLines, issueFor, shippingFor } from './cart.js';

export const orderNumber = () => 'DH' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();
export const audit = (q, actorId, action, entity, entityId, meta = {}) =>
  q.query('INSERT INTO audit_events (actor_id, action, entity, entity_id, meta) VALUES ($1,$2,$3,$4,$5)', [actorId ?? null, action, entity, String(entityId ?? ''), JSON.stringify(meta)]);

// Inventory policy: stock is RESERVED (decremented) when a pending order is created, inside one transaction,
// using a guarded atomic UPDATE so concurrent checkouts can never oversell. A reservation is RELEASED when
// payment fails, is cancelled, or the reservation window (RESERVATION_MINUTES) lapses.
export async function createPendingOrder({ db, cfg }, { cartId, user, email, address }) {
  return db.tx(async t => {
    const lines = await cartLines(t, cartId);
    if (!lines.length) throw new HttpError(400, 'Your bag is empty', 'empty_cart');
    for (const l of lines) {
      const issue = issueFor(l);
      if (issue) throw new HttpError(409, issue === 'insufficient_stock' ? `Only ${l.stock} left of ${l.name} (${l.size})` : `${l.name} (${l.size}) is no longer available`, issue);
    }
    let subtotal = 0, tax = 0;
    for (const l of lines) { const lt = l.price * l.qty; subtotal += lt; tax += Math.round(lt * l.taxRate / 100) }
    const ship = await shippingFor(t, subtotal);
    const total = subtotal + tax + ship.amount;
    const number = orderNumber();
    const order = await one(t, `INSERT INTO orders (user_id, order_number, email, subtotal, shipping_amount, tax_amount, total_amount, shipping_address_snapshot, shipping_method_id, reservation_expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() + ($10 || ' minutes')::interval) RETURNING id, order_number, total_amount, currency`,
      [user?.id ?? null, number, email, subtotal, ship.amount, tax, total, JSON.stringify(address), ship.id, String(cfg.RESERVATION_MINUTES)]);
    for (const l of lines) {
      const r = await t.query('UPDATE product_variants SET stock_quantity = stock_quantity - $1 WHERE id = $2 AND stock_quantity >= $1 RETURNING id', [l.qty, l.variantId]);
      if (!r.rows.length) throw new HttpError(409, `Stock changed for ${l.name} (${l.size}). Please review your bag.`, 'stock_changed');
      await t.query(`INSERT INTO order_items (order_id, product_id, variant_id, product_name_snapshot, sku_snapshot, variant_snapshot, unit_price, quantity, line_total)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [order.id, l.productId, l.variantId, l.name, l.sku, JSON.stringify({ size: l.size, color: l.color }), l.price, l.qty, l.price * l.qty]);
      await t.query('INSERT INTO inventory_movements (variant_id, quantity_change, reason, reference_id) VALUES ($1,$2,$3,$4)', [l.variantId, -l.qty, 'order_reserved', number]);
    }
    return order;
  });
}

// Releases the reservation of a still-pending order. Safe to call repeatedly.
export async function releaseOrder(db, number, paymentStatus = 'cancelled') {
  return db.tx(async t => {
    const o = await one(t, `SELECT id FROM orders WHERE order_number = $1 AND payment_status = 'pending' FOR UPDATE`, [number]);
    if (!o) return false;
    for (const i of await rows(t, 'SELECT variant_id, quantity FROM order_items WHERE order_id = $1', [o.id])) {
      if (!i.variant_id) continue;
      await t.query('UPDATE product_variants SET stock_quantity = stock_quantity + $1 WHERE id = $2', [i.quantity, i.variant_id]);
      await t.query('INSERT INTO inventory_movements (variant_id, quantity_change, reason, reference_id) VALUES ($1,$2,$3,$4)', [i.variant_id, i.quantity, 'order_released', number]);
    }
    await t.query(`UPDATE orders SET payment_status = $2, status = 'cancelled', reservation_expires_at = NULL, updated_at = now() WHERE id = $1`, [o.id, paymentStatus]);
    await t.query(`UPDATE payments SET status = $2, updated_at = now() WHERE order_id = $1 AND status = 'pending'`, [o.id, paymentStatus === 'failed' ? 'failed' : 'cancelled']);
    return true;
  });
}

export async function releaseExpired(db) {
  const due = await rows(db, `SELECT order_number FROM orders WHERE payment_status = 'pending' AND reservation_expires_at < now()`);
  let n = 0;
  for (const d of due) if (await releaseOrder(db, d.order_number, 'cancelled')) n++;
  return n;
}

// Marks an order paid only for a verified provider event. A payment that arrives after the reservation
// was released is recorded for manual review/refund rather than silently overselling.
export async function markPaid(db, { provider, providerOrderId, providerPaymentId }) {
  return db.tx(async t => {
    const p = await one(t, `SELECT p.id, p.order_id, o.payment_status, o.order_number FROM payments p JOIN orders o ON o.id = p.order_id
                            WHERE p.provider = $1 AND p.provider_order_id = $2 FOR UPDATE OF o`, [provider, providerOrderId]);
    if (!p) throw new HttpError(404, 'Unknown payment order');
    if (p.payment_status === 'paid') return { orderNumber: p.order_number, status: 'paid', already: true };
    if (p.payment_status !== 'pending') {
      await t.query(`UPDATE payments SET provider_payment_id = $2, status = 'captured', updated_at = now() WHERE id = $1`, [p.id, providerPaymentId]);
      await audit(t, null, 'late_payment', 'order', p.order_number, { providerPaymentId, orderState: p.payment_status });
      return { orderNumber: p.order_number, status: 'needs_review' };
    }
    await t.query(`UPDATE payments SET provider_payment_id = $2, status = 'captured', updated_at = now() WHERE id = $1`, [p.id, providerPaymentId]);
    await t.query(`UPDATE orders SET payment_status = 'paid', status = 'confirmed', reservation_expires_at = NULL, updated_at = now() WHERE id = $1`, [p.order_id]);
    return { orderNumber: p.order_number, status: 'paid' };
  });
}

export const ordersForUser = (db, userId) => rows(db, `
  SELECT o.order_number, o.status, o.payment_status, o.total_amount AS total, o.currency, o.created_at,
         COALESCE(json_agg(json_build_object('name', oi.product_name_snapshot, 'quantity', oi.quantity, 'variant', oi.variant_snapshot, 'lineTotal', oi.line_total) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
  FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
  WHERE o.user_id = $1 GROUP BY o.id ORDER BY o.id DESC LIMIT 100`, [userId]);
