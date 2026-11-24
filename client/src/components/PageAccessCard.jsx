import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../context/App';
import { resetStaffAccess } from '../lib/staffAccess';
import { Icon } from './AdminShell';

const ROLES = [['cashier', 'Staff', 'Everyone with the Staff role']];

// POS Settings → Staff access (owner only): tick which admin pages each kind of staff member sees. The owner always sees everything.
export default function PageAccessCard() {
  const { user, toast } = useApp();
  const [d, setD] = useState(null); const [cfg, setCfg] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  useEffect(() => { if (['owner', 'admin'].includes(user?.role)) api('/admin/pos/staff-access').then(x => { setD(x); setCfg(x.config) }).catch(e => setErr(e.message)) }, [user?.role]);
  if (!['owner', 'admin'].includes(user?.role)) return null;
  if (!d || !cfg) return err ? <p className="dpos-err" role="alert">{err}</p> : null;
  const toggle = (role, page) => setCfg(c => ({ ...c, [role]: c[role].includes(page) ? c[role].filter(p => p !== page) : [...c[role], page] }));
  const save = async () => {
    setBusy(true); setErr();
    try { const r = await api('/admin/pos/staff-access', { method: 'PUT', body: { cashier: cfg.cashier, inventory: cfg.cashier } }); setCfg(r); resetStaffAccess(); toast('Staff access saved.') } catch (e) { setErr(e.message) } finally { setBusy(false) }
  };
  return (
    <section className="dpos-card sa-card" style={{ marginTop: 16 }}>
      <h2><Icon n="users" />Staff permissions</h2>
      <p className="sub">Tick the pages every Staff member can open from the admin sidebar. Admins always see everything.</p>
      <div className="sa-boxes">
        {d.all.filter(([path]) => d.can.cashier.includes(path)).map(([path, label]) => (
          <label className={`sa-box ${cfg.cashier.includes(path) ? 'on' : ''}`} key={path}>
            <input type="checkbox" checked={cfg.cashier.includes(path)} onChange={() => toggle('cashier', path)} aria-label={`Staff can open ${label}`} /><span>{label}</span>
          </label>))}
      </div>
      {err && <p className="dpos-err" role="alert">{err}</p>}
      <div style={{ marginTop: 14 }}><button type="button" className="dpos-btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save page access'}</button></div>
    </section>
  );
}
