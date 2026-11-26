import { inr } from '../lib/format';

// How one payment was received: Cash, QR / GPay, Card, or Split across them (amounts must add up exactly).
const MODES = [['cash', 'CASH'], ['upi', 'QR / GPAY'], ['card', 'CARD'], ['split', 'SPLIT']];
const toPaise = s => { const n = Math.round(parseFloat(String(s || '').replace(/,/g, '')) * 100); return Number.isFinite(n) && n > 0 ? n : 0 };

export const blankPay = () => ({ mode: 'cash', cash: '', upi: '', card: '', on: { cash: true, upi: true, card: false }, typed: {} });
const KEYS = ['cash', 'upi', 'card'];
const LAB = { cash: 'Cash', upi: 'QR / GPay', card: 'Card' };
const rup = n => String(Math.round(n) / 100);

// What the API expects, plus a problem message when a split does not add up. Only the ticked methods count.
export function payParts(p, amount) {
  if (p.mode !== 'split') return { mode: p.mode, split: undefined, problem: null };
  const on = p.on || { cash: true, upi: true, card: false };
  const split = { cash: on.cash ? toPaise(p.cash) : 0, upi: on.upi ? toPaise(p.upi) : 0, card: on.card ? toPaise(p.card) : 0 };
  const sum = split.cash + split.upi + split.card;
  return { mode: 'split', split, problem: sum === amount ? null : sum < amount ? `${inr(amount - sum)} still to split` : `Split is ${inr(sum - amount)} more than ${inr(amount)}` };
}

// Typing an amount keeps it; the rest of the balance fills the first ticked box that has not been typed in.
function refill(v, amount) {
  const on = v.on || {}, typed = v.typed || {}; const next = { ...v };
  const picked = KEYS.filter(k => on[k]);
  const fixed = picked.filter(k => typed[k]).reduce((t, k) => t + toPaise(v[k]), 0);
  const free = picked.filter(k => !typed[k]);
  free.forEach((k, n) => { next[k] = n === 0 ? (amount - fixed > 0 ? rup(amount - fixed) : '') : '' });
  return next;
}

export default function PayPicker({ value, onChange, amount, label }) {
  const on = value.on || { cash: true, upi: true, card: false }; const typed = value.typed || {};
  const parts = payParts({ ...value, on }, amount); const picked = KEYS.filter(k => on[k]);
  const setMode = v => onChange(v === 'split' ? refill({ ...value, mode: v, on, typed: {} }, amount) : { ...value, mode: v });
  const toggle = k => { if (on[k] && picked.length <= 2) return; const o = { ...on, [k]: !on[k] }; const t = { ...typed, [k]: false }; onChange(refill({ ...value, on: o, typed: t, [k]: '' }, amount)) };
  const type = (k, val) => { val = String(val).replace(/[^\d.]/g, '').replace(/^0+(?=\d)/, ''); const t = { ...typed, [k]: val !== '' }; onChange(refill({ ...value, [k]: val, typed: t }, amount)) };
  return (
    <div className="payp">
      <div className="adv-modes" role="radiogroup" aria-label={label}>
        {MODES.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={value.mode === v} className={value.mode === v ? 'on' : ''} onClick={() => setMode(v)}>{l}</button>)}
      </div>
      {value.mode === 'split' && (
        <div className="payp-split">
          <p className="payp-t">SPLIT BETWEEN (PICK 2 OR 3)</p>
          <div className="payp-pick">{KEYS.map(k => <button key={k} type="button" aria-pressed={!!on[k]} className={on[k] ? 'on' : ''} onClick={() => toggle(k)}>{on[k] ? '✓ ' : ''}{k === 'upi' ? 'QR / GPAY' : LAB[k].toUpperCase()}</button>)}</div>
          <div className="payp-amts" style={{ gridTemplateColumns: `repeat(${picked.length}, minmax(0, 1fr))` }}>
            {picked.map(k => <label key={k}>{LAB[k]} ₹<input inputMode="decimal" placeholder="0.00" value={value[k]} onChange={e => type(k, e.target.value)} /></label>)}
          </div>
          <p className={parts.problem ? 'payp-bad' : 'payp-ok'}>{parts.problem || `Adds up to ${inr(amount)} ✓`}</p>
        </div>)}
    </div>
  );
}
