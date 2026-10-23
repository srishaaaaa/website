import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useApp } from '../context/App';
import { api } from '../lib/api';
import { inr } from '../lib/format';

const when = d => new Date(d).toLocaleDateString('en-IN');

export function Account() {
  const { user, authReady, signOut } = useApp();
  const [orders, setOrders] = useState(null); const [err, setErr] = useState();
  useEffect(() => {
    if (!user) return;
    api('/orders').then(setOrders).catch(e => setErr(e.message));
  }, [user]);
  if (!authReady) return <div className="page-pad"><p className="muted">Loading…</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="account">
      <p className="eyebrow">ACCOUNT</p>
      <h1 className="serif">Your orders</h1>
      <p className="muted">{user.email}</p>
      {user.role !== 'customer' && <p><Link className="link-u" to="/admin">Open the staff dashboard</Link></p>}
      {err && <p role="alert" className="err">{err}</p>}
      {!orders && !err && <p className="muted">Loading…</p>}
      {orders?.length === 0 && <div className="empty"><p className="serif big">No orders yet.</p><Link className="btn dark" to="/shop">EXPLORE THE COLLECTION</Link></div>}
      {orders?.length > 0 && (
        <table className="tbl"><thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Payment</th><th className="r">Total</th></tr></thead>
          <tbody>{orders.map(o => <tr key={o.order_number}><td>{o.order_number}</td><td>{when(o.created_at)}</td><td>{o.status}</td><td>{o.payment_status}</td><td className="r">{inr(o.total)}</td></tr>)}</tbody></table>
      )}
      <button className="btn dark" onClick={signOut}>SIGN OUT</button>
    </div>
  );
}

const STATUSES = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];

// Functional staff view; the full dashboard is Phase 5. Authorization is enforced by the API, not this page.
export function Admin() {
  const { user, authReady } = useApp();
  const [s, setS] = useState(); const [o, setO] = useState([]); const [rv, setRv] = useState([]); const [e, setE] = useState();
  useEffect(() => {
    if (!user) return;
    Promise.all([api('/admin/stats'), api('/admin/orders'), api('/admin/reviews')]).then(([a, b, c]) => { setS(a); setO(b); setRv(c) }).catch(x => setE(x.message));
  }, [user]);
  if (!authReady) return <div className="page-pad"><p className="muted">Loading…</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (e) return <div className="empty page-pad"><p className="serif big">{e}</p><Link className="btn dark" to="/login">Sign in as staff</Link></div>;
  const moderate = async (id, status) => { try { await api(`/admin/reviews/${id}`, { method: 'PATCH', body: { status } }); setRv(l => l.map(r => r.id === id ? { ...r, status } : r)) } catch (x) { setE(x.message) } };
  return (
    <div className="account">
      <p className="eyebrow">ADMIN</p><h1 className="serif">Orders</h1>
      {s && <p>Paid orders: {s.paidOrders} · Gross: {inr(s.gross)} · Average: {inr(s.averageOrder)}</p>}
      <table className="tbl"><thead><tr><th>Order</th><th>Email</th><th className="r">Total</th><th>Payment</th><th>Status</th></tr></thead>
        <tbody>{o.map(x => (
          <tr key={x.id}><td>{x.order_number}</td><td>{x.email}</td><td className="r">{inr(x.total)}</td><td>{x.payment_status}</td>
            <td><select value={x.status} aria-label={`Status for ${x.order_number}`} onChange={async ev => { try { await api('/admin/orders/' + x.order_number, { method: 'PATCH', body: { status: ev.target.value } }); setO(list => list.map(y => y.id === x.id ? { ...y, status: ev.target.value } : y)) } catch (err) { setE(err.message) } }}>{STATUSES.map(v => <option key={v}>{v}</option>)}</select></td></tr>))}</tbody></table>
      <h2 className="serif" style={{ fontSize: 36, margin: '40px 0 0' }}>Review moderation</h2>
      {!rv.length && <p className="muted">No reviews submitted yet.</p>}
      {rv.length > 0 && <table className="tbl"><thead><tr><th>Product</th><th>Rating</th><th>Review</th><th>Status</th></tr></thead>
        <tbody>{rv.map(r => (
          <tr key={r.id}><td>{r.product_name}</td><td>{'★'.repeat(r.rating)}</td><td>{r.body}<br /><span className="muted small">{r.email}</span></td>
            <td><select value={r.status} aria-label={`Status for review ${r.id}`} onChange={ev => moderate(r.id, ev.target.value)}>{['pending', 'published', 'rejected'].map(v => <option key={v}>{v}</option>)}</select></td></tr>))}</tbody></table>}
    </div>
  );
}
