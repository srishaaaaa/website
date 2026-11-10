import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import { waLink } from '../lib/contact';
import { Icon } from '../components/AdminShell';
import Modal from '../components/Modal';
import { downloadCsv } from '../components/StockMovements';

const toPaise = s => { const n = Math.round(parseFloat(String(s || '').replace(/,/g, '')) * 100); return Number.isFinite(n) && n > 0 ? n : 0 };
const dmy = d => d ? String(d).slice(0, 10).split('-').reverse().join('-') : '';
const BLANK = { code: '', type: 'percent', value: '', min: '', expires: '', limit: '', sentOnly: false };
const generate = () => { const w = ['DHANYA', 'SAREE', 'FESTIVE', 'WELCOME', 'SILK']; const r = Math.random().toString(36).slice(2, 5).toUpperCase(); return `${w[Math.floor(Math.random() * w.length)]}${r}` };
const offerText = c => c.discountType === 'percent' ? `${c.discountValue}% OFF` : `${inr(c.discountValue)} OFF`;
const expired = c => c.expiresOn && String(c.expiresOn).slice(0, 10) < new Date().toISOString().slice(0, 10);

// The message opened in WhatsApp: the offer, its rules and the link to the printable coupon card.
const message = (c, name, shop) => [
  `Hello${name ? ' ' + name : ''},`, `🎁 Here is a coupon from *${shop?.name || 'DHANYA'}*`, '', `Code: *${c.code}*`, `Offer: *${offerText(c)}*`, '',
  ...(c.minOrder ? [`• Valid on purchases of ${inr(c.minOrder)} or more`] : []), ...(c.expiresOn ? [`• Valid till ${dmy(c.expiresOn)}`] : []),
  ...(c.sentOnly ? ['• Only for the mobile number it was sent to'] : []), '• Show this code at billing. Discount applies to the item value only.', '',
  `Download your coupon: ${location.origin}/coupon/${c.code}`, ...(shop?.phone ? ['', `📞 ${shop.phone}`] : []),
].join('\n');

