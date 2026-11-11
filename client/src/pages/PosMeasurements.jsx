import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import ExportCsv from '../components/ExportCsv';
import { PeriodFilter, periodRange, usePeriod } from '../components/PeriodFilter';
import { CM_FIELDS, measureSummary } from '../components/MeasureModal';
import { BACK_NECKS, FRONT_NECKS } from './stitching/NeckPicker';

const dmy = d => d ? String(d).slice(0, 10).split('-').reverse().join('-') : '';
const TILES = [['all', 'TOTAL BILLS', 'plum'], ['pending', 'PENDING', 'amber'], ['completed', 'COMPLETED', 'green'], ['cancelled', 'CANCELLED', 'red']];
const drawing = (list, name) => list.find(([n]) => n.toLowerCase() === String(name || '').toLowerCase())?.[1];

// Measurements: one card per bill that has stitching lines, with the neck drawings, sizes and a Pending / Completed status.
export default function PosMeasurements() {
  const [per, setPer] = usePeriod('all'); const [f, setF] = useState({ q: '', name: '', phone: '' }); const [status, setStatus] = useState('all');
  const [data, setData] = useState(null); const [err, setErr] = useState(); const [open, setOpen] = useState({}); const [n, setN] = useState(0);
  const [from, to] = periodRange(per);
  useEffect(() => {
    const t = setTimeout(() => api(`/admin/pos/measurements?from=${from}&to=${to}&status=${status}&q=${encodeURIComponent(f.q)}&name=${encodeURIComponent(f.name)}&phone=${encodeURIComponent(f.phone)}`).then(d => { setData(d); setErr() }).catch(e => setErr(e.message)), 200);
    return () => clearTimeout(t);
  }, [from, to, status, f, n]);
  const setTailoring = async (b, s) => { try { await api(`/admin/pos/sales/${encodeURIComponent(b.invoiceNo)}/tailoring`, { method: 'PATCH', body: { status: s } }); setN(x => x + 1) } catch (e) { setErr(e.message) } };
  const bills = data?.bills || [];
  const rows = bills.flatMap(b => b.items.map(i => [b.invoiceNo, b.customerName, b.customerPhone, dmy(b.billDate), b.status, i.name, i.measure?.frontNeck ?? '', i.measure?.backNeck ?? '', measureSummary(i.measure)]));
  return (
    <div className="msp">
      <div className="msp-top"><span />
        <div className="msp-tools"><PeriodFilter value={per} onChange={setPer} />
          <ExportCsv name="measurements" header={['Invoice', 'Customer', 'Phone', 'Date', 'Status', 'Item', 'Front neck', 'Back neck', 'Measurements']} rows={rows} /></div></div>
      {err && <p className="dpos-err" role="alert">{err}</p>}
      <div className="msp-tiles">{TILES.map(([k, l, c]) => (
        <button key={k} type="button" className={`msp-tile ${c} ${status === k ? 'on' : ''}`} aria-pressed={status === k} onClick={() => setStatus(k)}><span>{l}</span><b>{data ? data.counts[k] : '…'}</b></button>))}</div>
      <div className="msp-filters">
        <label>Search order ID<input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} placeholder="INV-…" /></label>
        <label>Customer name<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <label>Customer phone<input inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></label>
      </div>
      {!data ? <p className="muted">Loading…</p> : !bills.length ? <p className="dpos-empty">No bills with measurements yet. Add a service line with measurements in Billing.</p> : (
        <div className="msp-list">{bills.map(b => (
          <article key={b.invoiceNo} className={`msp-card ${b.status}`}>
            <header onClick={() => setOpen(o => ({ ...o, [b.invoiceNo]: !o[b.invoiceNo] }))}>
              <div><b>{b.customerName || 'Walk-in customer'}</b><span className="msp-inv">{b.invoiceNo}</span><small>{b.customerPhone || '-'} · {dmy(b.billDate)} · {b.items.length} {b.items.length === 1 ? 'item' : 'items'}</small></div>
              <div className="msp-st" onClick={e => e.stopPropagation()}>
                {b.status === 'cancelled' ? <span className="msp-pill red">Cancelled</span>
                  : <select value={b.status} aria-label={`Status of ${b.invoiceNo}`} onChange={e => setTailoring(b, e.target.value)}><option value="pending">Pending</option><option value="completed">Completed</option></select>}
                <i aria-hidden="true">{open[b.invoiceNo] ? '▲' : '▼'}</i></div>
            </header>
            {open[b.invoiceNo] && (
              <div className="msp-body">
                {b.customerAddress && <p className="muted small">{b.customerAddress}</p>}
                {b.items.map((i, k) => (
                  <section key={k} className="msp-item">
                    <div className="msp-ih"><b>{i.name}</b><span>{inr(i.lineTotal)}</span></div>
                    <div className="msp-necks">
                      {[['FRONT NECK', i.measure?.frontNeck, FRONT_NECKS], ['BACK NECK', i.measure?.backNeck, BACK_NECKS]].map(([l, v, list]) => v && <div key={l}><em>{l}</em><span className="msp-draw">{drawing(list, v)}</span><b>{v}</b></div>)}
                      {(i.measure?.sleeveType || i.measure?.sleeveLength) && <div><em>SLEEVE</em><b>{[i.measure.sleeveType, i.measure.sleeveLength].filter(Boolean).join(', ')}</b></div>}
                      {i.measure?.dueDate && <div><em>DUE DATE</em><b>{dmy(i.measure.dueDate)}</b></div>}
                    </div>
                    <div className="msp-cm">{CM_FIELDS.filter(([key]) => i.measure?.cm?.[key]).map(([key, label]) => <div key={key}><em>{label.toUpperCase()}</em><b>{i.measure.cm[key]} cm</b></div>)}</div>
                    {i.measure?.remarks?.length > 0 && <div className="msp-rem"><em>REMARKS</em><ul>{i.measure.remarks.map((r, x) => <li key={x}>{r}</li>)}</ul></div>}
                  </section>))}
              </div>)}
          </article>))}</div>)}
    </div>
  );
}
