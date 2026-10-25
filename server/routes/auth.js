import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { one } from '../db/index.js';
import { HttpError, wrap } from '../lib/http.js';
import { resolveCart } from '../lib/cart.js';

const credentials = z.object({ email: z.string().trim().email().max(254), password: z.string().min(8).max(200) });
const registerBody = credentials.extend({ name: z.string().trim().max(80).optional() });
// Compared against when the email is unknown so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

export default function auth(ctx) {
  const { db, cfg, auth: a } = ctx;
  const r = Router();
  const limiter = rateLimit({ windowMs: 15 * 60_000, limit: cfg.NODE_ENV === 'test' ? 1000 : 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Please try again later.' } });
  const publicUser = u => ({ id: u.id, email: u.email, name: u.full_name ?? u.name ?? '', role: u.role });

  // After sign-in, any guest cart in the cookie is merged into the customer's cart.
  const finish = async (req, res, profile) => {
    a.issue(res, profile);
    req.user = profile;
    await resolveCart(ctx, req, res);
    res.json({ user: publicUser(profile) });
  };

  r.post('/register', limiter, wrap(async (req, res) => {
    const d = registerBody.parse(req.body);
    const exists = await one(db, 'SELECT 1 AS x FROM profiles WHERE lower(email) = lower($1)', [d.email]);
    if (exists) throw new HttpError(409, 'That email is already registered', 'email_taken');
    const profile = await one(db, `INSERT INTO profiles (email, password_hash, full_name) VALUES ($1,$2,$3) RETURNING id, email, full_name, role`,
      [d.email, await bcrypt.hash(d.password, 12), d.name || '']);
    await finish(req, res, profile);
  }));

  r.post('/login', limiter, wrap(async (req, res) => {
    const d = credentials.parse(req.body);
    const u = await one(db, 'SELECT id, email, full_name, role, password_hash FROM profiles WHERE lower(email) = lower($1)', [d.email]);
    const ok = await bcrypt.compare(d.password, u?.password_hash ?? DUMMY_HASH);
    if (!u || !ok) throw new HttpError(401, 'Invalid email or password', 'invalid_credentials');
    await finish(req, res, u);
  }));

  // Sign in with Google: the browser sends the ID token Google issued; we confirm with Google that it is genuine,
  // was issued for this site, and that the email is verified, then sign in (or create) the matching account.
  r.get('/google/config', (_req, res) => res.json({ clientId: cfg.GOOGLE_CLIENT_ID ?? null }));
  r.post('/google', limiter, wrap(async (req, res) => {
    if (!cfg.GOOGLE_CLIENT_ID) throw new HttpError(503, 'Google sign-in is not set up yet', 'google_disabled');
    const { credential } = z.object({ credential: z.string().min(20).max(4096) }).parse(req.body);
    let g;
    try {
      const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, { signal: AbortSignal.timeout(8000) });
      g = resp.ok ? await resp.json() : null;
    } catch { throw new HttpError(502, 'Could not reach Google. Please try again.', 'google_unreachable') }
    const issuerOk = g && ['accounts.google.com', 'https://accounts.google.com'].includes(g.iss);
    if (!g || g.aud !== cfg.GOOGLE_CLIENT_ID || !issuerOk || String(g.email_verified) !== 'true' || !g.sub || !g.email)
      throw new HttpError(401, 'Google sign-in could not be verified', 'google_invalid');

    const cols = 'id, email, full_name, role';
    let u = await one(db, `SELECT ${cols} FROM profiles WHERE google_sub = $1`, [g.sub]);
    if (!u) {
      u = await one(db, `UPDATE profiles SET google_sub = $2, email_verified_at = COALESCE(email_verified_at, now()), full_name = COALESCE(NULLIF(full_name, ''), $3)
                         WHERE lower(email) = lower($1) AND google_sub IS NULL RETURNING ${cols}`, [g.email, g.sub, g.name || '']);
    }
    if (!u) {
      try {
        u = await one(db, `INSERT INTO profiles (email, full_name, google_sub, email_verified_at) VALUES ($1,$2,$3, now()) RETURNING ${cols}`, [g.email, g.name || '', g.sub]);
      } catch { throw new HttpError(409, 'That email is already linked to a different Google account', 'google_conflict') }
    }
    await finish(req, res, u);
  }));

  // ---- "My profile": details, address book and password. Everything is scoped to the signed-in customer. ----
  const text = (max, min = 0) => z.string().trim().min(min).max(max);
  const profileBody = z.object({
    name: text(80, 1),
    phone: z.string().trim().regex(/^(\+?\d[\d\s-]{6,16})?$/, 'Enter a valid phone number').default(''),
    birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(d => !isNaN(Date.parse(d)) && Date.parse(d) < Date.now() && Date.parse(d) > Date.parse('1900-01-01'), 'Enter a valid birthday').nullable().default(null),
    gender: z.enum(['female', 'male', 'other']).nullable().default(null),
  });
  const addressBody = z.object({
    label: text(30).default('Home'), name: text(80, 1), phone: z.string().trim().regex(/^\+?\d[\d\s-]{6,16}$/, 'Enter a valid phone number'),
    line1: text(200, 3), line2: text(200).default(''), city: text(80, 1), state: text(80, 1), pin: z.string().regex(/^\d{6}$/, 'PIN code must be 6 digits'),
    isDefault: z.boolean().default(false),
  });
  const ADDR = 'id, label, name, phone, line1, line2, city, state, pin, is_default AS "isDefault"';
  const idParam = z.coerce.number().int().positive();
  const snapshot = async uid => {
    const p = await one(db, `SELECT id, email, full_name AS name, phone, role, to_char(birthday, 'YYYY-MM-DD') AS birthday, gender, created_at AS "memberSince",
      (password_hash IS NOT NULL) AS "hasPassword", (google_sub IS NOT NULL) AS "hasGoogle" FROM profiles WHERE id = $1`, [uid]);
    const addresses = (await db.query(`SELECT ${ADDR} FROM customer_addresses WHERE profile_id = $1 ORDER BY is_default DESC, id`, [uid])).rows;
    return { profile: { ...p, phone: p.phone ?? '' }, addresses };
  };

  r.get('/profile', a.required, wrap(async (req, res) => res.json(await snapshot(req.user.id))));
  r.patch('/profile', a.required, wrap(async (req, res) => {
    const d = profileBody.parse(req.body);
    await db.query('UPDATE profiles SET full_name = $2, phone = NULLIF($3, \'\'), birthday = $4, gender = $5, updated_at = now() WHERE id = $1', [req.user.id, d.name, d.phone, d.birthday, d.gender]);
    const s = await snapshot(req.user.id);
    res.json({ ...s, user: publicUser({ ...req.user, name: s.profile.name }) });
  }));

  r.post('/addresses', a.required, wrap(async (req, res) => {
    const d = addressBody.parse(req.body);
    const n = (await one(db, 'SELECT count(*)::int AS n FROM customer_addresses WHERE profile_id = $1', [req.user.id])).n;
    if (n >= 10) throw new HttpError(400, 'You can save up to 10 addresses. Remove one to add another.', 'too_many_addresses');
    await db.tx(async t => {
      const makeDefault = d.isDefault || n === 0;
      if (makeDefault) await t.query('UPDATE customer_addresses SET is_default = false WHERE profile_id = $1', [req.user.id]);
      await t.query(`INSERT INTO customer_addresses (profile_id, label, name, phone, line1, line2, city, state, pin, is_default) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [req.user.id, d.label || 'Home', d.name, d.phone, d.line1, d.line2, d.city, d.state, d.pin, makeDefault]);
    });
    res.status(201).json(await snapshot(req.user.id));
  }));
  r.patch('/addresses/:id', a.required, wrap(async (req, res) => {
    const id = idParam.parse(req.params.id), d = addressBody.parse(req.body);
    const mine = await one(db, 'SELECT is_default FROM customer_addresses WHERE id = $1 AND profile_id = $2', [id, req.user.id]);
    if (!mine) throw new HttpError(404, 'Address not found');
    await db.tx(async t => {
      const makeDefault = d.isDefault || mine.is_default;
      if (makeDefault && !mine.is_default) await t.query('UPDATE customer_addresses SET is_default = false WHERE profile_id = $1', [req.user.id]);
      await t.query(`UPDATE customer_addresses SET label=$3, name=$4, phone=$5, line1=$6, line2=$7, city=$8, state=$9, pin=$10, is_default=$11, updated_at=now() WHERE id=$1 AND profile_id=$2`,
        [id, req.user.id, d.label || 'Home', d.name, d.phone, d.line1, d.line2, d.city, d.state, d.pin, makeDefault]);
    });
    res.json(await snapshot(req.user.id));
  }));
  r.post('/addresses/:id/default', a.required, wrap(async (req, res) => {
    const id = idParam.parse(req.params.id);
    if (!await one(db, 'SELECT 1 AS x FROM customer_addresses WHERE id = $1 AND profile_id = $2', [id, req.user.id])) throw new HttpError(404, 'Address not found');
    await db.tx(async t => {
      await t.query('UPDATE customer_addresses SET is_default = false WHERE profile_id = $1', [req.user.id]);
      await t.query('UPDATE customer_addresses SET is_default = true WHERE id = $1', [id]);
    });
    res.json(await snapshot(req.user.id));
  }));
  r.delete('/addresses/:id', a.required, wrap(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const gone = await one(db, 'DELETE FROM customer_addresses WHERE id = $1 AND profile_id = $2 RETURNING is_default', [id, req.user.id]);
    if (!gone) throw new HttpError(404, 'Address not found');
    if (gone.is_default) await db.query('UPDATE customer_addresses SET is_default = true WHERE id = (SELECT id FROM customer_addresses WHERE profile_id = $1 ORDER BY id LIMIT 1)', [req.user.id]);
    res.json(await snapshot(req.user.id));
  }));

  // Google-only accounts have no password yet, so they can set one without a current password; everyone else must prove the old one.
  r.post('/password', limiter, a.required, wrap(async (req, res) => {
    const d = z.object({ current: z.string().max(200).optional(), password: z.string().min(8).max(200) }).parse(req.body);
    const row = await one(db, 'SELECT password_hash FROM profiles WHERE id = $1', [req.user.id]);
    if (row.password_hash && !(d.current && await bcrypt.compare(d.current, row.password_hash))) throw new HttpError(400, 'Your current password is not correct', 'wrong_password');
    await db.query('UPDATE profiles SET password_hash = $2, updated_at = now() WHERE id = $1', [req.user.id, await bcrypt.hash(d.password, 12)]);
    res.json({ ok: true });
  }));

  r.post('/logout', (req, res) => { a.clear(res); res.json({ ok: true }) });
  r.get('/me', a.optional, (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));
  return r;
}
