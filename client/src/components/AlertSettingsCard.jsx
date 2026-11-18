import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../context/App';

// POS Settings → Alerts: the stitching due-date alert (banner on the stitching pages and a pop-up once a day).
export default function AlertSettingsCard() {
  const { toast } = useApp(); const [a, setA] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  useEffect(() => { api('/admin/pos/alert-settings').then(setA).catch(e => setErr(e.message)) }, []);
  const save = async () => { setBusy(true); setErr(); try { setA(await api('/admin/pos/alert-settings', { method: 'PUT', body: a })); toast('Alert settings saved.') } catch (e) { setErr(e.message) } finally { setBusy(false) } };
  return (
    <section className="dpos-card"><h2>Alerts</h2>
      <p className="sub">Choose how the stitching due-date alert reminds you.</p>
      {err && <p className="dpos-err" role="alert">{err}</p>}
      {!a ? <p className="muted small">Loading…</p> : (
        <div style={{ display: 'grid', gap: 10 }}>
          <label className="rw-tick"><input type="checkbox" checked={a.stitchDue} onChange={e => setA({ ...a, stitchDue: e.target.checked })} /> <span><b>Stitching due-date alerts</b>: warn about overdue orders and orders due soon</span></label>
          <label className="rw-tick"><input type="checkbox" disabled={!a.stitchDue} checked={a.banner} onChange={e => setA({ ...a, banner: e.target.checked })} /> <span>Show the alert banner on the stitching pages</span></label>
          <label className="rw-tick"><input type="checkbox" disabled={!a.stitchDue} checked={a.popup} onChange={e => setA({ ...a, popup: e.target.checked })} /> <span>Pop-up message once a day when staff open the dashboard</span></label>
          <label className="f" style={{ maxWidth: 260 }}>Warn this many days before the due date<input type="number" min="0" max="30" disabled={!a.stitchDue} value={a.daysBefore} onChange={e => setA({ ...a, daysBefore: Math.max(0, Math.min(30, +e.target.value || 0)) })} /></label>
          <div><button type="button" className="dpos-btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save alert settings'}</button></div>
        </div>)}
    </section>
  );
}
