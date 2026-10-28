// The complete split-up of a bill or advance order, used on invoices, receipts, Order History and Advance Orders:
// Subtotal → Discount → Delivery → Taxable value → CGST / SGST / Total GST → TOTAL → how it was paid.
// Each row: { label, value, kind } where kind is 'row' | 'muted' | 'total' | 'pay' | 'paysub' | 'strong'; value is in paise (negative = deduction).
export const PAY_L = [['cash', 'Cash'], ['upi', 'QR / GPay'], ['card', 'Card']];
const MODE_L = { cash: 'Cash', upi: 'QR / GPay', card: 'Card', split: 'Split' };
const modeRows = s => PAY_L.filter(([k]) => s?.[k] > 0).map(([k, l]) => ({ label: l, value: s[k], kind: 'paysub' }));
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
  const one = byRate.size === 1 ? ` (${[...byRate.keys()][0]}%)` : '';
  out.push({ label: `Total GST${one}`, value: b.tax, kind: 'row' });
  return out;
}

// sale = a bill from the API (may carry .advance); adv = an advance order (not yet billed, or billed with its sale passed as `sale`).
export function billRows(b, { sale } = {}) {
  const rows = [{ label: b.isGst ? 'Subtotal' : 'Subtotal', note: b.isGst ? 'EXCL. GST' : '', value: b.subtotal, kind: 'row' }];
  if (b.discount > 0) rows.push({ label: `Discount${b.couponCode ? ` (${b.couponCode})` : ''}`, value: -b.discount, kind: 'row' });
  if (b.deliveryFee > 0) rows.push({ label: 'Delivery', value: b.deliveryFee, kind: 'row' });
  if (b.isGst && b.tax > 0) rows.push({ label: 'TAXABLE VALUE', value: b.subtotal - (b.discount || 0), kind: 'muted' }, ...gstRows(b));
  rows.push({ label: 'TOTAL', value: b.total, kind: 'total' });
  return rows.concat(payRows(b, { sale }));
}

export function payRows(b, { sale } = {}) {
  if (b.status === 'voided') return [{ label: 'VOID — bill cancelled, nothing collected', value: null, kind: 'strong' }];
  if (b.status === 'cancelled') return [{ label: 'Advance order cancelled', value: null, kind: 'strong' }, { label: 'Deposit to hand back', value: b.deposit, kind: 'pay' }];
  // a bill made from an advance order
  const a = b.advance ?? (sale?.advance) ?? null;
  if (a) return [
    { label: 'Deposit Paid', value: a.deposit, kind: 'pay' }, ...modeRows(a.depositSplit),
    { label: 'Final Balance Paid', value: a.balance, kind: 'pay' }, ...modeRows(a.balanceSplit),
    { label: 'Remaining Balance (Fully Settled)', value: 0, kind: 'strong' },
  ];
  // an advance order still waiting for collection
  if ('deposit' in b && !('paymentMode' in b)) {
    const dep = b.depositSplit || { [b.depositMode]: b.deposit };
    return [{ label: 'Deposit Paid', value: b.deposit, kind: 'pay' }, ...modeRows(dep), { label: 'Balance Due', value: b.total - b.deposit, kind: 'strong' }];
  }
  // a normal bill
  if (b.paymentMode === 'split') return [{ label: 'Amount Paid', value: b.total, kind: 'pay' }, ...modeRows({ cash: b.payCash, upi: b.payUpi, card: b.payCard })];
  const out = [{ label: `Paid by ${MODE_L[b.paymentMode] || b.paymentMode}`, value: b.total, kind: 'pay' }];
  if (b.paymentMode === 'cash' && b.cashTendered > b.total) out.push({ label: 'Cash received', value: b.cashTendered, kind: 'paysub' }, { label: 'Change returned', value: b.change || b.cashTendered - b.total, kind: 'paysub' });
  return out;
}

export const modeName = s => s.advance ? 'Advance order · deposit + balance' : s.paymentMode === 'split'
  ? `Split · ${PAY_L.filter(([k]) => ({ cash: s.payCash, upi: s.payUpi, card: s.payCard })[k] > 0).map(([, l]) => l).join(' + ')}` : MODE_L[s.paymentMode];
