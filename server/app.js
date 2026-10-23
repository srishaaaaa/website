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

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes(ctx));
  app.use('/api', catalogRoutes(ctx));
  app.use('/api/cart', cartRoutes(ctx));
  app.use('/api/wishlist', wishlistRoutes(ctx));
  app.use('/api/reviews', reviewRoutes(ctx));
  app.use('/api/newsletter', newsletterRoutes(ctx));
  app.use('/api', commerceRoutes(ctx));
  app.use('/api/admin', adminRoutes(ctx));
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
  app.use(errorHandler());
  return app;
}
