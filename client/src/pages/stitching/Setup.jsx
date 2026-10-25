import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, uploadImage } from '../../lib/api';
import Modal from '../../components/Modal';
import { Empty, Err, Field, PriPill, StatusPill, dmy, inr, resetMeta, rupees, toPaise, useMeta } from './common';

// ------------------------------- design library -------------------------------
function DesignModal({ meta, design, onClose, onSaved }) {
  const [f, setF] = useState(design ? { ...design, extra: rupees(design.extraCharge) } : { name: '', garmentTypeId: meta.garmentTypes[0].id, specs: {}, instructions: '', imageUrl: null, extra: '', status: 'active' });
  const [err, setErr] = useState(); const [busy, setBusy] = useState(false); const type = meta.garmentTypes.find(t => t.id === Number(f.garmentTypeId));
  const photo = async file => { setBusy(true); setErr(); try { setF({ ...f, imageUrl: (await uploadImage(file)).url }) } catch (e) { setErr(e.message) } finally { setBusy(false) } };
  const save = async () => {
    setBusy(true); setErr();
    const specs = Object.fromEntries(Object.entries(f.specs).filter(([k, v]) => v && type.specFields.includes(k)));
    const body = { name: f.name.trim(), garmentTypeId: Number(f.garmentTypeId), specs, instructions: f.instructions, imageUrl: f.imageUrl || null, extraCharge: toPaise(f.extra), status: f.status };
    try { design ? await api(`/admin/stitching/designs/${design.id}`, { method: 'PATCH', body }) : await api('/admin/stitching/designs', { method: 'POST', body }); onSaved() } catch (e) { setErr(e.message) } finally { setBusy(false) }
  };
  return (
    <Modal title={design ? 'Edit design' : 'New design'} wide onClose={onClose} footer={<><button className="dpos-btn ghost" onClick={onClose}>Back</button><button className="dpos-btn" disabled={busy || !f.name.trim()} onClick={save}>SAVE</button></>}>
      <div className="stc-stack"><Err>{err}</Err>
        <div className="stc-grid"><Field label="Design name"><input value={f.name} maxLength={100} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Garment"><select value={f.garmentTypeId} onChange={e => setF({ ...f, garmentTypeId: Number(e.target.value), specs: {} })}>{meta.garmentTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Default extra charge (₹)"><input type="number" min="0" value={f.extra} onChange={e => setF({ ...f, extra: e.target.value })} /></Field>
          <Field label="Status"><select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="active">Active</option><option value="archived">Archived</option></select></Field></div>
        <div className="stc-grid">{type.specFields.map(k => { const s = meta.specLibrary[k]; return <Field key={k} label={s.label}>{s.type === 'select' ? <select value={f.specs[k] ?? ''} onChange={e => setF({ ...f, specs: { ...f.specs, [k]: e.target.value } })}><option value="">—</option>{s.options.map(o => <option key={o}>{o}</option>)}</select> : <input value={f.specs[k] ?? ''} onChange={e => setF({ ...f, specs: { ...f.specs, [k]: e.target.value } })} />}</Field> })}</div>
        <Field label="Standard stitching instructions / embroidery notes"><textarea rows="3" maxLength={1000} value={f.instructions} onChange={e => setF({ ...f, instructions: e.target.value })} /></Field>
        <div className="stc-row">{f.imageUrl && <img src={f.imageUrl} alt="" style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 12 }} />}
          <label className="dpos-btn ghost sm" style={{ cursor: 'pointer' }}>{busy ? 'UPLOADING…' : f.imageUrl ? 'Replace reference photo' : '+ Reference photo'}<input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={e => { if (e.target.files[0]) photo(e.target.files[0]); e.target.value = '' }} /></label>
          {f.imageUrl && <button className="dpos-btn danger sm" onClick={() => setF({ ...f, imageUrl: null })}>Remove</button>}</div>
        <p className="muted small" style={{ margin: 0 }}>Only upload photos you took or have permission to use. Using a design on an order pre-fills its fields: every value stays editable per order.</p></div>
    </Modal>);
}
export function Designs({ manager }) {
  const [meta] = useMeta(); const [list, setList] = useState(null); const [m, setM] = useState(null); const [err, setErr] = useState(); const [all, setAll] = useState(false);
  const load = useCallback(() => api(`/admin/stitching/designs?all=${all ? 1 : 0}`).then(setList).catch(e => setErr(e.message)), [all]);
  useEffect(() => { load() }, [load]);
  if (!meta) return <Empty>Loading…</Empty>;
  return (
    <div className="stc-stack"><Err>{err}</Err>
      <div className="stc-row between"><label className="stc-row small"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} /> Show archived</label>{manager && <button className="dpos-btn" onClick={() => setM({})}>+ New design</button>}</div>
      {!list ? <Empty>Loading…</Empty> : !list.length ? <section className="dpos-card"><Empty>No saved designs yet. Add common necklines, sleeves and finishes so staff can pre-fill orders.</Empty></section> : (
        <div className="stc-grid">{list.map(d => (
          <section key={d.id} className="dpos-card stc-stack" style={d.status === 'archived' ? { opacity: .6 } : null}>
            {d.imageUrl && <img src={d.imageUrl} alt={d.name} style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 14 }} />}
            <div className="stc-row between"><b>{d.name}</b><span className="stc-pill s-work">{d.garmentName}</span></div>
            <p className="muted small" style={{ margin: 0 }}>{Object.entries(d.specs).map(([k, v]) => `${meta.specLibrary[k]?.label ?? k}: ${v}`).join(' · ') || 'No preset fields'}</p>
            {d.instructions && <p className="small" style={{ margin: 0 }}>{d.instructions}</p>}
            <div className="stc-row between"><span>{d.extraCharge ? `+ ${inr(d.extraCharge)}` : 'No extra charge'}</span>{manager && <button className="dpos-btn ghost sm" onClick={() => setM(d)}>Edit</button>}</div></section>))}</div>)}
      {m && <DesignModal meta={meta} design={m.id ? m : null} onClose={() => setM(null)} onSaved={() => { setM(null); load() }} />}
    </div>);
}

