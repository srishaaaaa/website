import { rows, one } from '../db/index.js';
import { HttpError } from './http.js';
import { audit } from './orders.js';

const like = v => `%${String(v).trim().replace(/[\\%_]/g, m => '\\' + m)}%`;

// Retail bills with at least one stitching line (a line whose snapshot carries `measure`), newest first.
export async function listMeasurements(db, { q = '', name = '', phone = '', status = 'all', from, to }) {
  const w = ["s.channel = 'retail'", "EXISTS (SELECT 1 FROM pos_sale_items i WHERE i.sale_id = s.id AND i.variant_snapshot ? 'measure')"], a = [];
  const add = v => { a.push(v); return '$' + a.length };
  if (q.trim()) w.push(`s.invoice_no ILIKE ${add(like(q))}`);
  if (name.trim()) w.push(`s.customer_name ILIKE ${add(like(name))}`);
  if (phone.trim()) w.push(`regexp_replace(s.customer_phone, '\\D', '', 'g') LIKE ${add(like(phone.replace(/\D/g, '')))}`);
  if (from) w.push(`s.bill_date >= ${add(from)}::date`);
  if (to) w.push(`s.bill_date <= ${add(to)}::date`);
  const list = await rows(db, `
    SELECT s.id, s.invoice_no AS "invoiceNo", s.customer_name AS "customerName", s.customer_phone AS "customerPhone", s.customer_address AS "customerAddress",
           s.bill_date::text AS "billDate", s.created_at AS "createdAt", s.total_amount AS total, s.share_token AS "shareToken",
           CASE WHEN s.status = 'voided' THEN 'cancelled' ELSE s.tailoring_status END AS status
    FROM pos_sales s WHERE ${w.join(' AND ')} ORDER BY s.id DESC LIMIT 300`, a);
  const counts = { all: list.length, pending: 0, completed: 0, cancelled: 0 };
  for (const b of list) counts[b.status]++;
  const bills = list.filter(b => status === 'all' || b.status === status);
  for (const b of bills) {
    b.items = await rows(db, `SELECT name_snapshot AS name, unit_price AS "unitPrice", quantity, line_total AS "lineTotal", variant_snapshot -> 'measure' AS measure
      FROM pos_sale_items WHERE sale_id = $1 AND variant_snapshot ? 'measure' ORDER BY id`, [b.id]);
    delete b.id;
  }
  return { counts, bills };
}

export async function setTailoring(db, user, invoice, status) {
  const s = await one(db, 'SELECT id, status FROM pos_sales WHERE invoice_no = $1', [invoice]);
  if (!s) throw new HttpError(404, 'Invoice not found');
  if (s.status === 'voided') throw new HttpError(409, 'A cancelled bill cannot be changed', 'voided');
  await db.query('UPDATE pos_sales SET tailoring_status = $2 WHERE id = $1', [s.id, status]);
  await audit(db, user.id, 'pos.tailoring', 'pos_sale', invoice, { status });
  return { invoiceNo: invoice, status };
}
