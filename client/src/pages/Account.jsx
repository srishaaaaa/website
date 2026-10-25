import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/App';
import { api } from '../lib/api';
import { inr } from '../lib/format';

const when = d => new Date(d).toLocaleDateString('en-IN');
const TABS = [['profile', 'Profile'], ['addresses', 'Addresses'], ['orders', 'Orders'], ['security', 'Security']];
const BLANK_ADDR = { label: 'Home', name: '', phone: '', line1: '', line2: '', city: '', state: '', pin: '', isDefault: false };

function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label> }

function ProfileTab({ data, onSaved }) {
  const { signIn, toast } = useApp();
  const p = data.profile;
  const [f, setF] = useState({ name: p.name || '', phone: p.phone || '', birthday: p.birthday || '', gender: p.gender || '' });
  const [err, setErr] = useState(); const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault(); setErr(); setBusy(true);
    try {
      const d = await api('/auth/profile', { method: 'PATCH', body: { name: f.name, phone: f.phone, birthday: f.birthday || null, gender: f.gender || null } });
      signIn(d.user); onSaved(d); toast('Profile saved.');
    } catch (x) { setErr(x.message === 'Validation failed' ? 'Please check your name, phone number and birthday.' : x.message) }
    setBusy(false);
  }
  return (
    <form className="acc-form" onSubmit={save} noValidate>
      <div className="acc-card acc-id">
        <span className="acc-avatar" aria-hidden="true">{(p.name || p.email).trim().charAt(0).toUpperCase()}</span>
        <div><strong>{p.name || 'Your name'}</strong><p className="muted small">{p.email}</p><p className="muted small">Member since {when(p.memberSince)}{p.hasGoogle ? ' · Signed in with Google' : ''}</p></div>
      </div>
      <Field label="Full name"><input required autoComplete="name" maxLength={80} value={f.name} onChange={set('name')} /></Field>
      <Field label="Email"><input value={p.email} readOnly aria-readonly="true" className="ro" /></Field>
      <Field label="Phone"><input type="tel" autoComplete="tel" inputMode="tel" placeholder="+91 98765 43210" value={f.phone} onChange={set('phone')} /></Field>
      <div className="acc-two">
        <Field label="Birthday"><input type="date" autoComplete="bday" max={new Date().toISOString().slice(0, 10)} value={f.birthday} onChange={set('birthday')} /></Field>
        <Field label="Gender"><select value={f.gender} onChange={set('gender')}><option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></Field>
      </div>
      {err && <p role="alert" className="err">{err}</p>}
      <button className="btn dark" disabled={busy}>{busy ? 'SAVING…' : 'SAVE CHANGES'}</button>
    </form>
  );
}

function AddressForm({ initial, onCancel, onSaved }) {
  const [f, setF] = useState({ ...BLANK_ADDR, ...initial }); const [err, setErr] = useState(); const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault(); setErr(); setBusy(true);
    const { id, ...body } = f;
    try { onSaved(await api(id ? `/auth/addresses/${id}` : '/auth/addresses', { method: id ? 'PATCH' : 'POST', body })) }
    catch (x) { setErr(x.message === 'Validation failed' ? 'Please check every field. The PIN code must be 6 digits.' : x.message); setBusy(false) }
  }
  return (
    <form className="acc-card acc-form" onSubmit={save} noValidate>
      <h3 className="serif">{f.id ? 'Edit address' : 'New address'}</h3>
      <div className="acc-two">
        <Field label="Label"><input maxLength={30} placeholder="Home, Work…" value={f.label} onChange={set('label')} /></Field>
        <Field label="Full name"><input required autoComplete="name" value={f.name} onChange={set('name')} /></Field>
      </div>
      <Field label="Phone"><input required type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} /></Field>
      <Field label="Address"><input required autoComplete="address-line1" value={f.line1} onChange={set('line1')} /></Field>
      <Field label="Apartment, landmark (optional)"><input autoComplete="address-line2" value={f.line2} onChange={set('line2')} /></Field>
      <div className="acc-two">
        <Field label="City"><input required autoComplete="address-level2" value={f.city} onChange={set('city')} /></Field>
        <Field label="State"><input required autoComplete="address-level1" value={f.state} onChange={set('state')} /></Field>
      </div>
      <Field label="PIN code"><input required inputMode="numeric" maxLength={6} autoComplete="postal-code" value={f.pin} onChange={set('pin')} /></Field>
      <label className="acc-check"><input type="checkbox" checked={f.isDefault} onChange={e => setF({ ...f, isDefault: e.target.checked })} /> Use as my default address</label>
      {err && <p role="alert" className="err">{err}</p>}
      <div className="acc-actions"><button className="btn dark" disabled={busy}>{busy ? 'SAVING…' : 'SAVE ADDRESS'}</button><button type="button" className="link-u" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

