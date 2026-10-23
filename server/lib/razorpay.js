import crypto from 'node:crypto';
import { HttpError } from './http.js';

const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y) };
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

// Payment provider contract (so Stripe etc. can be added): name, publicConfig(), createOrder(), verifySignature(), parseWebhook().
export function createRazorpayProvider(cfg) {
  const keyId = cfg.RAZORPAY_KEY_ID, keySecret = cfg.RAZORPAY_KEY_SECRET;
  const configured = !!(keyId && keySecret && !keyId.endsWith('_xxx') && keySecret !== 'xxx');
  return {
    name: 'razorpay',
    configured,
    testMode: !!keyId?.startsWith('rzp_test_'),
    publicConfig: () => ({ keyId }),
    async createOrder({ amount, currency, receipt }) {
      if (!configured) throw new HttpError(503, 'Payments are not configured yet', 'payments_unconfigured');
      const r = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64') },
        body: JSON.stringify({ amount, currency, receipt }),
      });
      if (!r.ok) throw new HttpError(502, 'The payment provider could not start this payment', 'provider_error');
      return { providerOrderId: (await r.json()).id };
    },
    verifySignature: ({ orderId, paymentId, signature }) => configured && safeEqual(hmac(keySecret, `${orderId}|${paymentId}`), signature),
    parseWebhook(raw, signature) {
      if (!cfg.RAZORPAY_WEBHOOK_SECRET) throw new HttpError(503, 'Webhook secret not configured');
      if (!safeEqual(hmac(cfg.RAZORPAY_WEBHOOK_SECRET, raw), signature || '')) throw new HttpError(400, 'Bad signature');
      const e = JSON.parse(raw.toString('utf8')); const pay = e.payload?.payment?.entity;
      if (!pay) return null;
      const type = e.event === 'payment.captured' ? 'captured' : e.event === 'payment.failed' ? 'failed' : null;
      return type ? { type, providerOrderId: pay.order_id, providerPaymentId: pay.id } : null;
    },
  };
}
