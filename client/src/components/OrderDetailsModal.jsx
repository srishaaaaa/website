import { inr } from '../lib/format';
import BillSummary from './BillSummary';
import DoneSheet, { DoneCard, statsFor } from './DoneSheet';

// The eye button on the admin order lists: a read-only "Order Details" window in the same layout as Bill Generated and
// Advance Order Saved: dark header, the three figures (total · paid · balance / returned, or deposit and final balance for
// advance orders), the customer, the items and the complete split-up.
// bill (+ sale for a billed advance order) gives the figures and the split-up; without it the short totals are shown.
export default function OrderDetailsModal({ no, customer, phone, address, source, isGst, when, items = [], subtotal, discount = 0, delivery = 0, total, rows = [], notes, loading, onClose, bill, sale }) {
  const dt = when ? new Date(when) : null;
  const sub = subtotal ?? items.reduce((t, i) => t + i.total, 0);
  const tag = bill?.advance || sale?.advance ? 'ADVANCE · PAID' : bill && 'deposit' in bill && !('paymentMode' in bill) ? 'ADVANCE' : isGst ? 'GST INVOICE' : 'NON-GST BILL';
  return (
    <DoneSheet label={`Order details ${no || ''}`} title="Order Details" tag={loading ? null : tag} code={no} onClose={onClose}
      headAction={<button type="button" className="dn-x" aria-label="Close" onClick={onClose}>✕</button>}
      stats={!loading && bill ? statsFor(sale || bill, { sale }) : !loading && total != null ? [{ label: 'Total', value: total }] : []}>
      {loading ? <p className="muted" style={{ padding: '8px 2px' }}>Loading…</p> : <>
        <DoneCard title="CUSTOMER" className="dn-cust">
          <div className="dn-grid">
            <div><small>Name</small><b>{customer || 'Walk-in Customer'}</b></div>
            <div><small>Contact</small><b>{phone || '—'}</b></div>
            <div><small>Source</small><b>{String(source || 'offline').toUpperCase()}</b></div>
            <div><small>Date &amp; time</small><b>{dt && !isNaN(dt) ? dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—'}</b></div>
            {address && <div className="full"><small>Address</small><b>{address}</b></div>}
          </div>
        </DoneCard>
        <DoneCard title="ORDER ITEMS">{items.map((i, n) => <div key={n} className="dn-item"><span><b>{i.name}</b>{i.note && <em>{i.note}</em>}<small>{i.qty} × {inr(i.unit)}</small></span><b>{inr(i.total)}</b></div>)}</DoneCard>
        <DoneCard title={bill && 'deposit' in bill && !('paymentMode' in bill) ? 'ORDER SPLIT-UP' : 'BILL SPLIT-UP'}>
          {bill ? <BillSummary bill={bill} sale={sale} />
            : <div className="bsum">
              <div className="bsum-row"><span>Subtotal</span><b>{inr(sub)}</b></div>
              {discount > 0 && <div className="bsum-row"><span>Discount</span><b>−{inr(discount)}</b></div>}
              {delivery > 0 && <div className="bsum-row"><span>Delivery</span><b>{inr(delivery)}</b></div>}
              {rows.map((r, n) => <div key={n} className="bsum-row"><span>{r.label}</span><b>{r.value}</b></div>)}
              <div className="bsum-total"><span>TOTAL</span><b>{inr(total)}</b></div>
            </div>}
        </DoneCard>
        {notes && <p className="dn-note">Note: {notes}</p>}
      </>}
    </DoneSheet>
  );
}
