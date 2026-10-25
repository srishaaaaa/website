import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useApp } from '../../context/App';
import Modal from '../../components/Modal';
import { AppointmentModal } from './Schedule';
import { Empty, Err, Field, ItemForm, PayPill, PriPill, StatusPill, dmy, fromServerItem, inr, itemPayload, kindName, newKey, statusName, toPaise, rupees, useMeta, waLink, when } from './common';

const ACT = { created: 'Order created', edited: 'Order details edited', item_edited: 'Garment edited', note: 'Note', payment: 'Payment received', refund: 'Refund recorded', invoice: 'POS invoice created', alteration: 'Alteration updated', qc: 'Quality check recorded', appointment: 'Appointment' };
const actText = a => {
  const d = a.detail ?? {};
  if (a.action === 'note') return d.text;
  if (a.action === 'payment' || a.action === 'refund') return `${inr(d.amount)} by ${String(d.mode).toUpperCase()}${d.kind && d.kind !== 'part' ? ` (${d.kind})` : ''}`;
  if (a.action === 'invoice') return d.invoice;
  if (a.action === 'edited') return (d.fields ?? []).join(', ');
  if (a.action === 'item_edited') return `${d.item}${d.repriced ? ' (charges changed)' : ''}`;
  if (a.action === 'alteration') return `Round ${d.round}: ${String(d.status).replace('_', ' ')}`;
  if (a.action === 'qc') return `Round ${d.round}: ${d.passed} passed${d.failed?.length ? `, ${d.failed.length} failed` : ''}`;
  if (a.action === 'appointment') return `${d.kind?.replace(/_/g, ' ')} ${d.change ?? ''}`.trim();
  return '';
};

