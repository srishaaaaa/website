import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import Modal from '../components/Modal';
import { Icon } from '../components/AdminShell';
import PrintSettings from '../components/PrintSettings';
import { Chips, PeriodFilter, inPeriod, periodRange, todayStr, usePeriod } from '../components/PeriodFilter';
import { MODE, clock, longDate, money } from '../lib/invoiceFormat';
import PayPicker, { blankPay, payParts } from '../components/PayPicker';

// "Cash ₹500 · QR / GPay ₹500" for a {cash, upi, card} split.
const SPLIT_L = [['cash', 'Cash'], ['upi', 'QR / GPay'], ['card', 'Card']];
export const splitText = s => SPLIT_L.filter(([k]) => s?.[k] > 0).map(([k, l]) => `${l} ${money(s[k])}`).join(' · ');
const depSplit = a => a.depositSplit || { [a.depositMode]: a.deposit };

const toPaise = s => { const n = Math.round(parseFloat(String(s || '').replace(/,/g, '')) * 100); return Number.isFinite(n) && n > 0 ? n : 0 };
const Err = ({ children }) => children ? <p className="dpos-err" role="alert">{children}</p> : null;
const Empty = ({ children }) => <p className="dpos-empty">{children}</p>;
const waLink = (phone, text) => { const d = String(phone || '').replace(/\D/g, '').slice(-10); return `https://wa.me/${d.length === 10 ? '91' + d : ''}?text=${encodeURIComponent(text)}` };
const invoiceUrl = token => `${location.origin}/invoice/${token}`;
const dtShort = iso => ({ d: longDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso))), t: clock(iso) });
const Ico = ({ children, size = 17 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
const WaIcon = () => <Ico><path d="M20 12a8 8 0 0 1-11.9 7L4 20l1.1-4A8 8 0 1 1 20 12Z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.2-1.7-1-.8.6a3.5 3.5 0 0 1-1.6-1.6l.6-.8-1-1.7Z" /></Ico>;
const DocIcon = () => <Ico><path d="M6 3h9l4 4v14H6z" /><path d="M9 13h7M9 17h7" /></Ico>;
const EyeIcon = () => <Ico><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Ico>;
const TrashIcon = () => <Ico><path d="M4 7h16M10 3h4M6 7l1 13h10l1-13M10 11v6M14 11v6" /></Ico>;

// ============================ order history ============================
export function OrderHistory({ tick, manager, openInvoice, onChanged }) {
  const [f, setF] = useState({ q: '', name: '', phone: '', source: 'all' }); const [per, setPer] = usePeriod('all');
  const [rows, setRows] = useState(null); const [err, setErr] = useState(); const [n, setN] = useState(0);
  const [from, to] = periodRange(per);
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams({ q: f.q, name: f.name, phone: f.phone, source: f.source, channel: 'retail' }); if (manager) { p.set('from', from); p.set('to', to) }
      api('/admin/pos/sales?' + p).then(r => { setRows(r); setErr() }).catch(e => setErr(e.message));
    }, 220);
    return () => clearTimeout(t);
  }, [f, from, to, tick, n, manager]);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const voidIt = async r => {
    const reason = window.prompt(`Void ${r.invoiceNo}? Its stock goes back. Reason?`); if (!reason) return;
    try { await api(`/admin/pos/sales/${encodeURIComponent(r.invoiceNo)}/void`, { method: 'POST', body: { reason } }); setN(x => x + 1); onChanged?.() } catch (e) { setErr(e.message) }
  };
  const exportCsv = () => {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Order ID', 'Date', 'Time', 'Customer', 'Mobile', 'Source', 'Type', 'Payment', 'Total (INR)', 'Status'].map(esc).join(',')]
      .concat((rows || []).map(r => [r.invoiceNo, r.billDate, clock(r.createdAt), r.customerName || 'Guest', r.customerPhone, r.source, r.isGst ? 'GST' : 'NON-GST', MODE[r.paymentMode], (r.total / 100).toFixed(2), r.status].map(esc).join(',')));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })); a.download = `order-history-${todayStr()}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  return (
    <>
      <div className="dpos-bar-tools">
        {manager ? <PeriodFilter value={per} onChange={setPer} /> : <span className="sub">Cashiers see today’s bills. Owners and admins can search the full history.</span>}
        <button className="dpos-btn outline" onClick={exportCsv} disabled={!rows?.length}><Ico size={15}><path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" /></Ico>Export CSV</button>
      </div>
      <section className="dpos-card dpos-filters">
        <label className="f">Search order ID<input type="search" value={f.q} onChange={set('q')} placeholder="e.g. DP-2026-…" /></label>
        <label className="f">Customer name<input value={f.name} onChange={set('name')} placeholder="Search name…" /></label>
        <label className="f">Customer phone<input value={f.phone} inputMode="tel" onChange={set('phone')} placeholder="Search phone…" /></label>
        <label className="f">Order source<select value={f.source} onChange={set('source')}><option value="all">All Sources</option><option value="offline">Offline</option><option value="online">Online</option></select></label>
      </section>
      <Err>{err}</Err>
      <section className="dpos-card dpos-ordcard">
        {!rows ? <Empty>Loading…</Empty> : !rows.length ? <Empty>No orders match.</Empty> : (
          <div className="dpos-tw"><table className="dpos-ord"><thead><tr><th>Order ID</th><th>Date &amp; time</th><th>Customer name</th><th>Mobile number</th><th>Source</th><th>Total due</th><th className="r">Status</th></tr></thead>
            <tbody>{rows.map(r => { const dt = dtShort(r.createdAt); return (
              <tr key={r.invoiceNo} className={r.status === 'voided' ? 'voided' : ''}>
                <td className="oid">{r.invoiceNo}</td>
                <td><b>{longDate(r.billDate)}</b><div className="muted small">{dt.t}</div></td>
                <td><b>{r.customerName || 'Guest'}</b></td>
                <td>{r.customerPhone || <span className="muted">—</span>}</td>
                <td><span className="dpos-tag">{r.source}</span><br /><span className="dpos-tag solid">{r.isGst ? 'GST' : 'NON-GST'}</span></td>
                <td className="due">{inr(r.total)}</td>
                <td className="r"><div className="dpos-rowact">
                  <span className={`dpos-pill ${r.status === 'voided' ? 'bad' : 'ok'}`}>{r.status === 'voided' ? 'Void' : 'Completed'}</span>
                  <a className="ra wa" title="Send invoice on WhatsApp" aria-label="Send on WhatsApp" href={waLink(r.customerPhone, `Hello${r.customerName ? ' ' + r.customerName : ''}, here is your invoice ${r.invoiceNo} for ${money(r.total)}: ${invoiceUrl(r.shareToken)}`)} target="_blank" rel="noopener noreferrer"><WaIcon /></a>
                  <a className="ra doc" title="Open invoice in a new tab" aria-label="Open invoice" href={`/invoice/${r.shareToken}`} target="_blank" rel="noopener noreferrer"><DocIcon /></a>
                  <button className="ra eye" title="View invoice" aria-label="View invoice" onClick={() => openInvoice(r.invoiceNo, r)}><EyeIcon /></button>
                  {manager && <button className="ra del" title="Void this invoice" aria-label="Void invoice" disabled={r.status === 'voided'} onClick={() => voidIt(r)}><TrashIcon /></button>}
                </div></td></tr>) })}</tbody></table></div>)}
      </section>
    </>
  );
}

// ============================ advance order: booking window (opened from Billing) ============================
const ClockIcon = () => <Ico size={16}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Ico>;

export function AdvanceModal({ total, onClose, onSave }) {
  const [dep, setDep] = useState(''); const [pay, setPay] = useState(blankPay); const [date, setDate] = useState(''); const [notes, setNotes] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  const deposit = toPaise(dep);
  const submit = async e => {
    e.preventDefault(); setErr();
    if (!(deposit > 0)) return setErr('Enter the deposit amount received.');
    if (deposit > total) return setErr('The deposit cannot be more than the order total.');
    const pp = payParts(pay, deposit); if (pp.problem) return setErr(pp.problem);
    setBusy(true);
    try { await onSave({ deposit, depositMode: pp.mode, depositSplit: pp.split, deliveryDate: date || null, notes: notes.trim() || undefined }) } catch (x) { setErr(x.issues?.[0]?.message || x.message); setBusy(false) }
  };
  return (
    <Modal className="adv" title="Save as Advance Order" sub="Not counted as revenue until fully paid" onClose={onClose}>
      <form onSubmit={submit} className="adv-form">
        <div className="adv-total"><span>ORDER TOTAL</span><b>{inr(total)}</b></div>
        <label className="adv-l">DEPOSIT AMOUNT (₹) *<input autoFocus inputMode="decimal" value={dep} onChange={e => setDep(e.target.value)} placeholder="0.00" /></label>
        {deposit > 0 && deposit <= total && <p className="adv-due">Balance due: {inr(total - deposit)}</p>}
        <div><p className="adv-l">DEPOSIT PAYMENT MODE</p>
          <PayPicker value={pay} onChange={setPay} amount={deposit} label="Deposit payment mode" /></div>
        <label className="adv-l">EXPECTED DELIVERY DATE<input type="date" min={todayStr()} value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="adv-l">NOTES (OPTIONAL)<textarea rows={3} maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Colour preference, follow-up needed…" /></label>
        <Err>{err}</Err>
        <button className="adv-go" disabled={busy}><ClockIcon /> {busy ? 'SAVING…' : 'CONFIRM ADVANCE ORDER'}</button>
      </form>
    </Modal>
  );
}

// Shown right after an advance order is saved: the receipt for the deposit, then the order lives in Advance Orders (and in Order History once billed).
export function AdvanceDone({ adv, shop, onClose, onView }) {
  const who = adv.customerName?.trim() || 'Guest';
  const text = `Hello${adv.customerName ? ' ' + adv.customerName : ''}, your advance order ${adv.code} with ${shop?.name || 'us'} is booked. Order total ${money(adv.total)}, deposit paid ${money(adv.deposit)}, balance due ${money(adv.balance)}${adv.deliveryDate ? ', expected on ' + adv.deliveryDate : ''}. Thank you!`;
  const print = () => {
    const w = window.open('', '_blank', 'width=420,height=640'); if (!w) return;
    const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    w.document.write(`<!doctype html><title>Advance receipt ${esc(adv.code)}</title><body style="font-family:Arial,sans-serif;max-width:300px;margin:16px auto;color:#111"><h3 style="margin:0 0 4px;text-align:center">${esc(shop?.name || '')}</h3><p style="text-align:center;margin:0 0 12px;font-size:12px">ADVANCE RECEIPT · ${esc(adv.code)}</p><p style="margin:0 0 8px;font-size:13px">Customer: ${esc(who)}${adv.customerPhone ? ' · ' + esc(adv.customerPhone) : ''}</p><hr><p style="display:flex;justify-content:space-between;margin:8px 0"><span>Order total</span><b>${money(adv.total)}</b></p><p style="display:flex;justify-content:space-between;margin:8px 0"><span>Deposit paid</span><b>${money(adv.deposit)}</b></p><p style="margin:-2px 0 6px;font-size:12px;color:#555">${esc(splitText(depSplit(adv)))}</p><p style="display:flex;justify-content:space-between;margin:8px 0;font-size:16px"><b>Balance due</b><b>${money(adv.balance)}</b></p>${adv.deliveryDate ? '<p style="font-size:12px">Expected: ' + esc(adv.deliveryDate) + '</p>' : ''}<hr><p style="font-size:11px;text-align:center">Not a tax invoice. The bill is issued when the order is collected.</p><script>onload=()=>{print()}<\/script>`);
    w.document.close();
  };
  return (
    <div className="dpos-modal" role="dialog" aria-modal="true" aria-label="Advance order saved" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="dpos-sheet dpos-done adv-done">
        <div className="dpos-done-head">
          <div><h2>Advance Order Saved <span className="adv-tag">DEPOSIT</span></h2><p className="oid">#{adv.code}</p></div>
          <button className="dpos-btn" onClick={onClose}><Icon n="plus" size={14} />New sale</button>
        </div>
        <section className="dpos-done-card">
          <div className="dpos-done-top"><span>ADVANCE RECEIPT — {who.toUpperCase()}</span></div>
          <div className="dpos-done-row"><span>Order Total</span><b className="big">{money(adv.total)}</b></div>
          <div className="dpos-done-row"><span>Deposit Paid<small className="adv-split">{splitText(depSplit(adv))}</small></span><b className="adv-paid">{money(adv.deposit)}</b></div>
          <div className="adv-bal"><span>Balance Due</span><b>{money(adv.balance)}</b></div>
        </section>
        <div className="dpos-done-act">
          <button className="dpos-btn outline" onClick={print}><Ico size={15}><path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><rect x="7" y="14" width="10" height="7" rx="1" /></Ico>Print receipt</button>
          <a className="dpos-btn wa" href={waLink(adv.customerPhone, text)} target="_blank" rel="noopener noreferrer"><WaIcon />WhatsApp</a>
          <button className="dpos-btn" onClick={onClose}><Icon n="plus" size={14} />New sale</button>
        </div>
        <p className="adv-view"><button type="button" className="link-u" onClick={onView}>View in Advance Orders →</button></p>
      </div>
    </div>
  );
}

const ADV_STATUS = { pending: ['Pending', 'warn'], ready: ['Ready', 'ok'], completed: ['Billed', 'ok'], cancelled: ['Cancelled', 'bad'] };

function AdvanceDetail({ code, manager, onClose, onChanged, onBilled }) {
  const nav = useNavigate();
  const [a, setA] = useState(null); const [err, setErr] = useState(); const [pay, setPay] = useState(blankPay); const [busy, setBusy] = useState(false);
  const load = useCallback(() => api('/admin/pos/advances/' + encodeURIComponent(code)).then(x => { setA(x); setErr() }).catch(e => setErr(e.message)), [code]);
  useEffect(() => { load() }, [load]);
  const act = async fn => { setBusy(true); setErr(); try { await fn(); await load(); onChanged() } catch (e) { setErr(e.message) } finally { setBusy(false) } };
  const setStatus = s => act(() => api(`/admin/pos/advances/${encodeURIComponent(code)}/status`, { method: 'PATCH', body: { status: s } }));
  const bill = () => { const pp = payParts(pay, a.balance); if (pp.problem) return setErr(pp.problem); act(async () => { const out = await api(`/admin/pos/advances/${encodeURIComponent(code)}/finalize`, { method: 'POST', body: { balanceMode: pp.mode, balanceSplit: pp.split } }); onBilled(out.sale) }) };
  const open = a && (a.status === 'pending' || a.status === 'ready');
  const [lab, tone] = a ? ADV_STATUS[a.status] : [];
  return (
    <Modal title={a ? `Advance order ${a.code}` : 'Advance order'} sub={a ? `${a.customerName || 'Walk-in customer'}${a.customerPhone ? ' · ' + a.customerPhone : ''}` : ''} wide onClose={onClose}>
      <Err>{err}</Err>
      {!a ? <Empty>Loading…</Empty> : (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><span className={`dpos-pill ${tone}`}>{lab}</span>{a.deliveryDate && <span className="muted small">Delivery {longDate(a.deliveryDate)}</span>}{a.isGst && <span className="dpos-pill">GST</span>}{a.invoiceNo && <button className="link-u small" onClick={() => onBilled(null, a.invoiceNo)}>Billed as {a.invoiceNo}</button>}</div>
          <div className="dpos-tw"><table><thead><tr><th>Item</th><th className="r">Qty</th><th className="r">Price</th><th className="r">Amount</th></tr></thead>
            <tbody>{a.items.map((i, n) => <tr key={n}><td><b>{i.name}</b>{i.size ? <span className="muted small"> ({i.size}{i.color && i.color !== 'Default' ? `, ${i.color}` : ''})</span> : null}</td><td className="r">{i.qty}</td><td className="r">{inr(i.price)}</td><td className="r">{inr(i.price * i.qty)}</td></tr>)}</tbody></table></div>
          <div className="dpos-box dpos-sum">
            <div><span>Subtotal</span><span>{inr(a.subtotal)}</span></div>
            {a.discount > 0 && <div><span>Discount</span><span>− {inr(a.discount)}</span></div>}
            {a.isGst && <div><span>GST</span><span>{inr(a.tax)}</span></div>}
            {a.deliveryFee > 0 && <div><span>Delivery</span><span>{inr(a.deliveryFee)}</span></div>}
            <div><span>Bill total</span><b>{inr(a.total)}</b></div>
            <div><span>Advance received <small className="muted">({splitText(depSplit(a))})</small></span><b>{inr(a.deposit)}</b></div>
            <div className="tot"><span>Balance due</span><span>{inr(a.balance)}</span></div>
          </div>
          {a.notes && <p className="sub">Note: {a.notes}</p>}
          {open && <div className="dpos-box" style={{ display: 'grid', gap: 10 }}>
            <p className="muted small" style={{ fontWeight: 800, letterSpacing: '.1em', margin: 0 }}>BALANCE RECEIVED BY</p>
            <PayPicker value={pay} onChange={setPay} amount={a.balance} label="Balance paid by" />
            <button className="dpos-cta" disabled={busy} onClick={bill}>{busy ? 'Billing…' : `Collect ${inr(a.balance)} & generate bill`}</button></div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {open && <button className="dpos-btn ghost" disabled={busy} onClick={() => setStatus(a.status === 'pending' ? 'ready' : 'pending')}>{a.status === 'pending' ? 'Mark ready for collection' : 'Back to pending'}</button>}
            {open && manager && <button className="dpos-btn danger" disabled={busy} onClick={() => confirm(`Cancel ${a.code}? Remember to hand back the ${inr(a.deposit)} advance.`) && setStatus('cancelled')}>Cancel order</button>}
            {a.invoiceNo && <button className="dpos-btn" onClick={() => onBilled(null, a.invoiceNo)}>View invoice</button>}
          </div>
        </div>)}
    </Modal>
  );
}

export function AdvanceOrders({ manager, tick, onBilled, initialCode }) {
  const [st, setSt] = useState('all'); const [q, setQ] = useState(''); const [per, setPer] = usePeriod('all');
  const [rows, setRows] = useState(null); const [err, setErr] = useState(); const [sel, setSel] = useState(initialCode || null); const [n, setN] = useState(0);
  useEffect(() => { const t = setTimeout(() => api('/admin/pos/advances?q=' + encodeURIComponent(q)).then(r => { setRows(r); setErr() }).catch(e => setErr(e.message)), 200); return () => clearTimeout(t) }, [q, tick, n]);
  const today = todayStr();
  const shown = useMemo(() => (rows || []).filter(r => inPeriod(r.createdAt, per) && (st === 'all' || r.status === st)), [rows, per, st]);
  // The three money boxes follow the period filter (by booking date) but not the status chips.
  const inP = (rows || []).filter(r => inPeriod(r.createdAt, per));
  const openP = inP.filter(r => ['pending', 'ready'].includes(r.status)), liveP = inP.filter(r => r.status !== 'cancelled'), doneP = inP.filter(r => r.status === 'completed');
  const sum = (list, k) => list.reduce((s, r) => s + (r[k] || 0), 0);
  return (
    <>
      <div className="adv-kpis">
        <div className="adv-k"><div><span>BALANCE TO RECEIVE</span><b>{rows ? inr(sum(openP, 'balance')) : '…'}</b><small>{rows ? `${openP.length} open order${openP.length === 1 ? '' : 's'} · ${openP.filter(r => r.status === 'ready').length} ready to collect` : ''}</small></div><i className="rose"><Ico size={22}><path d="M7 5h10M7 9h10M9 5c4 0 6 2 6 4s-2 4-6 4H7l7 6" /></Ico></i></div>
        <div className="adv-k"><div><span>ADVANCE PAID</span><b>{rows ? inr(sum(liveP, 'deposit')) : '…'}</b><small>{rows ? `Advances received on ${liveP.length} order${liveP.length === 1 ? '' : 's'}` : ''}</small></div><i className="blue"><Ico size={22}><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></Ico></i></div>
        <div className="adv-k"><div><span>COMPLETED ORDERS</span><b>{rows ? inr(sum(doneP, 'total')) : '…'}</b><small>{rows ? `${doneP.length} order${doneP.length === 1 ? '' : 's'} collected and fully paid` : ''}</small></div><i className="green"><Ico size={22}><path d="m5 12.5 4.5 4.5L19 7.5" /></Ico></i></div>
      </div>
      <div className="adv-bar">
        <label className="adv-search"><Ico size={17}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></Ico><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by ID, customer, phone, product or status" aria-label="Search advance orders" /></label>
        <div className="adv-chips" role="group" aria-label="Status">{[['all', 'ALL'], ['pending', 'PENDING'], ['ready', 'READY'], ['completed', 'COMPLETED'], ['cancelled', 'CANCELLED']].map(([v, l]) => <button key={v} type="button" className={st === v ? 'on' : ''} aria-pressed={st === v} onClick={() => setSt(v)}>{l}</button>)}</div>
      </div>
      <div className="dpos-bar-tools"><PeriodFilter value={per} onChange={setPer} /></div>
      <Err>{err}</Err>
      <section className="dpos-card">
        {!rows ? <Empty>Loading…</Empty> : !shown.length ? <Empty>No advance orders here. Add items in Billing and press “Save as advance order”.</Empty> : (
          <div className="dpos-tw"><table><thead><tr><th>Order</th><th>Customer</th><th>Delivery date</th><th className="r">Items</th><th className="r">Total</th><th className="r">Advance</th><th className="r">Balance</th><th>Status</th></tr></thead>
            <tbody>{shown.map(r => { const late = r.deliveryDate && r.deliveryDate < today && ['pending', 'ready'].includes(r.status); const [lab, tone] = ADV_STATUS[r.status]; return (
              <tr key={r.code} className="click" tabIndex={0} onClick={() => setSel(r.code)} onKeyDown={e => e.key === 'Enter' && setSel(r.code)}>
                <td><b>{r.code}</b></td><td>{r.customerName || <span className="muted">Walk-in</span>}{r.customerPhone ? <div className="muted small">{r.customerPhone}</div> : null}</td>
                <td>{r.deliveryDate ? longDate(r.deliveryDate) : <span className="muted">—</span>} {late && <span className="dpos-pill bad">Late</span>}</td>
                <td className="r">{r.itemCount}</td><td className="r">{inr(r.total)}</td><td className="r">{inr(r.deposit)}</td><td className="r"><b>{inr(r.balance)}</b></td><td><span className={`dpos-pill ${tone}`}>{lab}</span></td></tr>) })}</tbody></table></div>)}
      </section>
      {sel && <AdvanceDetail code={sel} manager={manager} onClose={() => setSel(null)} onChanged={() => setN(x => x + 1)} onBilled={(sale, invoiceNo) => { setSel(null); setN(x => x + 1); onBilled(sale, invoiceNo) }} />}
    </>
  );
}

// ============================ "Bill generated" window after Complete sale ============================
export function BillDone({ sale, shop, onClose }) {
  const nav = useNavigate();
  const [ps, setPs] = useState(false);
  const received = sale.paymentMode === 'cash' ? (sale.cashTendered || sale.total) : sale.total;
  const link = invoiceUrl(sale.shareToken);
  useEffect(() => { const k = e => e.key === 'Escape' && !ps && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose, ps]);
  return (
    <div className="dpos-modal" role="dialog" aria-modal="true" aria-label="Bill generated" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="dpos-sheet dpos-done">
        <div className="dpos-done-head">
          <div><h2>Bill Generated <span className="dpos-tag solid">{sale.isGst ? 'GST' : 'NON-GST'}</span></h2><p className="oid">#{sale.invoiceNo}</p></div>
          <button className="dpos-btn" onClick={onClose}><Icon n="plus" size={14} />New sale</button>
        </div>
        <section className="dpos-done-card">
          <div className="dpos-done-top"><span>PAYMENT RECEIPT</span><span className="dpos-tag">{(MODE[sale.paymentMode] || '').toUpperCase()}</span></div>
          <div className="dpos-done-row"><span>Grand Total</span><b className="big">{money(sale.total)}</b></div>
          <div className="dpos-done-row"><span>Amount Received</span><b>{money(received)}</b></div>
          <div className="dpos-done-bal"><span>Balance Returned</span><b>{money(sale.change || 0)}</b></div>
        </section>
        <div className="dpos-done-act">
          <button className="dpos-btn outline" onClick={() => setPs(true)}><Ico size={15}><path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><rect x="7" y="14" width="10" height="7" rx="1" /></Ico>Print receipt</button>
          <button className="dpos-btn outline" onClick={() => nav('/invoice/' + sale.shareToken)}><EyeIcon />View</button>
          <a className="dpos-btn wa" href={waLink(sale.customerPhone, `Hello${sale.customerName ? ' ' + sale.customerName : ''}, here is your invoice ${sale.invoiceNo} from ${shop?.name || 'us'} for ${money(sale.total)}: ${link}`)} target="_blank" rel="noopener noreferrer"><WaIcon />WhatsApp invoice</a>
          <button className="dpos-btn" onClick={onClose}><Icon n="plus" size={14} />New sale</button>
        </div>
        <section className="dpos-done-card items">
          <p className="dpos-done-l">ITEMS SOLD</p>
          {sale.items.map((i, n) => <div key={n} className="dpos-done-item"><span><b>{i.name}</b> <small className="muted">× {i.quantity} piece{i.quantity > 1 ? 's' : ''}</small></span><span>{money(i.lineTotal)}</span></div>)}
        </section>
      </div>
      {ps && <PrintSettings onClose={() => setPs(false)} onPrint={({ type, paper }) => { setPs(false); window.open(`/invoice/${sale.shareToken}?fmt=${type === 'thermal' ? 'thermal' : 'a4'}&size=${paper}&print=1`, '_blank') }} />}
    </div>
  );
}

// ============================ analytics -> Coupons tab: Discount Summary + Promo Campaign Performance ============================
export function CouponPanel({ rep, openInvoice }) {
  const [q, setQ] = useState('');
  if (!rep) return <Empty>Loading…</Empty>;
  const t = q.trim().toLowerCase();
  const list = rep.discountedList.filter(r => !t || [r.invoiceNo, r.customerName, r.customerPhone, r.couponCode, (r.discount / 100).toString(), String(r.discount / 100)].some(v => String(v ?? '').toLowerCase().includes(t)));
  const avg = rep.discountedBills ? Math.round(rep.discounts / rep.discountedBills) : 0;
  return (
    <div className="dpos-cp">
      <section className="dpos-card"><h2>Discount Summary</h2>
        <div className="dpos-cp-stats">
          <div className="dpos-cp-s"><span>TOTAL DISCOUNTS GIVEN <i>%</i></span><b className="acc">{inr(rep.discounts)}</b></div>
          <div className="dpos-cp-s"><span>DISCOUNTED ORDERS</span><b>{rep.discountedBills}</b></div>
          <div className="dpos-cp-s"><span>AVG DISCOUNT PER ORDER</span><b>{inr(avg)}</b></div>
        </div>
      </section>
      <section className="dpos-card">
        <div className="dpos-head" style={{ marginBottom: 12 }}><h2 style={{ marginBottom: 0 }}>Promo Campaign Performance</h2>
          <label className="dpos-search"><Ico size={16}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></Ico><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search code/mobile/amount…" aria-label="Search discounted orders" /></label></div>
        {!list.length ? <p className="dpos-empty dark">No promotional discounts given in this period.</p> : (
          <div className="dpos-tw"><table><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Mobile</th><th>Coupon</th><th className="r">Discount</th><th className="r">Bill total</th></tr></thead>
            <tbody>{list.map(r => (
              <tr key={r.invoiceNo} className="click" tabIndex={0} onClick={() => openInvoice(r.invoiceNo, r)} onKeyDown={e => e.key === 'Enter' && openInvoice(r.invoiceNo, r)}>
                <td className="oid">{r.invoiceNo}</td><td>{longDate(r.billDate)}</td><td>{r.customerName || 'Guest'}</td><td>{r.customerPhone || '—'}</td>
                <td>{r.couponCode ? <span className="dpos-tag solid">{r.couponCode}</span> : <span className="dpos-tag">Manual</span>}</td><td className="r due">{inr(r.discount)}</td><td className="r">{inr(r.total)}</td></tr>))}</tbody></table></div>)}
      </section>
    </div>
  );
}
