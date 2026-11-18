import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import { useApp } from '../context/App';
import AdminShell from '../components/AdminShell';
import StaffOnly from '../components/StaffOnly';
import ExportCsv from '../components/ExportCsv';
import { WaIcon, DocIcon, EyeIcon, waUrl } from '../components/RowActions';
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

const todayIst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
// The promised date of an order, with a pencil to change it.
function DueEdit({ o, onChanged, short }) {
  const [on, setOn] = useState(false); const [err, setErr] = useState();
  const late = o.due && o.due < todayIst() && o.status === 'pending';
  const save = async v => { if (!v || v === o.due) return setOn(false); try { await api('/admin/pos/stitching/due', { method: 'PATCH', body: { kind: o.kind, ref: o.ref, due: v } }); setOn(false); onChanged?.() } catch (e) { setErr(e.message) } };
  return on
    ? <span className="sd-dueedit"><input type="date" autoFocus defaultValue={o.due || ''} aria-label={`New due date for ${o.ref}`} onChange={e => save(e.target.value)} onBlur={() => setOn(false)} />{err && <small role="alert">{err}</small>}</span>
    : <span className={`sd-due ${late ? 'late' : ''}`}>{o.due ? `${short ? '' : 'Due '}${dmy(o.due)}` : 'No due date'}{o.status !== 'cancelled' && o.status !== 'completed' && <button type="button" className="sd-pen" title="Change due date" aria-label={`Change due date of ${o.ref}`} onClick={() => setOn(true)}>✎</button>}</span>;
}

function OrderList({ list, nav, onChanged }) {
  return (
    <div className="sd-list">{list.map(o => (
      <div key={o.ref} className="sd-row">
        <button type="button" className="sd-open" onClick={() => openOrder(nav, o)}>
          <span className="sd-ref">{o.ref}</span>
          <span className="sd-who"><b>{o.customerName || 'Walk-in customer'}</b><small>{o.customerPhone || '-'} · {dmy(o.billDate)}{o.time ? ` · ${o.time}` : ''} · {o.garments} {o.garments === 1 ? 'garment' : 'garments'}</small></span>
        </button>
        <DueEdit o={o} onChanged={onChanged} />
        <span className={`sd-pill ${o.status}`}>{o.kind === 'advance' ? 'Advance' : STATUS_L[o.status]}</span>
        <b className="sd-amt">{inr(o.total)}</b>
      </div>))}</div>
  );
}

// Stitching Orders table: Order · Customer · Items · Due date · Total · Balance · Status (change it here) · WhatsApp / invoice / details.
function OrdersTable({ list, nav, onChanged }) {
  const [err, setErr] = useState();
  const setStatus = async (o, status) => { setErr(); try { await api(`/admin/pos/sales/${encodeURIComponent(o.ref)}/tailoring`, { method: 'PATCH', body: { status } }); onChanged?.() } catch (e) { setErr(e.message) } };
  return (
    <>{err && <p className="dpos-err" role="alert">{err}</p>}
      <div className="dpos-tw"><table className="sto"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Due date</th><th className="r">Total</th><th className="r">Balance</th><th>Status</th><th className="r">Actions</th></tr></thead>
        <tbody>{list.map(o => { const late = o.due && o.due < todayIst() && o.status === 'pending'; const fixed = o.kind === 'advance' || o.status === 'cancelled'; return (
          <tr key={o.ref}>
            <td><b>{o.ref}</b><div className="muted small">{dmy(o.billDate)}{o.time ? ` · ${o.time}` : ''}</div></td>
            <td><b>{o.customerName || 'Walk-in customer'}</b><div className="muted small">{o.customerPhone || '-'}</div></td>
            <td>{o.garmentNames || `${o.garments} garment${o.garments === 1 ? '' : 's'}`}</td>
            <td className={late ? 'sto-late' : ''}><DueEdit o={o} onChanged={onChanged} short /></td>
            <td className="r"><b>{inr(o.total)}</b></td>
            <td className="r">{o.balance > 0 ? <b>{inr(o.balance)}</b> : <span className="muted">Paid</span>}</td>
            <td>{fixed ? <span className={`sd-pill ${o.status}`}>{o.kind === 'advance' ? 'Advance' : STATUS_L[o.status]}</span>
              : <select className={`sto-st ${o.status}`} aria-label={`Status of ${o.ref}`} value={o.status} onChange={e => setStatus(o, e.target.value)}><option value="pending">Pending</option><option value="completed">Completed</option></select>}</td>
            <td className="r"><div className="dpos-rowact">
              {o.customerPhone && <a className="ra wa" title="Send on WhatsApp" aria-label={`Send ${o.ref} on WhatsApp`} href={waUrl(o.customerPhone, `Hello ${o.customerName || ''}, your stitching order ${o.ref}${o.due ? ` is due on ${dmy(o.due)}` : ''}.`)} target="_blank" rel="noopener noreferrer"><WaIcon /></a>}
              <button type="button" className="ra doc" title="Open invoice" aria-label={`Open ${o.ref}`} onClick={() => openOrder(nav, o)}><DocIcon /></button>
              <button type="button" className="ra eye" title="Details" aria-label={`Details of ${o.ref}`} onClick={() => openOrder(nav, o)}><EyeIcon /></button>
            </div></td></tr>) })}</tbody></table></div></>
  );
}

