import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, uploadMedia } from '../lib/api';
import { useApp } from '../context/App';
import AdminShell from '../components/AdminShell';
import StaffOnly from '../components/StaffOnly';
import { BACK_NECKS, FRONT_NECKS, applyDesigns, loadDesigns } from './stitching/NeckPicker';
import { SLEEVE_LENGTHS, SLEEVE_TYPES } from '../components/MeasureModal';

// Stitching → Stitching Designs: add your own neck designs (a name and a picture) and sleeve options. They show up in the measurement
// pickers in Billing, Advance orders and Measurements, next to the built-in designs.
export default function StitchDesigns() {
  const { user, authReady, toast } = useApp();
  const [d, setD] = useState(null); const [err, setErr] = useState(); const [busy, setBusy] = useState(false);
  useEffect(() => { if (user && ['owner', 'admin'].includes(user.role)) loadDesigns(true).then(x => setD({ front: x.front || [], back: x.back || [], sleeveTypes: x.sleeveTypes || [], sleeveLengths: x.sleeveLengths || [] })).catch(e => setErr(e.message)) }, [user]);
  if (!authReady) return <div className="page-pad"><p className="muted">Loading…</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!['owner', 'admin'].includes(user.role)) return <StaffOnly />;
  const save = async next => { setBusy(true); setErr(); try { const out = await api('/admin/pos/stitch-designs', { method: 'PUT', body: next }); setD(out); applyDesigns(out); toast('Saved.') } catch (e) { setErr(e.issues?.[0]?.message || e.message) } finally { setBusy(false) } };
  return (
    <AdminShell title="Stitching Designs" sub="Add your own neck designs and sleeve options. They appear in the measurement pickers next to the built-in ones.">
      {err && <p className="dpos-err" role="alert">{err}</p>}
      {!d ? <p className="muted">Loading…</p> : <>
        <NeckSection title="Front neck designs" kind="front" list={d.front} builtinCount={FRONT_NECKS.length - d.front.length} busy={busy} onSave={list => save({ ...d, front: list })} />
        <NeckSection title="Back neck designs" kind="back" list={d.back} builtinCount={BACK_NECKS.length - d.back.length} busy={busy} onSave={list => save({ ...d, back: list })} />
        <NameSection title="Sleeve types" base={SLEEVE_TYPES} list={d.sleeveTypes} busy={busy} onSave={list => save({ ...d, sleeveTypes: list })} />
        <NameSection title="Sleeve lengths" base={SLEEVE_LENGTHS} list={d.sleeveLengths} busy={busy} onSave={list => save({ ...d, sleeveLengths: list })} />
      </>}
    </AdminShell>
  );
}

function NeckSection({ title, kind, list, builtinCount, busy, onSave }) {
  const [name, setName] = useState(''); const [file, setFile] = useState(null); const [up, setUp] = useState(false); const [err, setErr] = useState(); const input = useRef();
  const add = async e => {
    e.preventDefault(); setErr();
    if (!name.trim()) return setErr('Give the design a name.');
    if (list.some(x => x.name.toLowerCase() === name.trim().toLowerCase())) return setErr('You already added a design with that name.');
    setUp(true);
    try { const image = file ? (await uploadMedia(file)).url : null; await onSave([...list, { name: name.trim(), image }]); setName(''); setFile(null); if (input.current) input.current.value = '' } catch (x) { setErr(x.message) } finally { setUp(false) }
  };
  return (
    <section className="dpos-card"><h2>{title} <span className="muted small">({builtinCount} built in · {list.length} yours)</span></h2>
      <div className="sdz-grid">
        {list.map((x, i) => (
          <div className="sdz-card" key={x.name}>
            {x.image ? <img src={x.image} alt={x.name} /> : <span className="sdz-ph">No picture</span>}
            <b>{x.name}</b>
            <button type="button" className="dpos-btn danger sm" disabled={busy} onClick={() => { if (confirm(`Remove “${x.name}”? Orders that already use it keep the name.`)) onSave(list.filter((_, k) => k !== i)) }}>Remove</button>
          </div>))}
        {!list.length && <p className="muted small sdz-none">No designs of your own yet.</p>}
      </div>
      <form className="sdz-add" onSubmit={add}>
        <label className="f">Design name<input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder={kind === 'front' ? 'e.g. Princess cut' : 'e.g. Deep scoop'} /></label>
        <label className="f">Picture (optional)<input ref={input} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setFile(e.target.files[0] || null)} /></label>
        <button className="dpos-btn" disabled={busy || up}>{up ? 'Adding…' : '+ Add design'}</button>
      </form>
      {err && <p className="dpos-err" role="alert">{err}</p>}
    </section>
  );
}

function NameSection({ title, base, list, busy, onSave }) {
  const [v, setV] = useState('');
  const add = e => { e.preventDefault(); const t = v.trim(); if (!t || base.includes(t) || list.includes(t)) return; onSave([...list, t]); setV('') };
  return (
    <section className="dpos-card"><h2>{title}</h2>
      <p className="muted small">Built in: {base.join(', ')}</p>
      <div className="sdz-chips">{list.map(x => <span key={x} className="sdz-chip">{x}<button type="button" aria-label={`Remove ${x}`} disabled={busy} onClick={() => onSave(list.filter(y => y !== x))}>×</button></span>)}</div>
      <form className="sdz-add one" onSubmit={add}><label className="f">Add an option<input value={v} maxLength={40} onChange={e => setV(e.target.value)} placeholder="e.g. Cap sleeve" /></label><button className="dpos-btn" disabled={busy || !v.trim()}>+ Add</button></form>
    </section>
  );
}
