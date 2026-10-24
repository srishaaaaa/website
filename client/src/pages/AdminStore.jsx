import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useApp } from '../context/App';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import AdminShell from '../components/AdminShell';
import { Stars } from '../components/CustomerReviews';

// Online-store admin panels (orders, reviews, users, store settings) in the shared admin layout. Authorization is enforced by the API.
const STATUSES = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
const when = d => new Date(d).toLocaleDateString('en-IN');

function useGate() {
  const { user, authReady } = useApp();
  if (!authReady) return <div className="page-pad"><p className="muted">Loading…</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!['owner', 'admin'].includes(user.role)) return <div className="empty page-pad"><p className="serif big">Staff access only.</p><Link className="btn dark" to="/">RETURN HOME</Link></div>;
  return null;
}
const Card = ({ children }) => <section className="dpos-card">{children}</section>;

export function AdminOrders() {
  const gate = useGate(); const [s, setS] = useState(); const [o, setO] = useState(null); const [e, setE] = useState();
  useEffect(() => { if (!gate) Promise.all([api('/admin/stats'), api('/admin/orders')]).then(([a, b]) => { setS(a); setO(b) }).catch(x => setE(x.message)) }, [gate]);
  if (gate) return gate;
  return (
    <AdminShell title="Online orders" sub="Orders placed on the website. In-store bills are under Retail billing.">
      {e && <p role="alert" className="dpos-err">{e}</p>}
      <div className="dpos-kpis">
        <div className="dpos-kpi"><span>Paid orders</span><b>{s ? s.paidOrders : '…'}</b></div>
        <div className="dpos-kpi"><span>Gross sales</span><b>{s ? inr(s.gross) : '…'}</b></div>
        <div className="dpos-kpi"><span>Average order</span><b>{s ? inr(s.averageOrder) : '…'}</b></div>
      </div>
      <Card>
        {!o ? <p className="dpos-empty">Loading…</p> : !o.length ? <p className="dpos-empty">No online orders yet.</p> : (
          <div className="dpos-tw"><table><thead><tr><th>Order</th><th>Email</th><th className="r">Total</th><th>Payment</th><th>Status</th></tr></thead>
            <tbody>{o.map(x => (
              <tr key={x.id}><td><b>{x.order_number}</b></td><td>{x.email}</td><td className="r">{inr(x.total)}</td><td><span className={`dpos-pill ${x.payment_status === 'paid' ? 'ok' : ''}`}>{x.payment_status}</span></td>
                <td><select value={x.status} aria-label={`Status for ${x.order_number}`} onChange={async ev => { try { await api('/admin/orders/' + x.order_number, { method: 'PATCH', body: { status: ev.target.value } }); setO(list => list.map(y => y.id === x.id ? { ...y, status: ev.target.value } : y)) } catch (err) { setE(err.message) } }}>{STATUSES.map(v => <option key={v}>{v}</option>)}</select></td></tr>))}</tbody></table></div>)}
      </Card>
    </AdminShell>
  );
}

export function AdminReviews() {
  const gate = useGate(); const [rv, setRv] = useState(null); const [f, setF] = useState('pending'); const [e, setE] = useState();
  useEffect(() => { if (!gate) api('/admin/reviews').then(setRv).catch(x => setE(x.message)) }, [gate]);
  const shown = useMemo(() => (rv || []).filter(r => f === 'all' || (f === 'pending' ? r.status === 'pending' : r.status === 'published')), [rv, f]);
  if (gate) return gate;
  const moderate = async (id, status) => { try { await api(`/admin/reviews/${id}`, { method: 'PATCH', body: { status } }); setRv(l => l.map(r => r.id === id ? { ...r, status } : r)) } catch (x) { setE(x.message) } };
  const remove = async id => { if (!confirm('Delete this review permanently?')) return; try { await api(`/admin/reviews/${id}`, { method: 'DELETE' }); setRv(l => l.filter(r => r.id !== id)) } catch (x) { setE(x.message) } };
  return (
    <AdminShell title="Customer Reviews" sub="Approve, hide or delete a review before it appears on the storefront."
      actions={<div className="dpos-seg" role="radiogroup" aria-label="Filter">{[['pending', 'Pending'], ['approved', 'Approved'], ['all', 'All']].map(([v, l]) => <button key={v} role="radio" aria-checked={f === v} className={f === v ? 'on' : ''} onClick={() => setF(v)}>{l}</button>)}</div>}>
      {e && <p role="alert" className="dpos-err">{e}</p>}
      <Card>
        {!rv ? <p className="dpos-empty">Loading…</p> : !shown.length ? <p className="dpos-empty">No reviews here yet.</p> : shown.map(r => (
          <div key={r.id} className="dpos-line" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
            <div><div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><span style={{ color: '#c58a14' }}><Stars n={r.rating} size={14} /></span><b>{r.product_name}</b>
              <span className={`dpos-pill ${r.status === 'published' ? 'ok' : r.status === 'rejected' ? 'bad' : 'warn'}`}>{r.status === 'published' ? 'Approved' : r.status === 'rejected' ? 'Hidden' : 'Pending'}</span>{r.is_demo && <span className="dpos-pill">Sample</span>}</div>
              <p style={{ margin: '6px 0 2px' }}>{r.body}</p><span className="muted small">{r.email}</span></div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {r.status !== 'published' && <button className="dpos-btn sm" onClick={() => moderate(r.id, 'published')}>Approve</button>}
              {r.status !== 'rejected' && <button className="dpos-btn ghost sm" onClick={() => moderate(r.id, 'rejected')}>Hide</button>}
              <button className="dpos-btn danger sm" onClick={() => remove(r.id)}>Delete</button></div>
          </div>))}
      </Card>
    </AdminShell>
  );
}