// Alert for orders that are late or promised for today: a banner on the stitching pages and, once a day, a pop-up message.
function DueAlert({ d }) {
  const { toast } = useApp(); const al = d?.alerts ?? { stitchDue: true, popup: true, banner: true, daysBefore: 2, dueSoonCount: 0 };
  const n = d ? d.overdue : 0, t = d ? d.dueToday : 0, k = al.dueSoonCount || 0;
  useEffect(() => { if (!d || !al.stitchDue || !al.popup || (!n && !t && !k)) return; try { if (sessionStorage.getItem('dhanya.dueAlert') === d.today) return; sessionStorage.setItem('dhanya.dueAlert', d.today) } catch { /* ignore */ } toast(`Stitching: ${n} overdue, ${t} due today${k ? `, ${k} due within ${al.daysBefore} days` : ''}`) }, [d?.today, n, t, k, al.popup, al.stitchDue]); // eslint-disable-line
  if (!d || !al.stitchDue || !al.banner || (!n && !t && !k)) return null;
  return <div className="sd-alert" role="alert"><b>⚠ Stitching due dates</b><span>{n > 0 && <em className="bad">{n} overdue</em>}{t > 0 && <em className="warn">{t} due today</em>}{k > 0 && <em className="soon">{k} due within {al.daysBefore} days</em>}</span><Link to="/admin/stitching/orders?due=overdue">View</Link></div>;
}

// ---------------- Stitching Dashboard ----------------
export function StitchDashboard() {
  const gate = useStaff(); const nav = useNavigate();
  const [per, setPer] = usePeriod('month'); const [d, setD] = useState(null); const [err, setErr] = useState();
  const [from, to] = periodRange(per);
  const [n, setN] = useState(0); const reload = () => setN(x => x + 1);
  useEffect(() => { if (!gate) api(`/admin/pos/stitching/overview?from=${from}&to=${to}`).then(x => { setD(x); setErr() }).catch(e => setErr(e.message)) }, [gate, from, to, n]);
  if (gate) return gate;
  const v = (f, dash = '…') => d ? f(d) : dash;
  return (
    <AdminShell title="Stitching Dashboard" sub="Stitching work at a glance: what is due, what is late and what it earned"
      actions={<><PeriodFilter value={per} onChange={setPer} /><Link className="dpos-btn" to="/admin/billing?new=stitching">+ New stitching order</Link></>}>
      {err && <p className="dpos-err" role="alert">{err}</p>}
      <DueAlert d={d} />
      <div className="sd-grid6 sd-line">
        <Card label="ACTIVE ORDERS" value={v(x => x.activeOrders)} sub="Pending work" />
        <Card label="DUE TODAY" value={v(x => x.dueToday)} sub="Promised today" tone={d?.dueToday ? 'amber' : ''} />
        <Card label="OVERDUE" value={v(x => x.overdue)} sub="Past promised date" tone={d?.overdue ? 'red' : ''} />
        <Card label="COMPLETED" value={v(x => x.completed)} sub="Finished orders" tone="green" />
        <Card label="REVENUE" value={v(x => inr(x.stitchingRevenue))} sub={v(x => `${x.bills} ${x.bills === 1 ? 'bill' : 'bills'} this period`)} />
        <Card label="GARMENTS" value={v(x => x.garments)} sub={v(x => `${inr(x.averageGarment)} avg each`)} />
        <Card label="OPEN ADVANCES" value={v(x => x.openAdvances)} sub="Work pending" />
        <Card label="TO COLLECT" value={v(x => inr(x.balanceToCollect))} sub="On advance orders" />
      </div>
      <div className="sd-two">
        <section className="sd-panel"><h2>Due in the next 7 days</h2>
          {!d ? <Empty>Loading…</Empty> : !d.dueSoon.length ? <Empty>Nothing is due in the next 7 days.</Empty> : <OrderList list={d.dueSoon} nav={nav} onChanged={reload} />}</section>
        <section className="sd-panel"><h2>Overdue</h2>
          {!d ? <Empty>Loading…</Empty> : !d.overdueList.length ? <Empty>No overdue orders. 🎉</Empty> : <OrderList list={d.overdueList} nav={nav} onChanged={reload} />}</section>
      </div>
      <section className="sd-panel"><div className="sd-ph"><h2>Recent stitching orders</h2><span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}><ExportCsv name="recent-stitching-orders" header={['Order', 'Customer', 'Status', 'Due']} rows={(d?.recent || []).map(o => [o.ref, o.customer || o.name || '', o.status || '', o.due || o.dueDate || ''])} /><Link className="sd-va" to="/admin/stitching/orders">View all →</Link></span></div>
        {!d ? <Empty>Loading…</Empty> : !d.recent.length ? <Empty>No stitching orders yet. Add a service in Billing and take its measurements.</Empty> : <OrderList list={d.recent} nav={nav} onChanged={reload} />}</section>
    </AdminShell>
  );
}