export default function OrderDetail() {
  const { id } = useParams(); const { user } = useApp(); const manager = ['owner', 'admin'].includes(user?.role);
  const [meta] = useMeta(); const [o, setO] = useState(null); const [err, setErr] = useState(); const [m, setM] = useState(null);
  const [tailors, setTailors] = useState([]); const [designs, setDesigns] = useState([]);
  const load = useCallback(() => api(`/admin/stitching/orders/${id}`).then(x => { setO(x); setErr() }).catch(e => setErr(e.message)), [id]);
  useEffect(() => { load(); api('/admin/stitching/tailors').then(setTailors).catch(() => {}); api('/admin/stitching/designs').then(setDesigns).catch(() => {}) }, [load]);
  if (err && !o) return <Err>{err}</Err>;
  if (!o || !meta) return <Empty>Loading…</Empty>;
  const closed = ['delivered', 'cancelled'].includes(o.status);
  const next = (meta.transitions[o.status] ?? []).filter(s => s !== 'alterations_required' && s !== 'cancelled');
  const run = async (fn) => { setErr(); try { const r = await fn(); setO(r.order ?? r); return true } catch (e) { setErr(e.message); return false } };
  const close = () => setM(null);
  const reached = new Set(o.history.map(h => h.to));
  const order = meta.statuses.filter(([k]) => k !== 'cancelled').map(([k]) => k), curIdx = order.indexOf(o.status);
  const qcRows = o.qc.filter(q => q.round === o.qcRound);
  const openAlt = o.alterations.some(a => a.status !== 'done');

  return (
    <div className="stc-stack">
      <section className="dpos-card stc-stack">
        <div className="stc-row between">
          <div><div className="stc-row"><h2 className="stc-mono" style={{ fontSize: 22 }}>{o.orderNo}</h2><StatusPill s={o.status} meta={meta} /><PriPill p={o.priority} />{o.overdue && <span className="stc-pill late">Overdue</span>}<PayPill s={o.paymentStatus} /></div>
            <p className="sub">Created {when(o.createdAt)} · promised {dmy(o.deliveryDate)}</p></div>
          <div className="stc-row">
            <a className="dpos-btn outline sm" href={`/admin/stitching/print/${o.id}?copy=job`} target="_blank" rel="noopener noreferrer">Job card</a>
            <a className="dpos-btn outline sm" href={`/admin/stitching/print/${o.id}?copy=customer`} target="_blank" rel="noopener noreferrer">Customer receipt</a>
            {o.shareToken && <a className="dpos-btn outline sm" href={`/invoice/${o.shareToken}`} target="_blank" rel="noopener noreferrer">Invoice {o.invoiceNo}</a>}
          </div>
        </div>
        <Err>{err}</Err>
        {!closed && (
          <div className="stc-row">
            {next.map(s => <button key={s} className="dpos-btn sm" onClick={() => setM({ t: 'status', to: s })}>→ {statusName(meta, s)}</button>)}
            {['trial_scheduled', 'trial_completed', 'finishing_qc', 'ready'].includes(o.status) && <button className="dpos-btn outline sm" onClick={() => setM({ t: 'alt' })}>+ Alteration needed</button>}
            <button className="dpos-btn outline sm" onClick={() => setM({ t: 'appt' })}>Schedule appointment</button>
            <button className="dpos-btn outline sm" onClick={() => setM({ t: 'sched' })}>Edit schedule / tailor</button>
            {manager && <button className="dpos-btn danger sm" onClick={() => setM({ t: 'status', to: 'cancelled' })}>Cancel order</button>}
          </div>)}
        {o.status === 'alterations_required' && <p className="stc-warn" style={{ margin: 0 }}>Waiting on alteration round {o.alterations.at(-1)?.round}. Mark it done, then move the order back to stitching, trial or the final check.</p>}
      </section>

      <div className="stc-split">
        <div className="stc-stack">
          <section className="dpos-card">
            <h2>Customer and schedule</h2>
            <dl className="stc-kv">
              <dt>Customer</dt><dd><b>{o.customerName}</b> · {o.customerPhone} <a className="stc-link" href={waLink(o.customerPhone, `Hello ${o.customerName}, an update on your stitching order ${o.orderNo}: ${statusName(meta, o.status)}.`)} target="_blank" rel="noopener noreferrer">WhatsApp</a></dd>
              <dt>Tailor</dt><dd>{o.tailorName || <span className="muted">Not assigned</span>}</dd>
              <dt>Ordered</dt><dd>{dmy(o.orderDate)}</dd><dt>Start</dt><dd>{dmy(o.startDate)}</dd><dt>Trial</dt><dd>{dmy(o.trialDate)}</dd><dt>Delivery</dt><dd><b>{dmy(o.deliveryDate)}</b>{o.deliveredAt && ` · delivered ${when(o.deliveredAt)}`}</dd>
              {o.notes && <><dt>Notes</dt><dd>{o.notes}</dd></>}
            </dl>
          </section>

          <section className="dpos-card stc-stack">
            <h2 style={{ margin: 0 }}>Garments</h2>
            {o.items.map((it, i) => (
              <div className="stc-item" key={it.id}>
                <header><b>{i + 1}. {it.garmentName}{it.qty > 1 ? ` × ${it.qty}` : ''}{it.designName && <span className="muted"> · {it.designName}</span>}</b>
                  <div className="stc-row"><b>{inr(it.unitCharge * it.qty)}</b>{!closed && <button className="dpos-btn ghost sm" onClick={() => setM({ t: 'item', item: fromServerItem(it) })}>Edit</button>}</div></header>
                <dl className="stc-kv">
                  {Object.entries(it.specs).map(([k, v]) => <Fragment key={k}><dt>{meta.specLibrary[k]?.label ?? k}</dt><dd>{v}</dd></Fragment>)}
                  {it.custom.map((c, j) => <Fragment key={j}><dt>{c.label}</dt><dd>{c.value}</dd></Fragment>)}
                  {it.notes && <><dt>Instructions</dt><dd>{it.notes}</dd></>}
                  <dt>Fabric</dt><dd>{[it.fabric.source === 'boutique' ? 'Boutique fabric' : 'Customer fabric', it.fabric.type, it.fabric.color, it.fabric.quantity].filter(Boolean).join(' · ')} <span className="stc-pill">{{ pending: 'Awaiting fabric', received: 'Received', ready: 'Ready' }[it.fabric.status ?? 'pending']}</span>
                    {it.fabric.linked && <div className="muted small">Linked product: {it.fabric.linked.name} ({it.fabric.linked.sku})</div>}</dd>
                  {(it.fabric.lining || it.fabric.accessories) && <><dt>Materials</dt><dd>{[it.fabric.lining && `Lining: ${it.fabric.lining}`, it.fabric.accessories && `Accessories: ${it.fabric.accessories}`].filter(Boolean).join(' · ')}</dd></>}
                </dl>
                {it.fabric.photos?.length > 0 && <div className="stc-photos">{it.fabric.photos.map(u => <a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="Fabric reference" /></a>)}</div>}
                {Object.entries(it.measurements.groups ?? {}).map(([g, v]) => (
                  <div className="stc-box" key={g}><div className="stc-row between"><b>{meta.measureGroups[g]?.label ?? g} measurements</b><span className="muted small">{v.unit === 'in' ? 'inches' : 'cm'} · taken {when(v.takenAt)}{v.profileId && ` · profile v${v.profileVersion}`}</span></div>
                    <div className="muted" style={{ marginTop: 6 }}>{[...Object.entries(v.values).map(([k, n]) => `${meta.measureGroups[g]?.fields.find(f => f[0] === k)?.[1] ?? k} ${n}`), ...v.custom.map(c => `${c.label} ${c.value}`)].join(' · ')}{v.notes && <div>Note: {v.notes}</div>}</div></div>))}
                {!Object.keys(it.measurements.groups ?? {}).length && it.measureGroups.length > 0 && <p className="stc-warn" style={{ margin: 0 }}>No measurements recorded yet.</p>}
              </div>))}
          </section>

          <section className="dpos-card stc-stack">
            <div className="stc-row between"><h2 style={{ margin: 0 }}>Alterations</h2></div>
            {!o.alterations.length ? <p className="muted" style={{ margin: 0 }}>No alterations so far.</p> : o.alterations.map(a => (
              <div className="stc-box" key={a.id}>
                <div className="stc-row between"><b>Round {a.round}: {a.reason}</b><span className={`stc-pill ${a.status === 'done' ? 's-done' : 's-alter'}`}>{a.status.replace('_', ' ')}</span></div>
                <dl className="stc-kv" style={{ marginTop: 8 }}>{a.itemId && <><dt>Garment</dt><dd>{o.items.find(i => i.id === a.itemId)?.garmentName}</dd></>}
                  {a.feedback && <><dt>Trial feedback</dt><dd>{a.feedback}</dd></>}{a.corrections && <><dt>Corrections</dt><dd>{a.corrections}</dd></>}
                  <dt>Charge</dt><dd>{a.charge ? inr(a.charge) : 'No charge'}</dd><dt>Tailor</dt><dd>{a.tailorName || '—'}</dd><dt>Due</dt><dd>{dmy(a.dueDate)}</dd>{a.completionNotes && <><dt>Completion</dt><dd>{a.completionNotes} · {when(a.completedAt)}</dd></>}</dl>
                {a.status !== 'done' && <div className="stc-row" style={{ marginTop: 8 }}>
                  {a.status === 'open' && <button className="dpos-btn ghost sm" onClick={() => run(() => api(`/admin/stitching/orders/${o.id}/alterations/${a.id}`, { method: 'PATCH', body: { status: 'in_progress' } }))}>Start work</button>}
                  <button className="dpos-btn sm" onClick={() => setM({ t: 'altDone', a })}>Mark done</button></div>}
              </div>))}
          </section>
        </div>

        <aside className="stc-stack">
          <section className="dpos-card">
            <h2>Progress</h2>
            {o.status === 'cancelled' ? <p className="stc-warn" style={{ background: '#fdecea', color: 'var(--d-bad)' }}>Cancelled {when(o.cancelledAt)}</p> : (
              <ol className="stc-line">{order.map((k, i) => { const cls = k === o.status ? 'now' : reached.has(k) ? 'done' : i < curIdx ? 'skip' : ''; const h = o.history.filter(x => x.to === k).at(-1);
                return <li key={k} className={cls}><span className="dot">{cls === 'done' ? '✓' : i + 1}</span><div><b>{statusName(meta, k)}</b>{h && <small>{when(h.at)} · {h.by}{h.override ? ' · override' : ''}{h.note ? ` · ${h.note}` : ''}</small>}{cls === 'skip' && <small>Skipped</small>}</div></li> })}</ol>)}
          </section>

          <section className="dpos-card stc-stack">
            <h2 style={{ margin: 0 }}>Quality check{o.qcRound > 0 ? ` · round ${o.qcRound + 1}` : ''}</h2>
            <QcPanel key={`${o.qcRound}-${qcRows.length}-${o.status}`} meta={meta} rows={qcRows} disabled={closed} onSave={checks => run(() => api(`/admin/stitching/orders/${o.id}/qc`, { method: 'PUT', body: { checks } }))} />
          </section>

          <section className="dpos-card stc-stack">
            <h2 style={{ margin: 0 }}>Price and payments</h2>
            <div className="stc-sum">
              <div><span>Subtotal</span><span>{inr(o.subtotal)}</span></div>
              {o.alterationTotal > 0 && <div><span>includes alterations</span><span>{inr(o.alterationTotal)}</span></div>}
              {o.discount > 0 && <div><span>Discount</span><span>− {inr(o.discount)}</span></div>}
              {o.isGst && <div><span>GST {o.gstRate}%</span><span>{inr(o.tax)}</span></div>}
              <div className="tot"><span>Total</span><span>{inr(o.total)}</span></div>
              <div><span>Paid</span><span>{inr(o.paid)}</span></div>
              <div><b>Balance</b><b style={{ color: o.balance ? 'var(--d-bad)' : 'var(--d-ok)' }}>{inr(o.balance)}</b></div>
            </div>
            <div className="stc-row">
              {o.balance > 0 && o.status !== 'cancelled' && <button className="dpos-btn sm" onClick={() => setM({ t: 'pay', refund: false })}>Record payment</button>}
              {!o.invoiceNo && o.status !== 'cancelled' && o.total > 0 && <button className="dpos-btn outline sm" onClick={() => setM({ t: 'invoice' })}>Create invoice</button>}
              {manager && !o.invoiceNo && o.paid > 0 && <button className="dpos-btn danger sm" onClick={() => setM({ t: 'pay', refund: true })}>Refund</button>}
            </div>
            {o.invoiceNo && <p className="muted small" style={{ margin: 0 }}>Invoiced as {o.invoiceNo} in billing. Charges are locked.</p>}
            {o.payments.length > 0 && <table className="stc-table"><thead><tr><th>Receipt</th><th>Date</th><th className="r">Amount</th></tr></thead><tbody>{o.payments.map(p => (
              <tr key={p.id}><td className="stc-mono">{p.receipt}<div className="muted small" style={{ fontFamily: 'inherit' }}>{p.kind} · {p.mode.toUpperCase()}{p.ref ? ` · ${p.ref}` : ''}</div></td><td className="small">{when(p.at)}</td><td className="r money" style={p.kind === 'refund' ? { color: 'var(--d-bad)' } : null}>{p.kind === 'refund' ? '− ' : ''}{inr(p.amount)}</td></tr>))}</tbody></table>}
          </section>

          <section className="dpos-card stc-stack">
            <h2 style={{ margin: 0 }}>Appointments</h2>
            {!o.appointments.length ? <p className="muted" style={{ margin: 0 }}>None booked.</p> : o.appointments.map(a => <div key={a.id} className="stc-row between"><span><b>{kindName(meta, a.kind)}</b><div className="muted small">{when(a.startsAt)}{a.tailorName ? ` · ${a.tailorName}` : ''}</div></span><span className={`stc-pill ${a.status === 'completed' ? 's-done' : a.status === 'cancelled' ? 's-cancelled' : 's-trial'}`}>{a.status}</span></div>)}
          </section>

          <section className="dpos-card stc-stack">
            <h2 style={{ margin: 0 }}>Internal notes and activity</h2>
            <NoteBox onAdd={t => run(() => api(`/admin/stitching/orders/${o.id}/notes`, { method: 'POST', body: { text: t } }))} />
            <ul className="stc-stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 8, maxHeight: 340, overflow: 'auto' }}>{o.activity.map(a => <li key={a.id} style={{ fontSize: 13 }}><b>{ACT[a.action] ?? a.action}</b>{actText(a) && <>: {actText(a)}</>}<div className="muted small">{a.by} · {when(a.at)}</div></li>)}</ul>
          </section>
        </aside>
      </div>

      {m?.t === 'status' && <StatusModal meta={meta} order={o} to={m.to} manager={manager} onClose={close} onDone={r => { setO(r); close() }} />}
      {m?.t === 'pay' && <PayModal order={o} refund={m.refund} onClose={close} onDone={r => { setO(r); close() }} />}
      {m?.t === 'invoice' && <InvoiceModal order={o} onClose={close} onDone={r => { setO(r); close() }} />}
      {m?.t === 'alt' && <AltModal meta={meta} order={o} manager={manager} tailors={tailors} onClose={close} onDone={r => { setO(r); close() }} />}
      {m?.t === 'altDone' && <AltDoneModal order={o} a={m.a} onClose={close} onDone={r => { setO(r); close() }} />}
      {m?.t === 'sched' && <SchedModal meta={meta} order={o} manager={manager} tailors={tailors} onClose={close} onDone={r => { setO(r); close() }} />}
      {m?.t === 'item' && <ItemModal meta={meta} order={o} item={m.item} designs={designs} onClose={close} onDone={r => { setO(r); close() }} />}
      {m?.t === 'appt' && <AppointmentModal meta={meta} tailors={tailors} order={o} onClose={close} onSaved={() => { close(); load() }} />}
    </div>);
}

