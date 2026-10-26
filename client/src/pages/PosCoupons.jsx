import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import { Icon } from '../components/AdminShell';

const toPaise = s => { const n = Math.round(parseFloat(String(s || '').replace(/,/g, '')) * 100); return Number.isFinite(n) && n > 0 ? n : 0 };
const dmy = d => d ? String(d).slice(0, 10).split('-').reverse().join('-') : '';
const BLANK = { code: '', type: 'percent', value: '', min: '', expires: '', limit: '' };
const generate = () => { const w = ['DHANYA', 'SAREE', 'FESTIVE', 'WELCOME', 'SILK']; const r = Math.random().toString(36).slice(2, 5).toUpperCase(); return `${w[Math.floor(Math.random() * w.length)]}${[5, 10, 15, 20][Math.floor(Math.random() * 4)]}${r}` };

// Coupon Management: create discount codes and see how they are used. Discounts apply to the product subtotal only.
export default function PosCoupons() {
  const [list, setList] = useState(null); const [err, setErr] = useState(); const [f, setF] = useState(BLANK); const [busy, setBusy] = useState(false);
  const load = useCallback(() => api('/admin/pos/coupons').then(l => { setList(l); setErr() }).catch(e => setErr(e.message)), []);
  useEffect(() => { load() }, [load]);
  const create = async e => {
    e.preventDefault(); setErr(); setBusy(true);
    try {
      await api('/admin/pos/coupons', { method: 'POST', body: { code: f.code.trim(), discountType: f.type, discountValue: f.type === 'percent' ? Math.round(+f.value) : toPaise(f.value), minOrder: toPaise(f.min), expiresOn: f.expires || null, usageLimit: f.limit ? Math.round(+f.limit) : null } });
      setF(BLANK); load();
    } catch (x) { setErr(x.issues?.[0]?.message || (x.message === 'Validation failed' ? 'Check the code (3–40 letters or digits) and the discount.' : x.message)) } finally { setBusy(false) }
  };
  const toggle = async c => { try { await api(`/admin/pos/coupons/${c.id}`, { method: 'PATCH', body: { active: !c.active } }); load() } catch (x) { setErr(x.message) } };
  const del = async c => { if (!confirm(`Delete coupon ${c.code}?`)) return; try { await api(`/admin/pos/coupons/${c.id}`, { method: 'DELETE' }); load() } catch (x) { setErr(x.message) } };
  const active = (list || []).filter(c => c.active && !(c.expiresOn && String(c.expiresOn).slice(0, 10) < new Date().toISOString().slice(0, 10))).length;
  const uses = (list || []).reduce((s, c) => s + c.usedCount, 0);
  return (
    <div className="cp">
      <div className="cp-top"><div><h2>Coupon Management</h2><p className="sub">Create and manage discount codes. Applies to product subtotal only.</p></div>
        <button type="button" className="cp-ref" onClick={load}><Icon n="refresh" size={16} /> Refresh</button></div>
      <div className="cp-kpis">
        <div className="cp-k"><div><span>TOTAL COUPONS</span><b>{list ? list.length : '…'}</b><small>Configured promotional codes</small></div><i><Icon n="tag" size={18} /></i></div>
        <div className="cp-k"><div><span>ACTIVE COUPONS</span><b className="g">{list ? active : '…'}</b><small>Live &amp; ready at POS checkout</small></div><i className="g"><Icon n="check" size={18} /></i></div>
        <div className="cp-k"><div><span>TOTAL REDEMPTIONS</span><b>{list ? uses : '…'}</b><small>Total customer discount usages</small></div><i className="dark">%</i></div>
      </div>
      <p className="cp-note"><Icon n="info" size={16} /> Coupon discount applies to product subtotal only — delivery charges are excluded.</p>
      {err && <p className="dpos-err" role="alert">{err}</p>}
      <div className="cp-two">
        <form className="cp-card" onSubmit={create}>
          <span className="cp-badge">NEW COUPON</span><h3>Create Coupon</h3>
          <label className="cp-l">COUPON CODE <em>*</em></label>
          <div className="cp-code"><input required value={f.code} maxLength={40} onChange={e => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} placeholder="WELCOME10" aria-label="Coupon code" /><button type="button" onClick={() => setF({ ...f, code: generate() })}><Icon n="spark" size={15} /> GENERATE</button></div>
          <div className="cp-g2">
            <label className="cp-l">DISCOUNT {f.type === 'percent' ? '%' : '(₹)'} <em>*</em><input required inputMode="decimal" value={f.value} onChange={e => setF({ ...f, value: e.target.value })} placeholder={f.type === 'percent' ? '10' : '100'} /></label>
            <label className="cp-l">MIN ORDER (INR)<input inputMode="decimal" value={f.min} onChange={e => setF({ ...f, min: e.target.value })} placeholder="0 = no minimum" /></label>
          </div>
          <div className="cp-type" role="radiogroup" aria-label="Discount type">{[['percent', '% off'], ['fixed', '₹ off']].map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={f.type === v} className={f.type === v ? 'on' : ''} onClick={() => setF({ ...f, type: v })}>{l}</button>)}</div>
          <div className="cp-g2">
            <label className="cp-l">EXPIRY DATE<input type="date" value={f.expires} onChange={e => setF({ ...f, expires: e.target.value })} /></label>
            <label className="cp-l">USAGE LIMIT<input inputMode="numeric" value={f.limit} onChange={e => setF({ ...f, limit: e.target.value.replace(/\D/g, '') })} placeholder="Unlimited" /></label>
          </div>
          <button className="cp-go" disabled={busy}><Icon n="tag" size={15} /> CREATE COUPON</button>
        </form>
        <section className="cp-card">
          <div className="cp-lh"><h3>All Coupons <span className="cp-n">{list ? list.length : 0}</span></h3><span className="cp-adm">ADMIN ONLY</span></div>
          {!list ? <p className="dpos-empty">Loading…</p> : !list.length ? <div className="cp-empty">No coupons yet. Create your first coupon!</div> : (
            <ul className="cp-list">{list.map(c => (
              <li key={c.id} className={c.active ? '' : 'off'}>
                <div><b className="cp-c">{c.code}</b><span className="cp-d">{c.discountType === 'percent' ? `${c.discountValue}% off` : `${inr(c.discountValue)} off`}</span></div>
                <p>{c.minOrder ? `Min ${inr(c.minOrder)}` : 'No minimum'} · {c.expiresOn ? `Expires ${dmy(c.expiresOn)}` : 'No expiry'} · Used {c.usedCount}{c.usageLimit ? ` of ${c.usageLimit}` : ''}</p>
                <div className="cp-act"><button type="button" role="switch" aria-checked={c.active} aria-label={`${c.code} ${c.active ? 'on' : 'off'}`} className={`dpos-switch ${c.active ? 'on' : ''}`} onClick={() => toggle(c)} /><button type="button" className="cp-del" aria-label={`Delete ${c.code}`} onClick={() => del(c)}><Icon n="trash" size={16} /></button></div>
              </li>))}</ul>)}
        </section>
      </div>
    </div>
  );
}
