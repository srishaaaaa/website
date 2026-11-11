import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import { useApp } from '../context/App';
import AdminShell from '../components/AdminShell';
import StaffOnly from '../components/StaffOnly';
import ExportCsv from '../components/ExportCsv';
import { PeriodFilter, periodRange, usePeriod } from '../components/PeriodFilter';

const dmy = d => d ? String(d).slice(0, 10).split('-').reverse().join('-') : '';
const STATUS_L = { pending: 'Pending', completed: 'Completed', cancelled: 'Cancelled' };

// Shared gate: signed-in staff only (owners/admins/cashiers); reports are for owners/admins.
function useStaff(managerOnly = false) {
  const { user, authReady } = useApp();
  if (!authReady) return <div className="page-pad"><p className="muted">Loading…</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!['owner', 'admin', 'cashier'].includes(user.role) || (managerOnly && !['owner', 'admin'].includes(user.role))) return <StaffOnly />;
  return null;
}

const Card = ({ label, value, sub, tone = '' }) => <div className={`sd-card ${tone}`}><span>{label}</span><b>{value}</b><small>{sub}</small></div>;
const Empty = ({ children }) => <p className="sd-empty">{children}</p>;
const openOrder = (nav, o) => o.kind === 'advance' ? nav('/admin/billing/advance') : o.shareToken && nav('/invoice/' + o.shareToken);

function OrderList({ list, nav }) {
  return (
    <div className="sd-list">{list.map(o => (
      <button type="button" key={o.ref} className="sd-row" onClick={() => openOrder(nav, o)}>
        <span className="sd-ref">{o.ref}</span>
        <span className="sd-who"><b>{o.customerName || 'Walk-in customer'}</b><small>{o.customerPhone || '-'} · {dmy(o.billDate)} · {o.garments} {o.garments === 1 ? 'garment' : 'garments'}</small></span>
        <span className="sd-due">{o.due ? `Due ${dmy(o.due)}` : 'No due date'}</span>
        <span className={`sd-pill ${o.status}`}>{o.kind === 'advance' ? 'Advance' : STATUS_L[o.status]}</span>
        <b className="sd-amt">{inr(o.total)}</b>
      </button>))}</div>
  );
}

// ---------------- Stitching Dashboard ----------------
export function StitchDashboard() {
  const gate = useStaff(); const nav = useNavigate();
  const [per, setPer] = usePeriod('month'); const [d, setD] = useState(null); const [err, setErr] = useState();
  const [from, to] = periodRange(per);
  useEffect(() => { if (!gate) api(`/admin/pos/stitching/overview?from=${from}&to=${to}`).then(x => { setD(x); setErr() }).catch(e => setErr(e.message)) }, [gate, from, to]);
  if (gate) return gate;
  const v = (f, dash = '…') => d ? f(d) : dash;
  return (
    <AdminShell title="Stitching Dashboard" sub="Stitching work at a glance: what is due, what is late and what it earned"
      actions={<><PeriodFilter value={per} onChange={setPer} /><Link className="dpos-btn" to="/admin/billing?new=stitching">+ New stitching order</Link></>}>
      {err && <p className="dpos-err" role="alert">{err}</p>}
      <div className="sd-grid6">
        <Card label="ACTIVE ORDERS" value={v(x => x.activeOrders)} sub="Pending stitching work" />
        <Card label="DUE TODAY" value={v(x => x.dueToday)} sub="Promised for today" />
        <Card label="OVERDUE" value={v(x => x.overdue)} sub="Past the promised date" />
        <Card label="COMPLETED" value={v(x => x.completed)} sub="Finished orders" tone="green" />
        <Card label="STITCHING REVENUE" value={v(x => inr(x.stitchingRevenue))} sub={v(x => `${x.bills} ${x.bills === 1 ? 'bill' : 'bills'} in this period`)} />
        <Card label="GARMENTS" value={v(x => x.garments)} sub={v(x => `${inr(x.averageGarment)} average each`)} />
      </div>
      <div className="sd-grid6 two">
        <Card label="OPEN ADVANCES" value={v(x => x.openAdvances)} sub="Deposit taken, work pending" />
        <Card label="BALANCE TO COLLECT" value={v(x => inr(x.balanceToCollect))} sub="On open advance orders" />
      </div>
      <div className="sd-two">
        <section className="sd-panel"><h2>Due in the next 7 days</h2>
          {!d ? <Empty>Loading…</Empty> : !d.dueSoon.length ? <Empty>Nothing is due in the next 7 days.</Empty> : <OrderList list={d.dueSoon} nav={nav} />}</section>
        <section className="sd-panel"><h2>Overdue</h2>
          {!d ? <Empty>Loading…</Empty> : !d.overdueList.length ? <Empty>No overdue orders. 🎉</Empty> : <OrderList list={d.overdueList} nav={nav} />}</section>
      </div>
      <section className="sd-panel"><div className="sd-ph"><h2>Recent stitching orders</h2><Link className="sd-va" to="/admin/stitching/orders">View all →</Link></div>
        {!d ? <Empty>Loading…</Empty> : !d.recent.length ? <Empty>No stitching orders yet. Add a service in Billing and take its measurements.</Empty> : <OrderList list={d.recent} nav={nav} />}</section>
    </AdminShell>
  );
}

