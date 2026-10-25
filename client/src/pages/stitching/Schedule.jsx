import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import Modal from '../../components/Modal';
import { istDay } from '../../components/PeriodFilter';
import { clock, longDate } from '../../lib/invoiceFormat';
import { CustomerPicker, Empty, Err, Field, addDays, kindName, todayStr, useMeta, waLink } from './common';

const istTime = iso => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Book / reschedule / complete / cancel. Overlaps are warned about (never silently allowed). Reminders are a manual WhatsApp link: nothing is sent by the system.
export function AppointmentModal({ meta, tailors, order, appt, onClose, onSaved }) {
  const [customer, setCustomer] = useState(order ? { id: order.customerId, name: order.customerName, phone: order.customerPhone } : appt ? { id: appt.customerId, name: appt.customerName, phone: appt.customerPhone } : null);
  const [f, setF] = useState(() => appt ? { kind: appt.kind, date: istDay(appt.startsAt), time: istTime(appt.startsAt), minutes: appt.minutes, tailorId: appt.tailorId ? String(appt.tailorId) : '', notes: appt.notes } : { kind: order?.status === 'ready' ? 'delivery' : 'trial', date: addDays(todayStr(), 1), time: '10:00', minutes: 30, tailorId: order?.tailorId ? String(order.tailorId) : '', notes: '' });
  const [err, setErr] = useState(); const [clash, setClash] = useState(null); const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const startsAt = `${f.date}T${f.time}:00+05:30`;
  const save = async (ignoreConflicts = false) => {
    setBusy(true); setErr(); setClash(null);
    try {
      if (appt) await api(`/admin/stitching/appointments/${appt.id}`, { method: 'PATCH', body: { startsAt, minutes: Number(f.minutes), tailorId: f.tailorId ? Number(f.tailorId) : null, notes: f.notes, ignoreConflicts } });
      else await api('/admin/stitching/appointments', { method: 'POST', body: { ...(order ? { orderId: order.id } : { customerId: customer.id }), kind: f.kind, startsAt, minutes: Number(f.minutes), tailorId: f.tailorId ? Number(f.tailorId) : null, notes: f.notes, ignoreConflicts } });
      onSaved();
    } catch (e) { if (e.code === 'conflict') setClash(e.conflicts); setErr(e.message) } finally { setBusy(false) }
  };
  const setStatus = async status => { setBusy(true); setErr(); try { await api(`/admin/stitching/appointments/${appt.id}`, { method: 'PATCH', body: { status } }); onSaved() } catch (e) { setErr(e.message) } finally { setBusy(false) } };
  const editable = !appt || appt.status === 'scheduled';
  return (
    <Modal title={appt ? `${kindName(meta, appt.kind)} · ${appt.customerName}` : 'Schedule an appointment'} sub={appt?.orderNo ?? order?.orderNo} onClose={onClose}
      footer={<>{appt?.status === 'scheduled' && <><button className="dpos-btn danger" disabled={busy} onClick={() => setStatus('cancelled')}>Cancel appointment</button><button className="dpos-btn outline" disabled={busy} onClick={() => setStatus('completed')}>Mark completed</button></>}
        <button className="dpos-btn ghost" onClick={onClose}>Close</button>{editable && <button className="dpos-btn" disabled={busy || !customer?.id} onClick={() => save(false)}>{busy ? 'SAVING…' : appt ? 'RESCHEDULE / SAVE' : 'BOOK'}</button>}</>}>
      <div className="stc-stack"><Err>{err}</Err>
        {clash && <div className="stc-warn"><b>Overlaps:</b> {clash.map(c => `${kindName(meta, c.kind)} for ${c.customerName} at ${istTime(c.startsAt)}`).join('; ')}. <button className="stc-link" onClick={() => save(true)}>Book anyway</button></div>}
        {!order && !appt && <Field label="Customer">{customer?.isNew ? <p className="stc-warn">Add new customers from a stitching order or the measurement book first.</p> : null}<CustomerPicker value={customer?.isNew ? null : customer} onChange={setCustomer} /></Field>}
        {appt && appt.status !== 'scheduled' && <p className="stc-warn" style={{ margin: 0 }}>This appointment is {appt.status}. Book a new one to reschedule.</p>}
        <div className="stc-grid">
          <Field label="Type"><select value={f.kind} disabled={!!appt} onChange={set('kind')}>{meta.apptKinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Date"><input type="date" disabled={!editable} value={f.date} onChange={set('date')} /></Field><Field label="Time"><input type="time" disabled={!editable} value={f.time} onChange={set('time')} /></Field>
          <Field label="Minutes"><input type="number" min="5" max="480" step="5" disabled={!editable} value={f.minutes} onChange={set('minutes')} /></Field>
          <Field label="Staff / tailor"><select value={f.tailorId} disabled={!editable} onChange={set('tailorId')}><option value="">Not assigned</option>{tailors.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field></div>
        <Field label="Notes"><textarea rows="2" maxLength={300} disabled={!editable} value={f.notes} onChange={set('notes')} /></Field>
        {appt?.customerPhone && appt.status === 'scheduled' && <a className="stc-link" href={waLink(appt.customerPhone, `Hello ${appt.customerName}, a reminder of your ${kindName(meta, appt.kind).toLowerCase()} at Dhanya Boutique on ${longDate(istDay(appt.startsAt))} at ${clock(appt.startsAt)}.`)} target="_blank" rel="noopener noreferrer">Open a WhatsApp reminder to send yourself</a>}
        <p className="muted small" style={{ margin: 0 }}>The system does not send reminders by itself.</p></div>
    </Modal>);
}

export default function Schedule() {
  const [meta] = useMeta(); const [sp, setSp] = useSearchParams();
  const [view, setView] = useState('calendar'); const [tailors, setTailors] = useState([]);
  const t0 = todayStr(); const [ym, setYm] = useState([Number(t0.slice(0, 4)), Number(t0.slice(5, 7)) - 1]);
  const [rows, setRows] = useState(null); const [err, setErr] = useState(); const [edit, setEdit] = useState(sp.get('new') ? 'new' : null); const [showAll, setShowAll] = useState(false); const [tick, setTick] = useState(0);
  useEffect(() => { api('/admin/stitching/tailors').then(setTailors).catch(() => {}) }, []);
  const range = useMemo(() => {
    if (view === 'list') return [addDays(t0, -21), addDays(t0, 45)];
    const first = new Date(Date.UTC(ym[0], ym[1], 1)), off = (first.getUTCDay() + 6) % 7, start = new Date(first); start.setUTCDate(1 - off);
    const s = start.toISOString().slice(0, 10); return [s, addDays(s, 41)];
  }, [view, ym, t0]);
  const load = useCallback(() => api(`/admin/stitching/appointments?from=${range[0]}&to=${range[1]}`).then(r => { setRows(r); setErr() }).catch(e => setErr(e.message)), [range]);
  useEffect(() => { setRows(null); load() }, [load, tick]);
  const byDay = useMemo(() => { const m = {}; for (const a of rows ?? []) (m[istDay(a.startsAt)] ??= []).push(a); return m }, [rows]);
  if (!meta) return <Empty>Loading…</Empty>;
  const done = () => { setEdit(null); sp.delete('new'); setSp(sp, { replace: true }); setTick(x => x + 1) };
  const list = (rows ?? []).filter(a => showAll || a.status === 'scheduled');
  const overdue = list.filter(a => a.overdue), today = list.filter(a => istDay(a.startsAt) === t0 && !a.overdue), upcoming = list.filter(a => istDay(a.startsAt) > t0);
  const Row = ({ a }) => <li><button className="stc-row between" style={{ width: '100%', textAlign: 'left', padding: '10px 4px', borderBottom: '1px solid #f0ece4' }} onClick={() => setEdit(a)}>
    <span><b>{kindName(meta, a.kind)}</b> · {a.customerName}{a.orderNo && <span className="muted small"> · {a.orderNo}</span>}{a.tailorName && <span className="muted small"> · {a.tailorName}</span>}</span>
    <span className="stc-row"><span className="muted small">{longDate(istDay(a.startsAt))}, {clock(a.startsAt)}</span>{a.overdue && <span className="stc-pill late">Overdue</span>}{a.status !== 'scheduled' && <span className={`stc-pill ${a.status === 'completed' ? 's-done' : 's-cancelled'}`}>{a.status}</span>}</span></button></li>;
  const cells = view === 'calendar' ? Array.from({ length: 42 }, (_, i) => addDays(range[0], i)) : [];
  return (
    <div className="stc-stack">
      <div className="stc-row between">
        <div className="dpos-seg" role="radiogroup" aria-label="View">{[['calendar', 'Calendar'], ['list', 'List']].map(([k, l]) => <button key={k} role="radio" aria-checked={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div>
        {view === 'calendar' && <div className="stc-row"><button className="dpos-btn ghost sm" aria-label="Previous month" onClick={() => setYm(([y, m]) => m ? [y, m - 1] : [y - 1, 11])}>←</button><b style={{ minWidth: 140, textAlign: 'center' }}>{MONTHS[ym[1]]} {ym[0]}</b><button className="dpos-btn ghost sm" aria-label="Next month" onClick={() => setYm(([y, m]) => m < 11 ? [y, m + 1] : [y + 1, 0])}>→</button>
          <button className="dpos-btn ghost sm" onClick={() => setYm([Number(t0.slice(0, 4)), Number(t0.slice(5, 7)) - 1])}>Today</button></div>}
        <button className="dpos-btn" onClick={() => setEdit('new')}>+ Schedule appointment</button>
      </div>
      <Err>{err}</Err>
      {view === 'calendar' ? (
        <div className="stc-cal" role="grid" aria-label="Appointments calendar">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="hd">{d}</div>)}
          {cells.map(d => { const ev = byDay[d] ?? []; return (
            <div key={d} className={`day ${Number(d.slice(5, 7)) - 1 !== ym[1] ? 'off' : ''} ${d === t0 ? 'today' : ''}`}><b style={{ justifySelf: 'start' }}>{Number(d.slice(8))}</b>
              {ev.slice(0, 3).map(a => <button key={a.id} className={`ev ${a.status === 'cancelled' ? 'x' : a.overdue ? 'late' : ''}`} title={`${kindName(meta, a.kind)} · ${a.customerName}`} onClick={() => setEdit(a)}>{istTime(a.startsAt)} {a.customerName}</button>)}
              {ev.length > 3 && <button className="stc-link" style={{ textAlign: 'left' }} onClick={() => { setView('list'); setShowAll(true) }}>+{ev.length - 3} more</button>}</div>) })}
        </div>) : (
        <section className="dpos-card stc-stack">
          <label className="stc-row"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Show completed and cancelled</label>
          {!rows ? <Empty>Loading…</Empty> : !list.length ? <Empty>No appointments in this period.</Empty> : <>
            {overdue.length > 0 && <div><h3 style={{ color: 'var(--d-bad)' }}>Overdue</h3><ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{overdue.map(a => <Row key={a.id} a={a} />)}</ul></div>}
            <div><h3>Today’s schedule</h3>{today.length ? <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{today.map(a => <Row key={a.id} a={a} />)}</ul> : <p className="muted">Nothing else today.</p>}</div>
            <div><h3>Upcoming</h3>{upcoming.length ? <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{upcoming.map(a => <Row key={a.id} a={a} />)}</ul> : <p className="muted">Nothing booked.</p>}</div></>}
        </section>)}
      {edit && <AppointmentModal meta={meta} tailors={tailors} appt={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={done} />}
    </div>);
}
