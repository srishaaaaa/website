import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import AdminShell, { Icon } from './AdminShell';

const toPaise = s => { const n = Math.round(parseFloat(String(s ?? '').replace(/,/g, '')) * 100); return Number.isFinite(n) && n >= 0 ? n : 0 };
const rs = p => (p == null ? '' : String(p / 100));
const list = s => String(s || '').split(/[,\s]+/).map(x => x.replace(/\D/g, '')).filter(Boolean);
const tier = (min, max, fee) => ({ min: String(min), max: max == null ? '' : String(max), fee: String(fee) });

// A starting point the owner can edit: Tamil Nadu, the rest of South India and the rest of India, priced by the bag's weight.
const SAMPLE = [
  { name: 'Tamil Nadu', active: true, prefixes: '60, 61, 62, 63, 64', tiers: [tier(0, 500, 60), tier(500, 2000, 90), tier(2000, null, 140)] },
  { name: 'South India', active: true, prefixes: '5, 67, 68, 69', tiers: [tier(0, 500, 80), tier(500, 2000, 120), tier(2000, null, 180)] },
  { name: 'Rest of India', active: true, prefixes: '', tiers: [tier(0, 500, 100), tier(500, 2000, 160), tier(2000, null, 240)] },
];

// Delivery & Shipping Rules: delivery regions (chosen by PIN prefix) with weight brackets and their fee, plus the other delivery settings
// (shipping note, distance bands, PIN zones, cheaper delivery for bigger orders, free delivery, blocked PINs).
export default function DeliveryRulesCard() {
  const [r, setR] = useState(null); const [err, setErr] = useState(); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState({ 0: true }); const [edit, setEdit] = useState(null); // edit: { i (index or 'new'), name, prefixes }
  const [more, setMore] = useState(false);
  useEffect(() => {
    api('/admin/pos/delivery-rules').then(d => setR({ enabled: d.enabled, lines: (d.productLines || []).join('\n'), weightMode: !!d.weightMode, regions: (d.weightRegions || []).map(g => ({ name: g.name, active: g.active !== false, prefixes: (g.prefixes || []).join(', '), tiers: (g.tiers || []).map(t => ({ min: String(t.minGrams), max: t.maxGrams == null ? '' : String(t.maxGrams), fee: rs(t.fee) })) })), note: d.note || '', storePin: d.storePin || '', maxKm: String(d.maxKm || 0), perKm: rs(d.perKmBeyond || 0), bands: (d.bands || []).map(b => ({ km: String(b.upToKm), fee: rs(b.fee) })), defaultFee: rs(d.defaultFee), freeOver: d.freeOver == null ? '' : rs(d.freeOver),
      zones: (d.zones || []).map(z => ({ name: z.name, prefixes: z.prefixes.join(', '), fee: rs(z.fee) })), tiers: (d.orderTiers || []).map(t => ({ min: rs(t.minOrder), fee: rs(t.fee) })), blocked: (d.blockedPrefixes || []).join(', ') })).catch(e => setErr(e.message));
  }, []);
  const up = p => { setR(x => ({ ...x, ...p })); setOk('') };
  const save = async (next = r, msg = 'Saved ✓') => {
    setBusy(true); setErr(); setOk('');
    try {
      await api('/admin/pos/delivery-rules', { method: 'PUT', body: { enabled: next.enabled, productLines: next.lines.split('\n').map(x => x.trim().slice(0, 300)).filter(Boolean).slice(0, 20), weightMode: next.weightMode, weightRegions: next.regions.filter(g => g.name.trim()).map(g => ({ name: g.name.trim(), active: g.active, prefixes: list(g.prefixes), tiers: g.tiers.filter(t => t.min !== '').map(t => ({ minGrams: Math.max(0, parseInt(t.min, 10) || 0), maxGrams: t.max === '' ? null : Math.max(1, parseInt(t.max, 10) || 1), fee: toPaise(t.fee) })) })), note: (next.note || '').trim(), storePin: next.storePin.trim(), maxKm: Math.max(0, +next.maxKm || 0), perKmBeyond: toPaise(next.perKm), bands: next.bands.filter(b => +b.km > 0).map(b => ({ upToKm: +b.km, fee: toPaise(b.fee) })), defaultFee: toPaise(next.defaultFee), freeOver: next.freeOver === '' ? null : toPaise(next.freeOver),
        zones: next.zones.filter(z => z.name.trim() && list(z.prefixes).length).map(z => ({ name: z.name.trim(), prefixes: list(z.prefixes), fee: toPaise(z.fee) })),
        orderTiers: next.tiers.filter(t => t.min !== '').map(t => ({ minOrder: toPaise(t.min), fee: toPaise(t.fee) })), blockedPrefixes: list(next.blocked) } });
      setOk(msg);
    } catch (e) { setErr(e.issues?.[0]?.message || e.message) } finally { setBusy(false) }
  };
  // region changes that are saved straight away (enable / disable, rename, add, delete, load samples)
  const setRegions = (regions, msg) => { const next = { ...r, regions }; setR(next); save(next, msg) };

  const actions = r && <>
    <button type="button" className="dlv2-sample" disabled={busy} onClick={() => { if (r.regions.length && !confirm('Replace your regions with the sample regions and tiers?')) return; setOpen({ 0: true }); setRegions(SAMPLE, 'Sample regions loaded ✓') }}>Load Sample Regions &amp; Tiers</button>
    <button type="button" className="dpos-btn" onClick={() => setEdit({ i: 'new', name: '', prefixes: '' })}><Icon n="plus" size={15} />Add Delivery Region</button>
  </>;

  return (
    <AdminShell title="Delivery & Shipping Rules" sub="Configure delivery regions and weight-bracket shipping charges (0–500 g, 500 g–2 kg, etc.)" actions={actions}>
      {!r ? (err ? <p className="dpos-err" role="alert">{err}</p> : <p className="muted">Loading…</p>) : <div className="dlv2">
        {err && <p className="dpos-err" role="alert">{err}</p>}
        {ok && <p className="dlv2-ok" role="status">{ok}</p>}
        {!r.regions.length && <div className="dlv2-empty">No delivery regions yet. Add a region or load the sample regions and tiers.</div>}
        {r.regions.map((g, gi) => {
          const setG = p => up({ regions: r.regions.map((x, n) => n === gi ? { ...x, ...p } : x) });
          const setT = (ti, p) => setG({ tiers: g.tiers.map((x, n) => n === ti ? { ...x, ...p } : x) });
          const isOpen = !!open[gi]; const n = g.tiers.length;
          return (
            <section className={`dlv2-card ${g.active ? '' : 'off'}`} key={gi}>
              <button type="button" className="dlv2-head" aria-expanded={isOpen} onClick={() => setOpen(o => ({ ...o, [gi]: !o[gi] }))}>
                <span className="dlv2-ic"><Icon n="truck" size={18} /></span>
                <span className="dlv2-t"><span><b>{g.name || 'Unnamed region'}</b><i className={g.active ? 'on' : ''}>{g.active ? 'ACTIVE' : 'DISABLED'}</i></span>
                  <small className={n ? 'ok' : 'warn'}>{n ? `✓ ${n} weight ${n === 1 ? 'tier' : 'tiers'} configured` : '⚠ No weight tiers configured (free delivery)'}<em> · {list(g.prefixes).length ? `PIN ${list(g.prefixes).join(', ')}…` : 'Everywhere else'}</em></small></span>
                <span className="dlv2-chev" aria-hidden="true"><Icon n="chevron" size={16} /></span>
              </button>
              <div className="dlv2-bar">
                <button type="button" className="warn" onClick={() => setRegions(r.regions.map((x, k) => k === gi ? { ...x, active: !x.active } : x), g.active ? `${g.name} disabled ✓` : `${g.name} enabled ✓`)}>{g.active ? 'Disable' : 'Enable'}</button>
                <button type="button" onClick={() => setEdit({ i: gi, name: g.name, prefixes: g.prefixes })}><Icon n="edit" size={14} />Edit</button>
                <button type="button" className="bad" onClick={() => { if (confirm(`Delete the region “${g.name}”?`)) setRegions(r.regions.filter((_, k) => k !== gi), 'Region deleted ✓') }}><Icon n="trash" size={14} />Delete</button>
              </div>
              {isOpen && <div className="dlv2-body">
                <div className="dlv2-bh"><div><p>WEIGHT TIERS &amp; DELIVERY CHARGES</p><small>Set weight brackets in grams (g) and their delivery fee (₹). Leave “max” empty for no limit.</small></div>
                  <button type="button" className="dpos-btn ghost" onClick={() => setG({ tiers: [...g.tiers, { min: g.tiers.length ? (g.tiers.at(-1).max || '') : '0', max: '', fee: '' }] })}><Icon n="plus" size={14} />Add Weight Bracket</button></div>
                {n > 0 && <div className="dlv2-tw"><table>
                  <thead><tr><th>#</th><th>MIN WEIGHT (G)</th><th>MAX WEIGHT (G)</th><th>DELIVERY FEE (₹)</th><th className="r">ACTION</th></tr></thead>
                  <tbody>{g.tiers.map((t, ti) => (
                    <tr key={ti}><td className="n">{ti + 1}</td>
                      <td><span className="dlv2-in"><input aria-label="Minimum grams" inputMode="numeric" value={t.min} onChange={e => setT(ti, { min: e.target.value.replace(/\D/g, '') })} /><em>g</em></span></td>
                      <td><span className="dlv2-in"><input aria-label="Maximum grams" inputMode="numeric" placeholder="No limit" value={t.max} onChange={e => setT(ti, { max: e.target.value.replace(/\D/g, '') })} /><em>{t.max === '' ? '(Unlimited)' : 'g'}</em></span></td>
                      <td><span className="dlv2-in fee"><em>₹</em><input aria-label="Delivery fee in rupees" inputMode="decimal" value={t.fee} onChange={e => setT(ti, { fee: e.target.value.replace(/[^\d.]/g, '') })} /></span></td>
                      <td className="r"><button type="button" className="dlv2-del" aria-label="Remove bracket" onClick={() => setG({ tiers: g.tiers.filter((_, k) => k !== ti) })}><Icon n="trash" size={16} /></button></td></tr>))}</tbody>
                </table></div>}
                <div className="dlv2-save"><button type="button" className="dpos-btn" disabled={busy} onClick={() => save(r, 'Weight tiers saved ✓')}><Icon n="save" size={15} />{busy ? 'Saving…' : 'Save Weight Tiers'}</button></div>
              </div>}
            </section>);
        })}

        <section className="dlv2-card more">
          <button type="button" className="dlv2-head" aria-expanded={more} onClick={() => setMore(m => !m)}>
            <span className="dlv2-ic"><Icon n="gear" size={18} /></span>
            <span className="dlv2-t"><span><b>More delivery settings</b><i className={r.enabled ? 'on' : ''}>{r.enabled ? 'RULES ON' : 'RULES OFF'}</i></span><small>Shipping note, free delivery, distance bands, PIN zones, bigger-order discounts and blocked PINs</small></span>
            <span className="dlv2-chev" aria-hidden="true"><Icon n="chevron" size={16} /></span>
          </button>
          {more && <div className="dlv2-body dlv-body">
            <label className="cp-sw"><input type="checkbox" checked={r.enabled} onChange={e => up({ enabled: e.target.checked })} /><span><b>Use these delivery rules at checkout</b><small>Off: the shipping method's flat fee and free-over amount are used.</small></span></label>
            <label className="cp-sw"><input type="checkbox" checked={r.weightMode} onChange={e => up({ weightMode: e.target.checked })} /><span><b>Charge by product weight (the regions above)</b><small>Off: the distance bands and PIN zones below are used instead.</small></span></label>
            <div className="dpos-grid">
              <label className="f">Shipping note shown to customers<textarea rows={2} maxLength={300} value={r.note} onChange={e => up({ note: e.target.value })} placeholder="e.g. Delivered within 5 to 7 working days across India." /></label>
              <label className="f">Product pages: Delivery &amp; Returns lines (one per line)<textarea rows={2} maxLength={2000} value={r.lines} onChange={e => up({ lines: e.target.value })} placeholder={'Delivery across India in 5 to 7 working days\nFree delivery on orders above ₹5,000'} /></label>
            </div>
            <div className="dpos-grid">
              <label className="f">Default fee (₹)<input inputMode="decimal" value={r.defaultFee} onChange={e => up({ defaultFee: e.target.value })} /></label>
              <label className="f">Free delivery above (₹)<input inputMode="decimal" value={r.freeOver} onChange={e => up({ freeOver: e.target.value })} placeholder="Never free" /></label>
              <label className="f">We do not deliver to PIN prefixes<input value={r.blocked} onChange={e => up({ blocked: e.target.value })} placeholder="e.g. 194, 744" /></label>
            </div>
            <div className="dpos-grid">
              <label className="f">Shop PIN code (distance starts here)<input inputMode="numeric" maxLength={6} value={r.storePin} onChange={e => up({ storePin: e.target.value.replace(/\D/g, '') })} placeholder="6 digits" /></label>
              <label className="f">Do not deliver beyond (km, 0 = no limit)<input inputMode="decimal" value={r.maxKm} onChange={e => up({ maxKm: e.target.value })} /></label>
              <label className="f">Extra per km beyond the last band (₹)<input inputMode="decimal" value={r.perKm} onChange={e => up({ perKm: e.target.value })} /></label>
            </div>
            <div className="dlv2-three">
              <div><p className="dlv-h">Distance bands <small>km from the shop to the customer's PIN</small></p>
                {r.bands.map((b, i) => (
                  <div className="dlv-row" key={i}>
                    <span className="muted small">Up to</span><input aria-label="Up to km" inputMode="decimal" value={b.km} onChange={e => up({ bands: r.bands.map((x, n) => n === i ? { ...x, km: e.target.value } : x) })} /><span className="muted small">km ₹</span>
                    <input aria-label="Fee in rupees" inputMode="decimal" value={b.fee} onChange={e => up({ bands: r.bands.map((x, n) => n === i ? { ...x, fee: e.target.value } : x) })} />
                    <button type="button" className="dlv2-del" aria-label="Remove band" onClick={() => up({ bands: r.bands.filter((_, n) => n !== i) })}><Icon n="trash" size={15} /></button>
                  </div>))}
                <button type="button" className="dpos-btn ghost sm" onClick={() => up({ bands: [...r.bands, { km: '', fee: '' }] })}>+ Add band</button></div>
              <div><p className="dlv-h">PIN zones <small>these PINs use the zone fee (e.g. 600, 641)</small></p>
                {r.zones.map((z, i) => (
                  <div className="dlv-row" key={i}>
                    <input aria-label="Zone name" placeholder="Zone" value={z.name} onChange={e => up({ zones: r.zones.map((x, n) => n === i ? { ...x, name: e.target.value } : x) })} />
                    <input aria-label="PIN prefixes" placeholder="600, 601" value={z.prefixes} onChange={e => up({ zones: r.zones.map((x, n) => n === i ? { ...x, prefixes: e.target.value } : x) })} />
                    <input aria-label="Fee in rupees" inputMode="decimal" placeholder="₹" value={z.fee} onChange={e => up({ zones: r.zones.map((x, n) => n === i ? { ...x, fee: e.target.value } : x) })} />
                    <button type="button" className="dlv2-del" aria-label="Remove zone" onClick={() => up({ zones: r.zones.filter((_, n) => n !== i) })}><Icon n="trash" size={15} /></button>
                  </div>))}
                <button type="button" className="dpos-btn ghost sm" onClick={() => up({ zones: [...r.zones, { name: '', prefixes: '', fee: '' }] })}>+ Add zone</button></div>
              <div><p className="dlv-h">Cheaper delivery for bigger orders <small>lowest matching fee applies</small></p>
                {r.tiers.map((t, i) => (
                  <div className="dlv-row" key={i}>
                    <input aria-label="Order of at least" inputMode="decimal" placeholder="Order ₹" value={t.min} onChange={e => up({ tiers: r.tiers.map((x, n) => n === i ? { ...x, min: e.target.value } : x) })} />
                    <input aria-label="Fee in rupees" inputMode="decimal" placeholder="Fee ₹" value={t.fee} onChange={e => up({ tiers: r.tiers.map((x, n) => n === i ? { ...x, fee: e.target.value } : x) })} />
                    <button type="button" className="dlv2-del" aria-label="Remove tier" onClick={() => up({ tiers: r.tiers.filter((_, n) => n !== i) })}><Icon n="trash" size={15} /></button>
                  </div>))}
                <button type="button" className="dpos-btn ghost sm" onClick={() => up({ tiers: [...r.tiers, { min: '', fee: '' }] })}>+ Add tier</button></div>
            </div>
            <div className="dlv2-save"><button type="button" className="dpos-btn" disabled={busy} onClick={() => save()}><Icon n="save" size={15} />{busy ? 'Saving…' : 'Save Delivery Settings'}</button></div>
          </div>}
        </section>
      </div>}

      {edit && <div className="dpos-modal" role="dialog" aria-modal="true" aria-label={edit.i === 'new' ? 'Add delivery region' : 'Edit delivery region'} onMouseDown={e => e.target === e.currentTarget && setEdit(null)}>
        <form className="dpos-sheet dlv2-modal" onSubmit={e => {
          e.preventDefault(); if (!edit.name.trim()) return;
          if (edit.i === 'new') { const i = r.regions.length; setOpen(o => ({ ...o, [i]: true })); setRegions([...r.regions, { name: edit.name.trim(), active: true, prefixes: edit.prefixes, tiers: [] }], 'Region added ✓') }
          else setRegions(r.regions.map((x, k) => k === edit.i ? { ...x, name: edit.name.trim(), prefixes: edit.prefixes } : x), 'Region saved ✓');
          setEdit(null);
        }}>
          <div className="dlv2-mh"><b>{edit.i === 'new' ? 'Add New Delivery Region' : 'Edit Delivery Region'}</b><button type="button" aria-label="Close" onClick={() => setEdit(null)}>✕</button></div>
          <label className="f">REGION NAME<input autoFocus required maxLength={60} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Tamil Nadu, South India, Rest of India" /></label>
          <label className="f">PIN CODE PREFIXES <small className="muted">(optional · empty = everywhere else)</small><input value={edit.prefixes} onChange={e => setEdit({ ...edit, prefixes: e.target.value })} placeholder="e.g. 60, 61, 62" /></label>
          <div className="dlv2-mf"><button type="button" className="dpos-btn ghost" onClick={() => setEdit(null)}>Cancel</button><button className="dpos-btn">{edit.i === 'new' ? 'Create Region' : 'Save Region'}</button></div>
        </form>
      </div>}
    </AdminShell>
  );
}