// ---------------- Stitching Orders ----------------
const TILES = [['all', 'ALL ORDERS', ''], ['pending', 'PENDING', 'amber'], ['completed', 'COMPLETED', 'green'], ['cancelled', 'CANCELLED', 'red']];
export function StitchOrders() {
  const gate = useStaff(); const nav = useNavigate();
  const [per, setPer] = usePeriod('all'); const [f, setF] = useState({ q: '', name: '', phone: '' }); const [status, setStatus] = useState('all');
  const [d, setD] = useState(null); const [err, setErr] = useState(); const [from, to] = periodRange(per);
  useEffect(() => {
    if (gate) return;
    const t = setTimeout(() => api(`/admin/pos/stitching/orders?from=${from}&to=${to}&status=${status}&q=${encodeURIComponent(f.q)}&name=${encodeURIComponent(f.name)}&phone=${encodeURIComponent(f.phone)}`).then(x => { setD(x); setErr() }).catch(e => setErr(e.message)), 200);
    return () => clearTimeout(t);
  }, [gate, from, to, status, f]);
  if (gate) return gate;
  const rows = (d?.orders || []).map(o => [o.ref, o.customerName, o.customerPhone, dmy(o.billDate), o.due ? dmy(o.due) : '', STATUS_L[o.status], o.garments, (o.total / 100).toFixed(2)]);
  return (
    <AdminShell title="Stitching Orders" sub="Every bill with stitching and every open advance order, with due dates and status"
      actions={<><PeriodFilter value={per} onChange={setPer} /><ExportCsv name="stitching-orders" header={['Order', 'Customer', 'Phone', 'Date', 'Due', 'Status', 'Garments', 'Total']} rows={rows} /></>}>
      {err && <p className="dpos-err" role="alert">{err}</p>}
      <div className="sd-tiles">{TILES.map(([k, l, tone]) => (
        <button key={k} type="button" className={`sd-tile ${tone} ${status === k ? 'on' : ''}`} aria-pressed={status === k} onClick={() => setStatus(k)}><span>{l}</span><b>{d ? d.counts[k] : '…'}</b></button>))}</div>
      <section className="sd-filters">
        <label>Search order ID<input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} placeholder="e.g. INV-2026-…" /></label>
        <label>Customer name<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Search name…" /></label>
        <label>Customer phone<input inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="Search phone…" /></label>
        <label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
      </section>
      <section className="sd-panel">{!d ? <Empty>Loading…</Empty> : !d.orders.length ? <Empty>No stitching orders here. Add a service in Billing and take its measurements.</Empty> : <OrderList list={d.orders} nav={nav} />}</section>
    </AdminShell>
  );
}

// ---------------- Stitching Reports ----------------
export function StitchReports() {
  const gate = useStaff(true);
  const [per, setPer] = usePeriod('month'); const [d, setD] = useState(null); const [err, setErr] = useState(); const [from, to] = periodRange(per);
  useEffect(() => { if (!gate) api(`/admin/pos/stitching/overview?from=${from}&to=${to}`).then(x => { setD(x); setErr() }).catch(e => setErr(e.message)) }, [gate, from, to]);
  if (gate) return gate;
  const v = (f, dash = '…') => d ? f(d) : dash;
  const maxG = Math.max(1, ...(d?.byGarment || []).map(g => g.revenue)), maxD = Math.max(1, ...(d?.byDay || []).map(x => x.amount));
  const rows = [...(d?.byGarment || []).map(g => ['Garment', g.name, g.qty, (g.revenue / 100).toFixed(2)]), ...(d?.byDay || []).map(x => ['Day', dmy(x.day), '', (x.amount / 100).toFixed(2)])];
  return (
    <AdminShell title="Stitching Reports" sub="Stitching revenue by garment and by day"
      actions={<><PeriodFilter value={per} onChange={setPer} /><ExportCsv name="stitching-report" header={['Type', 'Name', 'Garments', 'Revenue']} rows={rows} /></>}>
      {err && <p className="dpos-err" role="alert">{err}</p>}
      <div className="sd-grid6 four">
        <Card label="STITCHING REVENUE" value={v(x => inr(x.stitchingRevenue))} sub="Stitching lines on completed bills" tone="green" />
        <Card label="BILLS" value={v(x => x.bills)} sub="With stitching" />
        <Card label="GARMENTS" value={v(x => x.garments)} sub={v(x => `${inr(x.averageGarment)} average each`)} />
        <Card label="PENDING VALUE" value={v(x => inr(x.pendingValue))} sub={v(x => `${x.pendingOrders} pending orders`)} />
      </div>
      <div className="sd-two wide">
        <section className="sd-panel"><h2>Revenue by garment</h2>
          {!d ? <Empty>Loading…</Empty> : !d.byGarment.length ? <Empty>No stitching sales in this period.</Empty> : <ul className="sd-bars">{d.byGarment.map(g => <li key={g.name}><span>{g.name} <small>×{g.qty}</small></span><i><u style={{ width: `${Math.max(4, g.revenue / maxG * 100)}%` }} /></i><b>{inr(g.revenue)}</b></li>)}</ul>}</section>
        <section className="sd-panel"><h2>Orders by status</h2>
          {['pending', 'completed', 'cancelled'].map(k => <div className="sd-st" key={k}><b>{STATUS_L[k]}</b><span>{v(x => x.byStatus[k])}</span></div>)}
          <p className="sd-foot">{v(x => `${x.overdue} overdue · ${x.dueToday} due today · ${inr(x.balanceToCollect)} still to collect on ${x.openAdvances} open advance orders.`)}</p></section>
      </div>
      <section className="sd-panel"><h2>Stitching revenue by day</h2>
        {!d ? <Empty>Loading…</Empty> : !d.byDay.length ? <Empty>No stitching sales in this period.</Empty> : <ul className="sd-bars">{d.byDay.map(x => <li key={x.day}><span>{dmy(x.day)}</span><i><u style={{ width: `${Math.max(4, x.amount / maxD * 100)}%` }} /></i><b>{inr(x.amount)}</b></li>)}</ul>}</section>
    </AdminShell>
  );
}
