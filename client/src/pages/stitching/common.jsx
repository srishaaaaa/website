import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, uploadImage } from '../../lib/api';
import { inr } from '../../lib/format';
import { clock, longDate } from '../../lib/invoiceFormat';
import { istDay, todayStr } from '../../components/PeriodFilter';
import '../../stitching.css';
import { NeckField } from './NeckPicker';

export { inr, todayStr };
export const Err = ({ children }) => children ? <p className="dpos-err" role="alert">{children}</p> : null;
export const Empty = ({ children }) => <p className="dpos-empty">{children}</p>;
export const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(16).slice(2)}`);
export const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) };
export const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86_400_000);
export const dmy = d => d ? longDate(String(d).slice(0, 10)) : '—';
export const when = iso => iso ? `${longDate(istDay(iso))}, ${clock(iso)}` : '—';
export const toPaise = s => { const n = Math.round(parseFloat(String(s ?? '').replace(/,/g, '')) * 100); return Number.isFinite(n) && n > 0 ? n : 0 };
export const rupees = p => p ? String(p / 100) : '';
export const waLink = (phone, text) => { const d = String(phone || '').replace(/\D/g, '').slice(-10); return `https://wa.me/${d.length === 10 ? '91' + d : ''}?text=${encodeURIComponent(text)}` };

// Garment types, status names, field catalogues: one fetch, shared by every Stitching Studio screen (server is the source of truth).
let metaPromise = null;
export const resetMeta = () => { metaPromise = null };
export function useMeta() {
  const [m, setM] = useState(null); const [err, setErr] = useState();
  useEffect(() => { let live = true; (metaPromise ??= api('/admin/stitching/meta')).then(x => live && setM(x)).catch(e => { metaPromise = null; live && setErr(e.message) }); return () => { live = false } }, []);
  return [m, err];
}
export const statusName = (meta, s) => meta?.statuses.find(x => x[0] === s)?.[1] ?? s;
const TONE = { received: 'received', measurements_confirmed: 'received', materials_ready: 'work', cutting: 'work', stitching: 'work', trial_scheduled: 'trial', trial_completed: 'trial', alterations_required: 'alter', finishing_qc: 'work', ready: 'ready', delivered: 'done', cancelled: 'cancelled' };
export const StatusPill = ({ s, meta }) => <span className={`stc-pill s-${TONE[s] ?? 'received'}`}>{statusName(meta, s)}</span>;
export const PayPill = ({ s }) => <span className={`stc-pill pay-${s}`}>{{ unpaid: 'Unpaid', partial: 'Part paid', paid: 'Paid', held: 'Advance held', none: '—' }[s]}</span>;
export const PriPill = ({ p }) => p === 'normal' ? null : <span className={`stc-pill pr-${p}`}>{p}</span>;
export const kindName = (meta, k) => meta?.apptKinds.find(x => x[0] === k)?.[1] ?? k;

export function Field({ label, children, className = '' }) { return <label className={`stc-f ${className}`}>{label}{children}</label> }

// ---- mirror of the server bill maths (server/lib/pos.js computeBill), for the live total only. The server is authoritative. ----
export function bill(lines, { isGst, gstRate, discount }) {
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const disc = Math.min(discount, subtotal);
  const out = lines.map(l => ({ ...l, total: l.price * l.qty, alloc: subtotal ? Math.floor(disc * l.price * l.qty / subtotal) : 0 }));
  let rest = disc - out.reduce((s, l) => s + l.alloc, 0);
  for (let i = 0; rest > 0 && out.length; i = (i + 1) % out.length, rest--) out[i].alloc++;
  const tax = isGst ? out.reduce((s, l) => s + Math.round((l.total - l.alloc) * gstRate / 100), 0) : 0;
  return { subtotal, discount: disc, tax, total: subtotal - disc + tax, overDiscount: discount > subtotal };
}

