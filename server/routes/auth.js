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

  r.post('/logout', (req, res) => { a.clear(res); res.json({ ok: true }) });
  r.get('/me', a.optional, (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));
  return r;
}
