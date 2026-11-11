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

// ---------- Stitching dashboard / orders / reports ----------
// A "stitching order" is a retail bill with at least one stitching line, or an open advance order whose items carry measurements.
// Active = pending bills + open advance orders. Dates are Asia/Kolkata days (YYYY-MM-DD).
const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) };
const minDate = list => list.filter(Boolean).sort()[0] ?? null;

async function stitchRows(db) {
  const bills = await rows(db, `
    SELECT s.invoice_no AS "invoiceNo", s.customer_name AS "customerName", s.customer_phone AS "customerPhone", s.bill_date::text AS "billDate", s.share_token AS "shareToken",
           CASE WHEN s.status = 'voided' THEN 'cancelled' ELSE s.tailoring_status END AS status, s.total_amount AS total,
           json_agg(json_build_object('name', i.name_snapshot, 'qty', i.quantity, 'amount', i.line_total - i.discount_alloc, 'due', i.variant_snapshot -> 'measure' ->> 'dueDate') ORDER BY i.id) AS lines
    FROM pos_sales s JOIN pos_sale_items i ON i.sale_id = s.id
    WHERE s.channel = 'retail' AND i.variant_snapshot ? 'measure' GROUP BY s.id ORDER BY s.id DESC LIMIT 1000`);
  const adv = await rows(db, `SELECT code, customer_name AS "customerName", customer_phone AS "customerPhone", created_at::date::text AS "billDate", total_amount AS total, deposit, delivery_date::text AS "deliveryDate", items
    FROM pos_advances WHERE status IN ('pending', 'ready') ORDER BY id DESC LIMIT 500`);
  const advances = adv.filter(a => (a.items || []).some(i => i.measure)).map(a => {
    const lines = a.items.filter(i => i.measure).map(i => ({ name: i.name, qty: i.qty, amount: i.price * i.qty, due: i.measure?.dueDate ?? null }));
    return { kind: 'advance', code: a.code, customerName: a.customerName, customerPhone: a.customerPhone, billDate: a.billDate, status: 'pending', total: a.total, balance: a.total - a.deposit, lines, due: minDate([...lines.map(l => l.due), a.deliveryDate]) };
  });
  const bs = bills.map(b => ({ kind: 'bill', ...b, due: minDate(b.lines.map(l => l.due)) }));
  return { bills: bs, advances };
}
const garments = o => o.lines.reduce((s, l) => s + l.qty, 0);
const value = o => o.lines.reduce((s, l) => s + l.amount, 0);
const brief = o => ({ kind: o.kind, ref: o.invoiceNo ?? o.code, shareToken: o.shareToken ?? null, customerName: o.customerName, customerPhone: o.customerPhone, billDate: o.billDate, due: o.due, status: o.status, total: o.total, garments: garments(o) });

export async function stitchingOrders(db, { q = '', name = '', phone = '', status = 'all', from, to }) {
  const { bills, advances } = await stitchRows(db);
  const has = (v, t) => String(v ?? '').toLowerCase().includes(String(t).trim().toLowerCase());
  const digits = s => String(s ?? '').replace(/\D/g, '');
  const all = [...advances, ...bills].filter(o => (!q.trim() || has(o.invoiceNo ?? o.code, q)) && (!name.trim() || has(o.customerName, name)) && (!phone.trim() || digits(o.customerPhone).includes(digits(phone)))
    && (!from || o.billDate >= from) && (!to || o.billDate <= to));
  const counts = { all: all.length, pending: all.filter(o => o.status === 'pending').length, completed: all.filter(o => o.status === 'completed').length, cancelled: all.filter(o => o.status === 'cancelled').length };
  return { counts, orders: all.filter(o => status === 'all' || o.status === status).map(brief) };
}

export async function stitchingOverview(db, { from, to }) {
  const { bills, advances } = await stitchRows(db);
  const today = istToday(), soon = addDays(today, 7);
  const active = [...advances, ...bills.filter(b => b.status === 'pending')];
  const inPeriod = bills.filter(b => (!from || b.billDate >= from) && (!to || b.billDate <= to));
  const done = inPeriod.filter(b => b.status === 'completed');
  const revenue = done.reduce((s, b) => s + value(b), 0), gar = done.reduce((s, b) => s + garments(b), 0);
  const byGarment = new Map(), byDay = new Map();
  for (const b of done) {
    byDay.set(b.billDate, (byDay.get(b.billDate) ?? 0) + value(b));
    for (const l of b.lines) { const g = byGarment.get(l.name) ?? { name: l.name, qty: 0, revenue: 0 }; g.qty += l.qty; g.revenue += l.amount; byGarment.set(l.name, g) }
  }
  const overdue = active.filter(o => o.due && o.due < today), dueToday = active.filter(o => o.due === today);
  return {
    from, to, today,
    activeOrders: active.length, dueToday: dueToday.length, overdue: overdue.length, completed: done.length,
    stitchingRevenue: revenue, bills: done.length, garments: gar, averageGarment: gar ? Math.round(revenue / gar) : 0,
    openAdvances: advances.length, balanceToCollect: advances.reduce((s, a) => s + a.balance, 0),
    pendingValue: active.reduce((s, o) => s + value(o), 0), pendingOrders: active.length,
    dueSoon: active.filter(o => o.due && o.due >= today && o.due <= soon).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 12).map(brief),
    overdueList: overdue.sort((a, b) => a.due.localeCompare(b.due)).slice(0, 12).map(brief),
    recent: [...advances, ...bills].sort((a, b) => b.billDate.localeCompare(a.billDate)).slice(0, 8).map(brief),
    byGarment: [...byGarment.values()].sort((a, b) => b.revenue - a.revenue), byDay: [...byDay].sort().map(([day, amount]) => ({ day, amount })),
    byStatus: { pending: inPeriod.filter(b => b.status === 'pending').length + advances.length, completed: done.length, cancelled: inPeriod.filter(b => b.status === 'cancelled').length },
  };
}