function SendModal({ c, shop, onClose, onDone }) {
  const [phone, setPhone] = useState(''); const [name, setName] = useState(''); const [only, setOnly] = useState(false); const [err, setErr] = useState(); const [busy, setBusy] = useState(false);
  const go = async kind => {
    if (phone.replace(/\D/g, '').length < 8) return setErr('Enter the customer\'s mobile number.');
    const tab = kind === 'wa' ? window.open('', '_blank') : window.open('', '_blank'); setBusy(true); setErr();
    try {
      const out = await api(`/admin/pos/coupons/${c.id}/sends`, { method: 'POST', body: { phone, name, onlyThis: only } });
      const cc = { ...c, sentOnly: out.sentOnly };
      const url = kind === 'wa' ? waLink(phone, message(cc, name, shop)) : `/coupon/${c.code}?print=1`;
      if (tab) tab.location.href = url; else location.assign(url);
      onDone(); onClose();
    } catch (e) { tab?.close(); setErr(e.message) } finally { setBusy(false) }
  };
  return (
    <Modal title={`Send coupon ${c.code}`} sub="Opens WhatsApp with the offer and a link to the coupon card" onClose={onClose}
      footer={<><button className="dpos-btn ghost" onClick={onClose}>Cancel</button><button className="dpos-btn outline" disabled={busy} onClick={() => go('pdf')}>Generate &amp; share PDF</button><button className="dpos-btn" style={{ background: '#1c7a4b', borderColor: '#1c7a4b' }} disabled={busy} onClick={() => go('wa')}>Send link on WhatsApp</button></>}>
      {err && <p className="dpos-err" role="alert">{err}</p>}
      <label className="f">CUSTOMER PHONE *<input autoFocus inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Mobile number" /></label>
      <label className="f" style={{ marginTop: 12 }}>CUSTOMER NAME<input value={name} onChange={e => setName(e.target.value)} placeholder="Optional" /></label>
      <label className="cp-sw" style={{ marginTop: 14 }}><input type="checkbox" checked={only || c.sentOnly} disabled={c.sentOnly} onChange={e => setOnly(e.target.checked)} /> ONLY FOR THIS CUSTOMER</label>
      {(only && !c.sentOnly) && <p className="cp-warn">This coupon will only work for the phones it was sent to. Walk-in customers can't use it any more.</p>}
    </Modal>
  );
}

function Recipients({ c, shop, onClose, onDone }) {
  const [list, setList] = useState(null); const [err, setErr] = useState(); const [sent, setSent] = useState({});
  useEffect(() => { api(`/admin/pos/coupons/${c.id}/recipients`).then(setList).catch(e => setErr(e.message)) }, [c.id]);
  const send = async p => {
    const tab = window.open('', '_blank');
    try { const out = await api(`/admin/pos/coupons/${c.id}/sends`, { method: 'POST', body: { phone: p.phone, name: p.name } }); const url = waLink(p.phone, message({ ...c, sentOnly: out.sentOnly }, p.name, shop)); if (tab) tab.location.href = url; setSent(s => ({ ...s, [p.phone]: true })); onDone() }
    catch (e) { tab?.close(); setErr(e.message) }
  };
  const n = (list || []).filter(p => p.sent || sent[p.phone]).length;
  return (
    <Modal title={`Send ${c.code} to customers`} sub="Everyone with a mobile number" onClose={onClose} footer={<><span className="muted small" style={{ marginRight: 'auto' }}>{n} sent</span><button className="dpos-btn" onClick={onClose}>Done · {n} sent</button></>}>
      {err && <p className="dpos-err" role="alert">{err}</p>}
      {!list ? <p className="muted">Loading…</p> : !list.length ? <p className="muted">No customers with a mobile number yet.</p> : (
        <ul className="cp-rec">{list.map(p => { const done = p.sent || sent[p.phone]; return (
          <li key={p.phone}><span><b>{p.name || 'Customer'}</b><em>{p.phone}</em></span>
            <button type="button" className={`cp-send ${done ? 'done' : ''}`} onClick={() => send(p)}>{done ? 'SENT ✓ · AGAIN' : 'SEND'}</button></li>) })}</ul>)}
    </Modal>
  );
}

function EditModal({ c, onClose, onDone }) {
  const [f, setF] = useState({ type: c.discountType, value: c.discountType === 'percent' ? String(c.discountValue) : String(c.discountValue / 100), min: c.minOrder ? String(c.minOrder / 100) : '', expires: c.expiresOn ? String(c.expiresOn).slice(0, 10) : '', limit: c.usageLimit ?? '', only: c.sentOnly });
  const [err, setErr] = useState();
  const save = async () => {
    try { await api(`/admin/pos/coupons/${c.id}`, { method: 'PATCH', body: { discountType: f.type, discountValue: f.type === 'percent' ? Math.round(+f.value) : toPaise(f.value), minOrder: toPaise(f.min), expiresOn: f.expires || null, usageLimit: f.limit ? +f.limit : null, sentOnly: f.only } }); onDone(); onClose() }
    catch (e) { setErr(e.issues?.[0]?.message || e.message) }
  };
  return (
    <Modal title={`Edit ${c.code}`} sub="The code itself cannot be changed" onClose={onClose} footer={<><button className="dpos-btn ghost" onClick={onClose}>Cancel</button><button className="dpos-btn" onClick={save}>Save changes</button></>}>
      {err && <p className="dpos-err" role="alert">{err}</p>}
      <div className="cp-g2">
        <label className="f">DISCOUNT {f.type === 'percent' ? '%' : '(₹)'}<input inputMode="decimal" value={f.value} onChange={e => setF({ ...f, value: e.target.value })} /></label>
        <label className="f">MIN ORDER (₹)<input inputMode="decimal" value={f.min} onChange={e => setF({ ...f, min: e.target.value })} /></label>
        <label className="f">EXPIRY DATE<input type="date" value={f.expires} onChange={e => setF({ ...f, expires: e.target.value })} /></label>
        <label className="f">USAGE LIMIT<input inputMode="numeric" value={f.limit} onChange={e => setF({ ...f, limit: e.target.value.replace(/\D/g, '') })} placeholder="Unlimited" /></label>
      </div>
      <label className="cp-sw" style={{ marginTop: 14 }}><input type="checkbox" checked={f.only} onChange={e => setF({ ...f, only: e.target.checked })} /> Only for customers it's sent to</label>
    </Modal>
  );
}

// Coupon Management: create discount codes, send them to customers on WhatsApp and see how they are used. Discounts apply to the product subtotal only.
export default function PosCoupons({ shop }) {
  const [list, setList] = useState(null); const [err, setErr] = useState(); const [f, setF] = useState(BLANK); const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all'); const [q, setQ] = useState(''); const [send, setSend] = useState(null); const [rec, setRec] = useState(null); const [edit, setEdit] = useState(null);
  const load = useCallback(() => api('/admin/pos/coupons').then(l => { setList(l); setErr() }).catch(e => setErr(e.message)), []);
  useEffect(() => { load() }, [load]);
  const create = async e => {
    e.preventDefault(); setErr(); setBusy(true);
    try {
      await api('/admin/pos/coupons', { method: 'POST', body: { code: f.code.trim(), discountType: f.type, discountValue: f.type === 'percent' ? Math.round(+f.value) : toPaise(f.value), minOrder: toPaise(f.min), expiresOn: f.expires || null, usageLimit: f.limit ? +f.limit : null, sentOnly: f.sentOnly } });
      setF(BLANK); load();
    } catch (x) { setErr(x.issues?.[0]?.message || (x.message === 'Validation failed' ? 'Check the code (3–40 letters or digits) and the discount.' : x.message)) } finally { setBusy(false) }
  };
  const toggle = async c => { try { await api(`/admin/pos/coupons/${c.id}`, { method: 'PATCH', body: { active: !c.active } }); load() } catch (x) { setErr(x.message) } };
  const del = async c => { if (!confirm(`Delete coupon ${c.code}?`)) return; try { await api(`/admin/pos/coupons/${c.id}`, { method: 'DELETE' }); load() } catch (x) { setErr(x.message) } };
  const all = list || [];
  const active = all.filter(c => c.active && !expired(c)).length, uses = all.reduce((s, c) => s + c.usedCount, 0);
  const counts = { all: all.length, active, inactive: all.filter(c => !c.active).length, sent: all.filter(c => c.sentOnly).length };
  const shown = useMemo(() => all.filter(c => (filter === 'all' || (filter === 'active' && c.active && !expired(c)) || (filter === 'inactive' && !c.active) || (filter === 'sent' && c.sentOnly)) && (!q.trim() || c.code.toLowerCase().includes(q.trim().toLowerCase()))), [all, filter, q]);
  const exportCsv = () => downloadCsv('coupons.csv', ['Code', 'Discount', 'Minimum order', 'Expires', 'Usage limit', 'Used', 'Status', 'Only sent customers'],
    all.map(c => [c.code, c.discountType === 'percent' ? `${c.discountValue}%` : (c.discountValue / 100).toFixed(2), (c.minOrder / 100).toFixed(2), c.expiresOn ? dmy(c.expiresOn) : '', c.usageLimit ?? '', c.usedCount, c.active ? 'Active' : 'Inactive', c.sentOnly ? 'Yes' : 'No']));
  return (
    <div className="cp">
      <div className="cp-top"><div><h2>Coupon Management</h2><p className="sub">Create discount codes and send them to customers on WhatsApp. Applies to the product subtotal only.</p></div>
        <div style={{ display: 'flex', gap: 8 }}><button type="button" className="cp-ref" disabled={!all.length} onClick={exportCsv}><Icon n="download" size={16} /> Download Excel</button>
          <button type="button" className="cp-ref" onClick={load}><Icon n="refresh" size={16} /> Refresh</button></div></div>
      <div className="cp-kpis">
        <div className="cp-k"><div><span>TOTAL COUPONS</span><b>{list ? list.length : '…'}</b><small>Configured promotional codes</small></div><i><Icon n="tag" size={18} /></i></div>
        <div className="cp-k"><div><span>ACTIVE COUPONS</span><b className="g">{list ? active : '…'}</b><small>Live &amp; ready at POS checkout</small></div><i className="g"><Icon n="check" size={18} /></i></div>
        <div className="cp-k"><div><span>TOTAL REDEMPTIONS</span><b>{list ? uses : '…'}</b><small>Total customer discount usages</small></div><i className="dark">%</i></div>
      </div>
      <p className="cp-note"><Icon n="info" size={16} /> Coupon discount applies to the product subtotal only, not delivery charges or GST. Staff can apply a coupon in Billing; enter the customer's phone first for member-only coupons.</p>
      {err && <p className="dpos-err" role="alert">{err}</p>}
      <div className="cp-two">
        <form className="cp-card" onSubmit={create}>
          <span className="cp-badge">NEW COUPON</span><h3>Create Coupon</h3>
          <label className="cp-l">COUPON CODE <em>*</em></label>
          <div className="cp-code"><input required value={f.code} maxLength={40} onChange={e => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} placeholder="WELCOME10" /><button type="button" onClick={() => setF({ ...f, code: generate() })}>Generate</button></div>
          <div className="cp-g2">
            <label className="cp-l">DISCOUNT {f.type === 'percent' ? '%' : '(₹)'} <em>*</em><input required inputMode="decimal" value={f.value} onChange={e => setF({ ...f, value: e.target.value })} placeholder={f.type === 'percent' ? '10' : '500'} /></label>
            <label className="cp-l">MIN ORDER (₹)<input inputMode="decimal" value={f.min} onChange={e => setF({ ...f, min: e.target.value })} placeholder="0 = no minimum" /></label>
          </div>
          <div className="cp-type" role="radiogroup" aria-label="Discount type">{[['percent', '% off'], ['fixed', '₹ off']].map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={f.type === v} className={f.type === v ? 'on' : ''} onClick={() => setF({ ...f, type: v })}>{l}</button>)}</div>
          <div className="cp-g2">
            <label className="cp-l">EXPIRY DATE<input type="date" value={f.expires} onChange={e => setF({ ...f, expires: e.target.value })} /></label>
            <label className="cp-l">USAGE LIMIT<input inputMode="numeric" value={f.limit} onChange={e => setF({ ...f, limit: e.target.value.replace(/\D/g, '') })} placeholder="Unlimited" /></label>
          </div>
          <label className="cp-sw"><input type="checkbox" checked={f.sentOnly} onChange={e => setF({ ...f, sentOnly: e.target.checked })} /><span><b>Only for customers it's sent to</b><small>Works only for the mobile numbers you send it to from this page</small></span></label>
          <button className="cp-go" disabled={busy}><Icon n="tag" size={15} /> CREATE COUPON</button>
        </form>
        <section className="cp-card">
          <div className="cp-lh"><h3>All Coupons <span className="cp-n">{all.length}</span></h3><span className="cp-adm">ADMIN ONLY</span></div>
          <div className="cp-filt">{[['all', 'All'], ['active', 'Active'], ['inactive', 'Inactive'], ['sent', 'Sent only']].map(([k, l]) => <button key={k} type="button" className={filter === k ? 'on' : ''} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} ({counts[k]})</button>)}
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search code…" aria-label="Search coupons" /></div>
          {!list ? <p className="dpos-empty">Loading…</p> : !shown.length ? <div className="cp-empty">{all.length ? 'No coupons match.' : 'No coupons yet. Create your first coupon!'}</div> : (
            <ul className="cp-list">{shown.map(c => (
              <li key={c.id} className={c.active ? '' : 'off'}>
                <div><b className="cp-c">{c.code}</b><span className={`cp-st ${c.active ? 'on' : ''}`}>{c.active ? 'ACTIVE' : 'INACTIVE'}</span>{c.sentOnly && <span className="cp-st sent">SENT ONLY</span>}<span className="cp-d">{c.discountType === 'percent' ? `${c.discountValue}% off` : `${inr(c.discountValue)} off`}{c.minOrder ? ` · min ${inr(c.minOrder)}` : ''}</span></div>
                <p>Used {c.usedCount}{c.usageLimit ? ` of ${c.usageLimit}` : ' times'} · {c.expiresOn ? `expires ${dmy(c.expiresOn)}` : 'no expiry'} · sent to {c.sentCount}</p>
                <div className="cp-act">
                  <button type="button" className="cp-mini" onClick={() => setRec(c)}>EVERYONE</button>
                  <button type="button" className="cp-mini solid" onClick={() => setSend(c)}>SEND</button>
                  <button type="button" role="switch" aria-checked={c.active} aria-label={`${c.code} ${c.active ? 'on' : 'off'}`} className={`dpos-switch ${c.active ? 'on' : ''}`} onClick={() => toggle(c)}><i /></button>
                  <button type="button" className="cp-mini" aria-label={`Edit ${c.code}`} onClick={() => setEdit(c)}><Icon n="edit" size={14} /></button>
                  <button type="button" className="dpos-trash" aria-label={`Delete ${c.code}`} onClick={() => del(c)}><Icon n="trash" size={16} /></button>
                </div>
              </li>))}</ul>)}
        </section>
      </div>
      {send && <SendModal c={send} shop={shop} onClose={() => setSend(null)} onDone={load} />}
      {rec && <Recipients c={rec} shop={shop} onClose={() => setRec(null)} onDone={load} />}
      {edit && <EditModal c={edit} onClose={() => setEdit(null)} onDone={load} />}
    </div>
  );
}