function NoteBox({ onAdd }) {
  const [t, setT] = useState('');
  return <form className="stc-row" onSubmit={async e => { e.preventDefault(); if (t.trim() && await onAdd(t.trim())) setT('') }}><input style={{ flex: 1 }} value={t} maxLength={500} onChange={e => setT(e.target.value)} placeholder="Add an internal note (never printed on the customer copy)" aria-label="Internal note" /><button className="dpos-btn sm" disabled={!t.trim()}>Add</button></form>;
}

function QcPanel({ meta, rows, disabled, onSave }) {
  const [v, setV] = useState(() => Object.fromEntries(meta.qcChecks.map(([k]) => [k, rows.find(r => r.key === k)?.passed ?? null])));
  const dirty = meta.qcChecks.some(([k]) => (rows.find(r => r.key === k)?.passed ?? null) !== v[k]);
  return (
    <div className="stc-stack" style={{ gap: 8 }}>
      {meta.qcChecks.map(([k, l]) => (
        <div className="stc-row between" key={k}><span style={{ fontSize: 14 }}>{l}</span>
          <div className="stc-unit" role="radiogroup" aria-label={l}>{[[true, 'Pass'], [false, 'Fail']].map(([b, t]) => <button key={t} type="button" role="radio" aria-checked={v[k] === b} disabled={disabled} className={v[k] === b ? 'on' : ''} style={v[k] === b && b === false ? { background: 'var(--d-bad)' } : null} onClick={() => setV({ ...v, [k]: b })}>{t}</button>)}</div></div>))}
      {!disabled && <button className="dpos-btn sm" disabled={!dirty || meta.qcChecks.every(([k]) => v[k] === null)} onClick={() => onSave(meta.qcChecks.filter(([k]) => v[k] !== null).map(([k]) => ({ key: k, passed: v[k] })))}>Save checklist</button>}
    </div>);
}

