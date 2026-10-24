import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { rows } from '../db/index.js';
import { HttpError, wrap } from '../lib/http.js';
import { audit } from '../lib/orders.js';

const text = n => z.string().trim().max(n);
const opt = n => text(n).optional().transform(v => v || null);

const body = z.object({
  kind: z.enum(['retail', 'wholesale']),
  name: text(100).min(1, 'Please enter your name'),
  business: opt(120),
  phone: text(20).regex(/^[+\d][\d\s()-]{6,18}$/, 'Please enter a valid phone number'),
  email: z.string().trim().email('Please enter a valid email').max(254).optional().or(z.literal('').transform(() => undefined)),
  interest: opt(300), quantity: opt(60), message: opt(1500),
  website: z.string().optional(), // honeypot: real people never fill this hidden field
});

export function enquiryRoutes({ db, cfg }) {
  const r = Router();
  const limiter = rateLimit({ windowMs: 10 * 60_000, limit: cfg.NODE_ENV === 'test' ? 1000 : 8, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many enquiries from this connection. Please try again later.' } });
  r.post('/enquiries', limiter, wrap(async (req, res) => {
    const d = body.parse(req.body);
    if (d.website) return res.status(201).json({ ok: true }); // bots get a quiet success and nothing is stored
    if (d.kind === 'wholesale' && !d.business) throw new HttpError(400, 'Please enter your business or shop name');
    const [row] = await rows(db, `INSERT INTO enquiries (kind, name, business, phone, email, interest, quantity, message)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [d.kind, d.name, d.business, d.phone, d.email ?? null, d.interest, d.quantity, d.message]);
    res.status(201).json({ ok: true, id: row.id });
  }));
  return r;
}

export function enquiryAdmin({ db, auth }) {
  const r = Router();
  const staff = auth.role('owner', 'admin');
  r.get('/enquiries', staff, wrap(async (_req, res) => res.json(await rows(db, 'SELECT * FROM enquiries ORDER BY (status = \'new\') DESC, id DESC LIMIT 300'))));
  r.patch('/enquiries/:id', staff, wrap(async (req, res) => {
    const { status } = z.object({ status: z.enum(['new', 'contacted', 'closed']) }).parse(req.body);
    const id = z.coerce.number().int().parse(req.params.id);
    const u = await db.query('UPDATE enquiries SET status = $2 WHERE id = $1 RETURNING id', [id, status]);
    if (!u.rows.length) throw new HttpError(404, 'Enquiry not found');
    await audit(db, req.user.id, 'enquiry.status', 'enquiry', id, { status });
    res.json({ ok: true });
  }));
  r.delete('/enquiries/:id', staff, wrap(async (req, res) => {
    const id = z.coerce.number().int().parse(req.params.id);
    const d = await db.query('DELETE FROM enquiries WHERE id = $1 RETURNING id', [id]);
    if (!d.rows.length) throw new HttpError(404, 'Enquiry not found');
    await audit(db, req.user.id, 'enquiry.delete', 'enquiry', id);
    res.json({ ok: true });
  }));
  return r;
}
