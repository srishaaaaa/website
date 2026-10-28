import { inr } from '../lib/format';

// How one payment was received: Cash, QR / GPay, Card, or Split across them (amounts must add up exactly).
const MODES = [['cash', 'CASH'], ['upi', 'QR / GPAY'], ['card', 'CARD'], ['split', 'SPLIT']];
const toPaise = s => { const n = Math.round(parseFloat(String(s || '').replace(/,/g, '')) * 100); return Number.isFinite(n) && n > 0 ? n : 0 };

export const blankPay = () => ({ mode: 'cash', cash: '', upi: '', card: '' });

// What the API expects, plus a problem message when a split does not add up.
export function payParts(p, amount) {
  if (p.mode !== 'split') return { mode: p.mode, split: undefined, problem: null };
  const split = { cash: toPaise(p.cash), upi: toPaise(p.upi), card: toPaise(p.card) };
  const sum = split.cash + split.upi + split.card;
  return { mode: 'split', split, problem: sum === amount ? null : sum < amount ? `${inr(amount - sum)} still to split` : `Split is ${inr(sum - amount)} more than ${inr(amount)}` };
}

export default function PayPicker({ value, onChange, amount, label }) {
  const parts = payParts(value, amount);
  return (
    <div className="payp">
      <div className="adv-modes" role="radiogroup" aria-label={label}>
        {MODES.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={value.mode === v} className={value.mode === v ? 'on' : ''} onClick={() => onChange({ ...value, mode: v })}>{l}</button>)}
      </div>
      {value.mode === 'split' && (
        <div className="payp-split">
          {[['cash', 'Cash'], ['upi', 'QR / GPay'], ['card', 'Card']].map(([k, l]) => (
            <label key={k}>{l} ₹<input inputMode="decimal" placeholder="0" value={value[k]} onChange={e => onChange({ ...value, [k]: e.target.value })} /></label>))}
          <p className={parts.problem ? 'payp-bad' : 'payp-ok'}>{parts.problem || `Adds up to ${inr(amount)} ✓`}</p>
        </div>)}
    </div>
  );
}
