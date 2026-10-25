import { Router } from 'express';
import { z } from 'zod';
import { one } from '../db/index.js';
import { HttpError, wrap } from '../lib/http.js';
import { audit } from '../lib/orders.js';
import * as S from '../lib/stitching.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const paise = z.number().int().min(0).max(100_000_000);
const text = n => z.string().trim().max(n);
const id = z.coerce.number().int().positive();
const mode = z.enum(['cash', 'upi', 'card']);
const url = z.string().trim().max(500).regex(/^(\/api\/media\/\d+|https:\/\/\S+)$/, 'Use an uploaded photo or an https link');

const measureGroup = z.object({
  unit: z.enum(['in', 'cm']), values: z.record(z.string(), z.number()).default({}), custom: z.array(z.object({ label: text(40), value: z.number() })).max(12).default([]),
  profileId: id.optional(), saveAs: text(80).min(1).optional(), notes: text(300).default(''), fitPref: text(80).default(''),
});
const itemBody = z.object({
  garmentTypeId: id, qty: z.number().int().min(1).max(50).default(1), designId: id.nullable().optional(),
  specs: z.record(z.string(), text(300)).default({}), custom: z.array(z.object({ label: text(60).min(1), value: text(300) })).max(15).default([]), notes: text(500).default(''),
  fabric: z.object({
    source: z.enum(['customer', 'boutique']).default('customer'), type: text(80).default(''), color: text(60).default(''), quantity: text(60).default(''), lining: text(80).default(''), accessories: text(200).default(''),
    status: z.enum(['pending', 'received', 'ready']).default('pending'), variantId: id.nullable().optional(), photos: z.array(url).max(5).default([]),
  }).default({}),
  measurements: z.object({ groups: z.record(z.string(), measureGroup).default({}) }).default({}),
  charges: z.object({ base: paise.default(0), design: paise.default(0), embroidery: paise.default(0), material: paise.default(0) }).default({}),
});
const orderBody = z.object({
  idempotencyKey: z.string().min(8).max(80),
  customerId: id.optional(), customer: z.object({ name: text(120), phone: text(20).regex(/^[0-9+\-\s]*$/, 'Phone may only contain digits') }).optional(),
  priority: z.enum(['normal', 'urgent', 'express']).default('normal'), tailorId: id.nullable().optional(),
  orderDate: date.optional(), startDate: date.nullable().optional(), trialDate: date.nullable().optional(), deliveryDate: date,
  isGst: z.boolean().default(false), gstRate: z.number().int().min(0).max(28).default(5), discount: paise.default(0), urgentCharge: paise.default(0),
  notes: text(1000).default(''), items: z.array(itemBody).min(1).max(20),
  advance: z.object({ amount: paise, mode, ref: text(80).optional() }).optional(),
}).refine(b => b.customerId || b.customer, { message: 'Choose or add a customer', path: ['customerId'] });
const orderPatch = z.object({
  priority: z.enum(['normal', 'urgent', 'express']).optional(), tailorId: id.nullable().optional(), startDate: date.nullable().optional(), trialDate: date.nullable().optional(), deliveryDate: date.optional(),
  notes: text(1000).optional(), discount: paise.optional(), urgentCharge: paise.optional(), isGst: z.boolean().optional(), gstRate: z.number().int().min(0).max(28).optional(),
});
const profileBody = z.object({ name: text(80).min(1), unit: z.enum(['in', 'cm']), values: z.record(z.string(), z.number()).default({}), custom: z.array(z.object({ label: text(40), value: z.number() })).max(12).default([]), fitPref: text(80).default(''), notes: text(300).default('') });
const alterationBody = z.object({ itemId: id.nullable().optional(), reason: text(200).min(3, 'Give the reason'), feedback: text(500).default(''), corrections: text(500).default(''), charge: paise.default(0), tailorId: id.nullable().optional(), dueDate: date.nullable().optional() });
const apptBody = z.object({
  orderId: id.nullable().optional(), customerId: id.optional(), kind: z.enum(S.APPT_KINDS.map(k => k[0])), startsAt: z.string().datetime({ offset: true }), minutes: z.number().int().min(5).max(480).default(30),
  tailorId: id.nullable().optional(), notes: text(300).default(''), ignoreConflicts: z.boolean().default(false),
});

