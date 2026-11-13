import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../context/App';
import Modal from './Modal';
import { money } from '../lib/invoiceFormat';

const toPaise = s => { const n = Math.round(parseFloat(String(s ?? '').replace(/,/g, '')) * 100); return Number.isFinite(n) && n > 0 ? n : 0 };

// Return items window (Order History → Return on any bill, and the invoice page).
//  - how many of each line come back, and a tick per item: ticked items go back into stock, unticked ones do not
//    (manual items — services, custom items — never touch stock);
//  - how the refund is paid (cash, GPay / UPI, card or a split);
//  - the delivery charge is never refunded;
//  - an admin has to confirm the refund: an owner / admin ticks the box, any other staff member types the admin password.
export default function ReturnWindow({ invoiceNo, onClose, onDone }) {
  const { user } = useApp();
  const admin = ['owner', 'admin'].includes(user?.role);
  const [full, setFull] = useState(null); const [qty, setQty] = useState({}); const [back, setBack] = useState({}); const [reason, setReason] = useState('');
  const [mode, setMode] = useState('cash'); const [split, setSplit] = useState({ cash: '', upi: '', card: '' });
  const [ok, setOk] = useState(false); const [pwd, setPwd] = useState(''); const [err, setErr] = useState(); const [busy, setBusy] = useState(false);
  useEffect(() => { api('/admin/pos/sales/' + encodeURIComponent(invoiceNo)).then(setFull).catch(e => setErr(e.message)) }, [invoiceNo]);
  const left = i => i.quantity - (i.returnedQty || 0);
  const picked = Object.entries(qty).filter(([, n]) => n > 0);
  const refund = useMemo(() => (full?.items || []).reduce((s, i) => s + Math.round((i.lineTotal - i.discount + i.tax) * (qty[i.id] || 0) / i.quantity), 0), [full, qty]);
  const splitSum = toPaise(split.cash) + toPaise(split.upi) + toPaise(split.card);
  const stocked = i => i.stocked !== false && !!i.sku;
  const canGo = picked.length && (admin ? ok : pwd.length > 0) && (mode !== 'split' || splitSum === refund) && !busy;
  const go = async () => {
    setBusy(true); setErr();
    try {
      const r = await api(`/admin/pos/sales/${encodeURIComponent(invoiceNo)}/returns`, { method: 'POST', body: {
        items: picked.map(([itemId, n]) => { const it = full.items.find(x => x.id === +itemId); return { itemId: +itemId, qty: n, restock: stocked(it) && back[itemId] !== false } }),
        reason, refundMode: mode, ...(mode === 'split' ? { refundSplit: { cash: toPaise(split.cash), upi: toPaise(split.upi), card: toPaise(split.card) } } : {}),
        approval: admin ? { approved: ok } : { adminPassword: pwd } } });
      onDone(r);
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  };
  return (
    <Modal title="Return items" sub={`Against invoice ${invoiceNo}`} wide onClose={onClose}
      footer={<><button type="button" className="dpos-btn ghost" onClick={onClose}>Cancel</button><button type="button" className="dpos-btn" disabled={!canGo} onClick={go}>{busy ? 'Saving…' : 'Create return invoice'}</button></>}>
      {err && <p className="dpos-err" role="alert">{err}</p>}
      {!full ? <p className="muted">Loading…</p> : (
        <>
          <table className="inv-rt"><thead><tr><th>Item</th><th>Sold</th><th>Returned</th><th>Return now</th><th>Back to stock</th></tr></thead>
            <tbody>{full.items.map(i => (
              <tr key={i.id}><td>{i.name}</td><td>{i.quantity}</td><td>{i.returnedQty || 0}</td>
                <td>{left(i) > 0 ? <span className="inv-rq"><input type="number" min="0" max={left(i)} value={qty[i.id] ?? ''} placeholder="0" aria-label={`Quantity of ${i.name} to return`} onChange={e => setQty(q => ({ ...q, [i.id]: Math.max(0, Math.min(left(i), +e.target.value || 0)) }))} />
                  <button type="button" onClick={() => setQty(q => ({ ...q, [i.id]: left(i) }))}>All</button></span> : <span className="muted">—</span>}</td>
                <td>{stocked(i) ? <label className="rw-tick"><input type="checkbox" checked={back[i.id] !== false} disabled={!(qty[i.id] > 0)} onChange={e => setBack(b => ({ ...b, [i.id]: e.target.checked }))} aria-label={`Put ${i.name} back into stock`} /> <span>{back[i.id] !== false ? 'Yes' : 'No'}</span></label> : <span className="muted small">Manual item · no stock</span>}</td></tr>))}</tbody></table>
          <p className="rw-note">Ticked items go back into stock; unticked ones do not. Manual items never touch stock.</p>
          <label className="f" style={{ marginTop: 10 }}>Reason<input value={reason} maxLength={300} onChange={e => setReason(e.target.value)} placeholder="Wrong size, defect…" /></label>
          <p className="inv-l" style={{ margin: '14px 0 6px' }}>REFUND PAID BY</p>
          <div className="dpos-two" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>{[['cash', 'Cash'], ['upi', 'GPay / UPI'], ['card', 'Card'], ['split', 'Split']].map(([k, l]) => <button key={k} type="button" className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}</div>
          {mode === 'split' && <div className="dpos-grid rw-split">{[['cash', 'Cash ₹'], ['upi', 'GPay / UPI ₹'], ['card', 'Card ₹']].map(([k, l]) => <label className="f" key={k}>{l}<input inputMode="decimal" value={split[k]} onChange={e => setSplit({ ...split, [k]: e.target.value })} /></label>)}
            <p className={splitSum === refund ? 'rw-ok' : 'rw-bad'}>Split {money(splitSum)} of {money(refund)}</p></div>}
          <div className="rw-sum"><span>Refund total</span><b>{money(refund)}</b></div>
          <p className="rw-note">Delivery charge{full.deliveryFee > 0 ? ` (${money(full.deliveryFee)})` : ''} is never refunded.</p>
          <fieldset className="rw-admin"><legend>Admin approval</legend>
            {admin
              ? <label className="rw-tick"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} /> <span>I confirm this refund as admin ({user.name || user.email})</span></label>
              : <label className="f">Admin password<input type="password" autoComplete="off" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="An admin must approve this refund" /></label>}
            <small>The return records who approved it.</small></fieldset>
        </>)}
    </Modal>
  );
}
