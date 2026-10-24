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
