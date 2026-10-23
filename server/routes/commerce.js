import { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { one } from '../db/index.js';
import { HttpError, wrap } from '../lib/http.js';
import { resolveCart } from '../lib/cart.js';
import { createPendingOrder, markPaid, ordersForUser, releaseOrder, releaseExpired } from '../lib/orders.js';

const address = z.object({
  name: z.string().trim().min(1).max(100), phone: z.string().trim().min(8).max(20),
  line1: z.string().trim().min(3).max(200), line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(80), state: z.string().trim().min(1).max(80), pin: z.string().regex(/^\d{6}$/, 'PIN code must be 6 digits'),
});

export function commerceRoutes(ctx) {
  const { db, cfg, auth, payments } = ctx;
  const r = Router();
  const limiter = rateLimit({ windowMs: 60_000, limit: cfg.NODE_ENV === 'test' ? 1000 : 20, standardHeaders: true, legacyHeaders: false });

  // Builds the order from the SERVER cart. The browser never submits prices or totals.
  r.post('/checkout', limiter, auth.optional, wrap(async (req, res) => {
    const d = z.object({ email: z.string().trim().email().max(254), address }).parse(req.body);
    await releaseExpired(db).catch(() => {});
    const cart = await resolveCart(ctx, req, res);
    if (!cart) throw new HttpError(400, 'Your bag is empty', 'empty_cart');
    const order = await createPendingOrder(ctx, { cartId: cart.id, user: req.user, email: d.email, address: d.address });
    try {
      const po = await payments.createOrder({ amount: order.total_amount, currency: order.currency, receipt: order.order_number });
      await db.query(`INSERT INTO payments (order_id, provider, provider_order_id, amount, currency) VALUES ($1,$2,$3,$4,$5)`,
        [order.id, payments.name, po.providerOrderId, order.total_amount, order.currency]);
      res.json({ orderNumber: order.order_number, total: order.total_amount, currency: order.currency, provider: payments.name, providerOrderId: po.providerOrderId, testMode: payments.testMode, ...payments.publicConfig() });
    } catch (e) {
      await releaseOrder(db, order.order_number, 'failed').catch(() => {}); // give the stock back immediately
      throw e;
    }
  }));

  // Client-side success is never trusted: the provider signature is verified on the server first.
  r.post('/payments/verify', limiter, auth.optional, wrap(async (req, res) => {
    const d = z.object({ razorpay_order_id: z.string(), razorpay_payment_id: z.string(), razorpay_signature: z.string() }).parse(req.body);
    if (!payments.verifySignature({ orderId: d.razorpay_order_id, paymentId: d.razorpay_payment_id, signature: d.razorpay_signature })) throw new HttpError(400, 'Payment signature could not be verified', 'bad_signature');
    const result = await markPaid(db, { provider: payments.name, providerOrderId: d.razorpay_order_id, providerPaymentId: d.razorpay_payment_id });
    if (result.status === 'paid') {
      const cart = await resolveCart(ctx, req, res);
      if (cart) await db.query('DELETE FROM cart_items WHERE cart_id = $1', [cart.id]);
    }
    res.json({ ok: result.status === 'paid', ...result });
  }));

  r.get('/orders', auth.required, wrap(async (req, res) => res.json(await ordersForUser(db, req.user.id))));
  r.get('/orders/:number', auth.required, wrap(async (req, res) => {
    const o = (await ordersForUser(db, req.user.id)).find(x => x.order_number === req.params.number);
    if (!o) throw new HttpError(404, 'Order not found'); // other customers' orders are indistinguishable from missing ones
    res.json(o);
  }));
  return r;
}

// Webhook gets the raw body so the signature can be verified exactly as the provider sent it.
export function webhookRoute({ db, payments }) {
  const r = Router();
  r.post('/payments/webhook', express.raw({ type: '*/*', limit: '1mb' }), wrap(async (req, res) => {
    const ev = payments.parseWebhook(req.body, req.get('x-razorpay-signature'));
    if (ev?.type === 'captured') await markPaid(db, { provider: payments.name, providerOrderId: ev.providerOrderId, providerPaymentId: ev.providerPaymentId });
    if (ev?.type === 'failed') {
      const o = await one(db, `SELECT o.order_number FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.provider = $1 AND p.provider_order_id = $2`, [payments.name, ev.providerOrderId]);
      if (o) await releaseOrder(db, o.order_number, 'failed');
    }
    res.json({ ok: true });
  }));
  return r;
}