export function AdminUsers() {
  const gate = useGate(); const { user, toast } = useApp(); const [list, setList] = useState(null); const [q, setQ] = useState(''); const [e, setE] = useState();
  useEffect(() => { if (!gate) api('/admin/users').then(setList).catch(x => setE(x.message)) }, [gate]);
  if (gate) return gate;
  const isOwner = user.role === 'owner';
  const shown = (list || []).filter(u => !q.trim() || `${u.name} ${u.email}`.toLowerCase().includes(q.trim().toLowerCase()));
  const setRole = async (u, role) => { try { await api(`/admin/users/${u.id}/role`, { method: 'PATCH', body: { role } }); setList(l => l.map(x => x.id === u.id ? { ...x, role } : x)); toast(`${u.email} is now ${role}`) } catch (x) { setE(x.message) } };
  return (
    <AdminShell title="Users & Roles" sub="Staff with access to this admin. Cashiers can bill; admins manage the store; only the owner changes roles."
      actions={<input type="search" style={{ maxWidth: 280 }} value={q} onChange={ev => setQ(ev.target.value)} placeholder="Search users…" aria-label="Search users" />}>
      {e && <p role="alert" className="dpos-err">{e}</p>}
      <Card>
        {!list ? <p className="dpos-empty">Loading…</p> : !shown.length ? <p className="dpos-empty">No users found.</p> : (
          <div className="dpos-tw"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
            <tbody>{shown.map(u => (
              <tr key={u.id}><td><span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}><span className="dpos-av" style={{ width: 32, height: 32, fontSize: 13 }}>{(u.name || u.email)[0].toUpperCase()}</span><b>{u.name || '—'}</b></span></td><td>{u.email}</td>
                <td>{u.role === 'owner' || !isOwner || u.id === user.id ? <span className={`dpos-pill ${u.role === 'customer' ? '' : 'ok'}`}>{u.role}</span>
                  : <select aria-label={`Role for ${u.email}`} value={u.role} onChange={ev => setRole(u, ev.target.value)} style={{ maxWidth: 150 }}>{['customer', 'cashier', 'inventory', 'admin'].map(r => <option key={r}>{r}</option>)}</select>}</td><td>{when(u.created_at)}</td></tr>))}</tbody></table></div>)}
      </Card>
    </AdminShell>
  );
}

export function AdminSettings() {
  const gate = useGate();
  if (gate) return gate;
  return <AdminShell title="Store settings" sub="Boutique location, hours and Instagram shown on the homepage, footer and map."><Card><StoreSettingsForm /></Card></AdminShell>;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Store settings (boutique location, hours, Instagram): feeds the homepage map, footer and Instagram strip.
export function StoreSettingsForm() {
  const { loadSite, toast } = useApp();
  const [f, setF] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  useEffect(() => {
    api('/store').then(({ store, social, flags }) => setF({
      name: store.name, owner: store.owner || '', address: (store.address || []).join('\n'), lat: store.location?.lat ?? '', lng: store.location?.lng ?? '', mapsUrl: store.mapsUrl || '', phone: store.phone || '', email: store.email || '',
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
        name: f.name || 'DHANYA', owner: f.owner || null, address: lines.length ? lines : null, phone: f.phone || null, email: f.email || null, timeZone: f.timeZone,
        location: f.lat !== '' && f.lng !== '' ? { lat: Number(f.lat), lng: Number(f.lng) } : null, mapsUrl: f.mapsUrl || null,
        hours: f.label ? { label: f.label, open: f.open, close: f.close, days: f.days } : null } });
      await api('/admin/settings/social', { method: 'PUT', body: { instagram: { handle: f.igHandle || null, url: f.igUrl || null, posts: f.posts }, links: f.links } });
      await api('/admin/settings/flags', { method: 'PUT', body: { demoReviews: f.demo } });
      toast('Store settings saved.'); loadSite();
    } catch (x) { setErr(x.issues?.[0] ? `${x.issues[0].path}: ${x.issues[0].message}` : x.message) } finally { setBusy(false) }
  };
  return (
    <form onSubmit={save} className="settings-form">
      <p className="muted small">Shown on the homepage map, footer and Instagram strip. Leave the address empty to show the “location to be announced” placeholder.</p>
      <div className="two"><label className="field"><span>Boutique name</span><input value={f.name} onChange={set('name')} /></label><label className="field"><span>Owner / contact person</span><input value={f.owner} onChange={set('owner')} /></label></div>
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