function useAction(fn, onDone) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  const go = async () => { setBusy(true); setErr(); try { const r = await fn(); onDone(r.order ?? r, r) } catch (e) { setErr(e.message) } finally { setBusy(false) } };
  return { busy, err, go };
}

function StatusModal({ meta, order, to, manager, onClose, onDone }) {
  const [note, setNote] = useState(''); const [override, setOverride] = useState(false);
  const { busy, err, go } = useAction(() => api(`/admin/stitching/orders/${order.id}/status`, { method: 'POST', body: { status: to, note, override } }), onDone);
  const cancel = to === 'cancelled';
  return (
    <Modal title={cancel ? 'Cancel this order' : `Move to “${statusName(meta, to)}”`} sub={order.orderNo} onClose={onClose}
      footer={<><button className="dpos-btn ghost" onClick={onClose}>Back</button><button className={`dpos-btn ${cancel ? 'danger' : ''}`} disabled={busy || (cancel && note.trim().length < 3)} onClick={go}>{busy ? 'SAVING…' : cancel ? 'CANCEL ORDER' : 'CONFIRM'}</button></>}>
      <div className="stc-stack">
        <Err>{err}</Err>
        <Field label={cancel ? 'Reason (required)' : 'Note (optional)'}><textarea rows="2" maxLength={300} value={note} onChange={e => setNote(e.target.value)} /></Field>
        {manager && ['ready', 'delivered'].includes(to) && <label className="stc-row"><input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} />
          <span style={{ fontSize: 13 }}>{to === 'ready' ? 'Owner/admin override: skip the incomplete quality check' : 'Owner/admin override: deliver with a balance still due'} (a note is required and the override is recorded)</span></label>}
        {cancel && order.paid > 0 && <p className="stc-warn" style={{ margin: 0 }}>{inr(order.paid)} has been received. Cancelling does not refund it: record a refund afterwards if the customer is owed money.</p>}
      </div>
    </Modal>);
}

