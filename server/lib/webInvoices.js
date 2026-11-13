import crypto from 'node:crypto';
import { rows, one } from '../db/index.js';
import { audit } from './orders.js';
import { invoiceNo } from './pos.js';

// Website orders appear in Order History → Online orders with an invoice like any other bill. The prices on the website include GST, so the
// invoice shows the taxable value, the GST inside it, any discount and the delivery charge; the total is exactly what the customer paid.
// Safe to call twice: one invoice per order. Stock is NOT touched here (the order already reserved and sold it).
export async function invoiceForOrder(db, orderId) {
  const o = await one(db, 'SELECT * FROM orders WHERE id = $1', [orderId]);
  if (!o || o.payment_status !== 'paid') return null;
  const have = await one(db, 'SELECT invoice_no FROM pos_sales WHERE web_order_id = $1', [o.id]);
  if (have) return have.invoice_no;
  const items = await rows(db, `SELECT oi.*, COALESCE(p.tax_rate, 0) AS rate FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = $1 ORDER BY oi.id`, [o.id]);
  if (!items.length) return null;
  const lines = items.map(i => { const gross = i.unit_price * i.quantity, tax = Math.round(gross * i.rate / (100 + i.rate)); return { ...i, gross, tax, base: gross - tax } });
  const subtotal = lines.reduce((s, l) => s + l.base, 0), tax = lines.reduce((s, l) => s + l.tax, 0);
  const discount = o.discount_amount || 0, delivery = o.shipping_amount || 0, total = subtotal + tax - discount + delivery;
  const a = o.shipping_address_snapshot || {};
  const addr = [a.line1, a.city, a.state, a.pin].filter(Boolean).join(', ');
  return db.tx(async t => {
    const number = await invoiceNo(t, 'retail');
    const sale = await one(t, `
      INSERT INTO pos_sales (invoice_no, idempotency_key, channel, customer_name, customer_phone, is_gst, subtotal, discount_type, discount_value, discount_amount, tax_amount, delivery_fee,
        total_amount, payment_mode, pay_cash, pay_upi, pay_card, cash_tendered, change_given, payment_ref, notes, cashier_id, bill_date, customer_address, source, gst_rate, share_token, created_at, web_order_id)
      VALUES ($1,$2,'retail',$3,$4,true,$5,'fixed',$6,$6,$7,$8,$9,'upi',0,$9,0,0,0,$10,$11,NULL,$12::date,$13,'online',NULL,$14,$15,$16)
      ON CONFLICT (web_order_id) DO NOTHING RETURNING id`,
      [number, `web-order-${o.id}`, a.name || '', String(a.phone || '').slice(0, 20), subtotal, discount, tax, delivery, total, o.order_number, `Website order ${o.order_number}`,
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(o.created_at)), addr, crypto.randomBytes(16).toString('base64url'), o.created_at, o.id]);
    if (!sale) return (await one(t, 'SELECT invoice_no FROM pos_sales WHERE web_order_id = $1', [o.id]))?.invoice_no ?? null;
    for (const l of lines) {
      await t.query(`INSERT INTO pos_sale_items (sale_id, product_id, variant_id, name_snapshot, sku_snapshot, variant_snapshot, unit_price, quantity, line_total, discount_alloc, tax_rate, tax_amount)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11)`,
        [sale.id, l.product_id, l.variant_id, l.product_name_snapshot, l.sku_snapshot, JSON.stringify(l.variant_snapshot || {}), Math.round(l.base / l.quantity), l.quantity, l.base, l.rate, l.tax]);
    }
    await audit(t, null, 'web.invoice', 'pos_sale', number, { order: o.order_number, total });
    return number;
  });
}

// Creates the missing invoices for paid website orders (older orders, or one whose invoice step failed). Cheap when nothing is missing.
export async function syncWebInvoices(db) {
  const todo = await rows(db, `SELECT o.id FROM orders o WHERE o.payment_status = 'paid' AND NOT EXISTS (SELECT 1 FROM pos_sales s WHERE s.web_order_id = o.id) ORDER BY o.id LIMIT 100`);
  for (const t of todo) await invoiceForOrder(db, t.id).catch(() => {});
  return todo.length;
}