// ---- customer picker: existing customers (no duplicates, matched by mobile) or a new one ----
export function CustomerPicker({ value, onChange, disabled }) {
  const [q, setQ] = useState(''); const [list, setList] = useState([]); const [open, setOpen] = useState(false); const [adding, setAdding] = useState(false);
  const [nw, setNw] = useState({ name: '', phone: '' });
  useEffect(() => {
    if (!open || q.trim().length < 2) { setList([]); return }
    const t = setTimeout(() => api('/admin/pos/customers?q=' + encodeURIComponent(q.trim())).then(r => setList(r.slice(0, 12))).catch(() => setList([])), 200);
    return () => clearTimeout(t);
  }, [q, open]);
  if (value && !adding) return (
    <div className="stc-box stc-row between"><div><b>{value.name || 'Customer'}</b><div className="muted small">{value.phone}{value.isNew ? ' · new customer' : ''}</div></div>
      {!disabled && <button type="button" className="dpos-btn ghost sm" onClick={() => { onChange(null); setQ('') }}>Change</button>}</div>);
  if (adding) return (
    <div className="stc-grid">
      <Field label="Customer name"><input value={nw.name} onChange={e => setNw({ ...nw, name: e.target.value })} autoFocus /></Field>
      <Field label="Mobile number"><input value={nw.phone} inputMode="tel" onChange={e => setNw({ ...nw, phone: e.target.value })} /></Field>
      <div className="stc-row" style={{ alignSelf: 'end' }}>
        <button type="button" className="dpos-btn sm" disabled={!nw.name.trim() || nw.phone.replace(/\D/g, '').length < 7} onClick={() => { onChange({ isNew: true, name: nw.name.trim(), phone: nw.phone.trim() }); setAdding(false) }}>Use this customer</button>
        <button type="button" className="dpos-btn ghost sm" onClick={() => setAdding(false)}>Back to search</button></div>
      <p className="muted small" style={{ gridColumn: '1 / -1', margin: 0 }}>If that mobile number already exists, the existing customer is used: no duplicate is created.</p>
    </div>);
  return (
    <div className="stc-pick">
      <input type="search" value={q} onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} placeholder="Search by name or phone number…" aria-label="Search customers" />
      {open && q.trim().length >= 2 && (
        <ul>{list.map(c => <li key={c.id}><button type="button" onClick={() => { onChange({ id: c.id, name: c.name, phone: c.phone }); setOpen(false) }}><b>{c.name || 'Customer'}</b><span className="muted">{c.phone}</span></button></li>)}
          {!list.length && <li className="muted small" style={{ padding: 10 }}>No customer found.</li>}</ul>)}
      <button type="button" className="stc-link" style={{ marginTop: 8 }} onClick={() => setAdding(true)}>+ Add a new customer</button>
    </div>);
}

// ---- measurements ----
const conv = (v, from, to) => { const n = parseFloat(v); if (!Number.isFinite(n) || from === to) return v; return String(Math.round((to === 'cm' ? n * 2.54 : n / 2.54) * 100) / 100) };
export const blankMeasure = (unit = 'in') => ({ unit, values: {}, custom: [], profileId: null, saveAs: '', notes: '' });
export function fromSnapshot(g) { return g ? { unit: g.unit, values: Object.fromEntries(Object.entries(g.values ?? {}).map(([k, v]) => [k, String(v)])), custom: (g.custom ?? []).map(c => ({ label: c.label, value: String(c.value) })), profileId: g.profileId ?? null, saveAs: '', notes: g.notes ?? '' } : blankMeasure() }
export function measurePayload(m) {
  const values = {}; for (const [k, v] of Object.entries(m.values)) { const n = parseFloat(v); if (Number.isFinite(n)) values[k] = n }
  const custom = m.custom.filter(c => c.label.trim() && c.value !== '').map(c => ({ label: c.label.trim(), value: parseFloat(c.value) }));
  return { unit: m.unit, values, custom, notes: m.notes, ...(m.profileId ? { profileId: m.profileId } : m.saveAs.trim() ? { saveAs: m.saveAs.trim() } : {}) };
}
export const hasMeasure = m => m && (Object.values(m.values).some(v => parseFloat(v) > 0) || m.custom.some(c => parseFloat(c.value) > 0));