function PayModal({ order, refund, onClose, onDone }) {
  const [amount, setAmount] = useState(refund ? '' : rupees(order.balance)); const [mode, setMode] = useState('cash'); const [ref, setRef] = useState(''); const [note, setNote] = useState(''); const [key] = useState(newKey);
  const kind = refund ? 'refund' : order.paid === 0 ? 'advance' : order.balance <= toPaise(amount) ? 'final' : 'part';
  const { busy, err, go } = useAction(() => api(`/admin/stitching/orders/${order.id}/payments`, { method: 'POST', body: { idempotencyKey: key, kind, amount: toPaise(amount), mode, ref: ref || undefined, note: note || undefined } }), onDone);
  return (
    <Modal title={refund ? 'Record a refund' : 'Record a payment'} sub={`${order.orderNo} · balance ${inr(order.balance)}`} onClose={onClose}
      footer={<><button className="dpos-btn ghost" onClick={onClose}>Back</button><button className="dpos-btn" disabled={busy || !toPaise(amount) || (refund && note.trim().length < 3)} onClick={go}>{busy ? 'SAVING…' : refund ? 'RECORD REFUND' : 'RECORD PAYMENT'}</button></>}>
      <div className="stc-stack"><Err>{err}</Err>
        <div className="stc-grid"><Field label="Amount (₹)"><input type="number" min="0" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} autoFocus /></Field>
          <Field label="Paid by"><select value={mode} onChange={e => setMode(e.target.value)}><option value="cash">Cash</option><option value="upi">GPay / UPI</option><option value="card">Card</option></select></Field></div>
        <Field label="Reference"><input value={ref} onChange={e => setRef(e.target.value)} placeholder="UPI / card reference (optional)" /></Field>
        {refund && <Field label="Reason (required)"><input value={note} maxLength={200} onChange={e => setNote(e.target.value)} /></Field>}
        <p className="muted small" style={{ margin: 0 }}>Submitting twice records the payment once. No money is charged automatically: this only records what you received.</p></div>
    </Modal>);
}

