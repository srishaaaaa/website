import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import Modal from '../../components/Modal';
import { Empty, Err, Field, MeasureEditor, blankMeasure, fromSnapshot, hasMeasure, measurePayload, useMeta, when } from './common';

const show = (meta, p) => [...Object.entries(p.values).map(([k, v]) => `${meta.measureGroups[p.group]?.fields.find(f => f[0] === k)?.[1] ?? k} ${v}`), ...p.custom.map(c => `${c.label} ${c.value}`)].join(' · ');

function ProfileModal({ meta, customer, profile, onClose, onSaved }) {
  const [group, setGroup] = useState(profile?.group ?? 'blouse'); const [name, setName] = useState(profile?.name ?? '');
  const [m, setM] = useState(profile ? fromSnapshot({ unit: profile.unit, values: profile.values, custom: profile.custom, notes: profile.notes }) : blankMeasure());
  const [fit, setFit] = useState(profile?.fitPref ?? ''); const [err, setErr] = useState(); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr();
    const p = measurePayload(m); const body = { name: name.trim(), unit: p.unit, values: p.values, custom: p.custom, fitPref: fit, notes: m.notes };
    try { profile ? await api(`/admin/stitching/measurements/${profile.id}`, { method: 'PATCH', body: { ...body, archived: profile.archived } }) : await api('/admin/stitching/measurements', { method: 'POST', body: { ...body, customerId: customer.id, group } }); onSaved() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  };
  return (
    <Modal title={profile ? `Edit “${profile.name}”` : 'New measurement profile'} sub={customer.name} wide onClose={onClose}
      footer={<><button className="dpos-btn ghost" onClick={onClose}>Back</button><button className="dpos-btn" disabled={busy || !name.trim() || !hasMeasure(m)} onClick={save}>{busy ? 'SAVING…' : profile ? `SAVE AS VERSION ${profile.version + 1}` : 'SAVE PROFILE'}</button></>}>
      <div className="stc-stack"><Err>{err}</Err>
        <div className="stc-grid"><Field label="Garment group"><select value={group} disabled={!!profile} onChange={e => { setGroup(e.target.value); setM({ ...blankMeasure(m.unit), notes: m.notes }) }}>{Object.entries(meta.measureGroups).map(([k, g]) => <option key={k} value={k}>{g.label}</option>)}</select></Field>
          <Field label="Profile name"><input value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="e.g. Bridal blouse, Nov 2026" /></Field>
          <Field label="Fit preference"><input value={fit} maxLength={80} onChange={e => setFit(e.target.value)} placeholder="Snug / regular / relaxed" /></Field></div>
        <MeasureEditor group={group} meta={meta} value={m} onChange={setM} allowSave={false} />
        {profile && <p className="muted small" style={{ margin: 0 }}>Every save is kept in the history with who made it and when. Past orders keep their own copy of the measurements.</p>}</div>
    </Modal>);
}

function HistoryModal({ meta, profile, onClose }) {
  const [h, setH] = useState(null);
  useEffect(() => { api(`/admin/stitching/measurements/${profile.id}/history`).then(setH).catch(() => setH([])) }, [profile.id]);
  return <Modal title={`History: ${profile.name}`} sub={`Current version ${profile.version}`} wide onClose={onClose}>
    {!h ? <Empty>Loading…</Empty> : <table className="stc-table"><thead><tr><th>Version</th><th>Measurements</th><th>By</th><th>When</th></tr></thead><tbody>{h.map(x => <tr key={x.id}><td><b>v{x.version}</b></td><td className="small">{show(meta, { group: profile.group, values: x.values, custom: x.custom })} <span className="muted">({x.unit === 'in' ? 'in' : 'cm'})</span>{x.fitPref && <div className="muted">Fit: {x.fitPref}</div>}</td><td>{x.by}</td><td className="small">{when(x.at)}</td></tr>)}</tbody></table>}</Modal>;
}

