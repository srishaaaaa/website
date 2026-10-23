import { z } from 'zod';

export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code }
}
export const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function errorHandler(log = console.error) {
  return (err, req, res, _next) => { // eslint-disable-line no-unused-vars
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', issues: err.issues.map(i => ({ path: i.path.join('.'), message: i.message })) });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    log(err);
    res.status(500).json({ error: 'Server error' });
  };
}

export const csv = z.string().optional().transform(v => (v ? v.split(',').map(s => s.trim()).filter(Boolean) : []));
export const intParam = z.coerce.number().int();
