import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import Modal from '../../components/Modal';
import { CustomerPicker, Empty, Err, Field, ItemForm, addDays, bill, blankItem, chargeOf, dayDiff, dmy, hasMeasure, inr, itemPayload, newKey, toPaise, todayStr, useMeta } from './common';

const Step = ({ n, title, sub, children }) => <section className="dpos-card"><h2 className="stc-h"><span className="n">{n}</span>{title}</h2>{sub && <p className="stc-sub">{sub}</p>}{children}</section>;

export default function OrderForm() {
  const [meta, merr] = useMeta(); const nav = useNavigate();
  const [designs, setDesigns] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [items, setItems] = useState([]); const [open, setOpen] = useState(0);
  const [f, setF] = useState({ priority: 'normal', tailorId: '', orderDate: todayStr(), startDate: '', deliveryDate: addDays(todayStr(), 7), notes: '', urgent: '', isGst: false, gstRate: 5, discount: '', advance: '', advMode: 'cash', advRef: '' });
  const [review, setReview] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState(); const [done, setDone] = useState(null);
  const keyRef = useRef({ hash: '', key: newKey() });
  useEffect(() => { api('/admin/stitching/designs').then(setDesigns).catch(() => {}) }, []);
  useEffect(() => { if (meta && !items.length) setItems([blankItem(meta)]) }, [meta]); // eslint-disable-line
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const upd = (i, it) => setItems(items.map((x, j) => j === i ? it : x));

  const lines = useMemo(() => {
    if (!meta) return [];
    const L = items.map(it => ({ name: meta.garmentTypes.find(t => t.id === it.garmentTypeId)?.name ?? '', price: chargeOf(it), qty: Number(it.qty) || 1 }));
    if (toPaise(f.urgent) > 0) L.push({ name: 'Urgent / express charge', price: toPaise(f.urgent), qty: 1 });
    return L;
  }, [items, f.urgent, meta]);
  const tot = bill(lines, { isGst: f.isGst, gstRate: Number(f.gstRate), discount: toPaise(f.discount) });
  const advance = toPaise(f.advance), garments = items.reduce((s, i) => s + (Number(i.qty) || 1), 0);

  // The same date rules the server enforces, shown before the form is sent.
  const problems = [];
  if (f.deliveryDate < f.orderDate) problems.push('The promised delivery date is before the order date.');
  if (f.orderDate > todayStr()) problems.push('The order date cannot be in the future.');
  if (f.startDate && (f.startDate < f.orderDate || f.startDate > f.deliveryDate)) problems.push('The start date must fall between the order date and the delivery date.');
  if (tot.overDiscount) problems.push('The discount is more than the order subtotal.');
  if (advance > tot.total) problems.push('The advance is more than the order total.');
  if (!customer) problems.push('Choose or add the customer.');
  const warnings = [];
  if (meta && f.deliveryDate >= f.orderDate) {
    const need = meta.minDays[f.priority] + Math.floor(Math.max(0, garments - 1) / 2), have = dayDiff(f.orderDate, f.deliveryDate);
    if (have < need) warnings.push(`Only ${have} day${have === 1 ? '' : 's'} to deliver: ${need} or more is realistic for a ${f.priority} order of ${garments} garment${garments === 1 ? '' : 's'}.`);
  }
  const noMeasure = meta ? items.filter(it => { const t = meta.garmentTypes.find(x => x.id === it.garmentTypeId); return t.measureGroups.length && t.measureGroups.some(g => !hasMeasure(it.measurements.groups[g])) }).map(it => meta.garmentTypes.find(x => x.id === it.garmentTypeId).name) : [];

  const payload = () => ({
    ...(customer?.id ? { customerId: customer.id } : { customer: { name: customer?.name ?? '', phone: customer?.phone ?? '' } }),
    priority: f.priority, tailorId: f.tailorId ? Number(f.tailorId) : null, orderDate: f.orderDate, startDate: f.startDate || null, deliveryDate: f.deliveryDate,
    isGst: f.isGst, gstRate: Number(f.gstRate), discount: toPaise(f.discount), urgentCharge: toPaise(f.urgent), notes: f.notes, items: items.map(itemPayload),
    ...(advance > 0 ? { advance: { amount: advance, mode: f.advMode, ref: f.advRef || undefined } } : {}),
  });
  const submit = async () => {
    setBusy(true); setErr();
    const body = payload(), hash = JSON.stringify(body);
    if (keyRef.current.hash !== hash) keyRef.current = { hash, key: newKey() }; // a changed form is a new order; a retry of the same form is not
    try { const r = await api('/admin/stitching/orders', { method: 'POST', body: { ...body, idempotencyKey: keyRef.current.key } }); setDone(r); setReview(false) }
    catch (e) { setErr(e.issues ? `${e.message}: ${e.issues.map(i => `${i.path} ${i.message}`).join('; ')}` : e.message); setReview(false) } finally { setBusy(false) }
  };

  if (merr) return <Err>{merr}</Err>;
  if (!meta) return <Empty>Loading…</Empty>;
  if (done) return (
    <section className="dpos-card stc-stack">
      <div className="stc-ok"><b>{done.duplicate ? 'This order was already saved.' : 'Stitching order saved.'}</b> Order number <span className="stc-mono">{done.order.orderNo}</span>, total {inr(done.order.total)}{done.order.paid ? `, advance ${inr(done.order.paid)} received` : ''}.</div>
      {done.warnings.map(w => <p key={w} className="stc-warn">{w}</p>)}
      <div className="stc-row"><Link className="dpos-btn" to={`/admin/stitching/orders/${done.order.id}`}>Open the order</Link>
        <a className="dpos-btn outline" href={`/admin/stitching/print/${done.order.id}?copy=job`} target="_blank" rel="noopener noreferrer">Print job card</a>
        <button className="dpos-btn ghost" onClick={() => { setDone(null); setItems([blankItem(meta)]); setCustomer(null); setF({ ...f, notes: '', advance: '', discount: '', urgent: '' }); keyRef.current = { hash: '', key: newKey() } }}>Create another</button></div>
    </section>);

  return (
    <div className="stc-split">
      <div className="stc-stack">
        <Err>{err}</Err>
        <Step n="1" title="Customer"><CustomerPicker value={customer} onChange={setCustomer} /></Step>
        <Step n="2" title="Garments" sub="Each garment has its own specifications, fabric, measurements and charges. Fields change with the garment type.">
          <div className="stc-stack">
            {items.map((it, i) => {
              const t = meta.garmentTypes.find(x => x.id === it.garmentTypeId);
              return (
                <div className="stc-item" key={it.key}>
                  <header><b>{i + 1}. {t.name}{Number(it.qty) > 1 ? ` × ${it.qty}` : ''}</b><div className="stc-row"><span className="money"><b>{inr(chargeOf(it) * (Number(it.qty) || 1))}</b></span>
                    <button type="button" className="dpos-btn ghost sm" onClick={() => setOpen(open === i ? -1 : i)}>{open === i ? 'Collapse' : 'Edit details'}</button>
                    {items.length > 1 && <button type="button" className="dpos-btn danger sm" onClick={() => { setItems(items.filter((_, j) => j !== i)); setOpen(0) }}>Remove</button>}</div></header>
                  {open === i && <ItemForm meta={meta} item={it} onChange={x => upd(i, x)} customerId={customer?.id} designs={designs} />}
                </div>);
            })}
            <div><button type="button" className="dpos-btn outline" onClick={() => { setItems([...items, blankItem(meta)]); setOpen(items.length) }}>+ Add another garment</button></div>
          </div>
        </Step>
        <Step n="3" title="Work assignment and schedule">
          <div className="stc-grid">
            <Field label="Priority"><select value={f.priority} onChange={set('priority')}><option value="normal">Normal</option><option value="urgent">Urgent</option><option value="express">Express</option></select></Field>
            <Field label="Assigned tailor"><select value={f.tailorId} onChange={set('tailorId')}><option value="">Not assigned yet</option>{meta.tailors.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            <Field label="Order date"><input type="date" max={todayStr()} value={f.orderDate} onChange={set('orderDate')} /></Field>
            <Field label="Expected start"><input type="date" min={f.orderDate} value={f.startDate} onChange={set('startDate')} /></Field>
            <Field label="Promised delivery"><input type="date" min={f.orderDate} value={f.deliveryDate} onChange={set('deliveryDate')} /></Field>
          </div>
          <Field label="Order notes / scheduling notes" className="" ><textarea rows="2" maxLength={1000} value={f.notes} onChange={set('notes')} /></Field>
          {warnings.map(w => <p key={w} className="stc-warn" style={{ marginBottom: 0 }}>⚠ {w}</p>)}
        </Step>
      </div>
      <aside className="dpos-card dpos-sticky">
        <div className="dpos-head" style={{ marginBottom: 10 }}><h2 style={{ marginBottom: 0 }}>Current order</h2></div>
        <div className="dpos-box dpos-sum" style={{ marginBottom: 14 }}>
          <div><span>SOURCE</span><span className="dpos-pill">Stitching</span></div>
          <div><span>CUSTOMER</span><span>{customer?.name || '-'}</span></div><div><span>PHONE</span><span>{customer?.phone || '-'}</span></div>
          <div><span>DATE</span><span>{dmy(f.orderDate)}</span></div>
          <hr style={{ border: 0, borderTop: '1px solid var(--d-line)', width: '100%' }} />
          {lines.length ? lines.map((l, i) => <div key={i}><span>{l.name}{l.qty > 1 ? ` × ${l.qty}` : ''}</span><span>{inr(l.price * l.qty)}</span></div>) : <em className="muted" style={{ textAlign: 'center', display: 'block' }}>No items added yet</em>}
        </div>
        <p className="muted small" style={{ fontWeight: 800, letterSpacing: '.1em', margin: '0 0 6px' }}>MANUAL DISCOUNT</p>
        <div className="dpos-grid" style={{ gridTemplateColumns: '110px 1fr', marginBottom: 12 }}>
          <select aria-label="Discount type" disabled><option>₹</option></select>
          <input inputMode="decimal" value={f.discount} onChange={set('discount')} placeholder="0" aria-label="Discount value" style={{ textAlign: 'right' }} />
        </div>
        <div className="dpos-ledger">
          <div className="dpos-lrow"><span>Subtotal ({garments} item{garments === 1 ? '' : 's'}) <small className="dpos-excl">EXCL. GST</small></span><b>{inr(tot.subtotal)}</b></div>
          {tot.discount > 0 && <div className="dpos-lrow"><span>Discount</span><span>− {inr(tot.discount)}</span></div>}
          <div className="dpos-lrow"><span>Urgent / express</span><input aria-label="Urgent or express charge in rupees" inputMode="decimal" value={f.urgent} onChange={set('urgent')} placeholder="0" /></div>
        </div>
        <div className="dpos-two" role="radiogroup" aria-label="Invoice type">
          <button role="radio" aria-checked={!f.isGst} className={!f.isGst ? 'on' : ''} onClick={() => setF({ ...f, isGst: false })}>Non-GST bill</button>
          <button role="radio" aria-checked={f.isGst} className={f.isGst ? 'on' : ''} onClick={() => setF({ ...f, isGst: true })}>GST invoice</button></div>
        {f.isGst && <div className="dpos-gstrow"><b>GST <small>(+ ADDED)</small></b>
          <select aria-label="GST rate" value={f.gstRate} onChange={e => setF({ ...f, gstRate: Number(e.target.value) })}>{[5, 12, 18].map(r => <option key={r} value={r}>{r}%</option>)}</select>
          <b className="acc">{inr(tot.tax)}</b></div>}
        <p className="dpos-flabel">ADVANCE PAID BY</p>
        <div className="dpos-pills" role="radiogroup" aria-label="Advance payment method">{[['cash', 'Cash'], ['upi', 'QR / GPay'], ['card', 'Card']].map(([v, l]) => <button key={v} role="radio" aria-checked={f.advMode === v} className={f.advMode === v ? 'on' : ''} onClick={() => setF({ ...f, advMode: v })}>{l}</button>)}</div>
        <hr className="dpos-hr" />
        <div className="dpos-grand"><span>GRAND TOTAL</span><b>{inr(tot.total)}</b></div>
        <div className="dpos-paybox">
          <p className="dpos-pl">{f.advMode === 'upi' ? 'GPAY' : f.advMode.toUpperCase()} ADVANCE</p>
          <label className="f">Advance Received (₹)<input className="bigin" inputMode="decimal" value={f.advance} onChange={set('advance')} placeholder="0.00" /></label>
          <p className="sub" style={{ marginTop: 8 }}>Balance due: {inr(Math.max(tot.total - advance, 0))}</p>
          {f.advMode !== 'cash' && <label className="f" style={{ marginTop: 12 }}>{f.advMode === 'card' ? 'Slip / approval no.' : 'Transaction ID'} (optional)<input value={f.advRef} onChange={set('advRef')} maxLength={80} /></label>}
        </div>
        <p className="sub" style={{ margin: '8px 2px 14px' }}>Alteration charges are added later, if needed. The server recalculates every amount when the order is saved.</p>
        {problems.map(p => <p key={p} className="stc-warn" style={{ margin: '0 0 10px', background: '#fdecea', color: 'var(--d-bad)' }}>{p}</p>)}
        {noMeasure.length > 0 && <p className="stc-warn" style={{ margin: '0 0 10px' }}>No measurements yet for {noMeasure.join(', ')}. You can add them later, but cutting cannot start without them.</p>}
        <button className="dpos-cta" disabled={problems.length > 0} onClick={() => { setErr(); setReview(true) }}>REVIEW ORDER</button>
      </aside>

      {review && (
        <Modal title="Review stitching order" sub="Check everything before saving" wide onClose={() => setReview(false)}
          footer={<><button className="dpos-btn ghost" onClick={() => setReview(false)}>Back to edit</button><button className="dpos-btn" disabled={busy} onClick={submit}>{busy ? 'SAVING…' : 'CONFIRM AND SAVE'}</button></>}>
          <div className="stc-xl stc-stack" style={{ gap: 12 }}>
            <dl className="stc-kv"><dt>Customer</dt><dd><b>{customer.name}</b> · {customer.phone}{customer.isNew && ' (new)'}</dd>
              <dt>Priority</dt><dd style={{ textTransform: 'capitalize' }}>{f.priority}</dd>
              <dt>Tailor</dt><dd>{meta.tailors.find(t => String(t.id) === f.tailorId)?.name ?? 'Not assigned yet'}</dd>
              <dt>Dates</dt><dd>Ordered {dmy(f.orderDate)}{f.startDate && ` · start ${dmy(f.startDate)}`} · <b>deliver {dmy(f.deliveryDate)}</b></dd></dl>
            {items.map((it, i) => { const t = meta.garmentTypes.find(x => x.id === it.garmentTypeId); return (
              <div key={it.key} className="stc-box"><div className="stc-row between"><b>{i + 1}. {t.name}{Number(it.qty) > 1 ? ` × ${it.qty}` : ''}</b><b>{inr(chargeOf(it) * (Number(it.qty) || 1))}</b></div>
                <div className="muted small">{[...Object.entries(it.specs).filter(([, v]) => v).map(([k, v]) => `${meta.specLibrary[k]?.label}: ${v}`), ...it.custom.filter(c => c.label).map(c => `${c.label}: ${c.value}`)].join(' · ') || 'No specifications entered'}</div>
                <div className="muted small">Fabric: {it.fabric.source === 'customer' ? 'customer provides' : 'boutique provides'}{it.fabric.type && `, ${it.fabric.type}`}{it.fabric.color && `, ${it.fabric.color}`}</div>
                <div className="muted small">Measurements: {Object.entries(it.measurements.groups).filter(([, m]) => hasMeasure(m)).map(([g, m]) => `${meta.measureGroups[g].label} (${[...Object.entries(m.values), ...m.custom.map(c => [c.label, c.value])].filter(([, v]) => v !== '').map(([k, v]) => `${meta.measureGroups[g].fields.find(x => x[0] === k)?.[1] ?? k} ${v}`).join(', ')} ${m.unit})`).join('; ') || 'none yet'}</div></div>); })}
            <div className="stc-sum">{tot.discount > 0 && <div><span>Discount</span><span>− {inr(tot.discount)}</span></div>}{f.isGst && <div><span>GST {f.gstRate}%</span><span>{inr(tot.tax)}</span></div>}
              <div className="tot"><span>Total</span><span>{inr(tot.total)}</span></div><div><span>Advance now ({f.advMode.toUpperCase()})</span><span>{inr(advance)}</span></div><div><b>Balance</b><b>{inr(Math.max(tot.total - advance, 0))}</b></div></div>
            {warnings.map(w => <p key={w} className="stc-warn" style={{ margin: 0 }}>⚠ {w}</p>)}
          </div>
        </Modal>)}
    </div>);
}
