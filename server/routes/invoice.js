import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { one } from '../db/index.js';
import { HttpError, wrap } from '../lib/http.js';
import { getSaleByToken, shopInfo } from '../lib/pos.js';
import { getReturn } from '../lib/returns.js';

// The shareable invoice link (WhatsApp / copy link). Anyone holding the unguessable token can read that one invoice, nothing else:
// no internal ids, no cashier, no date of birth, no payment reference. Never cached. The same link also opens a return invoice (credit note).
export default function invoicePublic({ db }) {
  const r = Router();
  const limiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, please try again shortly.' } });
  r.get('/invoice/:token', limiter, wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const s = await getSaleByToken(db, req.params.token);
    if (!s) {
      const ret = await getReturn(db, req.params.token, { byToken: true });
      if (!ret) throw new HttpError(404, 'This invoice link is not valid');
      delete ret.shareToken;
      return res.json({ kind: 'return', shop: await shopInfo(db), ret });
    }
    res.json({
      shop: await shopInfo(db),
      sale: { invoiceNo: s.invoiceNo, status: s.status, channel: s.channel, source: s.source, billDate: s.billDate, createdAt: s.createdAt, customerName: s.customerName, customerPhone: s.customerPhone,
        customerAddress: s.customerAddress, isGst: s.isGst, gstRate: s.gstRate, subtotal: s.subtotal, discount: s.discount, discountType: s.discountType, discountValue: s.discountValue,
        couponCode: s.couponCode, tax: s.tax, deliveryFee: s.deliveryFee, total: s.total, paymentMode: s.paymentMode, payCash: s.payCash, payUpi: s.payUpi, payCard: s.payCard,
        cashTendered: s.cashTendered, change: s.change, notes: s.notes, items: s.items.map(({ id, ...i }) => i),
        returns: (s.returns ?? []).map(({ shareToken, ...x }) => x), ...(s.advance ? { advance: s.advance } : {}) },
    });
  }));

  // The public coupon card (/coupon/CODE): only what is printed on it, never counts or recipients.
  r.get('/coupon/:code', limiter, wrap(async (req, res) => {
    const c = await one(db, 'SELECT code, discount_type, discount_value, min_order, expires_on::text AS expires_on, active, sent_only FROM pos_coupons WHERE upper(code) = upper($1)', [String(req.params.code).slice(0, 40)]);
    if (!c) throw new HttpError(404, 'Coupon not found');
    const shop = await shopInfo(db);
    res.set('Cache-Control', 'no-store').json({
      shop: { name: shop.name, phone: shop.phone },
      coupon: { code: c.code, discountType: c.discount_type, discountValue: c.discount_value, minOrder: c.min_order, expiresOn: c.expires_on, active: c.active, sentOnly: c.sent_only },
    });
  }));
  return r;
}
