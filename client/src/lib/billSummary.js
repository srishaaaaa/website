// The complete split-up of a bill or advance order, used on invoices, receipts, Order History and Advance Orders:
// Subtotal → Discount → Delivery → Taxable value → CGST / SGST / Total GST → TOTAL → how it was paid.
// Each row: { label, value, kind } where kind is 'row' | 'muted' | 'total' | 'pay' | 'paysub' | 'strong'; value is in paise (negative = deduction).
export const PAY_L = [['cash', 'Cash'], ['upi', 'QR / GPay'], ['card', 'Card']];
const MODE_L = { cash: 'Cash', upi: 'QR / GPay', card: 'Card', split: 'Split' };
const modeRows = s => PAY_L.filter(([k]) => s?.[k] > 0).map(([k, l]) => ({ label: l, value: s[k], kind: 'paysub' }));
const on = t => t ? ` · ${new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}` : '';
const how = s => { const m = PAY_L.filter(([k]) => s?.[k] > 0).map(([, l]) => l); return m.length > 1 ? 'Split' : m[0] || '' };
const half = r => `${Number.isInteger(r / 2) ? r / 2 : (r / 2).toFixed(1)}%`;

function gstRows(b) {
  if (!b.isGst || !(b.tax > 0)) return [];
  const byRate = new Map();
  for (const i of b.items || []) {
    const rate = b.gstRate ?? i.taxRate;
    if (rate > 0) byRate.set(rate, (byRate.get(rate) ?? 0) + (i.tax ?? 0));
  }
  if (byRate.size === 1) { const [r] = [...byRate.keys()]; byRate.set(r, b.tax) } // one rate: the bill's tax is that rate's tax
  const out = [];
  if (byRate.size && [...byRate.values()].reduce((s, v) => s + v, 0) === b.tax) {
    for (const [r, t] of [...byRate].sort((x, y) => x[0] - y[0])) {
      const c = Math.floor(t / 2);
      out.push({ label: `CGST (${half(r)})`, value: c, kind: 'row' }, { label: `SGST (${half(r)})`, value: t - c, kind: 'row' });
    }
  }
  if (!out.length) { const c = Math.floor(b.tax / 2); out.push({ label: 'CGST', value: c, kind: 'row' }, { label: 'SGST', value: b.tax - c, kind: 'row' }) }
  const one = byRate.size === 1 ? ` (${[...byRate.keys()][0]}%)` : '';
  out.push({ label: `Total GST${one}`, value: b.tax, kind: 'row' });
  return out;
}

// sale = a bill from the API (may carry .advance); adv = an advance order (not yet billed, or billed with its sale passed as `sale`).
export function billRows(b, { sale } = {}) {
  const rows = [{ label: b.isGst ? 'GST bill' : 'Non-GST bill', note: b.isGst ? 'CGST + SGST' : 'NO GST CHARGED', value: null, kind: 'muted' },
    { label: 'Subtotal', note: b.isGst ? 'EXCL. GST' : '', value: b.subtotal, kind: 'row' }];
  if (b.discount > 0) {
    const pct = b.discountType === 'percent' && b.discountValue ? ` · ${b.discountValue}%` : '';
    rows.push({ label: b.couponCode ? `Coupon discount (${b.couponCode}${pct})` : `Manual discount${pct ? ` (${pct.slice(3)})` : ''}`, value: -b.discount, kind: 'row' });
  }
  if (b.deliveryFee > 0) rows.push({ label: 'Delivery charge', value: b.deliveryFee, kind: 'row' });
  if (b.isGst && b.tax > 0) rows.push({ label: 'TAXABLE VALUE', value: b.subtotal - (b.discount || 0), kind: 'muted' }, ...gstRows(b));
  rows.push({ label: 'TOTAL', value: b.total, kind: 'total' });
  const out = rows.concat(payRows(b, { sale }));
  // Returns against the bill: what went back and what the bill is worth now.
  if (b.returns?.length) {
    for (const r of b.returns) out.push({ label: `Less: returned (${r.returnNo})`, value: -r.total, kind: 'row' });
    out.push({ label: 'NET AFTER RETURNS', value: b.total - b.returns.reduce((s, r) => s + r.total, 0), kind: 'strong' });
  }
  return out;
}

export function payRows(b, { sale } = {}) {
  if (b.status === 'voided') return [{ label: 'VOID — bill cancelled, nothing collected', value: null, kind: 'strong' }];
  if (b.status === 'cancelled') return [{ label: 'Advance order cancelled', value: null, kind: 'strong' }, { label: 'Deposit to hand back', value: b.deposit, kind: 'pay' }];
  // a bill made from an advance order
  const a = b.advance ?? (sale?.advance) ?? null;
  if (a) return [
    { label: `Deposit Paid${on(a.depositAt)}`, note: how(a.depositSplit).toUpperCase(), value: a.deposit, kind: 'pay' }, ...modeRows(a.depositSplit),
    { label: `Final Balance Paid${on(a.balanceAt)}`, note: how(a.balanceSplit).toUpperCase(), value: a.balance, kind: 'pay' }, ...modeRows(a.balanceSplit),
    ...(a.balanceChange > 0 ? [{ label: 'Cash received', value: a.balanceCashGiven, kind: 'paysub' }, { label: 'Amount returned', value: a.balanceChange, kind: 'paysub' }] : []),
    { label: 'Amount paid', value: a.deposit + a.balance, kind: 'strong' },
    { label: 'Remaining Balance (Fully Settled)', value: 0, kind: 'row' },
  ];
  // an advance order still waiting for collection
  if ('deposit' in b && !('paymentMode' in b)) {
    const dep = b.depositSplit || { [b.depositMode]: b.deposit };
    return [{ label: `Deposit Paid${on(b.createdAt)}`, note: how(dep).toUpperCase(), value: b.deposit, kind: 'pay' }, ...modeRows(dep), { label: 'Amount paid so far', value: b.deposit, kind: 'row' }, { label: 'Balance Due', value: b.total - b.deposit, kind: 'strong' }];
  }
  // a normal bill
  if (b.paymentMode === 'split') return [{ label: 'Payment: Split', value: null, kind: 'pay' }, ...modeRows({ cash: b.payCash, upi: b.payUpi, card: b.payCard }), { label: 'Amount paid', value: b.total, kind: 'strong' }];
  const out = [{ label: `Payment: ${MODE_L[b.paymentMode] || b.paymentMode}`, value: null, kind: 'pay' }];
  if (b.paymentMode === 'cash' && b.cashTendered > b.total) out.push({ label: 'Cash received', value: b.cashTendered, kind: 'paysub' }, { label: 'Amount returned', value: b.change || b.cashTendered - b.total, kind: 'paysub' });
  out.push({ label: 'Amount paid', value: b.total, kind: 'strong' });
  return out;
}

export const modeName = s => s.advance ? 'Advance order · deposit + balance' : s.paymentMode === 'split'
  ? `Split · ${PAY_L.filter(([k]) => ({ cash: s.payCash, upi: s.payUpi, card: s.payCard })[k] > 0).map(([, l]) => l).join(' + ')}` : MODE_L[s.paymentMode];