// ---------------- Stitching Orders ----------------
const TILES = [['all', 'ALL ORDERS', ''], ['pending', 'PENDING', 'amber'], ['completed', 'COMPLETED', 'green'], ['cancelled', 'CANCELLED', 'red']];
export function StitchOrders() {
  const gate = useStaff(); const nav = useNavigate();
  const [per, setPer] = usePeriod('all'); const [sp] = useSearchParams(); const [f, setF] = useState({ q: '', name: '', phone: '', garment: '', due: sp.get('due') || 'all', dueFrom: '', dueTo: '', kind: 'all', gst: 'all', sort: 'new' }); const [status, setStatus] = useState('all'); const [n, setN] = useState(0); const [ov, setOv] = useState(null);
  const [d, setD] = useState(null); const [err, setErr] = useState(); const [from, to] = periodRange(per);
  useEffect(() => {
    if (gate) return;
    const t = setTimeout(() => api(`/admin/pos/stitching/orders?from=${from}&to=${to}&status=${status}&q=${encodeURIComponent(f.q)}&name=${encodeURIComponent(f.name)}&phone=${encodeURIComponent(f.phone)}&garment=${encodeURIComponent(f.garment)}&due=${f.due}&kind=${f.kind}&gst=${f.gst}&sort=${f.sort}${f.dueFrom ? `&dueFrom=${f.dueFrom}` : ''}${f.dueTo ? `&dueTo=${f.dueTo}` : ''}`).then(x => { setD(x); setErr() }).catch(e => setErr(e.message)), 200);
    return () => clearTimeout(t);
  }, [gate, from, to, status, f, n]);
  useEffect(() => { if (!gate) api('/admin/pos/stitching/overview').then(setOv).catch(() => {}) }, [gate, n]);
  if (gate) return gate;
  const rows = (d?.orders || []).map(o => [o.ref, o.customerName, o.customerPhone, dmy(o.billDate), o.time || '', o.due ? dmy(o.due) : '', STATUS_L[o.status], o.garmentNames || '', o.garments, (o.total / 100).toFixed(2)]);
  return (
    <AdminShell title="Stitching Orders" sub="Every bill with stitching and every open advance order, with due dates and status"
      actions={<><PeriodFilter value={per} onChange={setPer} /><ExportCsv name="stitching-orders" header={['Order', 'Customer', 'Phone', 'Date', 'Time', 'Due', 'Status', 'Items', 'Garments', 'Total']} rows={rows} /></>}>
      {err && <p className="dpos-err" role="alert">{err}</p>}
      <DueAlert d={ov} />
      <div className="sd-tiles">{TILES.map(([k, l, tone]) => (
        <button key={k} type="button" className={`sd-tile ${tone} ${status === k ? 'on' : ''}`} aria-pressed={status === k} onClick={() => setStatus(k)}><span>{l}</span><b>{d ? d.counts[k] : '…'}</b></button>))}</div>
      <section className="sd-filters">
        <label>Search order ID<input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} placeholder="e.g. INV-2026-…" /></label>
        <label>Customer name<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Search name…" /></label>
        <label>Customer phone<input inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="Search phone…" /></label>
        <label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
        <label>Due<select value={f.due} onChange={e => setF({ ...f, due: e.target.value })}><option value="all">Any due date</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="week">Next 7 days</option><option value="none">No due date</option></select></label>
        <label>Due from<input type="date" value={f.dueFrom} onChange={e => setF({ ...f, dueFrom: e.target.value })} /></label>
        <label>Due to<input type="date" value={f.dueTo} onChange={e => setF({ ...f, dueTo: e.target.value })} /></label>
        <label>Garment<input value={f.garment} onChange={e => setF({ ...f, garment: e.target.value })} placeholder="e.g. blouse" /></label>
        <label>Type<select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}><option value="all">Bills + advances</option><option value="bill">Bills</option><option value="advance">Advance orders</option></select></label>
        <label>Bill type<select value={f.gst} onChange={e => setF({ ...f, gst: e.target.value })}><option value="all">GST + non-GST</option><option value="gst">GST invoices</option><option value="nongst">Non-GST bills</option></select></label>
        <label>Sort<select value={f.sort} onChange={e => setF({ ...f, sort: e.target.value })}><option value="new">Newest first</option><option value="old">Oldest first</option><option value="due">Due date (soonest)</option></select></label>
        <button type="button" className="dpos-btn ghost sm sd-reset" onClick={() => { setF({ q: '', name: '', phone: '', garment: '', due: 'all', dueFrom: '', dueTo: '', kind: 'all', gst: 'all', sort: 'new' }); setStatus('all') }}>Reset filters</button>
      </section>
      <section className="sd-panel">{!d ? <Empty>Loading…</Empty> : !d.orders.length ? <Empty>No stitching orders here. Add a service in Billing and take its measurements.</Empty> : <OrdersTable list={d.orders} nav={nav} onChanged={() => setN(x => x + 1)} />}</section>
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
  const rows = [['Summary', 'GST invoices', d?.gstBills ?? '', ((d?.gstRevenue || 0) / 100).toFixed(2)], ['Summary', 'Non-GST bills', d?.nonGstBills ?? '', ((d?.nonGstRevenue || 0) / 100).toFixed(2)], ...(d?.byGarment || []).map(g => ['Garment', g.name, g.qty, (g.revenue / 100).toFixed(2)]), ...(d?.byDay || []).map(x => ['Day', dmy(x.day), '', (x.amount / 100).toFixed(2)])];
  return (
    <AdminShell title="Stitching Reports" sub="Stitching revenue by garment and by day"
      actions={<><PeriodFilter value={per} onChange={setPer} /><ExportCsv name="stitching-report" header={['Type', 'Name', 'Garments', 'Revenue']} rows={rows} /></>}>
      {err && <p className="dpos-err" role="alert">{err}</p>}
      <div className="sd-grid6 five sr-kpis">
        <Card label="STITCHING REVENUE" value={v(x => inr(x.stitchingRevenue))} sub="Stitching lines on completed bills" tone="green" />
        <Card label="GST INVOICES" value={v(x => inr(x.gstRevenue))} sub={v(x => `${x.gstBills} ${x.gstBills === 1 ? 'bill' : 'bills'}`)} />
        <Card label="NON-GST BILLS" value={v(x => inr(x.nonGstRevenue))} sub={v(x => `${x.nonGstBills} ${x.nonGstBills === 1 ? 'bill' : 'bills'}`)} />
        <Card label="GARMENTS" value={v(x => x.garments)} sub={v(x => `${inr(x.averageGarment)} average each`)} />
        <Card label="PENDING VALUE" value={v(x => inr(x.pendingValue))} sub={v(x => `${x.pendingOrders} pending orders`)} />
      </div>
      <div className="sr-grid">
        <section className="sd-panel"><h2>Revenue by garment</h2>
          {!d ? <Empty>Loading…</Empty> : !d.byGarment.length ? <Empty>No stitching sales in this period.</Empty> : <ul className="sd-bars">{d.byGarment.map(g => <li key={g.name}><span>{g.name} <small>×{g.qty}</small></span><i><u style={{ width: `${Math.max(4, g.revenue / maxG * 100)}%` }} /></i><b>{inr(g.revenue)}</b></li>)}</ul>}</section>
        <section className="sd-panel"><h2>Orders by status</h2>
          {['pending', 'completed', 'cancelled'].map(k => <div className="sd-st" key={k}><b>{STATUS_L[k]}</b><span>{v(x => x.byStatus[k])}</span></div>)}
          <p className="sd-foot">{v(x => `${x.overdue} overdue · ${x.dueToday} due today · ${inr(x.balanceToCollect)} still to collect on ${x.openAdvances} open advance orders.`)}</p></section>
        <section className="sd-panel"><h2>Stitching revenue by day</h2>
        {!d ? <Empty>Loading…</Empty> : !d.byDay.length ? <Empty>No stitching sales in this period.</Empty> : <ul className="sd-bars">{d.byDay.map(x => <li key={x.day}><span>{dmy(x.day)}</span><i><u style={{ width: `${Math.max(4, x.amount / maxD * 100)}%` }} /></i><b>{inr(x.amount)}</b></li>)}</ul>}</section>
      </div>

    </AdminShell>
  );
}
