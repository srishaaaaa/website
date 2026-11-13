import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Icon } from './AdminShell';

const toPaise = s => { const n = Math.round(parseFloat(String(s ?? '').replace(/,/g, '')) * 100); return Number.isFinite(n) && n >= 0 ? n : 0 };
const rs = p => (p == null ? '' : String(p / 100));
const list = s => String(s || '').split(/[,\s]+/).map(x => x.replace(/\D/g, '')).filter(Boolean);

// Delivery charge rules: a default fee, PIN-code zones (by the first digits of the PIN), cheaper tiers for bigger orders, free delivery above an amount,
// and PIN prefixes that are not delivered to. Switched off = the shipping method's flat fee applies, as before.
export default function DeliveryRulesCard() {
  const [r, setR] = useState(null); const [err, setErr] = useState(); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/admin/pos/delivery-rules').then(d => setR({ enabled: d.enabled, lines: (d.productLines || []).join('\n'), weightMode: !!d.weightMode, regions: (d.weightRegions || []).map(g => ({ name: g.name, active: g.active !== false, prefixes: (g.prefixes || []).join(', '), tiers: (g.tiers || []).map(t => ({ min: String(t.minGrams), max: t.maxGrams == null ? '' : String(t.maxGrams), fee: rs(t.fee) })) })), note: d.note || '', storePin: d.storePin || '', maxKm: String(d.maxKm || 0), perKm: rs(d.perKmBeyond || 0), bands: (d.bands || []).map(b => ({ km: String(b.upToKm), fee: rs(b.fee) })), defaultFee: rs(d.defaultFee), freeOver: d.freeOver == null ? '' : rs(d.freeOver),
      zones: (d.zones || []).map(z => ({ name: z.name, prefixes: z.prefixes.join(', '), fee: rs(z.fee) })), tiers: (d.orderTiers || []).map(t => ({ min: rs(t.minOrder), fee: rs(t.fee) })), blocked: (d.blockedPrefixes || []).join(', ') })).catch(e => setErr(e.message));
  }, []);
  if (!r) return err ? <p className="dpos-err" role="alert">{err}</p> : null;
  const up = p => { setR({ ...r, ...p }); setOk(false) };
  const save = async () => {
    setBusy(true); setErr(); setOk(false);
    try {
      await api('/admin/pos/delivery-rules', { method: 'PUT', body: { enabled: r.enabled, productLines: r.lines.split('\n').map(x => x.trim().slice(0, 300)).filter(Boolean).slice(0, 20), weightMode: r.weightMode, weightRegions: r.regions.filter(g => g.name.trim()).map(g => ({ name: g.name.trim(), active: g.active, prefixes: list(g.prefixes), tiers: g.tiers.filter(t => t.min !== '').map(t => ({ minGrams: Math.max(0, parseInt(t.min, 10) || 0), maxGrams: t.max === '' ? null : Math.max(1, parseInt(t.max, 10) || 1), fee: toPaise(t.fee) })) })), note: (r.note || '').trim(), storePin: r.storePin.trim(), maxKm: Math.max(0, +r.maxKm || 0), perKmBeyond: toPaise(r.perKm), bands: r.bands.filter(b => +b.km > 0).map(b => ({ upToKm: +b.km, fee: toPaise(b.fee) })), defaultFee: toPaise(r.defaultFee), freeOver: r.freeOver === '' ? null : toPaise(r.freeOver),
        zones: r.zones.filter(z => z.name.trim() && list(z.prefixes).length).map(z => ({ name: z.name.trim(), prefixes: list(z.prefixes), fee: toPaise(z.fee) })),
        orderTiers: r.tiers.filter(t => t.min !== '').map(t => ({ minOrder: toPaise(t.min), fee: toPaise(t.fee) })), blockedPrefixes: list(r.blocked) } });
      setOk(true);
    } catch (e) { setErr(e.issues?.[0]?.message || e.message) } finally { setBusy(false) }
  };
  return (
    <section className="dpos-card dlv">
      <h2><Icon n="truck" />Delivery charge</h2>
      <label className="cp-sw"><input type="checkbox" checked={r.enabled} onChange={e => up({ enabled: e.target.checked })} /><span><b>Use these delivery rules at checkout</b><small>Off: the shipping method's flat fee and free-over amount are used.</small></span></label>
      <div style={{ opacity: r.enabled ? 1 : .55, display: 'grid', gap: 14, marginTop: 12 }}>
        <label className="f">Shipping note shown to customers (bag and checkout)<textarea rows={2} maxLength={300} value={r.note} onChange={e => up({ note: e.target.value })} placeholder="e.g. Delivered within 5 to 7 working days across India." /></label>
        <label className="f">Product pages: Delivery &amp; Returns lines (one per line; empty = the shipping note and free-delivery line are shown)<textarea rows={3} maxLength={2000} value={r.lines} onChange={e => up({ lines: e.target.value })} placeholder={'Delivery across India in 5 to 7 working days\nFree delivery on orders above ₹5,000'} /></label>
        <div className="dlv-wt">
          <label className="cp-sw"><input type="checkbox" checked={r.weightMode} onChange={e => up({ weightMode: e.target.checked })} /><span><b>Charge by product weight</b><small>The bag's total weight (each product's weight × quantity) is priced by the customer's region. Free-over, order tiers and blocked PINs still apply. Off: the distance bands and zones below are used.</small></span></label>
          <div style={{ opacity: r.weightMode ? 1 : .55, display: 'grid', gap: 12, marginTop: 10 }}>
            {r.regions.map((g, gi) => {
              const setG = p => up({ regions: r.regions.map((x, n) => n === gi ? { ...x, ...p } : x) });
              const setT = (ti, p) => setG({ tiers: g.tiers.map((x, n) => n === ti ? { ...x, ...p } : x) });
              return (
                <div className="dlv-region" key={gi}>
                  <div className="dlv-rh">
                    <input aria-label="Region name" placeholder="Region name, e.g. Tamil Nadu or All India" value={g.name} onChange={e => setG({ name: e.target.value })} />
                    <input aria-label="PIN prefixes" placeholder="PIN prefixes: 6, 56 (empty = everywhere else)" value={g.prefixes} onChange={e => setG({ prefixes: e.target.value })} />
                    <label className="dlv-act"><input type="checkbox" checked={g.active} onChange={e => setG({ active: e.target.checked })} /> Active</label>
                    <button type="button" className="dpos-btn ghost sm" aria-label="Remove region" onClick={() => up({ regions: r.regions.filter((_, n) => n !== gi) })}>✕</button>
                  </div>
                  <p className="dlv-h">Weight tiers <small>grams: from (included) to (not included); leave "to" empty for no limit; no tiers = free delivery</small></p>
                  {g.tiers.map((t, ti) => (
                    <div className="dlv-row" key={ti}>
                      <span className="muted small">From</span><input aria-label="From grams" inputMode="numeric" value={t.min} onChange={e => setT(ti, { min: e.target.value })} /><span className="muted small">g to</span>
                      <input aria-label="To grams" inputMode="numeric" placeholder="no limit" value={t.max} onChange={e => setT(ti, { max: e.target.value })} /><span className="muted small">g → ₹</span>
                      <input aria-label="Charge in rupees" inputMode="decimal" value={t.fee} onChange={e => setT(ti, { fee: e.target.value })} />
                      <button type="button" className="dpos-btn ghost sm" aria-label="Remove tier" onClick={() => setG({ tiers: g.tiers.filter((_, n) => n !== ti) })}>✕</button>
                    </div>))}
                  <button type="button" className="dpos-btn ghost sm" onClick={() => setG({ tiers: [...g.tiers, { min: g.tiers.length ? g.tiers.at(-1).max : '0', max: '', fee: '' }] })}>+ Add tier</button>
                </div>);
            })}
            <div><button type="button" className="dpos-btn ghost sm" onClick={() => up({ regions: [...r.regions, { name: '', active: true, prefixes: '', tiers: [{ min: '0', max: '', fee: '' }] }] })}>+ Add region</button></div>
          </div>
        </div>
        <div className="dpos-grid">
          <label className="f">Shop PIN code (distance starts here)<input inputMode="numeric" maxLength={6} value={r.storePin} onChange={e => up({ storePin: e.target.value.replace(/\D/g, '') })} placeholder="6 digits" /></label>
          <label className="f">Do not deliver beyond (km, 0 = no limit)<input inputMode="decimal" value={r.maxKm} onChange={e => up({ maxKm: e.target.value })} /></label>
          <label className="f">Extra per km beyond the last band (₹)<input inputMode="decimal" value={r.perKm} onChange={e => up({ perKm: e.target.value })} /></label>
        </div>
        <div><p className="dlv-h">DISTANCE BANDS <small>straight-line km from the shop to the customer's PIN</small></p>
          {r.bands.map((b, i) => (
            <div className="dlv-row" key={i}>
              <span className="muted small">Up to</span><input aria-label="Up to km" inputMode="decimal" value={b.km} onChange={e => up({ bands: r.bands.map((x, n) => n === i ? { ...x, km: e.target.value } : x) })} /><span className="muted small">km → ₹</span>
              <input aria-label="Fee in rupees" inputMode="decimal" value={b.fee} onChange={e => up({ bands: r.bands.map((x, n) => n === i ? { ...x, fee: e.target.value } : x) })} />
              <button type="button" className="dpos-btn ghost sm" aria-label="Remove band" onClick={() => up({ bands: r.bands.filter((_, n) => n !== i) })}>✕</button>
            </div>))}
          <button type="button" className="dpos-btn ghost sm" onClick={() => up({ bands: [...r.bands, { km: '', fee: '' }] })}>+ Add band</button></div>
        <div className="dpos-grid">
          <label className="f">Default fee (₹)<input inputMode="decimal" value={r.defaultFee} onChange={e => up({ defaultFee: e.target.value })} /></label>
          <label className="f">Free delivery above (₹)<input inputMode="decimal" value={r.freeOver} onChange={e => up({ freeOver: e.target.value })} placeholder="Never free" /></label>
        </div>
        <div><p className="dlv-h">PIN zones <small>optional: these PINs use the zone fee instead of the distance bands (first digits, e.g. 600, 641)</small></p>
          {r.zones.map((z, i) => (
            <div className="dlv-row" key={i}>
              <input aria-label="Zone name" placeholder="Zone name" value={z.name} onChange={e => up({ zones: r.zones.map((x, n) => n === i ? { ...x, name: e.target.value } : x) })} />
              <input aria-label="PIN prefixes" placeholder="PIN prefixes: 600, 601" value={z.prefixes} onChange={e => up({ zones: r.zones.map((x, n) => n === i ? { ...x, prefixes: e.target.value } : x) })} />
              <input aria-label="Fee in rupees" inputMode="decimal" placeholder="Fee ₹" value={z.fee} onChange={e => up({ zones: r.zones.map((x, n) => n === i ? { ...x, fee: e.target.value } : x) })} />
              <button type="button" className="dpos-btn ghost sm" aria-label="Remove zone" onClick={() => up({ zones: r.zones.filter((_, n) => n !== i) })}>✕</button>
            </div>))}
          <button type="button" className="dpos-btn ghost sm" onClick={() => up({ zones: [...r.zones, { name: '', prefixes: '', fee: '' }] })}>+ Add zone</button></div>
        <div><p className="dlv-h">Cheaper delivery for bigger orders <small>the lowest matching fee applies</small></p>
          {r.tiers.map((t, i) => (
            <div className="dlv-row" key={i}>
              <input aria-label="Order of at least" inputMode="decimal" placeholder="Order of at least ₹" value={t.min} onChange={e => up({ tiers: r.tiers.map((x, n) => n === i ? { ...x, min: e.target.value } : x) })} />
              <input aria-label="Fee in rupees" inputMode="decimal" placeholder="Fee ₹" value={t.fee} onChange={e => up({ tiers: r.tiers.map((x, n) => n === i ? { ...x, fee: e.target.value } : x) })} />
              <button type="button" className="dpos-btn ghost sm" aria-label="Remove tier" onClick={() => up({ tiers: r.tiers.filter((_, n) => n !== i) })}>✕</button>
            </div>))}
          <button type="button" className="dpos-btn ghost sm" onClick={() => up({ tiers: [...r.tiers, { min: '', fee: '' }] })}>+ Add tier</button></div>
        <label className="f">We do not deliver to PIN prefixes <small className="muted">(comma separated, optional)</small><input value={r.blocked} onChange={e => up({ blocked: e.target.value })} placeholder="e.g. 194, 744" /></label>
      </div>
      {err && <p className="dpos-err" role="alert">{err}</p>}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 14 }}><button type="button" className="dpos-btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save delivery rules'}</button>{ok && <span className="dpos-ok">Saved ✓</span>}</div>
    </section>
  );
}