// ------------------------------- tailors: assignment and workload (not HR, no attendance) -------------------------------
function TailorModal({ tailor, onClose, onSaved }) {
  const [f, setF] = useState(tailor ?? { name: '', phone: '', notes: '', active: true }); const [err, setErr] = useState(); const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); setErr(); try { const body = { name: f.name.trim(), phone: f.phone, notes: f.notes, active: f.active }; tailor ? await api(`/admin/stitching/tailors/${tailor.id}`, { method: 'PATCH', body }) : await api('/admin/stitching/tailors', { method: 'POST', body }); resetMeta(); onSaved() } catch (e) { setErr(e.message) } finally { setBusy(false) } };
  return <Modal title={tailor ? 'Edit tailor' : 'Add a tailor'} onClose={onClose} footer={<><button className="dpos-btn ghost" onClick={onClose}>Back</button><button className="dpos-btn" disabled={busy || !f.name.trim()} onClick={save}>SAVE</button></>}>
    <div className="stc-stack"><Err>{err}</Err><Field label="Name"><input value={f.name} maxLength={80} onChange={e => setF({ ...f, name: e.target.value })} /></Field><Field label="Phone"><input value={f.phone} inputMode="tel" onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
      <Field label="Notes (skills, standing instructions)"><textarea rows="2" maxLength={300} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
      <label className="stc-row"><input type="checkbox" checked={f.active} onChange={e => setF({ ...f, active: e.target.checked })} /> Active (can be assigned new work)</label></div></Modal>;
}
export function Tailors({ manager }) {
  const [meta] = useMeta(); const [list, setList] = useState(null); const [m, setM] = useState(null); const [err, setErr] = useState(); const [open, setOpen] = useState(null); const [orders, setOrders] = useState(null);
  const load = useCallback(() => api('/admin/stitching/tailors').then(setList).catch(e => setErr(e.message)), []);
  useEffect(() => { load() }, [load]);
  useEffect(() => { setOrders(null); if (open) api(`/admin/stitching/tailors/${open}/orders`).then(setOrders).catch(e => setErr(e.message)) }, [open]);
  return (
    <div className="stc-stack"><Err>{err}</Err>
      <p className="muted" style={{ margin: 0 }}>Workload is counted from real open orders. Assign or reassign work from an order; only owners and admins reassign work that already has a tailor.</p>
      {manager && <div><button className="dpos-btn" onClick={() => setM({})}>+ Add tailor</button></div>}
      {!list ? <Empty>Loading…</Empty> : !list.length ? <section className="dpos-card"><Empty>No tailors yet.{manager ? ' Add the first one.' : ' Ask an owner or admin to add them.'}</Empty></section> : (
        <div className="stc-grid">{list.map(t => (
          <section key={t.id} className="dpos-card stc-stack" style={t.active ? null : { opacity: .65 }}>
            <div className="stc-row between"><b style={{ fontSize: 16 }}>{t.name}</b>{!t.active && <span className="stc-pill">Inactive</span>}</div>
            {t.phone && <span className="muted small">{t.phone}</span>}{t.notes && <span className="small">{t.notes}</span>}
            <div className="stc-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}><div><b style={{ fontSize: 22 }}>{t.activeOrders}</b><div className="muted small">Open orders</div></div><div><b style={{ fontSize: 22, color: t.overdue ? 'var(--d-bad)' : undefined }}>{t.overdue}</b><div className="muted small">Overdue</div></div><div><b style={{ fontSize: 22 }}>{t.completed}</b><div className="muted small">Delivered</div></div></div>
            <div className="muted small">{t.nextDeadline ? `Next deadline ${dmy(t.nextDeadline)}` : 'No open deadlines'}{t.openAlterations > 0 && ` · ${t.openAlterations} open alteration${t.openAlterations === 1 ? '' : 's'}`}</div>
            <div className="stc-row"><button className="dpos-btn ghost sm" onClick={() => setOpen(open === t.id ? null : t.id)}>{open === t.id ? 'Hide work' : 'View work'}</button>{manager && <button className="dpos-btn ghost sm" onClick={() => setM(t)}>Edit</button>}</div>
            {open === t.id && (!orders ? <Empty>Loading…</Empty> : !orders.length ? <p className="muted" style={{ margin: 0 }}>Nothing assigned.</p> : <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{orders.map(o => <li key={o.id} className="stc-row between" style={{ padding: '7px 0', borderTop: '1px solid #f0ece4' }}>
              <span><Link className="stc-mono stc-link" to={`/admin/stitching/orders/${o.id}`}>{o.orderNo}</Link> <span className="muted small">{o.garments}</span> <PriPill p={o.priority} /></span><span className="stc-row"><StatusPill s={o.status} meta={meta} /><span className="small">{dmy(o.deliveryDate)}</span></span></li>)}</ul>)}
          </section>))}</div>)}
      {m && <TailorModal tailor={m.id ? m : null} onClose={() => setM(null)} onSaved={() => { setM(null); load() }} />}
    </div>);
}

