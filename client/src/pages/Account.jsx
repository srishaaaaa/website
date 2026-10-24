import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useApp } from '../context/App';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import { AdminTabs } from './AdminMedia';

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
      <AdminTabs />
      {s && <p>Paid orders: {s.paidOrders} · Gross: {inr(s.gross)} · Average: {inr(s.averageOrder)}</p>}
      <table className="tbl"><thead><tr><th>Order</th><th>Email</th><th className="r">Total</th><th>Payment</th><th>Status</th></tr></thead>
        <tbody>{o.map(x => (
          <tr key={x.id}><td>{x.order_number}</td><td>{x.email}</td><td className="r">{inr(x.total)}</td><td>{x.payment_status}</td>
            <td><select value={x.status} aria-label={`Status for ${x.order_number}`} onChange={async ev => { try { await api('/admin/orders/' + x.order_number, { method: 'PATCH', body: { status: ev.target.value } }); setO(list => list.map(y => y.id === x.id ? { ...y, status: ev.target.value } : y)) } catch (err) { setE(err.message) } }}>{STATUSES.map(v => <option key={v}>{v}</option>)}</select></td></tr>))}</tbody></table>
      <StoreSettingsForm />
      <h2 className="serif" style={{ fontSize: 36, margin: '40px 0 0' }}>Review moderation</h2>
      {!rv.length && <p className="muted">No reviews submitted yet.</p>}
      {rv.length > 0 && <table className="tbl"><thead><tr><th>Product</th><th>Rating</th><th>Review</th><th>Status</th></tr></thead>
        <tbody>{rv.map(r => (
          <tr key={r.id}><td>{r.product_name}</td><td>{'★'.repeat(r.rating)}</td><td>{r.body}<br /><span className="muted small">{r.email}</span></td>
            <td><select value={r.status} aria-label={`Status for review ${r.id}`} onChange={ev => moderate(r.id, ev.target.value)}>{['pending', 'published', 'rejected'].map(v => <option key={v}>{v}</option>)}</select></td></tr>))}</tbody></table>}
    </div>
  );
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Store settings (boutique location, hours, Instagram): feeds the homepage map, footer and Instagram strip.
export function StoreSettingsForm() {
  const { loadSite, toast } = useApp();
  const [f, setF] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  useEffect(() => {
    api('/store').then(({ store, social, flags }) => setF({
      name: store.name, address: (store.address || []).join('\n'), lat: store.location?.lat ?? '', lng: store.location?.lng ?? '', mapsUrl: store.mapsUrl || '', phone: store.phone || '', email: store.email || '',
      label: store.hours?.label || '', open: store.hours?.open || '10:00', close: store.hours?.close || '20:00', days: store.hours?.days || [0, 1, 2, 3, 4, 5, 6],
      demo: !!flags?.demoReviews, igHandle: social.instagram.handle || '', igUrl: social.instagram.url || '', posts: social.instagram.posts, links: social.links, timeZone: store.timeZone,
    })).catch(() => {});
  }, []);
  if (!f) return null;
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const save = async e => {
    e.preventDefault(); setBusy(true); setErr();
    try {
      const lines = f.address.split('\n').map(s => s.trim()).filter(Boolean);
      await api('/admin/settings/store', { method: 'PUT', body: {
        name: f.name || 'DHANYA', address: lines.length ? lines : null, phone: f.phone || null, email: f.email || null, timeZone: f.timeZone,
        location: f.lat !== '' && f.lng !== '' ? { lat: Number(f.lat), lng: Number(f.lng) } : null, mapsUrl: f.mapsUrl || null,
        hours: f.label ? { label: f.label, open: f.open, close: f.close, days: f.days } : null } });
      await api('/admin/settings/social', { method: 'PUT', body: { instagram: { handle: f.igHandle || null, url: f.igUrl || null, posts: f.posts }, links: f.links } });
      await api('/admin/settings/flags', { method: 'PUT', body: { demoReviews: f.demo } });
      toast('Store settings saved.'); loadSite();
    } catch (x) { setErr(x.issues?.[0] ? `${x.issues[0].path}: ${x.issues[0].message}` : x.message) } finally { setBusy(false) }
  };
  return (
    <form onSubmit={save} className="settings-form">
      <h2 className="serif" style={{ fontSize: 36, margin: '40px 0 8px' }}>Store settings</h2>
      <p className="muted small">Shown on the homepage map, footer and Instagram strip. Leave the address empty to show the “location to be announced” placeholder.</p>
      <label className="field"><span>Boutique name</span><input value={f.name} onChange={set('name')} /></label>
      <label className="field"><span>Address (one line per row)</span><textarea rows="3" value={f.address} onChange={set('address')} /></label>
      <label className="field"><span>Google Maps link (optional)</span><input type="url" value={f.mapsUrl} onChange={set('mapsUrl')} placeholder="https://maps.app.goo.gl/…" /></label>
      <div className="two"><label className="field"><span>Latitude</span><input inputMode="decimal" value={f.lat} onChange={set('lat')} /></label><label className="field"><span>Longitude</span><input inputMode="decimal" value={f.lng} onChange={set('lng')} /></label></div>
      <div className="two"><label className="field"><span>Phone</span><input value={f.phone} onChange={set('phone')} /></label><label className="field"><span>Email</span><input type="email" value={f.email} onChange={set('email')} /></label></div>
      <label className="field"><span>Opening hours label (e.g. Mon – Sun · 10AM – 8PM)</span><input value={f.label} onChange={set('label')} /></label>
      <div className="two"><label className="field"><span>Opens</span><input type="time" value={f.open} onChange={set('open')} /></label><label className="field"><span>Closes</span><input type="time" value={f.close} onChange={set('close')} /></label></div>
      <fieldset className="days"><legend className="eyebrow">Open on</legend>{DAYS.map((d, i) => <label key={d} className="check"><input type="checkbox" checked={f.days.includes(i)} onChange={() => setF({ ...f, days: f.days.includes(i) ? f.days.filter(x => x !== i) : [...f.days, i].sort() })} /> {d}</label>)}</fieldset>
      <div className="two"><label className="field"><span>Instagram handle</span><input value={f.igHandle} onChange={set('igHandle')} placeholder="without @" /></label><label className="field"><span>Instagram URL</span><input type="url" value={f.igUrl} onChange={set('igUrl')} /></label></div>
      <label className="check"><input type="checkbox" checked={f.demo} onChange={e => setF({ ...f, demo: e.target.checked })} /> Show clearly-labelled sample reviews on the homepage (turn off once real reviews arrive)</label>
      {err && <p role="alert" className="err">{err}</p>}
      <button className="btn dark" disabled={busy}>{busy ? 'SAVING…' : 'SAVE SETTINGS'}</button>
    </form>
  );
}
