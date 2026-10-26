import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Icon } from '../components/AdminShell';
import { downloadCsv } from '../components/StockMovements';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const md = d => ({ m: Number(String(d).slice(5, 7)), d: Number(String(d).slice(8, 10)) });
const key = (m, d) => m * 100 + d;
const dayName = (m, d) => `${String(d).padStart(2, '0')} ${MONTHS[m - 1].slice(0, 3)}`;
const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? `{${k}}`);

// Date of Birth: a calendar of customer birthdays, pick a day or range, then send each customer a one-tap WhatsApp offer.
export default function PosBirthdays({ shop, CustomerModal }) {
  const now = new Date(); const tm = now.getMonth() + 1, td = now.getDate();
  const [tab, setTab] = useState('calendar'); const [rows, setRows] = useState(null); const [err, setErr] = useState(); const [n, setN] = useState(0);
  const [month, setMonth] = useState(tm); const [range, setRange] = useState({ p: 'all', fm: '', fd: '', tm: '', td: '' }); const [adding, setAdding] = useState(false);
  const [offer, setOffer] = useState(null); const [saved, setSaved] = useState(null); const [editing, setEditing] = useState(null); const [saving, setSaving] = useState(false);
  useEffect(() => { api('/admin/pos/birthdays?days=366').then(r => { setRows(r); setErr() }).catch(e => setErr(e.message)) }, [n]);
  useEffect(() => { api('/admin/pos/birthday-offer').then(o => { setOffer(o); setSaved(JSON.stringify(o)) }).catch(e => setErr(e.message)) }, []);

  const withMd = useMemo(() => (rows || []).map(r => ({ ...r, ...md(r.dob) })), [rows]);
  const marks = useMemo(() => new Set(withMd.filter(r => r.m === month).map(r => r.d)), [withMd, month]);
  const [lo, hi] = useMemo(() => {
    const p = range.p;
    if (p === 'today') return [key(tm, td), key(tm, td)];
    if (p === 'week') { const e = new Date(now.getFullYear(), tm - 1, td + 6); return [key(tm, td), key(e.getMonth() + 1, e.getDate())] }
    if (p === 'month') return [key(tm, 1), key(tm, 31)];
    if (p === 'custom' && range.fm && range.fd && range.tm && range.td) return [key(+range.fm, +range.fd), key(+range.tm, +range.td)];
    if (p === 'day') return [key(range.fm, range.fd), key(range.fm, range.fd)];
    return [101, 1231];
  }, [range]); // eslint-disable-line
  const inRange = r => { const k = key(r.m, r.d); return lo <= hi ? k >= lo && k <= hi : k >= lo || k <= hi };
  const shown = withMd.filter(inRange).sort((a, b) => a.daysAway - b.daysAway);

  const dirty = offer && JSON.stringify(offer) !== saved;
  const chosen = offer?.offers.find(o => o.id === offer.selected);
  const vars = { shop: shop?.name || 'DHANYA', phone: shop?.phone || '', instagram: (shop?.instagram || '').replace(/^@/, '') || 'yourshop', offer: chosen?.text || '' };
  const send = r => { const d = r.phone.replace(/\D/g, ''); return `https://wa.me/${d.length === 10 ? '91' + d : d}?text=${encodeURIComponent(fill(offer?.message || '', { ...vars, name: r.name || 'there' }))}` };
  const save = async () => { setSaving(true); setErr(); try { const o = await api('/admin/pos/birthday-offer', { method: 'PUT', body: offer }); setOffer(o); setSaved(JSON.stringify(o)) } catch (x) { setErr(x.issues?.[0]?.message || x.message) } finally { setSaving(false) } };
  const addOffer = () => { const text = prompt('Offer text (e.g. 40% off on sarees):'); if (!text?.trim()) return; const id = 'o' + Date.now().toString(36); setOffer(o => ({ ...o, offers: [...o.offers, { id, text: text.trim() }], selected: id })) };
  const editOffer = () => { if (!chosen) return; const text = prompt('Edit the offer:', chosen.text); if (text?.trim()) setOffer(o => ({ ...o, offers: o.offers.map(x => x.id === chosen.id ? { ...x, text: text.trim() } : x) })) };
  const delOffer = () => { if (!chosen || !confirm(`Delete the offer “${chosen.text}”?`)) return; setOffer(o => { const left = o.offers.filter(x => x.id !== chosen.id); return { ...o, offers: left, selected: left[0]?.id ?? '' } }) };
  const exportCsv = () => downloadCsv('birthdays.csv', ['Customer', 'Mobile', 'Date of birth', 'Next birthday', 'Days away'], shown.map(r => [r.name, r.phone, r.dob, r.nextBirthday, r.daysAway]));

  const daysIn = new Date(now.getFullYear(), month, 0).getDate();
  const firstDow = (new Date(now.getFullYear(), month - 1, 1).getDay() + 6) % 7;
  const pickDay = d => setRange({ p: 'day', fm: month, fd: d, tm: month, td: d });
  const selDay = range.p === 'day' && range.fm === month ? range.fd : null;

  const Filter = () => (
    <>
      <div className="bd-chips" role="group" aria-label="Range">{[['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['all', 'All']].map(([v, l]) => <button key={v} type="button" className={range.p === v ? 'on' : ''} onClick={() => setRange({ p: v, fm: '', fd: '', tm: '', td: '' })}>{l}</button>)}</div>
      {[['FROM', 'fm', 'fd'], ['TO', 'tm', 'td']].map(([l, mk, dk]) => (
        <div key={l}><p className="bd-l">{l}</p>
          <div className="bd-sel"><select value={range[mk]} onChange={e => setRange({ ...range, p: 'custom', [mk]: e.target.value })} aria-label={`${l} month`}><option value="">Month</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
            <select value={range[dk]} onChange={e => setRange({ ...range, p: 'custom', [dk]: e.target.value })} aria-label={`${l} day`}><option value="">Day</option>{Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></div></div>))}
    </>
  );

  return (
    <div className="bd">
      <div className="bd-top"><p className="sub" style={{ margin: 0 }}>Customer birthdays &amp; one-tap offer sender</p>
        <button type="button" className="bd-add" onClick={() => setAdding(true)}><Icon n="plus" size={15} /> ADD CUSTOMER</button></div>
      <div className="bd-tabs" role="tablist">{[['calendar', 'Calendar'], ['customers', 'Customers']].map(([v, l]) => <button key={v} role="tab" aria-selected={tab === v} className={tab === v ? 'on' : ''} onClick={() => setTab(v)}>{l}</button>)}</div>
      {err && <p className="dpos-err" role="alert">{err}</p>}

      {tab === 'calendar' ? (
        <div className="bd-two">
          <div className="bd-col">
            <section className="bd-card">
              <div className="bd-cal-h"><select value={month} onChange={e => setMonth(+e.target.value)} aria-label="Month">{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m.slice(0, 3)}</option>)}</select>
                <span className="bd-sp" /><button type="button" aria-label="Previous month" onClick={() => setMonth(m => m === 1 ? 12 : m - 1)}>‹</button><button type="button" className="today" onClick={() => { setMonth(tm); pickDay(td) }}>Today</button><button type="button" aria-label="Next month" onClick={() => setMonth(m => m === 12 ? 1 : m + 1)}>›</button></div>
              <div className="bd-days">{Array.from({ length: firstDow }, (_, i) => <i key={'e' + i} />)}{Array.from({ length: daysIn }, (_, i) => i + 1).map(d => (
                <button key={d} type="button" className={`${selDay === d ? 'sel' : ''} ${month === tm && d === td ? 'now' : ''}`} onClick={() => pickDay(d)} aria-pressed={selDay === d}>{d}{marks.has(d) && <u aria-label="birthday" />}</button>))}</div>
              <p className="bd-leg"><u /> Dot = birthday</p>
            </section>
            <section className="bd-card"><h3 className="bd-h">Step 1 · Pick a date or range</h3><Filter /></section>
          </div>
          <div className="bd-col">
            <section className="bd-card"><h3 className="bd-h">Step 2 · Customers with birthdays ({shown.length})</h3><p className="sub">Pick a date or range on the left, then tap Send Offer on a customer.</p>
              {!rows ? <p className="dpos-empty">Loading…</p> : !shown.length ? <p className="bd-none">No birthdays found for this range.</p> : (
                <ul className="bd-list">{shown.map(r => (
                  <li key={r.phone}><div><b>{r.name || '—'}</b><span>{r.phone}</span></div><em>{dayName(r.m, r.d)}{r.daysAway === 0 ? ' · Today' : r.daysAway < 40 ? ` · in ${r.daysAway}d` : ''}</em>
                    <a className="bd-send" href={send(r)} target="_blank" rel="noopener noreferrer"><Icon n="send" size={14} /> Send Offer</a></li>))}</ul>)}
            </section>
            {offer && (
              <section className="bd-card">
                <div className="bd-oh"><span className="bd-ic sm"><Icon n="star" size={18} /></span><div><h3 className="bd-h" style={{ margin: 0 }}>Step 3 · Customise offer message</h3><p className="sub">Sent on WhatsApp when you tap “Send Offer”.</p></div>
                  <button type="button" className="bd-save" disabled={!dirty || saving} onClick={save}><Icon n="save" size={14} /> {saving ? 'Saving…' : 'Save'}</button></div>
                <p className="bd-l">SELECT OFFER</p>
                <div className="bd-offer"><select value={offer.selected} onChange={e => setOffer({ ...offer, selected: e.target.value })} aria-label="Offer">{offer.offers.map(o => <option key={o.id} value={o.id}>{o.text}</option>)}</select>
                  <button type="button" aria-label="Edit offer" onClick={editOffer} disabled={!chosen}><Icon n="edit" size={15} /></button><button type="button" className="del" aria-label="Delete offer" onClick={delOffer} disabled={!chosen}><Icon n="trash" size={15} /></button></div>
                <button type="button" className="bd-addoffer" onClick={addOffer}>+ Add Offer</button>
                <p className="bd-l">CUSTOMIZE MESSAGE</p>
                <textarea rows={8} value={offer.message} maxLength={1000} onChange={e => setOffer({ ...offer, message: e.target.value })} aria-label="Message" />
                <p className="bd-hint">Use <b>{'{name}'}</b> for the customer’s name, <b>{'{offer}'}</b> for the selected offer, and <b>{'{shop}'}</b>, <b>{'{phone}'}</b>, <b>{'{instagram}'}</b>.</p>
                <div className="bd-prev"><p>MESSAGE PREVIEW</p><pre>{fill(offer.message, { ...vars, name: shown[0]?.name || 'Aarav' })}</pre></div>
              </section>)}
          </div>
        </div>
      ) : (
        <>
          <section className="bd-card"><div className="bd-fh"><h3 className="bd-h" style={{ margin: 0 }}>Filter by upcoming birthday</h3><button type="button" className="bd-csv" onClick={exportCsv} disabled={!shown.length}><Icon n="download" size={14} /> Export CSV</button></div><Filter /></section>
          <section className="bd-card">
            {!rows ? <p className="dpos-empty">Loading…</p> : !shown.length ? <p className="bd-none">No birthdays found for this range.</p> : (
              <ul className="bd-list">{shown.map(r => (
                <li key={r.phone}><div><b>{r.name || '—'}</b><span>{r.phone}</span></div><em>{dayName(r.m, r.d)}{r.daysAway === 0 ? ' · Today' : ` · in ${r.daysAway}d`}</em>
                  <a className="bd-send" href={send(r)} target="_blank" rel="noopener noreferrer"><Icon n="send" size={14} /> Send Offer</a></li>))}</ul>)}
          </section>
        </>
      )}
      {adding && <CustomerModal c={null} onClose={() => setAdding(false)} onDone={() => { setAdding(false); setN(x => x + 1) }} />}
    </div>
  );
}
