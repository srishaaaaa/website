import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { clock, longDate } from '../lib/invoiceFormat';
import { PeriodFilter, istDay, periodRange, usePeriod } from './PeriodFilter';

const TYPES = [['all', 'All Types'], ['opening', 'Opening stock'], ['sale', 'POS sale'], ['online', 'Online order'], ['restock', 'Restock / return'], ['loss', 'Lost / damaged'], ['count', 'Stock count'], ['manual', 'Manual']];
const LABEL = { initial_stock: ['OPENING STOCK', 'in'], pos_sale: ['POS SALE', 'out'], pos_void: ['VOID RESTOCK', 'in'], pos_restock: ['RESTOCK', 'in'], pos_return: ['RETURN', 'in'], pos_loss: ['LOST / DAMAGED', 'warn'], pos_reconcile: ['STOCK COUNT', 'neutral'], order_reserved: ['ONLINE ORDER', 'out'], order_released: ['ORDER RELEASED', 'in'] };
const label = r => LABEL[r] || [String(r || 'adjustment').replace(/_/g, ' ').toUpperCase(), 'neutral'];
const sign = n => (n > 0 ? '+' : '') + n;

const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s };
export const downloadCsv = (name, header, lines) => {
  const body = [header, ...lines].map(r => r.map(csvCell).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv' })), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

const Glyph = ({ children }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;

// Stock Movements: every change to stock (restocks, sales, returns, losses and counts) with the level before and after.
export default function StockMovements({ onSnapshot }) {
  const [per, setPer] = usePeriod('all'); const [q, setQ] = useState(''); const [type, setType] = useState('all'); const [data, setData] = useState(null); const [err, setErr] = useState(); const [n, setN] = useState(0);
  const [from, to] = periodRange(per);
  useEffect(() => {
    const t = setTimeout(() => api(`/admin/pos/stock/movements?from=${from}&to=${to}&type=${type}&q=${encodeURIComponent(q)}`).then(d => { setData(d); setErr() }).catch(e => setErr(e.message)), 200);
    return () => clearTimeout(t);
  }, [from, to, type, q, n]);
  const s = data?.summary;
  const exportRows = () => downloadCsv('stock-movements.csv', ['Date', 'Time', 'Product', 'Size', 'Colour', 'SKU', 'Type', 'Change', 'Before', 'After', 'Reference / note'],
    (data?.rows || []).map(r => [istDay(r.at), clock(r.at), r.name, r.size, r.color, r.sku, label(r.reason)[0], r.change, r.before, r.after, r.ref]));
  return (
    <>
      <h2 className="sm-h">Stock Movements</h2>
      <p className="sub sm-sub">Every change to stock — restocks, sales, returns, losses and counts — with before and after levels.</p>
      <div className="sm-bar">
        <PeriodFilter value={per} onChange={setPer} />
        <span className="sm-sp" />
        <button type="button" className="sm-ic" aria-label="Refresh" onClick={() => setN(x => x + 1)}><Glyph><path d="M20 11a8 8 0 0 0-14-4M4 5v3h3M4 13a8 8 0 0 0 14 4M20 19v-3h-3" /></Glyph></button>
        <button type="button" className="sm-btn green" onClick={onSnapshot}><Glyph><path d="M12 4v11M7 11l5 5 5-5M5 20h14" /></Glyph>STOCK SNAPSHOT CSV</button>
        <button type="button" className="sm-btn red" onClick={exportRows} disabled={!data?.rows.length}><Glyph><path d="M12 4v11M7 11l5 5 5-5M5 20h14" /></Glyph>MOVEMENTS CSV</button>
      </div>
      {err && <p className="dpos-err" role="alert">{err}</p>}
      <div className="sm-kpis">
        <div className="sm-k"><i className="g"><Glyph><path d="M12 3 4 7v10l8 4 8-4V7zM4 7l8 4 8-4M12 11v10" /></Glyph></i><div><span>INCOMING STOCK</span><b className="g">{s ? sign(s.incoming) : '…'} <small>Units</small></b></div></div>
        <div className="sm-k"><i className="r"><Glyph><path d="M4 5h2l2 10h9l2-7H7" /><circle cx="10" cy="19" r="1.2" /><circle cx="17" cy="19" r="1.2" /></Glyph></i><div><span>UNITS SOLD (POS)</span><b>{s ? s.sold : '…'} <small>Units</small></b></div></div>
        <div className="sm-k"><i className="a"><Glyph><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5M12 16v.5" /></Glyph></i><div><span>LOST / DAMAGED</span><b>{s ? s.lost : '…'} <small>Units</small></b></div></div>
        <div className="sm-k"><i className="solid"><Glyph><path d="M4 16l5-5 4 4 7-8M15 7h5v5" /></Glyph></i><div><span>NET STOCK CHANGE</span><b>{s ? sign(s.net) : '…'} <small>Units</small></b></div></div>
      </div>
      <section className="sm-ledger">
        <div className="sm-lh"><b>MOVEMENT AUDIT LEDGER ({data ? data.summary.count : '…'})</b>
          <label className="sm-search"><Glyph><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></Glyph><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search product, bill no. or note…" aria-label="Search movements" /></label>
          <select value={type} onChange={e => setType(e.target.value)} aria-label="Movement type">{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="dpos-tw"><table><thead><tr><th>Date &amp; time</th><th>Product</th><th>Type</th><th className="r">Change</th><th className="r">Stock level</th><th>Reference / note</th></tr></thead>
          <tbody>{!data ? <tr><td colSpan="6" className="dpos-empty">Loading…</td></tr> : !data.rows.length ? <tr><td colSpan="6" className="dpos-empty">No stock movements in this period.</td></tr> : data.rows.map(r => { const [l, tone] = label(r.reason); return (
            <tr key={r.id}><td>{longDate(istDay(r.at))}, {clock(r.at)}</td>
              <td><b>{r.name}</b><div className="muted small">{[r.size, r.color !== 'Default' ? r.color : null].filter(Boolean).join(' · ')}</div></td>
              <td><span className={`sm-tag ${tone}`}>{l}</span></td>
              <td className={`r sm-ch ${r.change > 0 ? 'g' : 'r'}`}>{sign(r.change)}</td>
              <td className="r"><span className="muted">{r.before}</span> → <b>{r.after}</b></td>
              <td>{r.reason === 'pos_sale' || r.reason === 'pos_void' ? `Bill #${r.ref}` : r.reason === 'order_reserved' || r.reason === 'order_released' ? `Order ${r.ref}` : r.reason === 'initial_stock' ? 'Opening stock' : r.ref || '—'}</td></tr>) })}</tbody></table></div>
      </section>
    </>
  );
}