// Stitching Studio API. Everything here is staff-only (never public). owner/admin manage; cashiers run the day-to-day order, measurement,
// payment and appointment work. The role is re-read from the database on every request by auth.role.
export default function stitching({ db, auth }) {
  const r = Router();
  const staffer = auth.role('owner', 'admin', 'cashier');
  const manager = auth.role('owner', 'admin');
  const conflict = (res, e) => res.status(409).json({ error: e.message, code: e.code, conflicts: e.conflicts });
  const withConflicts = fn => wrap(async (req, res) => { try { await fn(req, res) } catch (e) { if (e.conflicts) return conflict(res, e); throw e } });
  const P = '/stitching';

  r.get(`${P}/meta`, staffer, wrap(async (_req, res) => res.json(await S.meta(db))));
  r.get(`${P}/dashboard`, staffer, wrap(async (_req, res) => res.json(await S.dashboard(db))));

  // ---- orders ----
  r.get(`${P}/orders`, staffer, wrap(async (req, res) => {
    const f = z.object({
      q: text(80).default(''), status: z.enum(['all', 'active', ...S.STATUSES.map(s => s[0])]).default('all'), garmentTypeId: id.optional(), tailorId: id.optional(),
      payment: z.enum(['all', 'unpaid', 'partial', 'paid', 'held', 'none']).default('all'), from: date.optional(), to: date.optional(), overdue: z.enum(['0', '1']).default('0').transform(v => v === '1'),
      sort: z.enum(['created', 'delivery', 'priority', 'status']).default('created'), dir: z.enum(['asc', 'desc']).default('desc'), page: z.coerce.number().int().min(1).max(1000).default(1), pageSize: z.coerce.number().int().min(5).max(100).default(20),
    }).parse(req.query);
    res.json(await S.listOrders(db, f));
  }));
  r.post(`${P}/orders`, staffer, wrap(async (req, res) => {
    const out = await S.createOrder(db, req.user, orderBody.parse(req.body));
    res.status(out.duplicate ? 200 : 201).json(out);
  }));
  r.get(`${P}/orders/:id`, staffer, wrap(async (req, res) => {
    const o = await S.getOrder(db, id.parse(req.params.id));
    if (!o) throw new HttpError(404, 'Order not found');
    res.json(o);
  }));
  r.patch(`${P}/orders/:id`, staffer, wrap(async (req, res) => res.json(await S.updateOrder(db, req.user, id.parse(req.params.id), orderPatch.parse(req.body)))));
  r.patch(`${P}/orders/:id/items/:itemId`, staffer, wrap(async (req, res) => res.json(await S.updateItem(db, req.user, id.parse(req.params.id), id.parse(req.params.itemId), itemBody.parse(req.body)))));
  r.post(`${P}/orders/:id/notes`, staffer, wrap(async (req, res) => res.status(201).json(await S.addNote(db, req.user, id.parse(req.params.id), z.object({ text: text(500).min(1) }).parse(req.body).text))));
  r.post(`${P}/orders/:id/status`, staffer, wrap(async (req, res) => {
    const b = z.object({ status: z.enum(S.STATUSES.map(s => s[0])), note: text(300).default(''), override: z.boolean().default(false) }).parse(req.body);
    res.json(await S.changeStatus(db, req.user, id.parse(req.params.id), b));
  }));
  r.put(`${P}/orders/:id/qc`, staffer, wrap(async (req, res) => {
    const { checks } = z.object({ checks: z.array(z.object({ key: z.string(), passed: z.boolean(), note: text(200).optional() })).min(1).max(20) }).parse(req.body);
    res.json(await S.setQc(db, req.user, id.parse(req.params.id), checks));
  }));
  r.post(`${P}/orders/:id/alterations`, staffer, wrap(async (req, res) => res.status(201).json(await S.addAlteration(db, req.user, id.parse(req.params.id), alterationBody.parse(req.body)))));
  r.patch(`${P}/orders/:id/alterations/:aid`, staffer, wrap(async (req, res) => {
    const b = z.object({ status: z.enum(['open', 'in_progress', 'done']).optional(), corrections: text(500).optional(), completionNotes: text(500).optional(), charge: paise.optional(), tailorId: id.nullable().optional(), dueDate: date.nullable().optional() }).parse(req.body);
    res.json(await S.updateAlteration(db, req.user, id.parse(req.params.id), id.parse(req.params.aid), b));
  }));
  r.post(`${P}/orders/:id/payments`, staffer, wrap(async (req, res) => {
    const b = z.object({ idempotencyKey: z.string().min(8).max(80), kind: z.enum(['advance', 'part', 'final', 'refund']), amount: z.number().int().min(1).max(100_000_000), mode, ref: text(80).optional(), note: text(200).optional() }).parse(req.body);
    const out = await S.addPayment(db, req.user, id.parse(req.params.id), b);
    res.status(out.duplicate ? 200 : 201).json(out);
  }));
  r.post(`${P}/orders/:id/invoice`, staffer, wrap(async (req, res) => {
    const b = z.object({ balanceMode: mode.optional(), paymentRef: text(80).optional() }).parse(req.body);
    const out = await S.createInvoice(db, req.user, id.parse(req.params.id), b);
    res.status(out.duplicate ? 200 : 201).json(out);
  }));

  // ---- measurement book (private) ----
  r.get(`${P}/measurements`, staffer, wrap(async (req, res) => res.json(await S.customersWithMeasurements(db, z.object({ q: text(80).default('') }).parse(req.query).q))));
  r.get(`${P}/customers/:id/measurements`, staffer, wrap(async (req, res) => res.json(await S.listProfiles(db, id.parse(req.params.id), req.query.archived === '1'))));
  r.post(`${P}/measurements`, staffer, wrap(async (req, res) => {
    const b = profileBody.extend({ customerId: id, group: z.enum(Object.keys(S.MEASURE_GROUPS)) }).parse(req.body);
    res.status(201).json(await S.createProfile(db, req.user, b));
  }));
  r.patch(`${P}/measurements/:id`, staffer, wrap(async (req, res) => res.json(await S.updateProfile(db, req.user, id.parse(req.params.id), profileBody.extend({ archived: z.boolean().default(false) }).parse(req.body)))));
  r.post(`${P}/measurements/:id/duplicate`, staffer, wrap(async (req, res) => res.status(201).json(await S.duplicateProfile(db, req.user, id.parse(req.params.id)))));
  r.get(`${P}/measurements/:id/history`, staffer, wrap(async (req, res) => res.json(await S.profileHistory(db, id.parse(req.params.id)))));

  // ---- appointments ----
  r.get(`${P}/appointments`, staffer, wrap(async (req, res) => {
    const f = z.object({ from: date, to: date, status: z.enum(['all', 'scheduled', 'completed', 'cancelled']).default('all'), kind: z.enum(['all', ...S.APPT_KINDS.map(k => k[0])]).default('all') }).parse(req.query);
    res.json(await S.listAppointments(db, f));
  }));
  r.post(`${P}/appointments`, staffer, withConflicts(async (req, res) => res.status(201).json(await S.createAppointment(db, req.user, apptBody.parse(req.body)))));
  r.patch(`${P}/appointments/:id`, staffer, withConflicts(async (req, res) => {
    const b = z.object({ startsAt: z.string().datetime({ offset: true }).optional(), minutes: z.number().int().min(5).max(480).optional(), tailorId: id.nullable().optional(), status: z.enum(['scheduled', 'completed', 'cancelled']).optional(), notes: text(300).optional(), ignoreConflicts: z.boolean().default(false) }).parse(req.body);
    res.json(await S.updateAppointment(db, req.user, id.parse(req.params.id), b));
  }));

  // ---- tailors (a work-assignment list, not staff accounts: no attendance or HR) ----
  r.get(`${P}/tailors`, staffer, wrap(async (_req, res) => res.json(await S.listTailors(db))));
  r.get(`${P}/tailors/:id/orders`, staffer, wrap(async (req, res) => res.json(await S.tailorOrders(db, id.parse(req.params.id)))));
  const tailorBody = z.object({ name: text(80).min(1), phone: text(20).regex(/^[0-9+\-\s]*$/, 'Phone may only contain digits').default(''), notes: text(300).default(''), active: z.boolean().default(true) });
  r.post(`${P}/tailors`, manager, wrap(async (req, res) => {
    const b = tailorBody.parse(req.body);
    const t = await one(db, 'INSERT INTO stitch_tailors (name, phone, notes, active) VALUES ($1,$2,$3,$4) RETURNING id', [b.name, b.phone, b.notes, b.active]);
    await audit(db, req.user.id, 'stitch.tailor.create', 'stitch_tailor', t.id, { name: b.name });
    res.status(201).json({ id: t.id });
  }));
  r.patch(`${P}/tailors/:id`, manager, wrap(async (req, res) => {
    const b = tailorBody.parse(req.body);
    const u = await db.query('UPDATE stitch_tailors SET name = $2, phone = $3, notes = $4, active = $5 WHERE id = $1 RETURNING id', [id.parse(req.params.id), b.name, b.phone, b.notes, b.active]);
    if (!u.rows.length) throw new HttpError(404, 'Tailor not found');
    await audit(db, req.user.id, 'stitch.tailor.update', 'stitch_tailor', req.params.id, { active: b.active });
    res.json({ ok: true });
  }));

  // ---- design library ----
  r.get(`${P}/designs`, staffer, wrap(async (req, res) => res.json(await S.listDesigns(db, req.query.all === '1'))));
  const designBody = z.object({ name: text(100).min(1), garmentTypeId: id, specs: z.record(z.string(), text(300)).default({}), instructions: text(1000).default(''), imageUrl: url.nullable().default(null), extraCharge: paise.default(0), status: z.enum(['active', 'archived']).default('active') });
  r.post(`${P}/designs`, manager, wrap(async (req, res) => {
    const b = designBody.parse(req.body);
    if (!(await one(db, 'SELECT 1 AS x FROM stitch_garment_types WHERE id = $1', [b.garmentTypeId]))) throw new HttpError(400, 'Unknown garment type');
    const d = await one(db, 'INSERT INTO stitch_designs (name, garment_type_id, specs, instructions, image_url, extra_charge, status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', [b.name, b.garmentTypeId, JSON.stringify(b.specs), b.instructions, b.imageUrl, b.extraCharge, b.status]);
    await audit(db, req.user.id, 'stitch.design.create', 'stitch_design', d.id, { name: b.name });
    res.status(201).json({ id: d.id });
  }));
  r.patch(`${P}/designs/:id`, manager, wrap(async (req, res) => {
    const b = designBody.parse(req.body);
    const u = await db.query('UPDATE stitch_designs SET name = $2, garment_type_id = $3, specs = $4, instructions = $5, image_url = $6, extra_charge = $7, status = $8 WHERE id = $1 RETURNING id', [id.parse(req.params.id), b.name, b.garmentTypeId, JSON.stringify(b.specs), b.instructions, b.imageUrl, b.extraCharge, b.status]);
    if (!u.rows.length) throw new HttpError(404, 'Design not found');
    await audit(db, req.user.id, 'stitch.design.update', 'stitch_design', req.params.id, { status: b.status });
    res.json({ ok: true });
  }));

  // ---- garment types (settings) ----
  r.get(`${P}/garment-types`, staffer, wrap(async (req, res) => res.json(await S.listGarmentTypes(db, req.query.all === '1'))));
  const typeBody = z.object({
    name: text(80).min(1), measureGroups: z.array(z.enum(Object.keys(S.MEASURE_GROUPS).filter(k => k !== 'misc'))).max(4).default([]),
    specFields: z.array(z.enum(Object.keys(S.SPEC_LIBRARY))).max(20).default([]), basePrice: paise.default(0), active: z.boolean().default(true),
  });
  const codeOf = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'garment';
  r.post(`${P}/garment-types`, manager, wrap(async (req, res) => {
    const b = typeBody.parse(req.body);
    let code = codeOf(b.name); for (let i = 2; await one(db, 'SELECT 1 AS x FROM stitch_garment_types WHERE code = $1', [code]); i++) code = `${codeOf(b.name)}-${i}`;
    const t = await one(db, 'INSERT INTO stitch_garment_types (code, name, measure_groups, spec_fields, base_price, active, display_order) VALUES ($1,$2,$3,$4,$5,$6,(SELECT COALESCE(MAX(display_order), 0) + 1 FROM stitch_garment_types)) RETURNING id', [code, b.name, b.measureGroups, b.specFields, b.basePrice, b.active]);
    await audit(db, req.user.id, 'stitch.type.create', 'stitch_type', t.id, { name: b.name });
    res.status(201).json({ id: t.id });
  }));
  r.patch(`${P}/garment-types/:id`, manager, wrap(async (req, res) => {
    const b = typeBody.parse(req.body);
    const u = await db.query('UPDATE stitch_garment_types SET name = $2, measure_groups = $3, spec_fields = $4, base_price = $5, active = $6 WHERE id = $1 RETURNING id', [id.parse(req.params.id), b.name, b.measureGroups, b.specFields, b.basePrice, b.active]);
    if (!u.rows.length) throw new HttpError(404, 'Garment type not found');
    await audit(db, req.user.id, 'stitch.type.update', 'stitch_type', req.params.id, { active: b.active });
    res.json({ ok: true });
  }));

  r.get(`${P}/reports`, manager, wrap(async (req, res) => {
    const { from, to } = z.object({ from: date, to: date }).parse(req.query);
    if (from > to) throw new HttpError(400, 'From date is after To date');
    res.json(await S.report(db, from, to));
  }));
  return r;
}
