import { useEffect } from 'react';
import { money } from '../lib/invoiceFormat';

// The shared window for Bill Generated, Advance Order Saved and Order Details: a dark header (title, tag, gold order id and one
// action), three figure boxes, then the cards (split-up, items …), a row of buttons and an optional link underneath.
// stats: [{ label, value (paise), sub, tone: 'ok' | 'due' | '' }]
export default function DoneSheet({ label, title, tag, code, headAction, stats = [], actions, footer, onClose, wide, children }) {
  useEffect(() => { const k = e => e.key === 'Escape' && onClose?.(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose]);
  return (
    <div className="dpos-modal" role="dialog" aria-modal="true" aria-label={label || title} onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
      <div className={`dpos-sheet dn ${wide ? 'wide' : ''}`}>
        <header className="dn-head">
          <div className="dn-title"><h2>{title}{tag && <span className="dn-tag">{tag}</span>}</h2>{code && <p className="dn-code">#{code}</p>}</div>
          {headAction}
        </header>
        <div className="dn-body">
          {stats.length > 0 && <div className="dn-stats" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
            {stats.map(s => <div key={s.label} className={`dn-stat ${s.tone || ''}`}><span>{s.label}</span><b>{typeof s.value === 'number' ? money(s.value) : s.value}</b>{s.sub && <small>{s.sub}</small>}</div>)}
          </div>}
          {children}
          {actions && <div className="dn-acts">{actions}</div>}
          {footer && <div className="dn-foot">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

// A card inside the window, with a small heading.
export const DoneCard = ({ title, children, className = '' }) => <section className={`dn-card ${className}`}>{title && <p className="dn-l">{title}</p>}{children}</section>;

// "Cash ₹5,000.00 · QR / GPay ₹1,000.00" for a {cash, upi, card} split.
const PAY = [['cash', 'Cash'], ['upi', 'QR / GPay'], ['card', 'Card']];
export const splitLine = s => PAY.filter(([k]) => s?.[k] > 0).map(([k, l]) => `${l} ${money(s[k])}`).join(' · ');

// The three figures for any bill or advance order:
//   open advance      → Order total · Deposit paid · Balance due
//   completed advance → Order total · Deposit paid · Final balance paid (with how each was paid)
//   normal bill       → Grand total · Amount received · Balance returned
export function statsFor(b, { sale } = {}) {
  const adv = b.advance ?? sale?.advance;
  if (adv) return [
    { label: 'Order total', value: b.total ?? sale?.total },
    { label: 'Deposit paid', value: adv.deposit, sub: splitLine(adv.depositSplit), tone: 'ok' },
    { label: 'Final balance paid', value: adv.balance, sub: splitLine(adv.balanceSplit) || 'Fully settled', tone: 'ok' },
  ];
  if ('deposit' in b && !('paymentMode' in b)) {
    const dep = b.depositSplit || { [b.depositMode]: b.deposit };
    return [
      { label: 'Order total', value: b.total },
      { label: 'Deposit paid', value: b.deposit, sub: splitLine(dep), tone: 'ok' },
      { label: b.status === 'cancelled' ? 'Deposit to hand back' : 'Balance due', value: b.status === 'cancelled' ? b.deposit : b.total - b.deposit, tone: 'due' },
    ];
  }
  const received = b.paymentMode === 'cash' ? (b.cashTendered || b.total) : b.total;
  const split = b.paymentMode === 'split' ? splitLine({ cash: b.payCash, upi: b.payUpi, card: b.payCard }) : ({ cash: 'Cash', upi: 'QR / GPay', card: 'Card' })[b.paymentMode] || '';
  const returned = (b.returns || []).reduce((t, r) => t + r.total, 0);
  return [
    { label: 'Grand total', value: b.total },
    { label: 'Amount received', value: received, sub: split, tone: 'ok' },
    returned > 0 ? { label: 'Refunded (returns)', value: returned, sub: b.returns.map(r => r.returnNo).join(', '), tone: 'due' } : { label: 'Balance returned', value: b.change || 0, tone: (b.change || 0) > 0 ? 'due' : '' },
  ];
}
