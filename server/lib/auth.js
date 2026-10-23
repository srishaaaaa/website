import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { HttpError } from './http.js';
import { one } from '../db/index.js';

export const SESSION_COOKIE = 'dhanya_session';
export const CART_COOKIE = 'dhanya_cart';
const DAY = 86_400_000;

export const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = () => crypto.randomBytes(32).toString('base64url');

export function cookieOpts(cfg, maxAgeMs) {
  return { httpOnly: true, sameSite: 'lax', secure: cfg.NODE_ENV === 'production', maxAge: maxAgeMs, path: '/' };
}

export function makeAuth({ db, cfg }) {
  const issue = (res, profile) => {
    const token = jwt.sign({ sub: profile.id }, cfg.JWT_SECRET, { expiresIn: '7d' });
    res.cookie(SESSION_COOKIE, token, cookieOpts(cfg, 7 * DAY));
  };
  const clear = res => res.clearCookie(SESSION_COOKIE, { ...cookieOpts(cfg), maxAge: undefined });

  // The role is always re-read from the database, so demoting a user takes effect immediately.
  async function load(req) {
    const t = req.cookies?.[SESSION_COOKIE];
    if (!t) return null;
    try {
      const { sub } = jwt.verify(t, cfg.JWT_SECRET);
      return await one(db, 'SELECT id, email, full_name AS name, phone, role FROM profiles WHERE id = $1', [sub]);
    } catch { return null }
  }
  const optional = async (req, _res, next) => { try { req.user = await load(req) } catch (e) { return next(e) } next() };
  const required = async (req, _res, next) => {
    try { req.user = await load(req) } catch (e) { return next(e) }
    next(req.user ? undefined : new HttpError(401, 'Please sign in'));
  };
  const role = (...roles) => [required, (req, _res, next) => next(roles.includes(req.user.role) ? undefined : new HttpError(403, 'Forbidden'))];
  return { issue, clear, optional, required, role };
}

// CSRF defence for cookie sessions: state-changing requests must carry a custom header
// (which browsers will not attach cross-site without a CORS preflight we do not allow).
export function csrfGuard({ exempt = [] } = {}) {
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || exempt.includes(req.path)) return next();
    if (req.get('x-requested-with') !== 'dhanya') return next(new HttpError(403, 'Missing CSRF header'));
    next();
  };
}
