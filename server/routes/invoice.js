import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { HttpError, wrap } from '../lib/http.js';
import { getSaleByToken, shopInfo } from '../lib/pos.js';

// The shareable invoice link (WhatsApp / copy link). Anyone holding the unguessable token can read that one invoice, nothing else:
// no internal ids, no cashier, no date of birth, no payment reference. Never cached.
export default function invoicePublic({ db }) {
  const r = Router();
  const limiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, please try again shortly.' } });
  r.get('/invoice/:token', limiter, wrap(async (req, res) => {
    const s = await getSaleByToken(db, req.params.token);
    if (!s) throw new HttpError(404, 'This invoice link is not valid');
    res.set('Cache-Control', 'no-store');
    res.json({
      shop: await shopInfo(db),
      sale: { invoiceNo: s.invoiceNo, status: s.status, channel: s.channel, source: s.source, billDate: s.billDate, createdAt: s.createdAt, customerName: s.customerName, customerPhone: s.customerPhone,
        customerAddress: s.customerAddress, isGst: s.isGst, gstRate: s.gstRate, subtotal: s.subtotal, discount: s.discount, discountType: s.discountType, discountValue: s.discountValue,
        couponCode: s.couponCode, tax: s.tax, deliveryFee: s.deliveryFee, total: s.total, paymentMode: s.paymentMode, payCash: s.payCash, payUpi: s.payUpi, payCard: s.payCard,
        cashTendered: s.cashTendered, change: s.change, notes: s.notes, items: s.items, ...(s.advance ? { advance: s.advance } : {}) },
    });
  }));
  return r;
}
