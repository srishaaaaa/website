import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import BillSummary from './BillSummary';
import { money } from '../lib/invoiceFormat';

// Balance invoice for an advance order that has not been collected yet: items, what was paid in advance and the balance still due.
// Same window as the invoice preview; Print prints just the document.
export default function AdvanceInvoice({ code, onClose }) {
  const [a, setA] = useState(null); const [shop, setShop] = useState(null); const [err, setErr] = useState(); const doc = useRef();
  useEffect(() => { Promise.all([api('/admin/pos/advances/' + encodeURIComponent(code)), api('/admin/pos/shop')]).then(([x, s]) => { setA(x); setShop(s) }).catch(e => setErr(e.message)) }, [code]);
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose]);
  const print = () => {
    const w = window.open('', '_blank', 'width=820,height=900'); if (!w) return;
    w.document.write(`<!doctype html><title>${code}</title><style>body{font-family:Poppins,Arial,sans-serif;margin:24px;color:#1a1420}table{width:100%;border-collapse:collapse}th,td{padding:7px 4px;text-align:left;border-bottom:1px solid #e8e2ea;font-size:13px}th{font-size:10px;letter-spacing:.1em;color:#6b6070}.r{text-align:right}h1{margin:0;color:#330533}.bsum>div{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}.bsum-total{font-weight:700;border-top:1px solid #1a1420}</style>${doc.current.innerHTML}`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };
  return (
    <div className="dpos-modal" role="dialog" aria-modal="true" aria-label="Balance invoice" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="dpos-sheet invprev advinv">
        <div className="invprev-bar"><b>BALANCE INVOICE • #{code}</b><span><button type="button" onClick={print}>Print</button><button type="button" aria-label="Close" onClick={onClose}>✕</button></span></div>
        <div className="advinv-body">
          {err ? <p className="dpos-err">{err}</p> : !a || !shop ? <p className="muted">Loading…</p> : (
            <div ref={doc} className="advinv-doc">
              <h1>{shop.name}</h1>
              <p style={{ margin: '2px 0', fontSize: 12 }}>{(shop.address || []).join(', ')}{shop.phone ? ` · ${shop.phone}` : ''}</p>
              <h2 style={{ margin: '18px 0 2px', fontSize: 16, color: '#330533' }}>ADVANCE ORDER · BALANCE INVOICE</h2>
              <p style={{ margin: 0, fontSize: 12 }}>#{a.code} · {String(a.createdAt || '').slice(0, 10).split('-').reverse().join('-')}{a.deliveryDate ? ` · Delivery ${a.deliveryDate.split('-').reverse().join('-')}` : ''}</p>
              <p style={{ margin: '10px 0', fontSize: 13 }}><b>{a.customerName || 'Walk-in customer'}</b>{a.customerPhone ? ` · ${a.customerPhone}` : ''}{a.customerAddress ? <><br />{a.customerAddress}</> : null}</p>
              <table><thead><tr><th>ITEM</th><th className="r">QTY</th><th className="r">RATE</th><th className="r">AMOUNT</th></tr></thead>
                <tbody>{a.items.map((i, n) => <tr key={n}><td>{i.name}{i.size ? ` (${i.size}${i.color && i.color !== 'Default' ? `, ${i.color}` : ''})` : ''}</td><td className="r">{i.qty}</td><td className="r">{money(i.price)}</td><td className="r">{money(i.price * i.qty)}</td></tr>)}</tbody></table>
              <div style={{ marginTop: 12 }}><BillSummary bill={a} /></div>
              <p style={{ margin: '14px 0 0', fontSize: 14 }}><b>Balance due: {money(a.balance)}</b></p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6b6070' }}>The final tax invoice is generated when the balance is collected.</p>
            </div>)}
        </div>
      </div>
    </div>
  );
}
