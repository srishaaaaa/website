import { billRows } from '../lib/billSummary';
import { money } from '../lib/invoiceFormat';

// The complete split-up of a bill or advance order (admin screens). Invoices print the same rows in their own style.
export default function BillSummary({ bill, sale, className = '' }) {
  return (
    <div className={`bsum ${className}`}>
      {billRows(bill, { sale }).map((r, i) => (
        <div key={i} className={`bsum-${r.kind}`}>
          <span>{r.label}{r.note && <small> {r.note}</small>}</span>
          {r.value != null && <b className="mono">{r.value < 0 ? `−${money(-r.value)}` : money(r.value)}</b>}
        </div>))}
    </div>
  );
}
