import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { Empty, Err, Field, PayPill, PriPill, StatusPill, dmy, inr, useMeta } from './common';

const SORTS = [['created', 'Date created'], ['delivery', 'Delivery date'], ['priority', 'Priority'], ['status', 'Status']];

export default function Orders() {
  const [meta] = useMeta(); const nav = useNavigate(); const [sp, setSp] = useSearchParams();
  const [tailors, setTailors] = useState([]);
  const q = Object.fromEntries(sp); const page = Number(q.page) || 1;
  const set = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n, { replace: true }) };
  const [data, setData] = useState(null); const [err, setErr] = useState(); const [text, setText] = useState(q.q ?? '');
  useEffect(() => { api('/admin/stitching/tailors').then(setTailors).catch(() => {}) }, []);
  useEffect(() => { const t = setTimeout(() => { if ((q.q ?? '') !== text) set('q', text.trim()) }, 300); return () => clearTimeout(t) }, [text]); // eslint-disable-line
  const qs = sp.toString();
  useEffect(() => {
    setData(null);
    api('/admin/stitching/orders?pageSize=20&' + qs).then(d => { setData(d); setErr() }).catch(e => setErr(e.message));
  }, [qs]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="stc-stack">
      <section className="dpos-card dpos-filters" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <Field label="Search"><input type="search" value={text} onChange={e => setText(e.target.value)} placeholder="Order no., name or phone" /></Field>
        <Field label="Status"><select value={q.status ?? 'all'} onChange={e => set('status', e.target.value === 'all' ? '' : e.target.value)}><option value="all">All statuses</option><option value="active">All active</option>{meta?.statuses.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Garment"><select value={q.garmentTypeId ?? ''} onChange={e => set('garmentTypeId', e.target.value)}><option value="">All garments</option>{meta?.garmentTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        <Field label="Tailor"><select value={q.tailorId ?? ''} onChange={e => set('tailorId', e.target.value)}><option value="">All tailors</option>{tailors.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        <Field label="Payment"><select value={q.payment ?? 'all'} onChange={e => set('payment', e.target.value === 'all' ? '' : e.target.value)}><option value="all">Any payment</option><option value="unpaid">Unpaid</option><option value="partial">Part paid</option><option value="paid">Paid in full</option></select></Field>
        <Field label="Ordered from"><input type="date" value={q.from ?? ''} onChange={e => set('from', e.target.value)} /></Field>
        <Field label="Ordered to"><input type="date" value={q.to ?? ''} onChange={e => set('to', e.target.value)} /></Field>
        <Field label="Sort by"><select value={q.sort ?? 'created'} onChange={e => set('sort', e.target.value)}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Order"><select value={q.dir ?? 'desc'} onChange={e => set('dir', e.target.value)}><option value="desc">Newest / highest first</option><option value="asc">Oldest / lowest first</option></select></Field>
        <label className="stc-row" style={{ alignSelf: 'end', paddingBottom: 12 }}><input type="checkbox" checked={q.overdue === '1'} onChange={e => set('overdue', e.target.checked ? '1' : '')} /> Overdue only</label>
      </section>
      <Err>{err}</Err>
      <section className="dpos-card">
        <div className="stc-row between" style={{ marginBottom: 10 }}><span className="muted small">{data ? `${data.total} order${data.total === 1 ? '' : 's'}` : 'Loading…'}</span><Link className="dpos-btn sm" to="/admin/stitching/orders/new">+ New order</Link></div>
        {!data && !err ? <Empty>Loading…</Empty> : data && !data.rows.length ? <Empty>{sp.toString() ? 'No orders match these filters.' : 'No stitching orders yet. Create the first one.'}</Empty> : data && (
          <div className="dpos-tw"><table className="stc-table cards"><thead><tr><th>Order</th><th>Customer</th><th>Garments</th><th>Tailor</th><th>Delivery</th><th>Status</th><th>Payment</th><th className="r">Total / balance</th></tr></thead>
            <tbody>{data.rows.map(o => (
              <tr key={o.id} className="click" onClick={() => nav(`/admin/stitching/orders/${o.id}`)}>
                <td><Link className="stc-mono stc-link" to={`/admin/stitching/orders/${o.id}`} onClick={e => e.stopPropagation()}>{o.orderNo}</Link><div className="muted small">{dmy(o.orderDate)}</div></td>
                <td><b>{o.customerName}</b><div className="muted small">{o.customerPhone}</div></td>
                <td>{o.garments} <PriPill p={o.priority} /></td>
                <td>{o.tailorName || <span className="muted">Unassigned</span>}</td>
                <td>{dmy(o.deliveryDate)}{o.overdue && <div><span className="stc-pill late">Overdue</span></div>}</td>
                <td><StatusPill s={o.status} meta={meta} /></td><td><PayPill s={o.paymentStatus} /></td>
                <td className="r"><span className="money">{inr(o.total)}</span>{o.balance > 0 && <div className="small" style={{ color: 'var(--d-bad)' }}>due {inr(o.balance)}</div>}</td></tr>))}</tbody></table></div>)}
        {data && pages > 1 && <div className="stc-row between" style={{ marginTop: 14 }}>
          <button className="dpos-btn ghost sm" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>← Previous</button><span className="muted small">Page {page} of {pages}</span>
          <button className="dpos-btn ghost sm" disabled={page >= pages} onClick={() => set('page', String(page + 1))}>Next →</button></div>}
      </section>
    </div>);
}
