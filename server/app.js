import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { makeAuth, csrfGuard } from './lib/auth.js';
import { errorHandler, HttpError } from './lib/http.js';
import { createRazorpayProvider } from './lib/razorpay.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import adminRoutes from './routes/admin.js';
import settingsRoutes from './routes/settings.js';
import { enquiryAdmin, enquiryRoutes } from './routes/enquiries.js';
import sampleAdmin from './routes/sample.js';
import posRoutes from './routes/pos.js';
import invoicePublic from './routes/invoice.js';
import stitchingRoutes from './routes/stitching.js';
import { mediaAdmin, mediaPublic } from './routes/media.js';
import { cartRoutes, wishlistRoutes, newsletterRoutes, reviewRoutes } from './routes/shopper.js';
import { commerceRoutes, webhookRoute } from './routes/commerce.js';

// `payments` is injectable so tests (and future providers) can supply their own implementation.
export function createApp({ db, cfg, payments = createRazorpayProvider(cfg) }) {
  const app = express();
  const ctx = { db, cfg, payments, auth: makeAuth({ db, cfg }) };
  if (cfg.NODE_ENV === 'production') app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: cfg.CLIENT_ORIGIN, credentials: true, allowedHeaders: ['Content-Type', 'X-Requested-With'] }));

  app.use('/api', webhookRoute(ctx)); // before body parsing: needs the raw bytes
  app.use(express.json({ limit: '100kb' }), cookieParser());
  app.use('/api', csrfGuard());

  // Public, non-personal catalogue reads are cached at the CDN edge: after the first visitor, everyone gets them in milliseconds,
  // and a slightly stale copy is served instantly while a fresh one is fetched in the background. Nothing user-specific is listed here.
  const PUBLIC_READS = /^\/(store|categories|collections(\/[a-z0-9-]+)?|products(\/[a-z0-9-]+)?|reviews)$/;
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' && PUBLIC_READS.test(req.path)) res.set('Cache-Control', '_' in req.query ? 'no-store' : 'public, max-age=0, s-maxage=30, stale-while-revalidate=60'); // ?_= means "fresh please" (staff, or right after a change)
    next();
  });

  // Health + a quick configuration check (no secrets): shows which schema is read and whether the boutique location is set.
  app.get('/api/health', async (_req, res) => {
    let storeConfigured = null;
    try { const r = await db.query("SELECT value FROM store_settings WHERE key = 'store'"); storeConfigured = !!(r.rows[0]?.value?.address?.length || r.rows[0]?.value?.location) } catch { storeConfigured = 'unreadable' }
    res.json({ ok: true, db: db.kind, schema: db.kind === 'postgres' ? cfg.DB_SCHEMA : null, storeConfigured });
  });
  app.use('/api/auth', authRoutes(ctx));
  app.use('/api', catalogRoutes(ctx));
  app.use('/api/cart', cartRoutes(ctx));
  app.use('/api/wishlist', wishlistRoutes(ctx));
  app.use('/api/reviews', reviewRoutes(ctx));
  app.use('/api/newsletter', newsletterRoutes(ctx));
  app.use('/api', settingsRoutes(ctx));
  app.use('/api', commerceRoutes(ctx));
  app.use('/api', mediaPublic(ctx));
  app.use('/api', enquiryRoutes(ctx));
  app.use('/api/admin', adminRoutes(ctx));
  app.use('/api/admin', mediaAdmin(ctx));
  app.use('/api/admin', enquiryAdmin(ctx));
  app.use('/api/admin', sampleAdmin(ctx));
  app.use('/api/admin', posRoutes(ctx));
  app.use('/api/admin', stitchingRoutes(ctx)); // Stitching Studio: staff only
  app.use('/api', invoicePublic(ctx));
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
  app.use(errorHandler());
  return app;
}
