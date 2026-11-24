import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import PrintSettings from './PrintSettings';
import { A4Doc, Thermal, PAGE, FIT, SHEET_CSS, advanceAsBill } from '../pages/InvoicePage';
import '../invoice.css';

// Balance invoice for an advance order that has not been collected yet. It uses the same layout as a finished bill:
// the items, the deposit paid (and how), and the balance still due. Print asks thermal / A4 / A5 first.
export default function AdvanceInvoice({ code, onClose }) {
  const [a, setA] = useState(null); const [shop, setShop] = useState(null); const [err, setErr] = useState();
  const [ps, setPs] = useState(false); const [paper, setPaper] = useState(null);
  useEffect(() => { Promise.all([api('/admin/pos/advances/' + encodeURIComponent(code)), api('/admin/pos/shop')]).then(([x, s]) => { setA(x); setShop(s) }).catch(e => setErr(e.message)) }, [code]);
  useEffect(() => { const k = e => e.key === 'Escape' && !ps && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose, ps]);

  // Printing: a copy of the invoice in the chosen format is placed straight under <body>, and only that copy prints.
  useEffect(() => {
    if (!paper) return;
    const st = document.createElement('style');
    st.textContent = `@page { size: ${PAGE[paper]} } @media print { body.advinv-printing > *:not(.advinv-print) { display: none !important } }` + (FIT[paper] ? SHEET_CSS(FIT[paper]) : '');
    document.head.appendChild(st); document.body.classList.add('advinv-printing');
    const done = () => setPaper(null);
    addEventListener('afterprint', done);
    const t = setTimeout(() => window.print(), 300);
    return () => { clearTimeout(t); removeEventListener('afterprint', done); st.remove(); document.body.classList.remove('advinv-printing') };
  }, [paper]);

  const bill = a && advanceAsBill(a);
  return (
    <div className="dpos-modal" role="dialog" aria-modal="true" aria-label="Balance invoice" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="dpos-sheet invprev advinv">
        <div className="invprev-bar"><b>BALANCE INVOICE • #{code}</b><span><button type="button" onClick={() => setPs(true)} disabled={!a || !shop}>Print</button><button type="button" aria-label="Close" onClick={onClose}>✕</button></span></div>
        <div className="advinv-body inv-page">
          {err ? <p className="dpos-err">{err}</p> : !a || !shop ? <p className="muted">Loading…</p> : <A4Doc sale={bill} shop={shop} />}
        </div>
      </div>
      {ps && <PrintSettings onClose={() => setPs(false)} onPrint={({ paper: p }) => { setPs(false); setPaper(p) }} />}
      {paper && bill && shop && createPortal(<div className="advinv-print inv-page">{FIT[paper] ? <A4Doc sale={bill} shop={shop} /> : <Thermal sale={bill} shop={shop} paper={paper} />}</div>, document.body)}
    </div>
  );
}
