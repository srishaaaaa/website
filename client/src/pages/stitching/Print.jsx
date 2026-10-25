import { useEffect, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useApp } from '../../context/App';
import { DEFAULT_LOGO } from '../../components/Wordmark';
import { clock, longDate } from '../../lib/invoiceFormat';
import { istDay } from '../../components/PeriodFilter';
import '../../pos.css';
import '../../pos3.css';
import { Empty, Err, dmy, inr, statusName, useMeta } from './common';

const num = (n, unit) => `${n}${unit === 'in' ? '"' : ' cm'}`;

// Job card (internal, for the workshop) or customer receipt (no internal notes, measurements or staff names). Printing is scoped to this page.
export default function Print() {
  const { id } = useParams(); const [sp] = useSearchParams(); const copy = sp.get('copy') === 'customer' ? 'customer' : 'job';
  const { user, authReady } = useApp(); const [meta] = useMeta();
  const [o, setO] = useState(null); const [shop, setShop] = useState(null); const [err, setErr] = useState();
  useEffect(() => { document.body.classList.add('stc-printing'); return () => document.body.classList.remove('stc-printing') }, []);
  const ok = user && ['owner', 'admin', 'cashier'].includes(user.role);
  useEffect(() => { if (!ok) return; Promise.all([api(`/admin/stitching/orders/${id}`), api('/admin/pos/shop')]).then(([a, b]) => { setO(a); setShop(b) }).catch(e => setErr(e.message)) }, [id, ok]);
  if (!authReady) return <div className="page-pad"><p className="muted">Loading…</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!ok) return <div className="empty page-pad"><p className="serif big">Staff access only.</p></div>;
  if (err) return <div className="page-pad"><Err>{err}</Err></div>;
  if (!o || !shop || !meta) return <div className="page-pad"><Empty>Loading…</Empty></div>;
  const job = copy === 'job';
  return (
    <div style={{ background: '#f3f1ec', minHeight: '100vh', '--d-ink': '#121214', '--d-acc': '#330533', '--d-line': '#e7e1d6', '--d-mut': '#6f6b66' }}>
      <div className="stc-bar-tools"><button className="dpos-btn" onClick={() => window.print()}>Print</button><Link className="dpos-btn ghost" to={`/admin/stitching/orders/${o.id}`}>← Back to order</Link>
        <Link className="dpos-btn ghost" to={`/admin/stitching/print/${o.id}?copy=${job ? 'customer' : 'job'}`}>Switch to {job ? 'customer receipt' : 'job card'}</Link></div>
      <article className="stc-sheet">
        <header className="head">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><img src={shop.logo || DEFAULT_LOGO} alt="" /><div><h1>{shop.name}</h1><div>{(shop.address || []).join(', ')}</div>{shop.phone && <div>Phone: {shop.phone}</div>}</div></div>
          <div style={{ textAlign: 'right' }}><h1 style={{ fontSize: 16 }}>{job ? 'STITCHING JOB CARD' : 'STITCHING ORDER RECEIPT'}</h1><div className="stc-mono" style={{ fontSize: 16 }}>{o.orderNo}</div><div>Ordered {dmy(o.orderDate)}</div>{job && <div><b>{statusName(meta, o.status)}</b>{o.priority !== 'normal' && ` · ${o.priority.toUpperCase()}`}</div>}</div>
        </header>
        <div className="two">
          <div><h2>Customer</h2><div><b>{o.customerName}</b></div><div>{o.customerPhone}</div></div>
          <div><h2>{job ? 'Schedule' : 'Dates'}</h2>{job && <div>Tailor: <b>{o.tailorName || 'Not assigned'}</b></div>}{job && o.startDate && <div>Start: {dmy(o.startDate)}</div>}{o.trialDate && <div>Trial: <b>{dmy(o.trialDate)}</b></div>}<div>Delivery: <b>{dmy(o.deliveryDate)}</b></div></div>
        </div>
        {o.items.map((it, i) => (
          <section key={it.id}>
            <h2>{i + 1}. {it.garmentName}{it.qty > 1 ? ` × ${it.qty}` : ''}{it.designName ? ` · ${it.designName}` : ''}</h2>
            {job ? <>
              {(Object.keys(it.specs).length > 0 || it.custom.length > 0) && <table><tbody>{Object.entries(it.specs).map(([k, v]) => <tr key={k}><td style={{ width: '32%' }}>{meta.specLibrary[k]?.label ?? k}</td><td><b>{v}</b></td></tr>)}{it.custom.map((c, j) => <tr key={j}><td>{c.label}</td><td><b>{c.value}</b></td></tr>)}</tbody></table>}
              {it.notes && <p style={{ margin: '6px 0' }}><b>Instructions:</b> {it.notes}</p>}
              <p style={{ margin: '6px 0' }}><b>Fabric:</b> {[it.fabric.source === 'boutique' ? 'Boutique provides' : 'Customer provides', it.fabric.type, it.fabric.color, it.fabric.quantity].filter(Boolean).join(', ')}{it.fabric.lining && ` · Lining: ${it.fabric.lining}`}{it.fabric.accessories && ` · Accessories: ${it.fabric.accessories}`} · {{ pending: 'awaiting fabric', received: 'fabric received', ready: 'ready for cutting' }[it.fabric.status ?? 'pending']}</p>
              {it.fabric.photos?.length > 0 && <div style={{ display: 'flex', gap: 6, margin: '6px 0' }}>{it.fabric.photos.map(u => <img key={u} src={u} alt="Fabric reference" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 4 }} />)}</div>}
              {Object.entries(it.measurements.groups ?? {}).map(([g, v]) => <div key={g} style={{ margin: '6px 0' }}><b>{meta.measureGroups[g]?.label ?? g} measurements ({v.unit === 'in' ? 'inches' : 'cm'}, {dmy(istDay(v.takenAt))}):</b>
                <div className="m">{[...Object.entries(v.values).map(([k, n]) => [meta.measureGroups[g]?.fields.find(f => f[0] === k)?.[1] ?? k, n]), ...v.custom.map(c => [c.label, c.value])].map(([k, n]) => <div key={k}>{k}: <b>{num(n, v.unit)}</b></div>)}</div>{v.notes && <div>Note: {v.notes}</div>}</div>)}
            </> : <p style={{ margin: 0 }}>{inr(it.unitCharge)}{it.qty > 1 ? ` each × ${it.qty} = ${inr(it.unitCharge * it.qty)}` : ''}</p>}
          </section>))}
        {job && o.notes && <section><h2>Order notes</h2><p style={{ margin: 0 }}>{o.notes}</p></section>}
        {job && o.alterations.length > 0 && <section><h2>Alterations</h2>{o.alterations.map(a => <div key={a.id}>Round {a.round}: <b>{a.reason}</b>{a.corrections && ` — ${a.corrections}`} ({a.status.replace('_', ' ')})</div>)}</section>}
        {!job && <section><h2>Amount</h2><table><tbody>
          <tr><td>Subtotal</td><td className="r">{inr(o.subtotal)}</td></tr>{o.discount > 0 && <tr><td>Discount</td><td className="r">− {inr(o.discount)}</td></tr>}{o.isGst && <tr><td>GST {o.gstRate}%</td><td className="r">{inr(o.tax)}</td></tr>}
          <tr><td><b>Total</b></td><td className="r"><b>{inr(o.total)}</b></td></tr>
          {o.payments.map(p => <tr key={p.id}><td>{p.kind === 'refund' ? 'Refund' : 'Received'} · {p.receipt} · {longDate(istDay(p.at))} {clock(p.at)} · {p.mode.toUpperCase()}</td><td className="r">{p.kind === 'refund' ? '− ' : ''}{inr(p.amount)}</td></tr>)}
          <tr><td><b>Balance due</b></td><td className="r"><b>{inr(o.balance)}</b></td></tr></tbody></table>
          {o.invoiceNo && <p style={{ margin: '8px 0 0' }}>Tax invoice: {o.invoiceNo}</p>}
          <p style={{ margin: '10px 0 0', fontSize: 11 }}>{shop.terms}</p></section>}
        {job && <div className="two" style={{ marginTop: 22 }}><div>Cutting done by: ____________________</div><div>Quality check by: ____________________</div></div>}
        <p style={{ marginTop: 18, fontSize: 11, color: '#555' }}>{job ? 'Internal use. Contains private customer measurements.' : 'Thank you for choosing ' + shop.name + '.'}</p>
      </article>
    </div>);
}
