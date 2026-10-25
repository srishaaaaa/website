import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { PeriodFilter, periodRange, usePeriod } from '../../components/PeriodFilter';
import { Empty, Err, Kpi, addDays, dayDiff, dmy, inr, useMeta, StatusPill } from './common';

function Days({ title, days, byDay }) {
  const max = Math.max(1, ...days.map(d => byDay[d] ?? 0));
  return (
    <section className="dpos-card"><h2>{title}</h2>
      {days.length > 92 ? <p className="muted">Choose a range of 92 days or less to see the daily chart.</p> : (
        <div className="stc-days" role="img" aria-label={title}>{days.map(d => <div key={d} title={`${dmy(d)}: ${byDay[d] ?? 0}`}><span>{byDay[d] || ''}</span><i style={{ height: `${(byDay[d] ?? 0) / max * 90}px`, opacity: byDay[d] ? 1 : .15 }} /><span>{Number(d.slice(8))}</span></div>)}</div>)}
    </section>);
}

export default function Reports() {
  const [meta] = useMeta(); const [per, setPer] = usePeriod('month'); const [from, to] = periodRange(per);
  const [r, setR] = useState(null); const [err, setErr] = useState();
  useEffect(() => { setR(null); api(`/admin/stitching/reports?from=${from}&to=${to}`).then(x => { setR(x); setErr() }).catch(e => setErr(e.message)) }, [from, to]);
  const days = useMemo(() => { const n = Math.min(dayDiff(from, to) + 1, 93); return Array.from({ length: Math.max(n, 0) }, (_, i) => addDays(from, i)) }, [from, to]);
  const rec = useMemo(() => Object.fromEntries((r?.received ?? []).map(x => [x.day, x.n])), [r]);
  const com = useMemo(() => Object.fromEntries((r?.completed ?? []).map(x => [x.day, x.n])), [r]);
  return (
    <div className="stc-stack">
      <PeriodFilter value={per} onChange={setPer} /><Err>{err}</Err>
      {!r || !meta ? <Empty>Loading…</Empty> : <>
        <div className="dpos-kpis">
          <Kpi label="Order value (not cancelled)" value={inr(r.orderValue)} /><Kpi label="Money collected" value={inr(r.collected)} /><Kpi label="Advances collected" value={inr(r.advances)} />
          <Kpi label="Alteration charges" value={inr(r.alterationCharges)} /><Kpi label="Outstanding on these orders" value={inr(r.outstanding)} /><Kpi label="Refunds" value={inr(r.refunds)} />
          <Kpi label="Delivered" value={r.delivered} /><Kpi label="Cancelled" value={r.cancelled} /><Kpi label="Average turnaround" value={r.avgTurnaroundDays == null ? '—' : `${r.avgTurnaroundDays} days`} />
        </div>
        <p className="muted small" style={{ margin: 0 }}><b>Order value</b> is what was agreed for orders placed in this period. <b>Money collected</b> is the cash, UPI and card actually received in the period (less refunds), whichever order it was for. An unpaid order is never counted as collected. Stitching figures are separate from retail sales: the invoices appear in Billing as bills noted “Stitching order”.</p>
        <div className="stc-grid w2"><Days title="Orders received" days={days} byDay={rec} /><Days title="Orders completed (delivered)" days={days} byDay={com} /></div>
        <div className="stc-grid w2">
          <section className="dpos-card"><h2>Active orders by stage (today)</h2>
            {!r.stages.length ? <Empty>No active orders.</Empty> : <div className="stc-bars">{meta.statuses.filter(([k]) => r.stages.some(s => s.status === k)).map(([k, l]) => { const n = r.stages.find(s => s.status === k).n; return <div key={k} className="stc-bar"><span>{l}</span><span className="t"><i style={{ width: `${n / Math.max(...r.stages.map(s => s.n)) * 100}%` }} /></span><b>{n}</b></div> })}</div>}</section>
          <section className="dpos-card"><h2>Tailor workload</h2>
            {!r.tailors.length ? <Empty>No tailors added.</Empty> : <table className="stc-table"><thead><tr><th>Tailor</th><th className="r">Open</th><th className="r">Overdue</th><th className="r">Delivered in period</th></tr></thead><tbody>{r.tailors.map(t => <tr key={t.id}><td><b>{t.name}</b></td><td className="r">{t.active}</td><td className="r" style={t.overdue ? { color: 'var(--d-bad)', fontWeight: 800 } : null}>{t.overdue}</td><td className="r">{t.completed}</td></tr>)}</tbody></table>}</section>
        </div>
        <section className="dpos-card"><h2>Overdue and delayed orders (all, as of today)</h2>
          {!r.overdue.length ? <Empty>Nothing is overdue.</Empty> : <div className="dpos-tw"><table className="stc-table"><thead><tr><th>Order</th><th>Customer</th><th>Stage</th><th>Tailor</th><th>Promised</th><th className="r">Days late</th><th className="r">Balance</th></tr></thead><tbody>{r.overdue.map(o => (
            <tr key={o.id}><td><Link className="stc-mono stc-link" to={`/admin/stitching/orders/${o.id}`}>{o.orderNo}</Link></td><td>{o.customerName}</td><td><StatusPill s={o.status} meta={meta} /></td><td>{o.tailorName || '—'}</td><td>{dmy(o.deliveryDate)}</td><td className="r" style={{ color: 'var(--d-bad)', fontWeight: 800 }}>{dayDiff(o.deliveryDate, new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()))}</td><td className="r money">{inr(o.balance)}</td></tr>))}</tbody></table></div>}</section>
      </>}
    </div>);
}