function InvoiceModal({ order, onClose, onDone }) {
  const [mode, setMode] = useState('cash'); const [ref, setRef] = useState('');
  const { busy, err, go } = useAction(() => api(`/admin/stitching/orders/${order.id}/invoice`, { method: 'POST', body: { balanceMode: order.balance > 0 ? mode : undefined, paymentRef: ref || undefined } }), onDone);
  return (
    <Modal title="Create the invoice" sub={`${order.orderNo} · total ${inr(order.total)}`} onClose={onClose}
      footer={<><button className="dpos-btn ghost" onClick={onClose}>Back</button><button className="dpos-btn" disabled={busy} onClick={go}>{busy ? 'CREATING…' : order.balance > 0 ? `COLLECT ${inr(order.balance)} AND INVOICE` : 'CREATE INVOICE'}</button></>}>
      <div className="stc-stack"><Err>{err}</Err>
        <p style={{ margin: 0 }}>This creates one invoice in Billing (Order History) for the full order. Payments already recorded here are counted in it, so nothing is billed twice. Charges lock once the invoice exists.</p>
        {order.balance > 0 && <div className="stc-grid"><Field label={`Balance ${inr(order.balance)} paid by`}><select value={mode} onChange={e => setMode(e.target.value)}><option value="cash">Cash</option><option value="upi">GPay / UPI</option><option value="card">Card</option></select></Field><Field label="Reference"><input value={ref} onChange={e => setRef(e.target.value)} /></Field></div>}
        {order.balance > 0 && <p className="stc-warn" style={{ margin: 0 }}>The balance is recorded as received now. Only continue if you have collected it.</p>}</div>
    </Modal>);
}