// The measurement grid for one garment group. Fields come from the server's template for that group; staff can add custom fields.
export function MeasureEditor({ group, meta, value, onChange, customerId, profiles = [], allowSave = true }) {
  const g = meta.measureGroups[group]; const set = p => onChange({ ...value, ...p });
  const usable = profiles.filter(p => p.group === group && !p.archived);
  const pick = id => {
    const p = usable.find(x => String(x.id) === id);
    if (!p) return set({ profileId: null });
    onChange({ ...value, unit: p.unit, profileId: p.id, saveAs: '', values: Object.fromEntries(Object.entries(p.values).map(([k, v]) => [k, String(v)])), custom: p.custom.map(c => ({ label: c.label, value: String(c.value) })), notes: value.notes || p.notes || '' });
  };
  const switchUnit = u => u === value.unit ? null : onChange({ ...value, unit: u, values: Object.fromEntries(Object.entries(value.values).map(([k, v]) => [k, conv(v, value.unit, u)])), custom: value.custom.map(c => ({ ...c, value: conv(c.value, value.unit, u) })) });
  const unitLabel = value.unit === 'in' ? 'in' : 'cm';
  return (
    <div className="stc-stack" style={{ gap: 10 }}>
      <div className="stc-row between">
        <strong style={{ fontSize: 14 }}>{g.label}</strong>
        <div className="stc-row">
          {customerId && usable.length > 0 && <select aria-label={`Saved ${g.label} profile`} value={value.profileId ?? ''} onChange={e => pick(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Enter new measurements</option>{usable.map(p => <option key={p.id} value={p.id}>{p.name} (v{p.version}, {p.unit})</option>)}</select>}
          <div className="stc-unit" role="radiogroup" aria-label="Unit">{[['in', 'Inches'], ['cm', 'Centimetres']].map(([u, l]) => <button key={u} type="button" role="radio" aria-checked={value.unit === u} className={value.unit === u ? 'on' : ''} onClick={() => switchUnit(u)}>{l}</button>)}</div>
        </div>
      </div>
      {g.fields.length > 0 && <div className="stc-meas">{g.fields.map(([k, label]) => (
        <label key={k}>{label} ({unitLabel})<input type="number" inputMode="decimal" min="0" step="0.25" value={value.values[k] ?? ''} onChange={e => set({ values: { ...value.values, [k]: e.target.value }, profileId: value.profileId })} /></label>))}</div>}
      {value.custom.map((c, i) => (
        <div key={i} className="stc-row">
          <input style={{ flex: '1 1 160px' }} placeholder="Custom measurement name" aria-label="Custom measurement name" value={c.label} maxLength={40} onChange={e => set({ custom: value.custom.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
          <input style={{ width: 110 }} type="number" min="0" step="0.25" placeholder={unitLabel} aria-label="Custom measurement value" value={c.value} onChange={e => set({ custom: value.custom.map((x, j) => j === i ? { ...x, value: e.target.value } : x) })} />
          <button type="button" className="dpos-btn danger sm" onClick={() => set({ custom: value.custom.filter((_, j) => j !== i) })}>Remove</button></div>))}
      <div className="stc-row"><button type="button" className="dpos-btn ghost sm" onClick={() => set({ custom: [...value.custom, { label: '', value: '' }] })}>+ Custom measurement</button>
        {allowSave && !value.profileId && <input style={{ flex: '1 1 200px' }} value={value.saveAs} onChange={e => set({ saveAs: e.target.value })} placeholder="Save to the measurement book as… (optional)" aria-label="Profile name" maxLength={80} />}</div>
      <input value={value.notes} onChange={e => set({ notes: e.target.value })} placeholder="Fit notes for this garment (optional)" aria-label="Measurement notes" maxLength={300} />
    </div>);
}

// ---- one garment on an order ----
export const blankItem = (meta, typeId) => {
  const t = meta.garmentTypes.find(x => x.id === typeId) ?? meta.garmentTypes[0];
  return { key: newKey(), garmentTypeId: t.id, qty: 1, designId: null, specs: {}, custom: [], notes: '', fabric: { source: 'customer', type: '', color: '', quantity: '', lining: '', accessories: '', status: 'pending', variantId: null, linkedName: '', photos: [] },
    measurements: { groups: {} }, charges: { base: rupees(t.basePrice), design: '', embroidery: '', material: '' } };
};
export const fromServerItem = i => ({
  key: newKey(), id: i.id, garmentTypeId: i.garmentTypeId, qty: i.qty, designId: i.designId, specs: { ...i.specs }, custom: (i.custom ?? []).map(c => ({ ...c })), notes: i.notes ?? '',
  fabric: { source: 'customer', type: '', color: '', quantity: '', lining: '', accessories: '', status: 'pending', photos: [], ...i.fabric, variantId: i.fabric?.linked?.variantId ?? null, linkedName: i.fabric?.linked?.name ?? '' },
  measurements: { groups: Object.fromEntries(Object.entries(i.measurements?.groups ?? {}).map(([g, v]) => [g, fromSnapshot(v)])) },
  charges: Object.fromEntries(['base', 'design', 'embroidery', 'material'].map(k => [k, rupees(i.charges?.[k])])),
});
export const chargeOf = it => ['base', 'design', 'embroidery', 'material'].reduce((s, k) => s + toPaise(it.charges[k]), 0);
export function itemPayload(it) {
  const f = it.fabric;
  return {
    garmentTypeId: it.garmentTypeId, qty: Number(it.qty) || 1, designId: it.designId || null, specs: it.specs, custom: it.custom.filter(c => c.label.trim()), notes: it.notes,
    fabric: { source: f.source, type: f.type, color: f.color, quantity: f.quantity, lining: f.lining, accessories: f.accessories, status: f.status, variantId: f.variantId || null, photos: f.photos },
    measurements: { groups: Object.fromEntries(Object.entries(it.measurements.groups).filter(([, m]) => hasMeasure(m)).map(([g, m]) => [g, measurePayload(m)])) },
    charges: Object.fromEntries(['base', 'design', 'embroidery', 'material'].map(k => [k, toPaise(it.charges[k])])),
  };
}

function FabricLink({ value, name, onPick }) {
  const [q, setQ] = useState(''); const [list, setList] = useState([]);
  useEffect(() => { if (q.trim().length < 2) { setList([]); return } const t = setTimeout(() => api('/admin/pos/catalog?q=' + encodeURIComponent(q.trim()) + '&limit=8').then(setList).catch(() => setList([])), 200); return () => clearTimeout(t) }, [q]);
  if (value) return <div className="stc-row"><span className="stc-pill s-work">Linked: {name}</span><button type="button" className="dpos-btn ghost sm" onClick={() => onPick(null, '')}>Unlink</button></div>;
  return <div className="stc-pick"><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Link a boutique product (optional): search by name or SKU" aria-label="Link fabric product" />
    {list.length > 0 && <ul>{list.map(v => <li key={v.variantId}><button type="button" onClick={() => { onPick(v.variantId, v.name); setQ('') }}><span>{v.name} <span className="muted">{v.size !== 'Default' ? v.size : ''} {v.color !== 'Default' ? v.color : ''}</span></span><span className="muted">{v.stock} in stock</span></button></li>)}</ul>}</div>;
}

export function ItemForm({ meta, item, onChange, customerId, designs, lockType }) {
  const type = meta.garmentTypes.find(t => t.id === item.garmentTypeId);
  const [profiles, setProfiles] = useState([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  useEffect(() => { if (customerId) api(`/admin/stitching/customers/${customerId}/measurements`).then(setProfiles).catch(() => setProfiles([])); else setProfiles([]) }, [customerId]);
  const set = p => onChange({ ...item, ...p });
  const groups = type?.measureGroups?.length ? type.measureGroups : [];
  const showMisc = !groups.length || item.measurements.groups.misc;
  const setGroup = (g, v) => set({ measurements: { groups: { ...item.measurements.groups, [g]: v } } });
  const pickDesign = id => {
    const d = designs.find(x => String(x.id) === id);
    if (!d) return set({ designId: null });
    set({ designId: d.id, specs: { ...item.specs, ...Object.fromEntries(Object.entries(d.specs).filter(([k]) => type.specFields.includes(k))) }, notes: item.notes || d.instructions || '', charges: { ...item.charges, design: d.extraCharge ? rupees(d.extraCharge) : item.charges.design } });
  };
  const addPhotos = async files => {
    setBusy(true); setErr();
    try { const urls = []; for (const f of files.slice(0, 5 - item.fabric.photos.length)) urls.push((await uploadImage(f)).url); set({ fabric: { ...item.fabric, photos: [...item.fabric.photos, ...urls] } }) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  };
  const fab = p => set({ fabric: { ...item.fabric, ...p } });
  const ch = k => e => set({ charges: { ...item.charges, [k]: e.target.value } });
  const line = chargeOf(item) * (Number(item.qty) || 1);
  return (
    <div className="stc-stack">
      <Err>{err}</Err>
      <div className="stc-grid">
        <Field label="Garment type"><select value={item.garmentTypeId} disabled={lockType} onChange={e => { const t = meta.garmentTypes.find(x => x.id === Number(e.target.value)); set({ garmentTypeId: t.id, specs: {}, designId: null, measurements: { groups: {} }, charges: { ...item.charges, base: rupees(t.basePrice) } }) }}>
          {meta.garmentTypes.filter(t => t.active || t.id === item.garmentTypeId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        <Field label="Quantity"><input type="number" min="1" max="50" value={item.qty} onChange={e => set({ qty: e.target.value })} /></Field>
        <Field label="Saved design (optional)"><select value={item.designId ?? ''} onChange={e => pickDesign(e.target.value)}><option value="">None</option>
          {designs.filter(d => d.garmentTypeId === item.garmentTypeId || d.id === item.designId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
      </div>

      <div className="stc-sec"><h4>Design and stitching specifications</h4>
        <div className="stc-grid">{(type?.specFields ?? []).map(k => { const f = meta.specLibrary[k]; return (
          <Field key={k} label={f.label}>{k === 'neck_design' ? <NeckField value={item.specs[k] ?? ''} onChange={v => set({ specs: { ...item.specs, [k]: v } })} /> : f.type === 'select'
            ? <select value={item.specs[k] ?? ''} onChange={e => set({ specs: { ...item.specs, [k]: e.target.value } })}><option value="">—</option>{f.options.map(o => <option key={o}>{o}</option>)}</select>
            : <input value={item.specs[k] ?? ''} maxLength={300} onChange={e => set({ specs: { ...item.specs, [k]: e.target.value } })} />}</Field>) })}</div>
        {item.custom.map((c, i) => <div key={i} className="stc-row"><input style={{ flex: '1 1 160px' }} placeholder="Specification" aria-label="Custom specification name" value={c.label} onChange={e => set({ custom: item.custom.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
          <input style={{ flex: '2 1 220px' }} placeholder="Detail" aria-label="Custom specification detail" value={c.value} onChange={e => set({ custom: item.custom.map((x, j) => j === i ? { ...x, value: e.target.value } : x) })} />
          <button type="button" className="dpos-btn danger sm" onClick={() => set({ custom: item.custom.filter((_, j) => j !== i) })}>Remove</button></div>)}
        <div><button type="button" className="dpos-btn ghost sm" onClick={() => set({ custom: [...item.custom, { label: '', value: '' }] })}>+ Custom specification</button></div>
        <Field label="Special instructions for this garment"><textarea rows="2" maxLength={500} value={item.notes} onChange={e => set({ notes: e.target.value })} /></Field></div>

      <div className="stc-sec"><h4>Fabric and materials</h4>
        <div className="stc-grid">
          <Field label="Fabric from"><select value={item.fabric.source} onChange={e => fab({ source: e.target.value })}><option value="customer">Customer brings fabric</option><option value="boutique">Boutique provides fabric</option></select></Field>
          <Field label="Fabric type"><input value={item.fabric.type} onChange={e => fab({ type: e.target.value })} placeholder="e.g. Kanjivaram silk" /></Field>
          <Field label="Colour"><input value={item.fabric.color} onChange={e => fab({ color: e.target.value })} /></Field>
          <Field label="Quantity / notes"><input value={item.fabric.quantity} onChange={e => fab({ quantity: e.target.value })} placeholder="e.g. 1.2 m" /></Field>
          <Field label="Lining material"><input value={item.fabric.lining} onChange={e => fab({ lining: e.target.value })} /></Field>
          <Field label="Accessories"><input value={item.fabric.accessories} onChange={e => fab({ accessories: e.target.value })} placeholder="hooks, zip, lace…" /></Field>
          <Field label="Material status"><select value={item.fabric.status} onChange={e => fab({ status: e.target.value })}><option value="pending">Awaiting fabric</option><option value="received">Fabric received</option><option value="ready">Ready for cutting</option></select></Field>
        </div>
        {item.fabric.source === 'boutique' && <FabricLink value={item.fabric.variantId} name={item.fabric.linkedName} onPick={(v, n) => fab({ variantId: v, linkedName: n })} />}
        <div className="stc-photos">{item.fabric.photos.map((u, i) => <figure key={u}><img src={u} alt={`Fabric reference ${i + 1}`} /><button type="button" aria-label="Remove photo" onClick={() => fab({ photos: item.fabric.photos.filter(x => x !== u) })}>✕</button></figure>)}
          {item.fabric.photos.length < 5 && <label className="dpos-btn ghost sm" style={{ cursor: 'pointer' }}>{busy ? 'UPLOADING…' : '+ Fabric / reference photo'}<input type="file" hidden accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={e => { addPhotos([...e.target.files]); e.target.value = '' }} /></label>}</div>
        {item.fabric.variantId && <p className="muted small" style={{ margin: 0 }}>Linking a product records which fabric is used. Stock is not deducted here: sell the fabric through billing so the stock and invoice stay correct.</p>}
      </div>

      <div className="stc-sec"><h4>Measurements</h4>
        {(groups.length ? groups : ['misc']).map(g => <MeasureEditor key={g} group={g} meta={meta} customerId={customerId} profiles={profiles} value={item.measurements.groups[g] ?? blankMeasure()} onChange={v => setGroup(g, v)} />)}
        {groups.length > 0 && !showMisc && <div><button type="button" className="dpos-btn ghost sm" onClick={() => setGroup('misc', blankMeasure())}>+ Other measurements (custom)</button></div>}
        {groups.length > 0 && showMisc && <MeasureEditor group="misc" meta={meta} customerId={customerId} profiles={profiles} value={item.measurements.groups.misc ?? blankMeasure()} onChange={v => setGroup('misc', v)} />}
        <p className="muted small" style={{ margin: 0 }}>A dated copy of these measurements is saved with the order, so later changes to the customer's book never alter it.</p></div>

      <div className="stc-sec"><h4>Charges per garment (₹)</h4>
        <div className="stc-grid">{[['base', 'Stitching'], ['design', 'Design / neck'], ['embroidery', 'Embroidery'], ['material', 'Lining / material']].map(([k, l]) => (
          <Field key={k} label={l}><input type="number" min="0" step="1" inputMode="decimal" value={item.charges[k]} onChange={ch(k)} /></Field>))}</div>
        <div className="stc-row between"><span className="muted small">Per garment {inr(chargeOf(item))} × {Number(item.qty) || 1}</span><b>{inr(line)}</b></div></div>
    </div>);
}

export const Kpi = ({ label, value, tone, to }) => { const st = tone ? { borderColor: tone } : undefined; return to ? <Link className="dpos-kpi" to={to} style={st}><span>{label}</span><b>{value}</b></Link> : <div className="dpos-kpi" style={st}><span>{label}</span><b>{value}</b></div> };
export function useOnce(fn, deps) { const r = useRef(fn); r.current = fn; useEffect(() => { r.current() }, deps) } // eslint-disable-line