export default function Book() {
  const [meta] = useMeta(); const [q, setQ] = useState(''); const [list, setList] = useState(null); const [sel, setSel] = useState(null); const [profiles, setProfiles] = useState(null);
  const [err, setErr] = useState(); const [m, setM] = useState(null); const [archived, setArchived] = useState(false); const [nw, setNw] = useState(null);
  const loadList = useCallback(() => { const t = setTimeout(() => api('/admin/stitching/measurements?q=' + encodeURIComponent(q)).then(setList).catch(e => setErr(e.message)), 200); return () => clearTimeout(t) }, [q]);
  useEffect(() => loadList(), [loadList]);
  const loadP = useCallback(() => { if (sel) api(`/admin/stitching/customers/${sel.id}/measurements?archived=${archived ? 1 : 0}`).then(setProfiles).catch(e => setErr(e.message)); else setProfiles(null) }, [sel, archived]);
  useEffect(() => { loadP() }, [loadP]);
  if (!meta) return <Empty>Loading…</Empty>;
  const after = () => { setM(null); loadP(); loadList() };
  const act = async fn => { setErr(); try { await fn(); after() } catch (e) { setErr(e.message) } };
  const addCustomer = async () => { setErr(); try { const r = await api('/admin/pos/customers', { method: 'POST', body: { name: nw.name.trim(), phone: nw.phone.trim() } }); setNw(null); setQ(nw.phone.trim()); setSel({ id: r.id, name: nw.name.trim(), phone: nw.phone.trim() }) } catch (e) { setErr(e.message) } };
  return (
    <div className="stc-stack">
      <p className="muted" style={{ margin: 0 }}>The measurement book is private: only signed-in staff can open it. Each customer can have several profiles for different garments.</p>
      <Err>{err}</Err>
      <div className="dpos-grid" style={{ gridTemplateColumns: 'minmax(260px, 340px) minmax(0, 1fr)', alignItems: 'start' }}>
        <section className="dpos-card stc-stack">
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search customer name or phone…" aria-label="Search customers" />
          {nw ? <div className="stc-stack" style={{ gap: 8 }}><input placeholder="Customer name" value={nw.name} onChange={e => setNw({ ...nw, name: e.target.value })} /><input placeholder="Mobile number" inputMode="tel" value={nw.phone} onChange={e => setNw({ ...nw, phone: e.target.value })} />
            <div className="stc-row"><button className="dpos-btn sm" disabled={!nw.name.trim() || nw.phone.replace(/\D/g, '').length < 7} onClick={addCustomer}>Add customer</button><button className="dpos-btn ghost sm" onClick={() => setNw(null)}>Cancel</button></div></div>
            : <button className="dpos-btn outline sm" onClick={() => setNw({ name: '', phone: '' })}>+ New customer</button>}
          {!list ? <Empty>Loading…</Empty> : !list.length ? <Empty>No customers found.</Empty> : <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 520, overflow: 'auto' }}>{list.map(c => (
            <li key={c.id}><button className="stc-row between" style={{ width: '100%', textAlign: 'left', padding: '10px 8px', borderRadius: 12, background: sel?.id === c.id ? '#f3ecf6' : 'transparent' }} onClick={() => setSel(c)}>
              <span><b>{c.name || 'Customer'}</b><div className="muted small">{c.phone}</div></span><span className={`stc-pill ${c.profiles ? 's-work' : ''}`}>{c.profiles} profile{c.profiles === 1 ? '' : 's'}</span></button></li>))}</ul>}
        </section>
        <section className="dpos-card stc-stack">
          {!sel ? <Empty>Choose a customer to see or add their measurements.</Empty> : <>
            <div className="stc-row between"><div><h2 style={{ margin: 0 }}>{sel.name || 'Customer'}</h2><span className="muted small">{sel.phone}</span></div>
              <div className="stc-row"><label className="stc-row small"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} /> Show archived</label><button className="dpos-btn" onClick={() => setM({ t: 'edit' })}>+ New profile</button></div></div>
            {!profiles ? <Empty>Loading…</Empty> : !profiles.length ? <Empty>No measurements saved for this customer yet.</Empty> : profiles.map(p => (
              <div key={p.id} className="stc-box" style={p.archived ? { opacity: .6 } : null}>
                <div className="stc-row between"><div><b>{p.name}</b> <span className="stc-pill s-work">{meta.measureGroups[p.group]?.label ?? p.group}</span> {p.archived && <span className="stc-pill">Archived</span>}</div><span className="muted small">v{p.version} · {p.unit === 'in' ? 'inches' : 'cm'} · updated {when(p.updatedAt)}{p.updatedBy ? ` by ${p.updatedBy}` : ''}</span></div>
                <p style={{ margin: '8px 0' }}>{show(meta, p)}</p>{p.fitPref && <p className="muted small" style={{ margin: '0 0 8px' }}>Fit: {p.fitPref}</p>}{p.notes && <p className="muted small" style={{ margin: '0 0 8px' }}>{p.notes}</p>}
                <div className="stc-row"><button className="dpos-btn ghost sm" onClick={() => setM({ t: 'edit', p })}>Edit</button><button className="dpos-btn ghost sm" onClick={() => act(() => api(`/admin/stitching/measurements/${p.id}/duplicate`, { method: 'POST' }))}>Duplicate</button>
                  <button className="dpos-btn ghost sm" onClick={() => setM({ t: 'history', p })}>History</button>
                  <button className="dpos-btn ghost sm" onClick={() => act(() => api(`/admin/stitching/measurements/${p.id}`, { method: 'PATCH', body: { name: p.name, unit: p.unit, values: p.values, custom: p.custom, fitPref: p.fitPref, notes: p.notes, archived: !p.archived } }))}>{p.archived ? 'Restore' : 'Archive'}</button></div>
              </div>))}</>}
        </section>
      </div>
      {m?.t === 'edit' && <ProfileModal meta={meta} customer={sel} profile={m.p} onClose={() => setM(null)} onSaved={after} />}
      {m?.t === 'history' && <HistoryModal meta={meta} profile={m.p} onClose={() => setM(null)} />}
    </div>);
}