function AltModal({ meta, order, manager, tailors, onClose, onDone }) {
  const [f, setF] = useState({ itemId: order.items.length === 1 ? String(order.items[0].id) : '', reason: '', feedback: '', corrections: '', charge: '', tailorId: order.tailorId ? String(order.tailorId) : '', dueDate: '' });
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const { busy, err, go } = useAction(() => api(`/admin/stitching/orders/${order.id}/alterations`, { method: 'POST', body: { itemId: f.itemId ? Number(f.itemId) : null, reason: f.reason, feedback: f.feedback, corrections: f.corrections, charge: toPaise(f.charge), tailorId: f.tailorId ? Number(f.tailorId) : null, dueDate: f.dueDate || null } }), onDone);
  return (
    <Modal title={`Alteration round ${order.alterations.length + 1}`} sub={order.orderNo} onClose={onClose} footer={<><button className="dpos-btn ghost" onClick={onClose}>Back</button><button className="dpos-btn" disabled={busy || f.reason.trim().length < 3} onClick={go}>{busy ? 'SAVING…' : 'SEND FOR ALTERATION'}</button></>}>
      <div className="stc-stack"><Err>{err}</Err>
        <div className="stc-grid"><Field label="Garment"><select value={f.itemId} onChange={set('itemId')}><option value="">Whole order</option>{order.items.map(i => <option key={i.id} value={i.id}>{i.garmentName}</option>)}</select></Field>
          <Field label="Tailor"><select value={f.tailorId} onChange={set('tailorId')}><option value="">Same as order</option>{tailors.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Expected completion"><input type="date" value={f.dueDate} onChange={set('dueDate')} /></Field><Field label="Extra charge (₹)"><input type="number" min="0" value={f.charge} onChange={set('charge')} /></Field></div>
        <Field label="Reason"><input value={f.reason} maxLength={200} onChange={set('reason')} /></Field>
        <Field label="Trial feedback"><textarea rows="2" maxLength={500} value={f.feedback} onChange={set('feedback')} /></Field>
        <Field label="Required corrections"><textarea rows="2" maxLength={500} value={f.corrections} onChange={set('corrections')} /></Field>
        <p className="muted small" style={{ margin: 0 }}>Earlier rounds and their quality checks are kept. A new round starts a fresh quality checklist.{!manager && ' Only an owner or admin can change the charge afterwards.'}</p></div>
    </Modal>);
}

function AltDoneModal({ order, a, onClose, onDone }) {
  const [t, setT] = useState('');
  const { busy, err, go } = useAction(() => api(`/admin/stitching/orders/${order.id}/alterations/${a.id}`, { method: 'PATCH', body: { status: 'done', completionNotes: t } }), onDone);
  return <Modal title={`Complete alteration round ${a.round}`} sub={order.orderNo} onClose={onClose} footer={<><button className="dpos-btn ghost" onClick={onClose}>Back</button><button className="dpos-btn" disabled={busy} onClick={go}>MARK DONE</button></>}>
    <div className="stc-stack"><Err>{err}</Err><Field label="Completion notes"><textarea rows="3" maxLength={500} value={t} onChange={e => setT(e.target.value)} /></Field></div></Modal>;
}

function SchedModal({ meta, order, manager, tailors, onClose, onDone }) {
  const [f, setF] = useState({ priority: order.priority, tailorId: order.tailorId ? String(order.tailorId) : '', startDate: order.startDate ?? '', trialDate: order.trialDate ?? '', deliveryDate: order.deliveryDate, notes: order.notes, discount: rupees(order.discount), urgent: rupees(order.urgentCharge), isGst: order.isGst, gstRate: order.gstRate });
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const locked = !!order.invoiceNo;
  const lockTailor = !manager && order.tailorId;
  const { busy, err, go } = useAction(() => api(`/admin/stitching/orders/${order.id}`, { method: 'PATCH', body: {
    priority: f.priority, startDate: f.startDate || null, trialDate: f.trialDate || null, deliveryDate: f.deliveryDate, notes: f.notes,
    ...(lockTailor ? {} : { tailorId: f.tailorId ? Number(f.tailorId) : null }),
    ...(manager && !locked ? { discount: toPaise(f.discount), urgentCharge: toPaise(f.urgent), isGst: f.isGst, gstRate: Number(f.gstRate) } : {}) } }), (r, raw) => { onDone(r, raw) });
  return (
    <Modal title="Schedule, tailor and charges" sub={order.orderNo} wide onClose={onClose} footer={<><button className="dpos-btn ghost" onClick={onClose}>Back</button><button className="dpos-btn" disabled={busy} onClick={go}>{busy ? 'SAVING…' : 'SAVE'}</button></>}>
      <div className="stc-stack"><Err>{err}</Err>
        <div className="stc-grid"><Field label="Priority"><select value={f.priority} onChange={set('priority')}><option value="normal">Normal</option><option value="urgent">Urgent</option><option value="express">Express</option></select></Field>
          <Field label="Tailor"><select value={f.tailorId} disabled={!!lockTailor} onChange={set('tailorId')}><option value="">Not assigned</option>{tailors.filter(t => t.active || String(t.id) === f.tailorId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Start"><input type="date" value={f.startDate} onChange={set('startDate')} /></Field><Field label="Trial"><input type="date" value={f.trialDate} onChange={set('trialDate')} /></Field>
          <Field label="Promised delivery"><input type="date" value={f.deliveryDate} onChange={set('deliveryDate')} /></Field></div>
        <Field label="Notes"><textarea rows="2" maxLength={1000} value={f.notes} onChange={set('notes')} /></Field>
        {lockTailor && <p className="muted small" style={{ margin: 0 }}>Only an owner or admin can reassign work that already has a tailor.</p>}
        {manager && <><h4 style={{ margin: 0 }}>Charges (owner/admin){locked && ' · locked, already invoiced'}</h4>
          <div className="stc-grid"><Field label="Urgent charge (₹)"><input type="number" min="0" disabled={locked} value={f.urgent} onChange={set('urgent')} /></Field><Field label="Discount (₹)"><input type="number" min="0" disabled={locked} value={f.discount} onChange={set('discount')} /></Field>
            <Field label="GST"><select disabled={locked} value={f.isGst ? String(f.gstRate) : 'none'} onChange={e => e.target.value === 'none' ? setF({ ...f, isGst: false }) : setF({ ...f, isGst: true, gstRate: Number(e.target.value) })}><option value="none">No GST</option>{[5, 12, 18].map(r => <option key={r} value={r}>GST {r}%</option>)}</select></Field></div></>}</div>
    </Modal>);
}

function ItemModal({ meta, order, item, designs, onClose, onDone }) {
  const [it, setIt] = useState(item);
  const { busy, err, go } = useAction(() => api(`/admin/stitching/orders/${order.id}/items/${item.id}`, { method: 'PATCH', body: itemPayload(it) }), onDone);
  return (
    <Modal title="Edit garment" sub={order.orderNo} wide onClose={onClose} footer={<><button className="dpos-btn ghost" onClick={onClose}>Back</button><button className="dpos-btn" disabled={busy} onClick={go}>{busy ? 'SAVING…' : 'SAVE GARMENT'}</button></>}>
      <div className="stc-xl stc-stack"><Err>{err}</Err><ItemForm meta={meta} item={it} onChange={setIt} customerId={order.customerId} designs={designs} lockType />
        <p className="muted small" style={{ margin: 0 }}>Saving stores a new dated measurement snapshot for this order. Charges can only be changed by an owner or admin, and not after invoicing.</p></div>
    </Modal>);
}
