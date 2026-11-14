import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../context/App';
import { resetStaffAccess } from '../lib/staffAccess';
import { Icon } from './AdminShell';

const ROLES = [['admin', 'Admin', 'Everything on the page list, except what you untick'], ['cashier', 'Cashier', 'Bills and looks things up at the counter'], ['inventory', 'Stock staff', 'Adjusts stock and manages products']];

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
    try { const r = await api('/admin/pos/staff-access', { method: 'PUT', body: cfg }); setCfg(r); resetStaffAccess(); toast('Staff access saved.') } catch (e) { setErr(e.message) } finally { setBusy(false) }
  };
  return (
    <section className="dpos-card sa-card" style={{ marginTop: 16 }}>
      <h2><Icon n="users" />Staff dashboard: who sees what</h2>
      <p className="sub">Choose which pages each kind of staff member sees in the admin sidebar. The owner and admins can both change this. The owner always sees everything; an admin always keeps POS Settings. A page appears only if that kind of staff can use it.</p>
      <div className="sa-grid">
        <div className="sa-head"><span>Page</span>{ROLES.map(([k, l, h]) => <span key={k} title={h}>{l}</span>)}</div>
        {d.all.map(([path, label]) => (
          <div className="sa-row" key={path}><span>{label}</span>
            {ROLES.map(([k, l]) => d.can[k].includes(path)
              ? <label key={k} className="sa-tick"><input type="checkbox" checked={cfg[k].includes(path)} disabled={k === 'admin' && path === '/admin/billing/settings'} onChange={() => toggle(k, path)} aria-label={`${l} can open ${label}`} /></label>
              : <span key={k} className="sa-na" title={`${l} cannot use this page`}>—</span>)}</div>))}
      </div>
      {err && <p className="dpos-err" role="alert">{err}</p>}
      <div style={{ marginTop: 14 }}><button type="button" className="dpos-btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save page access'}</button></div>
    </section>
  );
}
