import { useEffect } from 'react';
import { inr } from '../lib/format';

// The eye button on every admin order list: a clean read-only "Order Details" sheet (customer, bill type, items, totals).
// rows: extra summary lines [{ label, value, tone }] shown between Discount and TOTAL (e.g. Advance paid).
export default function OrderDetailsModal({ no, customer, phone, address, source, isGst, when, items = [], subtotal, discount = 0, delivery = 0, total, rows = [], notes, loading, onClose }) {
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose]);
  const dt = when ? new Date(when) : null;
  const sub = subtotal ?? items.reduce((t, i) => t + i.total, 0);
  return (
    <div className="dpos-modal" role="dialog" aria-modal="true" aria-label="Order details" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="dpos-sheet od">
        <div className="od-head"><div><h2>Order Details</h2><p>{no}</p></div><button type="button" aria-label="Close" onClick={onClose}>✕</button></div>
        {loading ? <p className="od-load">Loading…</p> : <div className="od-body">
          <div className="od-grid">
            <div><small>Customer name</small><b>{customer || 'Walk-in Customer'}</b></div>
            <div><small>Contact number</small><b>{phone || 'N/A'}</b></div>
            <div><small>Address</small><b>{address || 'N/A'}</b></div>
            <div><small>Order source</small><b>{String(source || 'offline').toUpperCase()}</b></div>
            <div><small>Bill type</small><span className="od-pill">{isGst ? 'GST INVOICE' : 'NON-GST BILL'}</span></div>
            <div><small>Date &amp; time</small><b>{dt && !isNaN(dt) ? dt.toLocaleString('en-US') : 'N/A'}</b></div>
          </div>
          <h3 className="od-h">Order items</h3>
          <ul className="od-items">{items.map((i, n) => <li key={n}><span><b>{i.name}</b>{i.note && <em>{i.note}</em>}</span><span className="od-amt"><b>{inr(i.total)}</b><small>{i.qty} x {inr(i.unit)}</small></span></li>)}</ul>
          <div className="od-sums">
            <div><span>Subtotal</span><b>{inr(sub)}</b></div>
            {discount > 0 && <div><span>Discount</span><b>-{inr(discount)}</b></div>}
            {delivery > 0 && <div><span>Delivery</span><b>{inr(delivery)}</b></div>}
            {rows.map((r, n) => <div key={n} className={r.tone || ''}><span>{r.label}</span><b>{r.value}</b></div>)}
            <div className="od-total"><span>TOTAL</span><b>{inr(total)}</b></div>
          </div>
          {notes && <p className="od-note">Note: {notes}</p>}
        </div>}
      </div>
    </div>
  );
}
