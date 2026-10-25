import { rows, one } from '../db/index.js';
import { HttpError } from './http.js';
import { audit } from './orders.js';
import { computeBill, createSale, getSale, normPhone } from './pos.js';

// ---------------------------------------------------------------------------------------------------------------------------------
// Stitching Studio service layer. Staff only (see routes/stitching.js). Money is integer paise. The server is the authority for every
// total; the client only mirrors the maths for display. Invoices are created by the existing POS createSale, so nothing is billed twice.
// ---------------------------------------------------------------------------------------------------------------------------------

const istDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const istYear = () => Number(istDate().slice(0, 4));
export const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) };
const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86_400_000);
const who = u => u?.name || u?.email || 'Staff';
const isManager = u => ['owner', 'admin'].includes(u?.role);

// ---- configuration constants (garment types and their field lists live in the database; the field catalogues live here) ----
export const MEASURE_GROUPS = {
  blouse: { label: 'Blouse', fields: [['bust', 'Bust'], ['under_bust', 'Under-bust'], ['waist', 'Waist'], ['shoulder', 'Shoulder'], ['armhole', 'Armhole'], ['sleeve_length', 'Sleeve length'], ['sleeve_round', 'Sleeve round'],
    ['blouse_length', 'Blouse length'], ['front_neck_depth', 'Front neck depth'], ['back_neck_depth', 'Back neck depth'], ['across_front', 'Across front'], ['across_back', 'Across back']] },
  kurti: { label: 'Kurti / top', fields: [['bust', 'Bust / chest'], ['waist', 'Waist'], ['hip', 'Hip'], ['shoulder', 'Shoulder'], ['armhole', 'Armhole'], ['sleeve_length', 'Sleeve length'], ['sleeve_round', 'Sleeve round'], ['length', 'Length'], ['neck_depth', 'Neck depth']] },
  bottom: { label: 'Bottom (salwar / churidar)', fields: [['waist', 'Waist'], ['hip', 'Hip'], ['thigh', 'Thigh'], ['knee', 'Knee'], ['calf', 'Calf'], ['ankle', 'Ankle'], ['length', 'Length'], ['rise', 'Rise']] },
  skirt: { label: 'Lehenga skirt', fields: [['waist', 'Waist'], ['hip', 'Hip'], ['length', 'Length'], ['flare', 'Flare / sweep']] },
  gown: { label: 'Gown / dress', fields: [['bust', 'Bust'], ['under_bust', 'Under-bust'], ['waist', 'Waist'], ['hip', 'Hip'], ['shoulder', 'Shoulder'], ['armhole', 'Armhole'], ['sleeve_length', 'Sleeve length'], ['length', 'Length']] },
  misc: { label: 'Other (custom only)', fields: [] },
};
const SLEEVE = ['Sleeveless', 'Cap', 'Short', 'Elbow', 'Three-quarter', 'Full', 'Bell', 'Puff'];
export const SPEC_LIBRARY = {
  neck_design: { label: 'Neck design', type: 'text' }, front_neck_depth: { label: 'Front neck depth', type: 'text' }, back_neck_depth: { label: 'Back neck depth', type: 'text' },
  sleeve_style: { label: 'Sleeve style', type: 'select', options: SLEEVE }, sleeve_length: { label: 'Sleeve length', type: 'text' }, sleeve_opening: { label: 'Sleeve opening', type: 'text' },
  length: { label: 'Garment length', type: 'text' }, lining: { label: 'Lining', type: 'select', options: ['None', 'Cotton lining', 'Satin lining', 'Fabric of the garment'] },
  padding: { label: 'Padding', type: 'select', options: ['None', 'Light padding', 'Cup padding'] }, closure: { label: 'Closure', type: 'select', options: ['Hooks', 'Zipper (side)', 'Zipper (back)', 'Buttons', 'Dori / ties', 'None'] },
  embroidery: { label: 'Embroidery / embellishment', type: 'text' }, fit: { label: 'Fitting preference', type: 'select', options: ['Snug', 'Regular', 'Relaxed'] }, hemming: { label: 'Hemming and finishing', type: 'text' },
};
export const STATUSES = [
  ['received', 'Order received'], ['measurements_confirmed', 'Measurements confirmed'], ['materials_ready', 'Fabric & materials prepared'], ['cutting', 'Cutting'], ['stitching', 'Stitching in progress'],
  ['trial_scheduled', 'Trial scheduled'], ['trial_completed', 'Trial completed'], ['alterations_required', 'Alterations required'], ['finishing_qc', 'Final finishing & quality check'],
  ['ready', 'Ready for delivery'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled'],
];
// Manual transitions. Stages may be skipped; alterations_required is entered only by adding an alteration round; delivered/cancelled are final.
export const TRANSITIONS = {
  received: ['measurements_confirmed', 'materials_ready', 'cutting', 'stitching', 'cancelled'],
  measurements_confirmed: ['materials_ready', 'cutting', 'stitching', 'cancelled'],
  materials_ready: ['cutting', 'stitching', 'cancelled'],
  cutting: ['stitching', 'cancelled'],
  stitching: ['trial_scheduled', 'finishing_qc', 'cancelled'],
  trial_scheduled: ['trial_completed', 'cancelled'],
  trial_completed: ['finishing_qc', 'cancelled'],
  alterations_required: ['stitching', 'trial_scheduled', 'finishing_qc', 'cancelled'],
  finishing_qc: ['ready', 'stitching', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [], cancelled: [],
};
const ALTERABLE = ['trial_scheduled', 'trial_completed', 'finishing_qc', 'ready'];
export const QC_CHECKS = [['fit', 'Measurements and fit'], ['stitching', 'Stitching quality'], ['finishing', 'Finishing'], ['closures', 'Buttons, hooks, zippers and closures'], ['design', 'Design requirements'], ['final', 'Final garment inspection']];
export const APPT_KINDS = [['measurement', 'Measurement'], ['trial', 'First fitting / trial'], ['follow_up_trial', 'Follow-up trial'], ['alteration', 'Alteration'], ['final_fitting', 'Final fitting'], ['delivery', 'Delivery / collection']];
export const MIN_DAYS = { normal: 5, urgent: 3, express: 1 };
const ACTIVE = "('delivered','cancelled')";

// ---- validation helpers ----
export function validateMeasure(group, unit, values = {}, custom = []) {
  const g = MEASURE_GROUPS[group];
  if (!g) throw new HttpError(400, `Unknown measurement group "${group}"`);
  const max = unit === 'in' ? 120 : 305, out = {};
  for (const [k, v] of Object.entries(values)) {
    if (!g.fields.some(f => f[0] === k)) throw new HttpError(400, `Unknown ${g.label} measurement "${k}"`);
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > max) throw new HttpError(400, `${g.fields.find(f => f[0] === k)[1]} must be a number above 0 and up to ${max} ${unit === 'in' ? 'inches' : 'cm'}`);
    out[k] = Math.round(v * 100) / 100;
  }
  const extra = custom.map(c => {
    const label = String(c.label ?? '').trim();
    if (!label || label.length > 40) throw new HttpError(400, 'Each custom measurement needs a name of up to 40 characters');
    if (typeof c.value !== 'number' || !(c.value > 0) || c.value > max) throw new HttpError(400, `"${label}" must be a number above 0 and up to ${max}`);
    return { label, value: Math.round(c.value * 100) / 100 };
  });
  if (!Object.keys(out).length && !extra.length) throw new HttpError(400, 'Enter at least one measurement');
  return { unit, values: out, custom: extra };
}

export function checkDates(d, today = istDate()) {
  const { orderDate, startDate, trialDate, deliveryDate } = d;
  if (orderDate > today) throw new HttpError(400, 'The order date cannot be in the future', 'bad_date');
  if (deliveryDate < orderDate) throw new HttpError(400, 'The promised delivery date is before the order date', 'bad_date');
  if (startDate && (startDate < orderDate || startDate > deliveryDate)) throw new HttpError(400, 'The start date must fall between the order date and delivery date', 'bad_date');
  if (trialDate && (trialDate < orderDate || trialDate > deliveryDate)) throw new HttpError(400, 'The trial date must fall between the order date and delivery date', 'bad_date');
}
export function deliveryWarnings({ orderDate, deliveryDate, trialDate, priority, garments }) {
  const out = [], need = MIN_DAYS[priority] + Math.floor(Math.max(0, garments - 1) / 2), have = dayDiff(orderDate, deliveryDate);
  if (have < need) out.push(`Only ${have} day${have === 1 ? '' : 's'} to deliver: ${need} or more is realistic for a ${priority} order of ${garments} garment${garments === 1 ? '' : 's'}.`);
  if (trialDate && trialDate === deliveryDate) out.push('The trial is on the delivery day, so there is no time left for alterations.');
  return out;
}

// ---- totals (the single source of truth; the same lines are sent to the POS invoice) ----
export function orderLines(items, { urgentCharge = 0, alterationTotal = 0 }) {
  const lines = items.map(i => ({ name: `${i.garment_name ?? i.garmentName}${(i.design_name ?? '') ? ' (' + i.design_name + ')' : ''}`, sku: 'STITCH', price: i.unit_charge ?? i.unitCharge, qty: i.qty, taxRate: 0 }));
  if (urgentCharge > 0) lines.push({ name: 'Urgent / express stitching charge', sku: 'STITCH', price: urgentCharge, qty: 1, taxRate: 0 });
  if (alterationTotal > 0) lines.push({ name: 'Alteration charges', sku: 'STITCH', price: alterationTotal, qty: 1, taxRate: 0 });
  return lines;
}
export function orderTotals(items, o) {
  const lines = orderLines(items, { urgentCharge: o.urgent_charge, alterationTotal: o.alteration_total });
  const bill = computeBill(lines, { isGst: o.is_gst, gstRate: o.is_gst ? o.gst_rate : null, discountType: 'fixed', discountValue: o.discount, deliveryFee: 0 });
  return { lines, subtotal: bill.subtotal, discount: bill.discount, tax: bill.tax, total: bill.total };
}
async function recompute(t, orderId) {
  const o = await one(t, 'SELECT * FROM stitch_orders WHERE id = $1', [orderId]);
  const items = await rows(t, 'SELECT garment_name, unit_charge, qty FROM stitch_items WHERE order_id = $1 ORDER BY position, id', [orderId]);
  const alt = (await one(t, 'SELECT COALESCE(SUM(charge), 0)::int AS s FROM stitch_alterations WHERE order_id = $1', [orderId])).s;
  const tot = orderTotals(items, { ...o, alteration_total: alt });
  await t.query('UPDATE stitch_orders SET alteration_total = $2, subtotal = $3, tax_amount = $4, total_amount = $5, updated_at = now() WHERE id = $1', [orderId, alt, tot.subtotal, tot.tax, tot.total]);
  return tot;
}

// ---- logging ----
const note = (t, orderId, user, action, detail = {}) => t.query('INSERT INTO stitch_activity (order_id, action, detail, by_user, by_name) VALUES ($1,$2,$3,$4,$5)', [orderId, action, JSON.stringify(detail), user?.id ?? null, who(user)]);
const moved = (t, orderId, user, from, to, text = '', override = false) =>
  t.query('INSERT INTO stitch_status_history (order_id, from_status, to_status, note, override, by_user, by_name) VALUES ($1,$2,$3,$4,$5,$6,$7)', [orderId, from, to, text, override, user?.id ?? null, who(user)]);

// ---- order reads ----
const PAY_SQL = `LEFT JOIN LATERAL (SELECT SUM(CASE WHEN kind = 'refund' THEN -amount ELSE amount END) AS paid FROM stitch_payments WHERE order_id = o.id) p ON true`;
const BASE = `
  SELECT o.id, o.order_no AS "orderNo", o.customer_id AS "customerId", o.customer_name AS "customerName", o.customer_phone AS "customerPhone", o.status, o.priority,
         o.tailor_id AS "tailorId", t.name AS "tailorName", o.order_date::text AS "orderDate", o.start_date::text AS "startDate", o.trial_date::text AS "trialDate", o.delivery_date::text AS "deliveryDate",
         o.is_gst AS "isGst", o.gst_rate AS "gstRate", o.discount, o.urgent_charge AS "urgentCharge", o.alteration_total AS "alterationTotal", o.subtotal, o.tax_amount AS tax, o.total_amount AS total,
         o.notes, o.invoice_no AS "invoiceNo", o.delivered_at AS "deliveredAt", o.cancelled_at AS "cancelledAt", o.created_at AS "createdAt",
         COALESCE(p.paid, 0)::int AS paid,
         (CASE WHEN o.status = 'cancelled' THEN 0 ELSE GREATEST(o.total_amount - COALESCE(p.paid, 0), 0) END)::int AS balance,
         (o.delivery_date < (now() AT TIME ZONE 'Asia/Kolkata')::date AND o.status NOT IN ${ACTIVE}) AS overdue,
         (SELECT string_agg(i.garment_name || CASE WHEN i.qty > 1 THEN ' ×' || i.qty ELSE '' END, ', ' ORDER BY i.position, i.id) FROM stitch_items i WHERE i.order_id = o.id) AS garments
  FROM stitch_orders o LEFT JOIN stitch_tailors t ON t.id = o.tailor_id ${PAY_SQL}`;
const payStatus = r => r.status === 'cancelled' ? (r.paid > 0 ? 'held' : 'none') : r.paid <= 0 ? 'unpaid' : r.balance > 0 ? 'partial' : 'paid';
const withPay = r => r && ({ ...r, paymentStatus: payStatus(r) });

export async function listOrders(db, f) {
  const w = [], p = [];
  const add = (sql, v) => { p.push(v); w.push(sql.replace('?', '$' + p.length)) };
  if (f.q) { const like = `%${f.q.replace(/[\\%_]/g, m => '\\' + m)}%`; p.push(like); w.push(`(b."orderNo" ILIKE $${p.length} OR b."customerName" ILIKE $${p.length} OR b."customerPhone" ILIKE $${p.length})`) }
  if (f.status === 'active') w.push(`b.status NOT IN ${ACTIVE}`); else if (f.status !== 'all') add('b.status = ?', f.status);
  if (f.tailorId) add('b."tailorId" = ?', f.tailorId);
  if (f.garmentTypeId) add('EXISTS (SELECT 1 FROM stitch_items i WHERE i.order_id = b.id AND i.garment_type_id = ?)', f.garmentTypeId);
  if (f.from) add('b."orderDate" >= ?::date::text', f.from);
  if (f.to) add('b."orderDate" <= ?::date::text', f.to);
  if (f.overdue) w.push('b.overdue');
  if (f.payment !== 'all') w.push(`b."paymentStatus" = '${f.payment}'`);
  const order = { created: 'b.id', delivery: 'b."deliveryDate"', priority: `CASE b.priority WHEN 'express' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END`, status: `array_position(ARRAY[${STATUSES.map(s => `'${s[0]}'`).join(',')}], b.status)` }[f.sort];
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const wrapped = `(SELECT x.*, (CASE WHEN x.status = 'cancelled' THEN CASE WHEN x.paid > 0 THEN 'held' ELSE 'none' END WHEN x.paid <= 0 THEN 'unpaid' WHEN x.balance > 0 THEN 'partial' ELSE 'paid' END) AS "paymentStatus" FROM (${BASE}) x) b`;
  const total = (await one(db, `SELECT COUNT(*)::int AS n FROM ${wrapped} ${where}`, p)).n;
  p.push(f.pageSize, (f.page - 1) * f.pageSize);
  const list = await rows(db, `SELECT b.* FROM ${wrapped} ${where} ORDER BY ${order} ${f.dir === 'desc' ? 'DESC' : 'ASC'} NULLS LAST, b.id DESC LIMIT $${p.length - 1} OFFSET $${p.length}`, p);
  return { total, page: f.page, pageSize: f.pageSize, rows: list };
}

export async function getOrder(q, id) {
  const o = withPay(await one(q, `${BASE} WHERE o.id = $1`, [id]));
  if (!o) return null;
  const [items, history, activity, payments, alterations, qc, appointments, rounds] = await Promise.all([
    rows(q, `SELECT i.id, i.garment_type_id AS "garmentTypeId", i.garment_name AS "garmentName", i.qty, i.design_id AS "designId", d.name AS "designName", i.specs, i.custom, i.notes, i.fabric, i.measurements, i.charges,
             i.unit_charge AS "unitCharge", t.measure_groups AS "measureGroups", t.spec_fields AS "specFields"
             FROM stitch_items i JOIN stitch_garment_types t ON t.id = i.garment_type_id LEFT JOIN stitch_designs d ON d.id = i.design_id WHERE i.order_id = $1 ORDER BY i.position, i.id`, [id]),
    rows(q, 'SELECT id, from_status AS "from", to_status AS "to", note, override, by_name AS "by", at FROM stitch_status_history WHERE order_id = $1 ORDER BY id', [id]),
    rows(q, 'SELECT id, action, detail, by_name AS "by", at FROM stitch_activity WHERE order_id = $1 ORDER BY id DESC LIMIT 200', [id]),
    rows(q, `SELECT id, kind, amount, mode, ref, note, received_at AS "at", 'RC-' || lpad(id::text, 6, '0') AS receipt, (SELECT COALESCE(NULLIF(full_name, ''), email) FROM profiles WHERE id = received_by) AS "by" FROM stitch_payments WHERE order_id = $1 ORDER BY id`, [id]),
    rows(q, `SELECT a.id, a.item_id AS "itemId", a.round, a.reason, a.feedback, a.corrections, a.charge, a.tailor_id AS "tailorId", t.name AS "tailorName", a.due_date::text AS "dueDate", a.status,
             a.completion_notes AS "completionNotes", a.created_at AS "createdAt", a.completed_at AS "completedAt" FROM stitch_alterations a LEFT JOIN stitch_tailors t ON t.id = a.tailor_id WHERE a.order_id = $1 ORDER BY a.round`, [id]),
    rows(q, 'SELECT round, check_key AS key, passed, note, checked_at AS "at" FROM stitch_qc WHERE order_id = $1 ORDER BY round, check_key', [id]),
    rows(q, `SELECT a.id, a.kind, a.starts_at AS "startsAt", a.minutes, a.status, a.notes, t.name AS "tailorName" FROM stitch_appointments a LEFT JOIN stitch_tailors t ON t.id = a.tailor_id WHERE a.order_id = $1 ORDER BY a.starts_at`, [id]),
    one(q, 'SELECT COUNT(*)::int AS n FROM stitch_alterations WHERE order_id = $1', [id]),
  ]);
  const inv = o.invoiceNo ? await one(q, 'SELECT share_token AS "shareToken" FROM pos_sales WHERE invoice_no = $1', [o.invoiceNo]) : null;
  return { ...o, items, history, activity, payments, alterations, appointments, qcRound: rounds.n, qc, shareToken: inv?.shareToken ?? null };
}

// ---- items ----
async function resolveItem(t, customerId, user, raw, position) {
  const type = await one(t, 'SELECT * FROM stitch_garment_types WHERE id = $1', [raw.garmentTypeId]);
  if (!type || !type.active) throw new HttpError(400, 'Choose an active garment type', 'bad_garment');
  if (raw.designId && !(await one(t, "SELECT 1 AS x FROM stitch_designs WHERE id = $1 AND status = 'active'", [raw.designId]))) throw new HttpError(400, 'That design is archived or missing', 'bad_design');
  const specs = {};
  for (const [k, v] of Object.entries(raw.specs ?? {})) if (type.spec_fields.includes(k) && String(v).trim()) specs[k] = String(v).trim();
  const fab = { ...(raw.fabric ?? {}) };
  if (fab.variantId) {
    const v = await one(t, 'SELECT v.id, v.sku, p.name FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = $1', [fab.variantId]);
    if (!v) throw new HttpError(400, 'The linked fabric product no longer exists', 'bad_fabric');
    fab.linked = { variantId: v.id, sku: v.sku, name: v.name };
  } else delete fab.variantId;
  const groups = {}, allowed = new Set([...type.measure_groups, 'misc']);
  for (const [g, m] of Object.entries(raw.measurements?.groups ?? {})) {
    if (!allowed.has(g)) throw new HttpError(400, `${type.name} does not use ${MEASURE_GROUPS[g]?.label ?? g} measurements`, 'bad_measure');
    let profile = null, src = { values: m.values ?? {}, custom: m.custom ?? [], unit: m.unit };
    if (m.profileId) {
      profile = await one(t, 'SELECT * FROM stitch_measure_profiles WHERE id = $1', [m.profileId]);
      if (!profile || profile.customer_id !== customerId || profile.measure_group !== g) throw new HttpError(400, 'That measurement profile belongs to a different customer or garment group', 'bad_profile');
      if (!Object.keys(src.values).length && !src.custom.length) src = { values: profile.vals, custom: profile.custom, unit: profile.unit };
    }
    const clean = validateMeasure(g, src.unit, src.values, src.custom);
    if (!profile && m.saveAs) profile = await saveProfile(t, user, { customerId, name: m.saveAs, group: g, ...clean, fitPref: '', notes: m.notes ?? '' });
    groups[g] = { ...clean, notes: m.notes ?? '', fitPref: m.fitPref ?? '', profileId: profile?.id ?? null, profileVersion: profile?.version ?? null, takenAt: new Date().toISOString() };
  }
  const c = raw.charges ?? {}, charges = { base: c.base ?? 0, design: c.design ?? 0, embroidery: c.embroidery ?? 0, material: c.material ?? 0 };
  return { type, specs, custom: raw.custom ?? [], notes: raw.notes ?? '', fabric: fab, measurements: { groups }, charges, unit: Object.values(charges).reduce((s, n) => s + n, 0), position, designId: raw.designId ?? null, qty: raw.qty };
}

// ---- measurement profiles ----
async function saveProfile(t, user, d) {
  const p = await one(t, `INSERT INTO stitch_measure_profiles (customer_id, name, measure_group, unit, vals, custom, fit_pref, notes, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`,
    [d.customerId, d.name, d.group, d.unit, JSON.stringify(d.values), JSON.stringify(d.custom), d.fitPref ?? '', d.notes ?? '', user.id]);
  await t.query('INSERT INTO stitch_measure_history (profile_id, version, unit, vals, custom, fit_pref, notes, changed_by, changed_name) VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8)', [p.id, d.unit, JSON.stringify(d.values), JSON.stringify(d.custom), d.fitPref ?? '', d.notes ?? '', user.id, who(user)]);
  return p;
}
const PROFILE_COLS = `m.id, m.customer_id AS "customerId", m.name, m.measure_group AS "group", m.unit, m.vals AS values, m.custom, m.fit_pref AS "fitPref", m.notes, m.version, m.archived, m.created_at AS "createdAt", m.updated_at AS "updatedAt", (SELECT COALESCE(NULLIF(full_name, ''), email) FROM profiles WHERE id = m.updated_by) AS "updatedBy"`;
export const listProfiles = (db, customerId, archived = false) => rows(db, `SELECT ${PROFILE_COLS} FROM stitch_measure_profiles m WHERE m.customer_id = $1 AND ($2 OR NOT m.archived) ORDER BY m.archived, m.updated_at DESC`, [customerId, archived]);
export function customersWithMeasurements(db, q = '') {
  const like = `%${q.replace(/[\\%_]/g, m => '\\' + m)}%`;
  return rows(db, `SELECT c.id, c.name, c.phone, COUNT(m.id) FILTER (WHERE NOT m.archived)::int AS profiles, MAX(m.updated_at) AS "lastUpdated"
    FROM pos_customers c LEFT JOIN stitch_measure_profiles m ON m.customer_id = c.id
    WHERE $1 = '' OR c.name ILIKE $2 OR c.phone LIKE $2 GROUP BY c.id ORDER BY (COUNT(m.id) > 0) DESC, MAX(m.updated_at) DESC NULLS LAST, c.id DESC LIMIT 200`, [q.trim(), like]);
}
export async function createProfile(db, user, d) {
  const clean = validateMeasure(d.group, d.unit, d.values, d.custom);
  return db.tx(async t => {
    if (!(await one(t, 'SELECT 1 AS x FROM pos_customers WHERE id = $1', [d.customerId]))) throw new HttpError(404, 'Customer not found');
    const p = await saveProfile(t, user, { ...d, ...clean });
    await audit(t, user.id, 'stitch.measure.create', 'stitch_profile', p.id, { customerId: d.customerId, group: d.group });
    return one(t, `SELECT ${PROFILE_COLS} FROM stitch_measure_profiles m WHERE m.id = $1`, [p.id]);
  });
}
export async function updateProfile(db, user, id, d) {
  return db.tx(async t => {
    const p = await one(t, 'SELECT * FROM stitch_measure_profiles WHERE id = $1 FOR UPDATE', [id]);
    if (!p) throw new HttpError(404, 'Measurement profile not found');
    const clean = validateMeasure(p.measure_group, d.unit, d.values, d.custom), version = p.version + 1;
    await t.query('UPDATE stitch_measure_profiles SET name = $2, unit = $3, vals = $4, custom = $5, fit_pref = $6, notes = $7, archived = $8, version = $9, updated_by = $10, updated_at = now() WHERE id = $1',
      [id, d.name, clean.unit, JSON.stringify(clean.values), JSON.stringify(clean.custom), d.fitPref, d.notes, d.archived, version, user.id]);
    await t.query('INSERT INTO stitch_measure_history (profile_id, version, unit, vals, custom, fit_pref, notes, changed_by, changed_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, version, clean.unit, JSON.stringify(clean.values), JSON.stringify(clean.custom), d.fitPref, d.notes, user.id, who(user)]);
    await audit(t, user.id, 'stitch.measure.update', 'stitch_profile', id, { version });
    return one(t, `SELECT ${PROFILE_COLS} FROM stitch_measure_profiles m WHERE m.id = $1`, [id]);
  });
}
export async function duplicateProfile(db, user, id) {
  return db.tx(async t => {
    const p = await one(t, 'SELECT * FROM stitch_measure_profiles WHERE id = $1', [id]);
    if (!p) throw new HttpError(404, 'Measurement profile not found');
    const n = await saveProfile(t, user, { customerId: p.customer_id, name: `Copy of ${p.name}`.slice(0, 80), group: p.measure_group, unit: p.unit, values: p.vals, custom: p.custom, fitPref: p.fit_pref, notes: p.notes });
    return one(t, `SELECT ${PROFILE_COLS} FROM stitch_measure_profiles m WHERE m.id = $1`, [n.id]);
  });
}
export const profileHistory = (db, id) => rows(db, 'SELECT id, version, unit, vals AS values, custom, fit_pref AS "fitPref", notes, changed_name AS "by", changed_at AS "at" FROM stitch_measure_history WHERE profile_id = $1 ORDER BY id DESC', [id]);

// ---- creating an order ----
async function resolveCustomer(t, d) {
  if (d.customerId) {
    const c = await one(t, 'SELECT id, name, phone FROM pos_customers WHERE id = $1', [d.customerId]);
    if (!c) throw new HttpError(404, 'Customer not found');
    return c;
  }
  const phone = normPhone(d.customer?.phone);
  if (!phone) throw new HttpError(400, 'Enter a valid mobile number for the customer', 'bad_phone');
  if (!d.customer?.name?.trim()) throw new HttpError(400, 'Enter the customer name', 'bad_name');
  return one(t, `INSERT INTO pos_customers (name, phone) VALUES ($1,$2) ON CONFLICT (phone) DO UPDATE SET name = COALESCE(NULLIF(pos_customers.name, ''), EXCLUDED.name), updated_at = now() RETURNING id, name, phone`, [d.customer.name.trim(), phone]);
}

export async function createOrder(db, user, d) {
  const dup = await one(db, 'SELECT id FROM stitch_orders WHERE idempotency_key = $1', [d.idempotencyKey]);
  if (dup) return { order: await getOrder(db, dup.id), duplicate: true, warnings: [] };
  const orderDate = d.orderDate ?? istDate();
  checkDates({ ...d, orderDate });
  const warnings = deliveryWarnings({ orderDate, deliveryDate: d.deliveryDate, trialDate: d.trialDate, priority: d.priority, garments: d.items.reduce((s, i) => s + i.qty, 0) });
  try {
    const id = await db.tx(async t => {
      const cust = await resolveCustomer(t, d);
      if (d.tailorId && !(await one(t, 'SELECT 1 AS x FROM stitch_tailors WHERE id = $1 AND active', [d.tailorId]))) throw new HttpError(400, 'Choose an active tailor', 'bad_tailor');
      const items = [];
      for (const [i, raw] of d.items.entries()) items.push(await resolveItem(t, cust.id, user, raw, i));
      const tot = orderTotals(items.map(i => ({ garment_name: i.type.name, unit_charge: i.unit, qty: i.qty })), { urgent_charge: d.urgentCharge, alteration_total: 0, is_gst: d.isGst, gst_rate: d.gstRate, discount: d.discount });
      if (d.advance && d.advance.amount > tot.total) throw new HttpError(400, 'The advance cannot be more than the order total', 'bad_advance');
      const y = istYear();
      const { last } = await one(t, 'INSERT INTO stitch_counters (year, last) VALUES ($1, 1) ON CONFLICT (year) DO UPDATE SET last = stitch_counters.last + 1 RETURNING last', [y]);
      const no = `SO-${y}-${String(last).padStart(4, '0')}`;
      const o = await one(t, `INSERT INTO stitch_orders (order_no, idempotency_key, customer_id, customer_name, customer_phone, priority, tailor_id, order_date, start_date, trial_date, delivery_date, is_gst, gst_rate,
          discount, urgent_charge, subtotal, tax_amount, total_amount, notes, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
        [no, d.idempotencyKey, cust.id, cust.name, cust.phone, d.priority, d.tailorId ?? null, orderDate, d.startDate ?? null, d.trialDate ?? null, d.deliveryDate, d.isGst, d.gstRate, d.discount, d.urgentCharge,
          tot.subtotal, tot.tax, tot.total, d.notes, user.id]);
      for (const i of items) await t.query(`INSERT INTO stitch_items (order_id, garment_type_id, garment_name, qty, design_id, specs, custom, notes, fabric, measurements, charges, unit_charge, position)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [o.id, i.type.id, i.type.name, i.qty, i.designId, JSON.stringify(i.specs), JSON.stringify(i.custom), i.notes, JSON.stringify(i.fabric), JSON.stringify(i.measurements), JSON.stringify(i.charges), i.unit, i.position]);
      await moved(t, o.id, user, null, 'received', 'Order created');
      await note(t, o.id, user, 'created', { total: tot.total, garments: items.length });
      if (d.advance?.amount > 0) {
        await t.query(`INSERT INTO stitch_payments (order_id, kind, amount, mode, ref, idempotency_key, received_by) VALUES ($1,'advance',$2,$3,$4,$5,$6)`, [o.id, d.advance.amount, d.advance.mode, d.advance.ref ?? null, `${d.idempotencyKey}:advance`, user.id]);
        await note(t, o.id, user, 'payment', { kind: 'advance', amount: d.advance.amount, mode: d.advance.mode });
      }
      await audit(t, user.id, 'stitch.order.create', 'stitch_order', no, { total: tot.total });
      return o.id;
    });
    return { order: await getOrder(db, id), duplicate: false, warnings };
  } catch (e) {
    if (e.code === '23505' && String(e.constraint ?? e.detail ?? e.message).includes('idempotency_key')) {
      const again = await one(db, 'SELECT id FROM stitch_orders WHERE idempotency_key = $1', [d.idempotencyKey]);
      if (again) return { order: await getOrder(db, again.id), duplicate: true, warnings: [] };
    }
    throw e;
  }
}

// ---- editing ----
export async function updateOrder(db, user, id, d) {
  const warnings = [];
  await db.tx(async t => {
    const o = await one(t, 'SELECT *, order_date::text AS od, start_date::text AS sd, trial_date::text AS td, delivery_date::text AS dd FROM stitch_orders WHERE id = $1 FOR UPDATE', [id]);
    if (!o) throw new HttpError(404, 'Order not found');
    if (['delivered', 'cancelled'].includes(o.status)) throw new HttpError(409, `A ${o.status} order can no longer be edited`, 'closed');
    const next = { ...o };
    const set = (k, v) => { if (v !== undefined) next[k] = v };
    for (const [k, col] of [['priority', 'priority'], ['startDate', 'sd'], ['trialDate', 'td'], ['deliveryDate', 'dd'], ['notes', 'notes']]) set(col, d[k]);
    if (d.tailorId !== undefined && d.tailorId !== o.tailor_id) {
      if (o.tailor_id && !isManager(user)) throw new HttpError(403, 'Only an owner or admin can reassign work', 'forbidden');
      if (d.tailorId && !(await one(t, 'SELECT 1 AS x FROM stitch_tailors WHERE id = $1 AND active', [d.tailorId]))) throw new HttpError(400, 'Choose an active tailor', 'bad_tailor');
      next.tailor_id = d.tailorId;
    }
    const money = d.discount !== undefined || d.urgentCharge !== undefined || d.isGst !== undefined || d.gstRate !== undefined;
    if (money) {
      if (!isManager(user)) throw new HttpError(403, 'Only an owner or admin can change charges or discounts', 'forbidden');
      if (o.invoice_no) throw new HttpError(409, 'This order is already invoiced, so its charges are locked', 'invoiced');
      set('discount', d.discount); set('urgent_charge', d.urgentCharge); set('is_gst', d.isGst); set('gst_rate', d.gstRate);
    }
    checkDates({ orderDate: o.od, startDate: next.sd, trialDate: next.td, deliveryDate: next.dd });
    await t.query(`UPDATE stitch_orders SET priority = $2, tailor_id = $3, start_date = $4, trial_date = $5, delivery_date = $6, notes = $7, discount = $8, urgent_charge = $9, is_gst = $10, gst_rate = $11, updated_at = now() WHERE id = $1`,
      [id, next.priority, next.tailor_id, next.sd, next.td, next.dd, next.notes, next.discount, next.urgent_charge, next.is_gst, next.gst_rate]);
    if (money) await recompute(t, id);
    const items = await one(t, 'SELECT COALESCE(SUM(qty), 1)::int AS n FROM stitch_items WHERE order_id = $1', [id]);
    warnings.push(...deliveryWarnings({ orderDate: o.od, deliveryDate: next.dd, trialDate: next.td, priority: next.priority, garments: items.n }));
    const changed = Object.keys(d).filter(k => d[k] !== undefined);
    await note(t, id, user, 'edited', { fields: changed });
    await audit(t, user.id, 'stitch.order.edit', 'stitch_order', o.order_no, { fields: changed });
  });
  return { order: await getOrder(db, id), warnings };
}

export async function updateItem(db, user, orderId, itemId, raw) {
  await db.tx(async t => {
    const o = await one(t, 'SELECT * FROM stitch_orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!o) throw new HttpError(404, 'Order not found');
    if (['delivered', 'cancelled'].includes(o.status)) throw new HttpError(409, `A ${o.status} order can no longer be edited`, 'closed');
    const cur = await one(t, 'SELECT * FROM stitch_items WHERE id = $1 AND order_id = $2 FOR UPDATE', [itemId, orderId]);
    if (!cur) throw new HttpError(404, 'Garment not found on this order');
    const nc = raw.charges ?? cur.charges, priced = ['base', 'design', 'embroidery', 'material'].some(k => (nc[k] ?? 0) !== (cur.charges[k] ?? 0)) || raw.qty !== cur.qty;
    if (priced && o.invoice_no) throw new HttpError(409, 'This order is already invoiced, so its charges are locked', 'invoiced');
    if (priced && !isManager(user)) throw new HttpError(403, 'Only an owner or admin can change charges or quantities', 'forbidden');
    const i = await resolveItem(t, o.customer_id, user, { ...raw, garmentTypeId: cur.garment_type_id, charges: raw.charges ?? cur.charges }, cur.position);
    await t.query(`UPDATE stitch_items SET qty = $2, design_id = $3, specs = $4, custom = $5, notes = $6, fabric = $7, measurements = $8, charges = $9, unit_charge = $10 WHERE id = $1`,
      [itemId, raw.qty, i.designId, JSON.stringify(i.specs), JSON.stringify(i.custom), i.notes, JSON.stringify(i.fabric), JSON.stringify(i.measurements), JSON.stringify(i.charges), i.unit]);
    await recompute(t, orderId);
    await note(t, orderId, user, 'item_edited', { item: cur.garment_name, repriced: priced });
    await audit(t, user.id, 'stitch.item.edit', 'stitch_order', o.order_no, { item: itemId });
  });
  return getOrder(db, orderId);
}

export async function addNote(db, user, id, text) {
  if (!(await one(db, 'SELECT 1 AS x FROM stitch_orders WHERE id = $1', [id]))) throw new HttpError(404, 'Order not found');
  await note(db, id, user, 'note', { text });
  return getOrder(db, id);
}

// ---- status workflow ----
function missingMeasurements(items) {
  return items.filter(i => (i.measureGroups ?? []).some(g => !Object.keys(i.measurements?.groups?.[g]?.values ?? {}).length)).map(i => i.garmentName);
}
export async function changeStatus(db, user, id, { status, note: text = '', override = false }) {
  await db.tx(async t => {
    const o = await one(t, 'SELECT * FROM stitch_orders WHERE id = $1 FOR UPDATE', [id]);
    if (!o) throw new HttpError(404, 'Order not found');
    if (!TRANSITIONS[o.status].includes(status)) {
      const hint = status === 'alterations_required' ? 'Add an alteration round to send a garment for alterations.' : '';
      throw new HttpError(409, `An order cannot move from "${label(o.status)}" to "${label(status)}". ${hint}`.trim(), 'bad_transition');
    }
    const manager = isManager(user);
    if (status === 'cancelled') {
      if (!manager) throw new HttpError(403, 'Only an owner or admin can cancel an order', 'forbidden');
      if (text.trim().length < 3) throw new HttpError(400, 'Give a reason for cancelling', 'note_required');
      if (o.invoice_no) throw new HttpError(409, 'This order has a POS invoice. Void the invoice in billing first', 'invoiced');
    }
    if (['measurements_confirmed', 'cutting', 'stitching'].includes(status)) {
      const items = await rows(t, 'SELECT i.garment_name AS "garmentName", i.measurements, g.measure_groups AS "measureGroups" FROM stitch_items i JOIN stitch_garment_types g ON g.id = i.garment_type_id WHERE i.order_id = $1', [id]);
      const miss = missingMeasurements(items);
      if (miss.length) throw new HttpError(409, `Add measurements for ${miss.join(', ')} first`, 'measurements_missing');
    }
    let overridden = false;
    if (['finishing_qc', 'ready'].includes(status) && (await one(t, "SELECT 1 AS x FROM stitch_alterations WHERE order_id = $1 AND status <> 'done' LIMIT 1", [id])))
      throw new HttpError(409, 'Finish the open alteration first', 'open_alteration');
    if (status === 'ready') {
      const round = (await one(t, 'SELECT COUNT(*)::int AS n FROM stitch_alterations WHERE order_id = $1', [id])).n;
      const passed = new Set((await rows(t, 'SELECT check_key FROM stitch_qc WHERE order_id = $1 AND round = $2 AND passed', [id, round])).map(r => r.check_key));
      const todo = QC_CHECKS.filter(([k]) => !passed.has(k)).map(c => c[1]);
      if (todo.length) {
        if (!override) throw new HttpError(409, `Quality check incomplete: ${todo.join(', ')}`, 'qc_incomplete');
        if (!manager) throw new HttpError(403, 'Only an owner or admin can override the quality check', 'forbidden');
        if (text.trim().length < 3) throw new HttpError(400, 'Give a reason for the override', 'note_required');
        overridden = true;
      }
    }
    if (status === 'delivered') {
      const bal = await one(t, `SELECT GREATEST(total_amount - COALESCE((SELECT SUM(CASE WHEN kind = 'refund' THEN -amount ELSE amount END) FROM stitch_payments WHERE order_id = $1), 0), 0)::int AS b FROM stitch_orders WHERE id = $1`, [id]);
      if (bal.b > 0) {
        if (!override) throw new HttpError(409, `Balance of ₹${(bal.b / 100).toLocaleString('en-IN')} is still due. Collect it, or an owner/admin can deliver with the balance outstanding`, 'balance_due');
        if (!manager) throw new HttpError(403, 'Only an owner or admin can deliver with a balance due', 'forbidden');
        if (text.trim().length < 3) throw new HttpError(400, 'Give a reason for delivering with a balance due', 'note_required');
        overridden = true;
      }
    }
    await t.query(`UPDATE stitch_orders SET status = $2, updated_at = now(), delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE delivered_at END, cancelled_at = CASE WHEN $2 = 'cancelled' THEN now() ELSE cancelled_at END WHERE id = $1`, [id, status]);
    await moved(t, id, user, o.status, status, text.trim(), overridden);
    await audit(t, user.id, 'stitch.order.status', 'stitch_order', o.order_no, { from: o.status, to: status, override: overridden });
  });
  return getOrder(db, id);
}
const label = s => STATUSES.find(x => x[0] === s)?.[1] ?? s;

export async function setQc(db, user, id, checks) {
  await db.tx(async t => {
    const o = await one(t, 'SELECT status, order_no FROM stitch_orders WHERE id = $1 FOR UPDATE', [id]);
    if (!o) throw new HttpError(404, 'Order not found');
    if (['delivered', 'cancelled'].includes(o.status)) throw new HttpError(409, 'This order is closed', 'closed');
    const round = (await one(t, 'SELECT COUNT(*)::int AS n FROM stitch_alterations WHERE order_id = $1', [id])).n;
    for (const c of checks) {
      if (!QC_CHECKS.some(q => q[0] === c.key)) throw new HttpError(400, `Unknown check "${c.key}"`);
      await t.query(`INSERT INTO stitch_qc (order_id, round, check_key, passed, note, checked_by) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (order_id, round, check_key) DO UPDATE SET passed = $4, note = $5, checked_by = $6, checked_at = now()`, [id, round, c.key, c.passed, c.note ?? '', user.id]);
    }
    await note(t, id, user, 'qc', { round, passed: checks.filter(c => c.passed).length, failed: checks.filter(c => !c.passed).map(c => c.key) });
  });
  return getOrder(db, id);
}

// ---- alterations ----
export async function addAlteration(db, user, orderId, d) {
  await db.tx(async t => {
    const o = await one(t, 'SELECT * FROM stitch_orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!o) throw new HttpError(404, 'Order not found');
    if (!ALTERABLE.includes(o.status)) throw new HttpError(409, `Alterations are added after a trial, during quality check, or when the garment is ready (this order is "${label(o.status)}")`, 'bad_status');
    if (d.charge > 0 && o.invoice_no) throw new HttpError(409, 'This order is already invoiced, so an alteration charge cannot be added', 'invoiced');
    if (d.itemId && !(await one(t, 'SELECT 1 AS x FROM stitch_items WHERE id = $1 AND order_id = $2', [d.itemId, orderId]))) throw new HttpError(400, 'That garment is not on this order');
    if (d.tailorId && !(await one(t, 'SELECT 1 AS x FROM stitch_tailors WHERE id = $1 AND active', [d.tailorId]))) throw new HttpError(400, 'Choose an active tailor', 'bad_tailor');
    const round = (await one(t, 'SELECT COALESCE(MAX(round), 0)::int + 1 AS n FROM stitch_alterations WHERE order_id = $1', [orderId])).n;
    await t.query(`INSERT INTO stitch_alterations (order_id, item_id, round, reason, feedback, corrections, charge, tailor_id, due_date, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [orderId, d.itemId ?? null, round, d.reason, d.feedback, d.corrections, d.charge, d.tailorId ?? o.tailor_id, d.dueDate ?? null, user.id]);
    await t.query("UPDATE stitch_orders SET status = 'alterations_required', updated_at = now() WHERE id = $1", [orderId]);
    await moved(t, orderId, user, o.status, 'alterations_required', `Alteration round ${round}: ${d.reason}`);
    await recompute(t, orderId);
    await audit(t, user.id, 'stitch.alteration.add', 'stitch_order', o.order_no, { round, charge: d.charge });
  });
  return getOrder(db, orderId);
}
export async function updateAlteration(db, user, orderId, altId, d) {
  await db.tx(async t => {
    const o = await one(t, 'SELECT * FROM stitch_orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!o) throw new HttpError(404, 'Order not found');
    const a = await one(t, 'SELECT * FROM stitch_alterations WHERE id = $1 AND order_id = $2 FOR UPDATE', [altId, orderId]);
    if (!a) throw new HttpError(404, 'Alteration not found');
    if (d.charge !== undefined && d.charge !== a.charge) {
      if (o.invoice_no) throw new HttpError(409, 'This order is already invoiced, so charges are locked', 'invoiced');
      if (!isManager(user)) throw new HttpError(403, 'Only an owner or admin can change charges', 'forbidden');
    }
    if (d.tailorId && !(await one(t, 'SELECT 1 AS x FROM stitch_tailors WHERE id = $1 AND active', [d.tailorId]))) throw new HttpError(400, 'Choose an active tailor', 'bad_tailor');
    const status = d.status ?? a.status;
    if (a.status === 'done' && status !== 'done') throw new HttpError(409, 'A completed alteration cannot be reopened. Add a new alteration round', 'bad_status');
    await t.query(`UPDATE stitch_alterations SET status = $2, corrections = $3, completion_notes = $4, charge = $5, tailor_id = $6, due_date = $7, completed_at = CASE WHEN $2 = 'done' AND completed_at IS NULL THEN now() ELSE completed_at END WHERE id = $1`,
      [altId, status, d.corrections ?? a.corrections, d.completionNotes ?? a.completion_notes, d.charge ?? a.charge, d.tailorId === undefined ? a.tailor_id : d.tailorId, d.dueDate === undefined ? a.due_date : d.dueDate, ]);
    await recompute(t, orderId);
    await note(t, orderId, user, 'alteration', { round: a.round, status });
    await audit(t, user.id, 'stitch.alteration.update', 'stitch_order', o.order_no, { round: a.round, status });
  });
  return getOrder(db, orderId);
}

// ---- payments and the POS invoice ----
async function netByMode(t, orderId) {
  const r = await rows(t, `SELECT mode, SUM(CASE WHEN kind = 'refund' THEN -amount ELSE amount END)::int AS n FROM stitch_payments WHERE order_id = $1 GROUP BY mode`, [orderId]);
  const out = { cash: 0, upi: 0, card: 0 }; for (const x of r) out[x.mode] = x.n; return out;
}
export async function addPayment(db, user, orderId, d) {
  const dup = await one(db, 'SELECT order_id FROM stitch_payments WHERE idempotency_key = $1', [d.idempotencyKey]);
  if (dup) return { order: await getOrder(db, dup.order_id), duplicate: true };
  try {
    await db.tx(async t => {
      const o = await one(t, 'SELECT * FROM stitch_orders WHERE id = $1 FOR UPDATE', [orderId]);
      if (!o) throw new HttpError(404, 'Order not found');
      const net = await netByMode(t, orderId), paid = net.cash + net.upi + net.card;
      if (d.kind === 'refund') {
        if (!isManager(user)) throw new HttpError(403, 'Only an owner or admin can record a refund', 'forbidden');
        if (o.invoice_no) throw new HttpError(409, 'This order has a POS invoice. Void the invoice in billing to reverse it', 'invoiced');
        if (d.amount > net[d.mode]) throw new HttpError(400, `Only ₹${(net[d.mode] / 100).toLocaleString('en-IN')} was taken by ${d.mode.toUpperCase()}, so that is the most that can be refunded that way`, 'bad_refund');
        if (!d.note || d.note.trim().length < 3) throw new HttpError(400, 'Give a reason for the refund', 'note_required');
      } else {
        if (o.status === 'cancelled') throw new HttpError(409, 'This order was cancelled', 'cancelled');
        const bal = Math.max(o.total_amount - paid, 0);
        if (d.amount > bal) throw new HttpError(400, `The balance is only ₹${(bal / 100).toLocaleString('en-IN')}`, 'overpay');
      }
      await t.query('INSERT INTO stitch_payments (order_id, kind, amount, mode, ref, note, idempotency_key, received_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [orderId, d.kind, d.amount, d.mode, d.ref ?? null, d.note ?? '', d.idempotencyKey, user.id]);
      await note(t, orderId, user, d.kind === 'refund' ? 'refund' : 'payment', { kind: d.kind, amount: d.amount, mode: d.mode });
      await audit(t, user.id, 'stitch.payment', 'stitch_order', o.order_no, { kind: d.kind, amount: d.amount, mode: d.mode });
    });
  } catch (e) {
    if (e.code === '23505') { const again = await one(db, 'SELECT order_id FROM stitch_payments WHERE idempotency_key = $1', [d.idempotencyKey]); if (again) return { order: await getOrder(db, again.order_id), duplicate: true } }
    throw e;
  }
  return { order: await getOrder(db, orderId), duplicate: false };
}

// Bills the order through the POS (once). Any balance is taken now through the same ledger; the invoice's payment split is the net of the ledger.
export async function createInvoice(db, user, orderId, { balanceMode, paymentRef }) {
  const first = await one(db, 'SELECT order_no, invoice_no, status FROM stitch_orders WHERE id = $1', [orderId]);
  if (!first) throw new HttpError(404, 'Order not found');
  if (first.invoice_no) return { order: await getOrder(db, orderId), sale: await getSale(db, first.invoice_no), duplicate: true };
  if (first.status === 'cancelled') throw new HttpError(409, 'This order was cancelled', 'cancelled');
  const o0 = await getOrder(db, orderId);
  if (o0.total <= 0) throw new HttpError(400, 'There is nothing to invoice yet. Add the stitching charges first', 'nothing_to_bill');
  if (o0.balance > 0) {
    if (!balanceMode) throw new HttpError(400, 'Choose how the balance is being paid', 'balance_mode');
    await addPayment(db, user, orderId, { kind: 'final', amount: o0.balance, mode: balanceMode, ref: paymentRef, note: 'Balance collected at invoicing', idempotencyKey: `stitch-${orderId}-final` });
  }
  const o = await getOrder(db, orderId), net = await netByMode(db, orderId);
  if (net.cash + net.upi + net.card !== o.total) throw new HttpError(409, 'Payments do not match the order total. Refund the excess, then invoice again', 'payment_mismatch');
  const modes = Object.keys(net).filter(k => net[k] > 0), paymentMode = modes.length > 1 ? 'split' : modes[0];
  const alt = o.alterationTotal;
  const lines = orderLines(o.items.map(i => ({ garmentName: i.garmentName, design_name: i.designName, unitCharge: i.unitCharge, qty: i.qty })), { urgentCharge: o.urgentCharge, alterationTotal: alt });
  const sale = await createSale(db, user, {
    idempotencyKey: `stitch-${orderId}-invoice`, channel: 'retail', source: 'offline', trusted: true,
    items: lines.map(l => ({ name: l.name, sku: l.sku, price: l.price, qty: l.qty, taxRate: 0 })),
    customerName: o.customerName, customerPhone: o.customerPhone, customerAddress: '', isGst: o.isGst, gstRate: o.isGst ? o.gstRate : undefined,
    discountType: 'fixed', discountValue: o.discount, deliveryFee: 0, paymentMode, cashTendered: paymentMode === 'cash' ? o.total : undefined,
    payments: net, paymentRef, notes: `Stitching order ${o.orderNo}`,
  });
  if (sale.total !== o.total) throw new HttpError(500, 'Invoice total differs from the order total', 'invoice_mismatch');
  await db.query('UPDATE stitch_orders SET invoice_no = $2, updated_at = now() WHERE id = $1 AND invoice_no IS NULL', [orderId, sale.invoiceNo]);
  await db.tx(async t => { await note(t, orderId, user, 'invoice', { invoice: sale.invoiceNo }); await audit(t, user.id, 'stitch.invoice', 'stitch_order', o.orderNo, { invoice: sale.invoiceNo }) });
  return { order: await getOrder(db, orderId), sale, duplicate: false };
}

// ---- appointments ----
const APPT = `SELECT a.id, a.order_id AS "orderId", o.order_no AS "orderNo", a.customer_id AS "customerId", c.name AS "customerName", c.phone AS "customerPhone", a.kind, a.starts_at AS "startsAt", a.minutes,
  a.tailor_id AS "tailorId", t.name AS "tailorName", a.status, a.notes, (a.status = 'scheduled' AND a.starts_at + (a.minutes || ' minutes')::interval < now()) AS overdue
  FROM stitch_appointments a JOIN pos_customers c ON c.id = a.customer_id LEFT JOIN stitch_orders o ON o.id = a.order_id LEFT JOIN stitch_tailors t ON t.id = a.tailor_id`;
export function listAppointments(db, { from, to, status, kind }) {
  return rows(db, `${APPT} WHERE (a.starts_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date AND ($3 = 'all' OR a.status = $3) AND ($4 = 'all' OR a.kind = $4) ORDER BY a.starts_at LIMIT 500`, [from, to, status, kind]);
}
async function conflicts(q, { startsAt, minutes, tailorId, customerId, ignoreId = 0 }) {
  return rows(q, `${APPT} WHERE a.status = 'scheduled' AND a.id <> $4 AND a.starts_at < ($1::timestamptz + ($2 || ' minutes')::interval) AND a.starts_at + (a.minutes || ' minutes')::interval > $1::timestamptz
    AND (a.customer_id = $3 OR ($5::int IS NOT NULL AND a.tailor_id = $5::int)) ORDER BY a.starts_at`, [startsAt, minutes, customerId, ignoreId, tailorId ?? null]);
}
export async function createAppointment(db, user, d) {
  let customerId = d.customerId;
  if (d.orderId) {
    const o = await one(db, 'SELECT customer_id FROM stitch_orders WHERE id = $1', [d.orderId]);
    if (!o) throw new HttpError(404, 'Order not found');
    customerId = o.customer_id;
  }
  if (!customerId || !(await one(db, 'SELECT 1 AS x FROM pos_customers WHERE id = $1', [customerId]))) throw new HttpError(400, 'Choose a customer or an order', 'bad_customer');
  if (d.tailorId && !(await one(db, 'SELECT 1 AS x FROM stitch_tailors WHERE id = $1 AND active', [d.tailorId]))) throw new HttpError(400, 'Choose an active tailor', 'bad_tailor');
  const clash = await conflicts(db, { ...d, customerId });
  if (clash.length && !d.ignoreConflicts) throw Object.assign(new HttpError(409, 'That time overlaps another appointment', 'conflict'), { conflicts: clash });
  const a = await one(db, 'INSERT INTO stitch_appointments (order_id, customer_id, kind, starts_at, minutes, tailor_id, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [d.orderId ?? null, customerId, d.kind, d.startsAt, d.minutes, d.tailorId ?? null, d.notes, user.id]);
  if (d.orderId) await note(db, d.orderId, user, 'appointment', { kind: d.kind, startsAt: d.startsAt });
  return one(db, `${APPT} WHERE a.id = $1`, [a.id]);
}
export async function updateAppointment(db, user, id, d) {
  const a = await one(db, 'SELECT * FROM stitch_appointments WHERE id = $1', [id]);
  if (!a) throw new HttpError(404, 'Appointment not found');
  if (a.status !== 'scheduled' && (d.startsAt || d.status === 'scheduled')) throw new HttpError(409, `A ${a.status} appointment cannot be rescheduled. Book a new one`, 'bad_status');
  const next = { startsAt: d.startsAt ?? a.starts_at.toISOString(), minutes: d.minutes ?? a.minutes, tailorId: d.tailorId === undefined ? a.tailor_id : d.tailorId };
  if (d.tailorId && !(await one(db, 'SELECT 1 AS x FROM stitch_tailors WHERE id = $1 AND active', [d.tailorId]))) throw new HttpError(400, 'Choose an active tailor', 'bad_tailor');
  if ((d.startsAt || d.minutes || d.tailorId !== undefined) && (d.status ?? a.status) === 'scheduled') {
    const clash = await conflicts(db, { ...next, customerId: a.customer_id, ignoreId: id });
    if (clash.length && !d.ignoreConflicts) throw Object.assign(new HttpError(409, 'That time overlaps another appointment', 'conflict'), { conflicts: clash });
  }
  await db.query('UPDATE stitch_appointments SET starts_at = $2, minutes = $3, tailor_id = $4, status = $5, notes = $6 WHERE id = $1', [id, next.startsAt, next.minutes, next.tailorId, d.status ?? a.status, d.notes ?? a.notes]);
  if (a.order_id) await note(db, a.order_id, user, 'appointment', { kind: a.kind, change: d.status ?? (d.startsAt ? 'rescheduled' : 'edited') });
  return one(db, `${APPT} WHERE a.id = $1`, [id]);
}

// ---- tailors, designs, garment types ----
export const listTailors = db => rows(db, `
  SELECT t.id, t.name, t.phone, t.notes, t.active,
    COUNT(o.id) FILTER (WHERE o.status NOT IN ${ACTIVE})::int AS active_orders,
    COUNT(o.id) FILTER (WHERE o.status NOT IN ${ACTIVE} AND o.delivery_date < (now() AT TIME ZONE 'Asia/Kolkata')::date)::int AS overdue,
    COUNT(o.id) FILTER (WHERE o.status = 'delivered')::int AS completed,
    MIN(o.delivery_date) FILTER (WHERE o.status NOT IN ${ACTIVE})::text AS next_deadline,
    (SELECT COUNT(*)::int FROM stitch_alterations a WHERE a.tailor_id = t.id AND a.status <> 'done') AS open_alterations
  FROM stitch_tailors t LEFT JOIN stitch_orders o ON o.tailor_id = t.id GROUP BY t.id ORDER BY t.active DESC, lower(t.name)`).then(r => r.map(x => ({ id: x.id, name: x.name, phone: x.phone, notes: x.notes, active: x.active, activeOrders: x.active_orders, overdue: x.overdue, completed: x.completed, nextDeadline: x.next_deadline, openAlterations: x.open_alterations })));
export const tailorOrders = (db, id) => rows(db, `SELECT * FROM (${BASE}) b WHERE b."tailorId" = $1 AND b.status NOT IN ${ACTIVE} ORDER BY b."deliveryDate", b.id`, [id]);
export const listDesigns = (db, all = false) => rows(db, `SELECT d.id, d.name, d.garment_type_id AS "garmentTypeId", g.name AS "garmentName", d.specs, d.instructions, d.image_url AS "imageUrl", d.extra_charge AS "extraCharge", d.status
  FROM stitch_designs d JOIN stitch_garment_types g ON g.id = d.garment_type_id WHERE $1 OR d.status = 'active' ORDER BY d.status, lower(d.name)`, [all]);
export const listGarmentTypes = (db, all = false) => rows(db, `SELECT id, code, name, measure_groups AS "measureGroups", spec_fields AS "specFields", base_price AS "basePrice", active FROM stitch_garment_types WHERE $1 OR active ORDER BY display_order, id`, [all]);

export async function meta(db) {
  return { statuses: STATUSES, transitions: TRANSITIONS, measureGroups: Object.fromEntries(Object.entries(MEASURE_GROUPS).map(([k, g]) => [k, { label: g.label, fields: g.fields }])), specLibrary: SPEC_LIBRARY, qcChecks: QC_CHECKS,
    apptKinds: APPT_KINDS, minDays: MIN_DAYS, garmentTypes: await listGarmentTypes(db), tailors: (await listTailors(db)).filter(t => t.active).map(t => ({ id: t.id, name: t.name })) };
}

// ---- dashboard and reports (real records only) ----
export async function dashboard(db) {
  const today = istDate(), soon = addDays(today, 7);
  const c = await one(db, `
    SELECT COUNT(*) FILTER (WHERE b.status NOT IN ${ACTIVE})::int AS active,
           COUNT(*) FILTER (WHERE b."orderDate" = $1)::int AS today,
           COUNT(*) FILTER (WHERE b.status IN ('materials_ready','cutting','stitching','alterations_required','finishing_qc'))::int AS in_progress,
           COUNT(*) FILTER (WHERE b.status NOT IN ${ACTIVE} AND b."deliveryDate" = $1)::int AS due_today,
           COUNT(*) FILTER (WHERE b.overdue)::int AS overdue,
           COUNT(*) FILTER (WHERE b.status = 'ready')::int AS awaiting,
           COALESCE(SUM(b.balance) FILTER (WHERE b.status <> 'cancelled'), 0)::int AS outstanding
    FROM (${BASE}) b`, [today]);
  const trials = (await one(db, `SELECT COUNT(*)::int AS n FROM (
      SELECT order_id AS k FROM stitch_appointments WHERE status = 'scheduled' AND kind IN ('trial','follow_up_trial','final_fitting') AND (starts_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date AND order_id IS NOT NULL
      UNION SELECT id FROM stitch_orders WHERE status NOT IN ${ACTIVE} AND trial_date BETWEEN $1::date AND $2::date) x`, [today, soon])).n;
  const stages = await rows(db, 'SELECT status, COUNT(*)::int AS n FROM stitch_orders GROUP BY status');
  const recent = await rows(db, `SELECT b.*, (CASE WHEN b.status = 'cancelled' THEN 'none' WHEN b.paid <= 0 THEN 'unpaid' WHEN b.balance > 0 THEN 'partial' ELSE 'paid' END) AS "paymentStatus" FROM (${BASE}) b ORDER BY b.id DESC LIMIT 8`);
  const deadlines = await rows(db, `SELECT b.id, b."orderNo", b."customerName", b.garments, b.status, b."deliveryDate", b.overdue, b."tailorName" FROM (${BASE}) b WHERE b.status NOT IN ${ACTIVE} AND b."deliveryDate" <= $1 ORDER BY b."deliveryDate", b.id LIMIT 8`, [soon]);
  const appts = await rows(db, `${APPT} WHERE a.status = 'scheduled' AND (a.starts_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date ORDER BY a.starts_at LIMIT 8`, [today, soon]);
  const alterations = await rows(db, `SELECT a.id, a.order_id AS "orderId", o.order_no AS "orderNo", a.round, a.reason, a.due_date::text AS "dueDate", a.status FROM stitch_alterations a JOIN stitch_orders o ON o.id = a.order_id WHERE a.status <> 'done' AND o.status <> 'cancelled' ORDER BY a.due_date NULLS LAST, a.id LIMIT 8`);
  return { counts: { active: c.active, today: c.today, inProgress: c.in_progress, upcomingTrials: trials, dueToday: c.due_today, overdue: c.overdue, awaitingCollection: c.awaiting, outstanding: c.outstanding }, stages, recent, deadlines, appointments: appts, alterations };
}

export async function report(db, from, to) {
  const rng = col => `(${col} AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date`;
  const [received, completed, stages, overdue, tailors] = await Promise.all([
    rows(db, `SELECT order_date::text AS day, COUNT(*)::int AS n FROM stitch_orders WHERE order_date BETWEEN $1::date AND $2::date GROUP BY 1 ORDER BY 1`, [from, to]),
    rows(db, `SELECT (delivered_at AT TIME ZONE 'Asia/Kolkata')::date::text AS day, COUNT(*)::int AS n FROM stitch_orders WHERE delivered_at IS NOT NULL AND ${rng('delivered_at')} GROUP BY 1 ORDER BY 1`, [from, to]),
    rows(db, `SELECT status, COUNT(*)::int AS n FROM stitch_orders WHERE status NOT IN ${ACTIVE} GROUP BY status`),
    rows(db, `SELECT b.id, b."orderNo", b."customerName", b.status, b."deliveryDate", b."tailorName", b.balance FROM (${BASE}) b WHERE b.overdue ORDER BY b."deliveryDate" LIMIT 100`),
    rows(db, `SELECT t.id, t.name, COUNT(o.id) FILTER (WHERE o.status NOT IN ${ACTIVE})::int AS active,
        COUNT(o.id) FILTER (WHERE o.status NOT IN ${ACTIVE} AND o.delivery_date < (now() AT TIME ZONE 'Asia/Kolkata')::date)::int AS overdue,
        COUNT(o.id) FILTER (WHERE o.status = 'delivered' AND ${rng('o.delivered_at')})::int AS completed FROM stitch_tailors t LEFT JOIN stitch_orders o ON o.tailor_id = t.id GROUP BY t.id ORDER BY lower(t.name)`, [from, to]),
  ]);
  const money = await one(db, `
    SELECT (SELECT COALESCE(SUM(total_amount), 0) FROM stitch_orders WHERE status <> 'cancelled' AND order_date BETWEEN $1::date AND $2::date)::int AS "orderValue",
           (SELECT COALESCE(SUM(CASE WHEN kind = 'refund' THEN -amount ELSE amount END), 0) FROM stitch_payments WHERE ${rng('received_at')})::int AS collected,
           (SELECT COALESCE(SUM(amount), 0) FROM stitch_payments WHERE kind = 'advance' AND ${rng('received_at')})::int AS advances,
           (SELECT COALESCE(SUM(amount), 0) FROM stitch_payments WHERE kind = 'refund' AND ${rng('received_at')})::int AS refunds,
           (SELECT COALESCE(SUM(a.charge), 0) FROM stitch_alterations a JOIN stitch_orders o ON o.id = a.order_id WHERE o.status <> 'cancelled' AND ${rng('a.created_at')})::int AS "alterationCharges",
           (SELECT COALESCE(SUM(b.balance), 0) FROM (${BASE}) b WHERE b.status <> 'cancelled' AND b."orderDate" BETWEEN $1::date::text AND $2::date::text)::int AS outstanding,
           (SELECT COUNT(*) FROM stitch_orders WHERE status = 'delivered' AND ${rng('delivered_at')})::int AS delivered,
           (SELECT COUNT(*) FROM stitch_orders WHERE status = 'cancelled' AND ${rng('cancelled_at')})::int AS cancelled,
           (SELECT ROUND(AVG(((delivered_at AT TIME ZONE 'Asia/Kolkata')::date - order_date))::numeric, 1)::float FROM stitch_orders WHERE status = 'delivered' AND ${rng('delivered_at')}) AS "avgTurnaroundDays"`, [from, to]);
  return { from, to, ...money, received, completed, stages, overdue, tailors };
}