function AddressesTab({ data, onSaved }) {
  const { toast } = useApp();
  const [editing, setEditing] = useState(null); // null | {} (new) | address
  const [err, setErr] = useState();
  const act = async (fn, msg) => { setErr(); try { onSaved(await fn()); msg && toast(msg) } catch (x) { setErr(x.message) } };
  if (editing) return <AddressForm initial={editing.id ? editing : { name: data.profile.name, phone: data.profile.phone }} onCancel={() => setEditing(null)} onSaved={d => { onSaved(d); setEditing(null); toast('Address saved.') }} />;
  return (
    <div>
      {err && <p role="alert" className="err">{err}</p>}
      {data.addresses.length === 0 && <div className="empty"><p className="serif big">No saved addresses.</p><p className="muted">Save one here and checkout becomes a single tap.</p></div>}
      <ul className="acc-addrs">
        {data.addresses.map(a => (
          <li key={a.id} className="acc-card">
            <p className="eyebrow">{a.label}{a.isDefault && <span className="acc-badge">DEFAULT</span>}</p>
            <p><strong>{a.name}</strong><br />{a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />{a.city}, {a.state} {a.pin}<br />{a.phone}</p>
            <div className="acc-actions">
              <button className="link-u" onClick={() => setEditing(a)}>Edit</button>
              {!a.isDefault && <button className="link-u" onClick={() => act(() => api(`/auth/addresses/${a.id}/default`, { method: 'POST' }), 'Default address updated.')}>Make default</button>}
              <button className="link-u" onClick={() => window.confirm('Remove this address?') && act(() => api(`/auth/addresses/${a.id}`, { method: 'DELETE' }), 'Address removed.')}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
      {data.addresses.length < 10 && <button className="btn dark" onClick={() => setEditing({})}>ADD A NEW ADDRESS</button>}
    </div>
  );
}

function OrdersTab() {
  const [orders, setOrders] = useState(null); const [err, setErr] = useState();
  useEffect(() => { api('/orders').then(setOrders).catch(e => setErr(e.message)) }, []);
  return (
    <div>
      {err && <p role="alert" className="err">{err}</p>}
      {!orders && !err && <p className="muted">Loading…</p>}
      {orders?.length === 0 && <div className="empty"><p className="serif big">No orders yet.</p><Link className="btn dark" to="/shop">EXPLORE THE COLLECTION</Link></div>}
      {orders?.length > 0 && (
        <div className="acc-scroll"><table className="tbl"><thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Payment</th><th className="r">Total</th></tr></thead>
          <tbody>{orders.map(o => <tr key={o.order_number}><td>{o.order_number}</td><td>{when(o.created_at)}</td><td>{o.status}</td><td>{o.payment_status}</td><td className="r">{inr(o.total)}</td></tr>)}</tbody></table></div>
      )}
    </div>
  );
}

function SecurityTab({ data, onSaved }) {
  const { toast } = useApp();
  const has = data.profile.hasPassword;
  const [f, setF] = useState({ current: '', password: '', again: '' }); const [err, setErr] = useState(); const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault(); setErr();
    if (f.password.length < 8) return setErr('Use at least 8 characters.');
    if (f.password !== f.again) return setErr('The two new passwords do not match.');
    setBusy(true);
    try { await api('/auth/password', { method: 'POST', body: { current: f.current || undefined, password: f.password } }); setF({ current: '', password: '', again: '' }); onSaved({ ...data, profile: { ...data.profile, hasPassword: true } }); toast(has ? 'Password changed.' : 'Password set.') }
    catch (x) { setErr(x.message === 'Validation failed' ? 'Use at least 8 characters.' : x.message) }
    setBusy(false);
  }
  return (
    <form className="acc-form" onSubmit={save} noValidate>
      <h3 className="serif">{has ? 'Change password' : 'Set a password'}</h3>
      {!has && <p className="muted small">You signed in with Google. A password lets you also sign in with your email.</p>}
      {has && <Field label="Current password"><input type="password" autoComplete="current-password" value={f.current} onChange={e => setF({ ...f, current: e.target.value })} /></Field>}
      <Field label="New password"><input type="password" autoComplete="new-password" minLength={8} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></Field>
      <Field label="Repeat new password"><input type="password" autoComplete="new-password" value={f.again} onChange={e => setF({ ...f, again: e.target.value })} /></Field>
      {err && <p role="alert" className="err">{err}</p>}
      <button className="btn dark" disabled={busy}>{busy ? 'SAVING…' : has ? 'CHANGE PASSWORD' : 'SET PASSWORD'}</button>
    </form>
  );
}

export function Account() {
  const { user, authReady, signOut } = useApp();
  const [sp, setSp] = useSearchParams();
  const tab = TABS.some(([k]) => k === sp.get('tab')) ? sp.get('tab') : 'profile';
  const [data, setData] = useState(null); const [err, setErr] = useState();
  useEffect(() => { if (user) api('/auth/profile').then(setData).catch(e => setErr(e.message)) }, [user?.id]); // eslint-disable-line
  if (!authReady) return <div className="page-pad"><p className="muted">Loading…</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="account">
      <p className="eyebrow">ACCOUNT</p>
      <h1 className="serif">{user.name ? `Hello, ${user.name.split(' ')[0]}` : 'Your account'}</h1>
      {user.role !== 'customer' && <p><Link className="link-u" to="/admin">Open the staff dashboard</Link></p>}
      <nav className="acc-tabs" aria-label="Account sections">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => setSp(k === 'profile' ? {} : { tab: k })}>{l}</button>)}
      </nav>
      {err && <p role="alert" className="err">{err}</p>}
      {!data && !err && <p className="muted">Loading…</p>}
      {data && tab === 'profile' && <ProfileTab data={data} onSaved={setData} />}
      {data && tab === 'addresses' && <AddressesTab data={data} onSaved={setData} />}
      {tab === 'orders' && <OrdersTab />}
      {data && tab === 'security' && <SecurityTab data={data} onSaved={setData} />}
      <button className="btn dark acc-out" onClick={signOut}>SIGN OUT</button>
    </div>
  );
}
