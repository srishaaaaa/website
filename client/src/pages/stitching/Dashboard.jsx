import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Empty, Err, Kpi, PayPill, StatusPill, dmy, inr, kindName, todayStr, useMeta, when } from './common';

export default function Dashboard() {
  const [meta] = useMeta(); const [d, setD] = useState(null); const [err, setErr] = useState();
  useEffect(() => { api('/admin/stitching/dashboard').then(setD).catch(e => setErr(e.message)) }, []);
  if (err) return <Err>{err}</Err>;
  if (!d || !meta) return <Empty>Loading…</Empty>;
  const c = d.counts, stageMax = Math.max(1, ...d.stages.map(s => s.n));
  const stages = meta.statuses.filter(([k]) => k !== 'cancelled').map(([k, l]) => [k, l, d.stages.find(s => s.status === k)?.n ?? 0]);
  return (
    <div className="stc-stack">
      <div className="stc-row">
        <Link className="dpos-btn" to="/admin/stitching/orders/new">+ New stitching order</Link>
        <Link className="dpos-btn outline" to="/admin/stitching/measurements">Add measurements</Link>
        <Link className="dpos-btn outline" to="/admin/stitching/appointments?new=1">Schedule a trial</Link>
        <Link className="dpos-btn outline" to="/admin/stitching/orders?payment=partial">Record a payment</Link>
        <Link className="dpos-btn ghost" to="/admin/stitching/orders">View all orders</Link>
      </div>
      <div className="dpos-kpis">
        <Kpi label="Active orders" value={c.active} to="/admin/stitching/orders?status=active" />
        <Kpi label="Received today" value={c.today} />
        <Kpi label="In progress" value={c.inProgress} />
        <Kpi label="Trials, next 7 days" value={c.upcomingTrials} to="/admin/stitching/appointments" />
        <Kpi label="Due for delivery today" value={c.dueToday} to="/admin/stitching/orders?status=active&sort=delivery&dir=asc" />
        <Kpi label="Overdue" value={c.overdue} tone={c.overdue ? '#b3261e' : undefined} to="/admin/stitching/orders?overdue=1" />
        <Kpi label="Ready, awaiting collection" value={c.awaitingCollection} to="/admin/stitching/orders?status=ready" />
        <Kpi label="Outstanding payments" value={inr(c.outstanding)} to="/admin/stitching/orders?payment=partial" />
      </div>
      <div className="stc-grid w2">
        <section className="dpos-card">
          <h2>Recent stitching orders</h2>
          {!d.recent.length ? <Empty>No stitching orders yet. Create the first one with “New stitching order”.</Empty> : (
            <div className="dpos-tw"><table className="stc-table cards"><thead><tr><th>Order</th><th>Customer</th><th>Garment</th><th>Tailor</th><th>Delivery</th><th>Progress</th><th>Payment</th></tr></thead>
              <tbody>{d.recent.map(o => (
                <tr key={o.id}><td><Link className="stc-mono stc-link" to={`/admin/stitching/orders/${o.id}`}>{o.orderNo}</Link></td><td><b>{o.customerName}</b></td><td>{o.garments}</td><td>{o.tailorName || <span className="muted">Unassigned</span>}</td>
                  <td>{dmy(o.deliveryDate)}{o.overdue && <> <span className="stc-pill late">Overdue</span></>}</td><td><StatusPill s={o.status} meta={meta} /></td><td><PayPill s={o.paymentStatus} /></td></tr>))}</tbody></table></div>)}
        </section>
        <section className="dpos-card">
          <h2>Order progress overview</h2>
          <div className="stc-bars">{stages.map(([k, l, n]) => <div className="stc-bar" key={k}><span>{l}</span><span className="t"><i style={{ width: `${n / stageMax * 100}%`, display: n ? 'block' : 'none' }} /></span><b>{n}</b></div>)}</div>
          <p className="muted small" style={{ marginBottom: 0 }}>Counts every order currently at that stage. Delivered orders are included.</p>
        </section>
      </div>
      <div className="stc-grid w2">
        <section className="dpos-card">
          <h2>Upcoming deadlines</h2>
          {!d.deadlines.length ? <Empty>Nothing due in the next 7 days.</Empty> : <ul className="stc-stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 10 }}>{d.deadlines.map(o => (
            <li key={o.id} className="stc-row between"><span><Link className="stc-mono stc-link" to={`/admin/stitching/orders/${o.id}`}>{o.orderNo}</Link> · {o.customerName}<span className="muted small"> · {o.garments}</span></span>
              <span>{o.overdue ? <span className="stc-pill late">Overdue · {dmy(o.deliveryDate)}</span> : <span className={o.deliveryDate === todayStr() ? 'stc-pill pr-urgent' : 'stc-pill'}>{o.deliveryDate === todayStr() ? 'Today' : dmy(o.deliveryDate)}</span>}</span></li>))}</ul>}
          {d.alterations.length > 0 && <><h3 style={{ margin: '18px 0 8px' }}>Pending alterations</h3><ul className="stc-stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 8 }}>{d.alterations.map(a => (
            <li key={a.id} className="stc-row between"><span><Link className="stc-mono stc-link" to={`/admin/stitching/orders/${a.orderId}`}>{a.orderNo}</Link> · round {a.round}: {a.reason}</span><span className="muted small">{a.dueDate ? `due ${dmy(a.dueDate)}` : 'no due date'}</span></li>))}</ul></>}
        </section>
        <section className="dpos-card">
          <h2>Trials and appointments</h2>
          {!d.appointments.length ? <Empty>No appointments in the next 7 days.</Empty> : <ul className="stc-stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 10 }}>{d.appointments.map(a => (
            <li key={a.id} className="stc-row between"><span><b>{kindName(meta, a.kind)}</b> · {a.customerName}{a.orderNo && <span className="muted small"> · {a.orderNo}</span>}</span><span className="muted small">{when(a.startsAt)}</span></li>))}</ul>}
          <p style={{ marginBottom: 0 }}><Link className="stc-link" to="/admin/stitching/appointments">Open the calendar</Link></p>
        </section>
      </div>
    </div>);
}