// ------------------------------- garment types and their fields -------------------------------
function TypeModal({ meta, type, onClose, onSaved }) {
  const [f, setF] = useState(type ? { ...type, price: rupees(type.basePrice) } : { name: '', measureGroups: [], specFields: [], price: '', active: true }); const [err, setErr] = useState(); const [busy, setBusy] = useState(false);
  const tog = (k, v) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v] });
  const save = async () => { setBusy(true); setErr(); try { const body = { name: f.name.trim(), measureGroups: f.measureGroups, specFields: f.specFields, basePrice: toPaise(f.price), active: f.active }; type ? await api(`/admin/stitching/garment-types/${type.id}`, { method: 'PATCH', body }) : await api('/admin/stitching/garment-types', { method: 'POST', body }); resetMeta(); onSaved() } catch (e) { setErr(e.message) } finally { setBusy(false) } };
  return (
    <Modal title={type ? `Edit ${type.name}` : 'New garment type'} wide onClose={onClose} footer={<><button className="dpos-btn ghost" onClick={onClose}>Back</button><button className="dpos-btn" disabled={busy || !f.name.trim()} onClick={save}>SAVE</button></>}>
      <div className="stc-stack"><Err>{err}</Err>
        <div className="stc-grid"><Field label="Name"><input value={f.name} maxLength={80} onChange={e => setF({ ...f, name: e.target.value })} /></Field><Field label="Default stitching charge (₹)"><input type="number" min="0" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></Field></div>
        <div className="stc-sec"><h4>Measurement templates</h4><div className="stc-row">{Object.entries(meta.measureGroups).filter(([k]) => k !== 'misc').map(([k, g]) => <label key={k} className="stc-row"><input type="checkbox" checked={f.measureGroups.includes(k)} onChange={() => tog('measureGroups', k)} /> {g.label}</label>)}</div><p className="muted small" style={{ margin: 0 }}>With none ticked, only custom measurements are offered.</p></div>
        <div className="stc-sec"><h4>Specification fields shown on orders</h4><div className="stc-grid">{Object.entries(meta.specLibrary).map(([k, s]) => <label key={k} className="stc-row"><input type="checkbox" checked={f.specFields.includes(k)} onChange={() => tog('specFields', k)} /> {s.label}</label>)}</div></div>
        <label className="stc-row"><input type="checkbox" checked={f.active} onChange={e => setF({ ...f, active: e.target.checked })} /> Active (deactivated types stay on old orders but cannot be chosen for new ones)</label></div>
    </Modal>);
}
export function GarmentTypes() {
  const [meta] = useMeta(); const [list, setList] = useState(null); const [m, setM] = useState(null); const [err, setErr] = useState();
  const load = useCallback(() => api('/admin/stitching/garment-types?all=1').then(setList).catch(e => setErr(e.message)), []);
  useEffect(() => { load() }, [load]);
  if (!meta) return <Empty>Loading…</Empty>;
  return (
    <div className="stc-stack"><Err>{err}</Err><div><button className="dpos-btn" onClick={() => setM({})}>+ New garment type</button></div>
      <section className="dpos-card">{!list ? <Empty>Loading…</Empty> : <div className="dpos-tw"><table className="stc-table cards"><thead><tr><th>Garment</th><th>Measurements</th><th>Fields</th><th className="r">Default charge</th><th /></tr></thead>
        <tbody>{list.map(t => <tr key={t.id} style={t.active ? null : { opacity: .55 }}><td><b>{t.name}</b>{!t.active && <> <span className="stc-pill">Inactive</span></>}</td><td className="small">{t.measureGroups.map(g => meta.measureGroups[g]?.label).join(', ') || 'Custom only'}</td><td className="small muted">{t.specFields.length} fields</td><td className="r money">{inr(t.basePrice)}</td><td className="r"><button className="dpos-btn ghost sm" onClick={() => setM(t)}>Edit</button></td></tr>)}</tbody></table></div>}</section>
      {m && <TypeModal meta={meta} type={m.id ? m : null} onClose={() => setM(null)} onSaved={() => { setM(null); load() }} />}
    </div>);
}
