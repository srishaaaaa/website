import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../context/App';
import Modal from './Modal';

const GREYS = ['#0a0a0a', '#18181b', '#1c1917', '#1e293b', '#262626', '#292524', '#2a2423', '#334155', '#3b4256', '#404048', '#44403c', '#4a4540', '#475569', '#4b5563', '#52525b', '#5c564d', '#57534e', '#64748b', '#6b7280', '#78716c'];
const COLOURS = ['#330533', '#7f1d3f', '#9f1239', '#b91c1c', '#c2410c', '#a16207', '#15803d', '#047857', '#0f766e', '#0e7490', '#1d4ed8', '#4338ca', '#6d28d9', '#7e22ce', '#a21caf', '#be185d'];
export const DEFAULT_ACCENT = '#330533';

// One accent colour for the POS: buttons, totals, invoice headers. Saved with the other settings.
export function AccentPicker({ value, onChange }) {
  const cur = value || DEFAULT_ACCENT;
  const sw = c => <button key={c} type="button" className={`pset-sw ${cur.toLowerCase() === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} aria-pressed={cur.toLowerCase() === c} onClick={() => onChange(c)} />;
  return (
    <section className="dpos-card"><h2>Appearance</h2>
      <p className="sub" style={{ marginBottom: 12 }}>One accent colour drives the whole POS: buttons, totals and invoice headers.</p>
      <p className="pset-l">GREYS</p><div className="pset-sws">{GREYS.map(sw)}</div>
      <p className="pset-l">COLOURS</p><div className="pset-sws">{COLOURS.map(sw)}</div>
      <div className="pset-hex"><i style={{ background: cur }} />
        <input aria-label="Accent colour code" value={cur.toUpperCase()} maxLength={7} onChange={e => { const v = e.target.value.trim(); if (/^#[0-9a-fA-F]{0,6}$/.test(v) && v.length === 7) onChange(v.toLowerCase()) }} onBlur={e => e.target.value = cur.toUpperCase()} />
        <button type="button" className="link-u" onClick={() => onChange('')}>RESET</button></div>
      <div className="pset-prev" style={{ '--c': cur }}><div className="pset-prev-h"><b>CARD PREVIEW</b><span>Buttons, links, totals and invoice headers use this colour.</span></div>
        <div className="pset-prev-b"><span className="pset-prev-btn">BUTTON</span><b style={{ color: cur }}>Accent link</b><em>Total ₹1,250</em></div></div>
    </section>
  );
}

// Low-stock warning for this device. The choice is kept in this browser, so each counter can decide for itself.
const KEY = 'dhanya.pos.alerts';
export const readAlerts = () => { try { return { on: false, sound: false, level: 5, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { on: false, sound: false, level: 5 } } };
const beep = () => { try { const a = new (window.AudioContext || window.webkitAudioContext)(); const o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.type = 'sine'; o.frequency.value = 880; g.gain.setValueAtTime(.001, a.currentTime); g.gain.exponentialRampToValueAtTime(.3, a.currentTime + .02); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + .6); o.start(); o.stop(a.currentTime + .65) } catch { /* no audio available */ } };
const Toggle = ({ on, onChange, label, disabled }) => <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`dpos-switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;

export function StockAlertsCard() {
  const [a, setA] = useState(readAlerts);
  const set = p => setA(cur => { const n = { ...cur, ...p }; try { localStorage.setItem(KEY, JSON.stringify(n)) } catch { /* private mode */ } return n });
  return (
    <section className="dpos-card"><h2>Stock alerts</h2>
      <p className="sub" style={{ marginBottom: 12 }}>Choose how this device warns you when products run low or go out of stock.</p>
      <div className="pset-row"><div><b>Low-stock notification</b><p className="sub">Show a popup when items reach their low-stock alert level.</p></div><Toggle on={a.on} onChange={v => set({ on: v })} label="Low-stock notification" /></div>
      <div className={`pset-row ${a.on ? '' : 'off'}`}><div><b>Alert sound</b><p className="sub">Play a short sound with the popup.</p></div><Toggle on={a.sound} disabled={!a.on} onChange={v => set({ sound: v })} label="Alert sound" /></div>
      <label className="f">Low-stock level (units)<input inputMode="numeric" value={a.level} onChange={e => set({ level: Math.max(0, Math.min(999, Math.floor(+e.target.value.replace(/\D/g, '')) || 0)) })} /></label>
      <button type="button" className="dpos-btn ghost sm" onClick={beep}>TEST SOUND</button>
    </section>
  );
}

export function LowStockAlert() {
  const [items, setItems] = useState(null);
  useEffect(() => {
    const a = readAlerts(); if (!a.on) return;
    try { if (sessionStorage.getItem('dhanya.pos.alerted')) return } catch { /* ignore */ }
    api('/admin/pos/catalog?limit=300').then(r => {
      const low = r.filter(v => v.stock <= a.level).sort((x, y) => x.stock - y.stock);
      if (!low.length) return;
      try { sessionStorage.setItem('dhanya.pos.alerted', '1') } catch { /* ignore */ }
      setItems(low); if (a.sound) beep();
    }).catch(() => {});
  }, []);
  if (!items) return null;
  return (
    <Modal title="Low stock" sub={`${items.length} item${items.length > 1 ? 's' : ''} at or below your alert level`} onClose={() => setItems(null)}>
      <ul className="pset-low">{items.slice(0, 40).map(v => <li key={v.variantId}><span><b>{v.name}</b> <em>{[v.size, v.color !== 'Default' ? v.color : null].filter(Boolean).join(' · ')}</em></span><b className={v.stock < 1 ? 'out' : ''}>{v.stock < 1 ? 'Out of stock' : `${v.stock} left`}</b></li>)}</ul>
    </Modal>
  );
}

// Change your own sign-in password (the POS uses your normal account).
export function LoginPasswordCard() {
  const { toast } = useApp();
  const [f, setF] = useState({ current: '', password: '', again: '' }); const [show, setShow] = useState(false); const [err, setErr] = useState(); const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setErr();
    if (f.password.length < 8) return setErr('Use at least 8 characters.');
    if (f.password !== f.again) return setErr('The two new passwords do not match.');
    setBusy(true);
    try { await api('/auth/password', { method: 'POST', body: { current: f.current, password: f.password } }); setF({ current: '', password: '', again: '' }); toast('Password changed.') }
    catch (x) { setErr(x.message === 'Validation failed' ? 'Use at least 8 characters.' : x.message) } finally { setBusy(false) }
  };
  const t = show ? 'text' : 'password';
  return (
    <form className="dpos-card" onSubmit={submit}><h2>Login password <button type="button" className="link-u pset-show" onClick={() => setShow(v => !v)}>{show ? 'HIDE' : 'SHOW'}</button></h2>
      <p className="sub" style={{ marginBottom: 10 }}>Change the password you use to sign in. It needs your current password. Staff change their own from their account page.</p>
      <label className="f">Current password<input type={t} autoComplete="current-password" value={f.current} onChange={e => setF({ ...f, current: e.target.value })} /></label>
      <div className="dpos-grid"><label className="f">New password<input type={t} autoComplete="new-password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></label>
        <label className="f">Confirm new password<input type={t} autoComplete="new-password" value={f.again} onChange={e => setF({ ...f, again: e.target.value })} /></label></div>
      {err && <p className="dpos-err" role="alert">{err}</p>}
      <button className="dpos-btn" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
    </form>
  );
}

const ROLES = [['admin', 'Admin', 'Everything, including settings and reports'], ['cashier', 'Cashier', 'Billing, advance orders, order history, customers'], ['inventory', 'Stock keeper', 'Inventory and stock adjustments']];

// Staff accounts for the POS. Only the owner can add staff or change a role.
export function StaffAccessCard() {
  const { user, toast } = useApp();
  const owner = user?.role === 'owner';
  const [rows, setRows] = useState(null); const [err, setErr] = useState(); const [nw, setNw] = useState({ name: '', email: '', password: '', role: 'cashier' }); const [busy, setBusy] = useState(false);
  const load = useCallback(() => api('/admin/users').then(r => setRows(r.filter(u => u.role !== 'customer'))).catch(e => setErr(e.message)), []);
  useEffect(() => { load() }, [load]);
  const setRole = async (u, role) => { setErr(); try { await api(`/admin/users/${u.id}/role`, { method: 'PATCH', body: { role } }); toast('Access updated.'); load() } catch (e) { setErr(e.message) } };
  const add = async e => {
    e.preventDefault(); setErr(); setBusy(true);
    try { await api('/admin/users', { method: 'POST', body: nw }); setNw({ name: '', email: '', password: '', role: 'cashier' }); toast('Staff member added.'); load() }
    catch (x) { setErr(x.issues?.[0]?.message || (x.message === 'Validation failed' ? 'Enter a name, a valid email and a password of 8+ characters.' : x.message)) } finally { setBusy(false) }
  };
  return (
    <section className="dpos-card"><h2>Staff access</h2>
      <p className="sub" style={{ marginBottom: 12 }}>Each staff member signs in with their own email and password, and sees only what their role allows. {ROLES.map(r => `${r[1]}: ${r[2].toLowerCase()}.`).join(' ')}</p>
      {err && <p className="dpos-err" role="alert">{err}</p>}
      {!rows ? <p className="dpos-empty">Loading…</p> : (
        <ul className="pset-staff">{rows.map(u => (
          <li key={u.id}><span><b>{u.name || u.email}</b><em>{u.email}</em></span>
            {u.role === 'owner' || !owner || u.id === user.id ? <span className="dpos-pill">{u.role === 'owner' ? 'Owner' : (ROLES.find(r => r[0] === u.role)?.[1] || u.role)}</span>
              : <select aria-label={`Role for ${u.email}`} value={u.role} onChange={e => setRole(u, e.target.value)}>{ROLES.map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}</select>}</li>))}</ul>)}
      {owner && (
        <form onSubmit={add} className="pset-add"><p className="pset-l">ADD A STAFF MEMBER</p>
          <div className="dpos-grid"><input aria-label="Name" placeholder="Name" value={nw.name} onChange={e => setNw({ ...nw, name: e.target.value })} /><input aria-label="Email" type="email" placeholder="Email" required value={nw.email} onChange={e => setNw({ ...nw, email: e.target.value })} /></div>
          <div className="dpos-grid"><input aria-label="Password" type="password" placeholder="Password (8+ characters)" required minLength={8} value={nw.password} onChange={e => setNw({ ...nw, password: e.target.value })} />
            <select aria-label="Role" value={nw.role} onChange={e => setNw({ ...nw, role: e.target.value })}>{ROLES.map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}</select></div>
          <button className="dpos-btn" disabled={busy}>{busy ? 'Adding…' : 'Add staff member'}</button></form>)}
    </section>
  );
}
