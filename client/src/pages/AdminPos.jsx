import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import { useApp } from '../context/App';
import AdminShell, { Icon } from '../components/AdminShell';

// Dhanya POS: the in-store billing module of the admin. Everything the screen shows comes from the API; prices, stock,
// totals and invoice numbers are decided on the server (the totals here are only a live preview).

const toPaise = s => { const n = Math.round(parseFloat(String(s || '').replace(/,/g, '')) * 100); return Number.isFinite(n) && n > 0 ? n : 0 };
const rupees = p => (p / 100).toFixed(2).replace(/\.00$/, '');
const dt = iso => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const MODES = [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card'], ['split', 'Split']];
const MODE_LABEL = { cash: 'Cash', upi: 'UPI', card: 'Card', split: 'Split' };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);

const TABS = { billing: false, analytics: true, orders: false, inventory: true, coupons: true, birthdays: true, settings: true, 'ws-billing': false, 'ws-inventory': false, 'ws-analytics': true };

// ---- live preview of the bill (the server recomputes everything on checkout) ----
function preview(lines, { isGst, discountType, discountValue, deliveryFee }) {
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const discount = Math.min(subtotal, discountType === 'percent' ? Math.round(subtotal * Math.min(discountValue, 100) / 100) : discountValue);
  let tax = 0;
  if (isGst && subtotal) for (const l of lines) { const lt = l.price * l.qty; tax += Math.round((lt - Math.floor(discount * lt / subtotal)) * l.taxRate / 100) }
  return { subtotal, discount, tax, total: subtotal - discount + tax + deliveryFee };
}

const Err = ({ children }) => children ? <p className="dpos-err" role="alert">{children}</p> : null;
const Empty = ({ children }) => <p className="dpos-empty">{children}</p>;

// ============================ invoice ============================
function Invoice({ sale, shop, onClose, onChanged, manager }) {
  const [s, setS] = useState(sale); const [err, setErr] = useState(); const [busy, setBusy] = useState(false);
  const showGst = shop?.gstin && shop.showGst?.[s.channel];
  const print = () => {
    document.body.classList.add('dpos-printing');
    const done = () => { document.body.classList.remove('dpos-printing'); window.removeEventListener('afterprint', done) };
    window.addEventListener('afterprint', done); window.print();
  };
  useEffect(() => () => document.body.classList.remove('dpos-printing'), []);
  const voidIt = async () => {
    const reason = window.prompt('Reason for voiding this invoice? Stock will be returned.'); if (!reason) return;
    setBusy(true); setErr();
    try { setS(await api(`/admin/pos/sales/${s.invoiceNo}/void`, { method: 'POST', body: { reason } })); onChanged?.() } catch (e) { setErr(e.message) } finally { setBusy(false) }
  };
  return (
    <div className="dpos-modal" role="dialog" aria-modal="true" aria-label={`Invoice ${s.invoiceNo}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dpos-sheet">
        <div className="dpos-invoice">
          <h2>{shop?.name || 'DHANYA'}</h2>
          <p className="c">{(shop?.address || []).join(', ')}{shop?.phone ? ` · ${shop.phone}` : ''}{showGst ? ` · GSTIN ${shop.gstin}` : ''}</p>
          <p className="c"><b>{s.isGst ? 'TAX INVOICE' : 'INVOICE'}{s.channel === 'wholesale' ? ' · WHOLESALE' : ''}</b></p>
          {s.status === 'voided' && <p className="dpos-void-stamp">VOID{s.voidReason ? ` · ${s.voidReason}` : ''}</p>}
          <hr />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span><b>{s.invoiceNo}</b><br />{dt(s.createdAt)}</span>
            <span style={{ textAlign: 'right' }}>{s.customerName || 'Walk-in customer'}{s.customerPhone ? <><br />{s.customerPhone}</> : null}{s.cashier ? <><br /><span className="muted">Billed by {s.cashier}</span></> : null}</span>
          </div>
          <table><thead><tr><th>Item</th><th className="r">Qty</th><th className="r">Price</th><th className="r">Amount</th></tr></thead>
            <tbody>{s.items.map((i, n) => (
              <tr key={n}><td>{i.name}{i.variant?.size ? <span className="muted"> ({i.variant.size}{i.variant.color && i.variant.color !== 'Default' ? `, ${i.variant.color}` : ''})</span> : null}{i.sku ? <div className="muted small">{i.sku}</div> : null}</td>
                <td className="r">{i.quantity}</td><td className="r">{inr(i.unitPrice)}</td><td className="r">{inr(i.lineTotal)}</td></tr>))}</tbody></table>
          <hr />
          <div className="dpos-sum">
            <div><span>Subtotal</span><span>{inr(s.subtotal)}</span></div>
            {s.discount > 0 && <div><span>Discount{s.couponCode ? ` (${s.couponCode})` : s.discountType === 'percent' ? ` (${s.discountValue}%)` : ''}</span><span>− {inr(s.discount)}</span></div>}
            {s.isGst && <div><span>GST</span><span>{inr(s.tax)}</span></div>}
            {s.deliveryFee > 0 && <div><span>Delivery</span><span>{inr(s.deliveryFee)}</span></div>}
            <div className="tot"><span>Total</span><span>{inr(s.total)}</span></div>
          </div>
          <hr />
          <div className="dpos-sum">
            <div><span>Payment</span><span>{MODE_LABEL[s.paymentMode]}{s.paymentRef ? ` · ${s.paymentRef}` : ''}</span></div>
            {s.paymentMode === 'split' && <><div><span>Cash</span><span>{inr(s.payCash)}</span></div><div><span>UPI</span><span>{inr(s.payUpi)}</span></div><div><span>Card</span><span>{inr(s.payCard)}</span></div></>}
            {s.paymentMode === 'cash' && s.change > 0 && <><div><span>Cash received</span><span>{inr(s.cashTendered)}</span></div><div><span>Change</span><span>{inr(s.change)}</span></div></>}
          </div>
          {s.notes && <p className="muted small">Note: {s.notes}</p>}
          <p className="c">Thank you for shopping with us.</p>
        </div>
        <Err>{err}</Err>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          <button className="dpos-btn" onClick={print}>Print</button>
          {manager && s.status === 'completed' && <button className="dpos-btn danger" disabled={busy} onClick={voidIt}>Void invoice</button>}
          <button className="dpos-btn ghost" onClick={onClose} style={{ marginLeft: 'auto' }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ============================ billing ============================
const blankCustom = () => ({ key: uuid(), custom: true, name: '', priceStr: '', qty: 1, taxRate: 5 });

function Billing({ channel, shop, onSale, manager }) {
  const ws = channel === 'wholesale';
  const [q, setQ] = useState(''); const [results, setResults] = useState(null); const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState(ws ? [blankCustom()] : []);
  const [wsItems, setWsItems] = useState([]);
  const [cust, setCust] = useState({ name: '', phone: '', dob: '' });
  const [isGst, setIsGst] = useState(true);
  const [disc, setDisc] = useState({ type: 'fixed', value: '' });
  const [coupon, setCoupon] = useState(null); const [couponIn, setCouponIn] = useState(''); const [couponMsg, setCouponMsg] = useState();
  const [delivery, setDelivery] = useState('');
  const [mode, setMode] = useState('cash'); const [tendered, setTendered] = useState('');
  const [split, setSplit] = useState({ cash: '', upi: '', card: '' }); const [ref, setRef] = useState(''); const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  const key = useRef(null); const searchBox = useRef();

  useEffect(() => { if (ws) api('/admin/pos/ws/items').then(setWsItems).catch(() => {}) }, [ws]);
  useEffect(() => {
    if (ws) return;
    const t = setTimeout(() => { setSearching(true); api('/admin/pos/catalog?q=' + encodeURIComponent(q)).then(r => { setResults(r); setErr() }).catch(e => setErr(e.message)).finally(() => setSearching(false)) }, 200);
    return () => clearTimeout(t);
  }, [q, ws]);

  const priced = useMemo(() => lines.filter(l => l.custom ? l.name.trim() && toPaise(l.priceStr) > 0 : true).map(l => ({ ...l, price: l.custom ? toPaise(l.priceStr) : l.price })), [lines]);
  const discountType = coupon ? coupon.discountType : disc.type;
  const discountValue = coupon ? coupon.discountValue : disc.type === 'percent' ? Math.min(100, Math.round(parseFloat(disc.value) || 0)) : toPaise(disc.value);
  const deliveryFee = toPaise(delivery);
  const bill = useMemo(() => preview(priced, { isGst, discountType, discountValue, deliveryFee }), [priced, isGst, discountType, discountValue, deliveryFee]);
  const tenderedP = tendered === '' ? bill.total : toPaise(tendered);
  const splitSum = toPaise(split.cash) + toPaise(split.upi) + toPaise(split.card);

  const body = useMemo(() => ({
    channel,
    items: priced.map(l => l.custom ? { name: l.name.trim(), price: l.price, qty: l.qty, taxRate: l.taxRate } : { variantId: l.variantId, qty: l.qty }),
    customerName: cust.name.trim(), customerPhone: cust.phone.trim(), ...(cust.dob && !ws ? { customerDob: cust.dob } : {}),
    isGst, ...(coupon ? { couponCode: coupon.code } : { discountType: disc.type, discountValue }), deliveryFee,
    paymentMode: mode, ...(mode === 'cash' ? { cashTendered: tenderedP } : {}),
    ...(mode === 'split' ? { payments: { cash: toPaise(split.cash), upi: toPaise(split.upi), card: toPaise(split.card) } } : {}),
    ...(ref.trim() ? { paymentRef: ref.trim() } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [channel, priced, cust, ws, isGst, coupon, disc.type, discountValue, deliveryFee, mode, tenderedP, split, ref, notes]);
  // A new idempotency key is used whenever the bill changes; an unchanged retry (e.g. after a network drop) reuses it, so it can never double-bill.
  useEffect(() => { key.current = null }, [body]);

  const add = v => setLines(ls => {
    const i = ls.findIndex(l => l.variantId === v.variantId);
    if (i >= 0) return ls.map((l, n) => n === i ? { ...l, qty: Math.min(l.qty + 1, v.stock) } : l);
    return [...ls, { key: uuid(), variantId: v.variantId, name: v.name, detail: [v.size, v.color !== 'Default' ? v.color : null].filter(Boolean).join(' · '), sku: v.sku, price: v.price, qty: 1, stock: v.stock, taxRate: v.taxRate }];
  });
  const patch = (k, p) => setLines(ls => ls.map(l => l.key === k ? { ...l, ...p } : l));
  const setQty = (l, n) => { const max = l.stock ?? 99999; patch(l.key, { qty: Math.max(1, Math.min(max, Math.floor(n) || 1)) }) };
  const drop = k => setLines(ls => ls.filter(l => l.key !== k));
  const onSearchEnter = e => { // a barcode scanner / typed SKU followed by Enter adds the exact match straight away
    if (e.key !== 'Enter' || !results) return;
    const exact = results.find(r => r.sku.toLowerCase() === q.trim().toLowerCase()) || (results.length === 1 ? results[0] : null);
    if (exact && exact.stock > 0) { add(exact); setQ('') }
  };
  const applyCoupon = async () => {
    setCouponMsg();
    try { const c = await api(`/admin/pos/coupons/check?code=${encodeURIComponent(couponIn.trim())}&subtotal=${bill.subtotal}`); setCoupon(c); setCouponMsg({ ok: true, t: `Coupon ${c.code} applied` }) }
    catch (e) { setCoupon(null); setCouponMsg({ ok: false, t: e.message }) }
  };

  const problem = !priced.length ? 'Add at least one item.' : mode === 'split' && splitSum !== bill.total ? `Split payments add up to ${inr(splitSum)}; the bill is ${inr(bill.total)}.`
    : mode === 'cash' && tenderedP < bill.total ? 'Cash received is less than the total.' : (!ws && lines.some(l => l.custom && (l.name.trim() || l.priceStr) && !(l.name.trim() && toPaise(l.priceStr) > 0))) ? 'Finish or remove the incomplete custom item.' : null;

  const submit = async () => {
    if (problem || busy) return;
    setBusy(true); setErr();
    try {
      const sale = await api('/admin/pos/sales', { method: 'POST', body: { ...body, idempotencyKey: (key.current ??= uuid()) } });
      onSale(sale);
      setLines(ws ? [blankCustom()] : []); setCust({ name: '', phone: '', dob: '' }); setDisc({ type: 'fixed', value: '' }); setCoupon(null); setCouponIn(''); setCouponMsg();
      setDelivery(''); setTendered(''); setSplit({ cash: '', upi: '', card: '' }); setRef(''); setNotes(''); key.current = null;
      if (!ws) { setQ(''); api('/admin/pos/catalog').then(setResults).catch(() => {}) }
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  };

  const lineEls = lines.map(l => (
    <div className="dpos-line" key={l.key}>
      {l.custom ? (
        <div className="dpos-grid" style={{ gridTemplateColumns: 'minmax(150px,2fr) minmax(90px,1fr) 80px' }}>
          <input aria-label="Item name or description" placeholder="Item name / description…" list={ws ? 'dpos-ws-list' : undefined} value={l.name} onChange={e => patch(l.key, { name: e.target.value })} />
          <input aria-label="Price in rupees" inputMode="decimal" placeholder="Price ₹" value={l.priceStr} onChange={e => patch(l.key, { priceStr: e.target.value })} />
          <select aria-label="GST rate" value={l.taxRate} onChange={e => patch(l.key, { taxRate: +e.target.value })}>{[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}% GST</option>)}</select>
        </div>
      ) : (
        <div><b>{l.name}</b><div className="muted small">{l.detail}{l.sku ? ` · ${l.sku}` : ''} · {inr(l.price)} each · {l.stock} in stock</div></div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifySelf: 'end' }}>
        <div className="dpos-qty"><button aria-label="Decrease quantity" onClick={() => setQty(l, l.qty - 1)}>−</button>
          <input aria-label="Quantity" inputMode="numeric" value={l.qty} onChange={e => setQty(l, +e.target.value)} /><button aria-label="Increase quantity" onClick={() => setQty(l, l.qty + 1)}>+</button></div>
        <button className="dpos-btn ghost sm" aria-label="Remove item" onClick={() => ws && lines.length === 1 ? setLines([blankCustom()]) : drop(l.key)}>✕</button>
      </div>
    </div>));

  return (
    <div className="dpos-bill">
      <div className="dpos-col">
        <section className="dpos-card"><h2><Icon n="orders" />Customer details</h2>
          <div className="dpos-grid">
            <label className="f">Customer name<input value={cust.name} onChange={e => setCust({ ...cust, name: e.target.value })} placeholder="Enter name" autoComplete="off" /></label>
            <label className="f">Mobile<input value={cust.phone} inputMode="tel" onChange={e => setCust({ ...cust, phone: e.target.value })} placeholder="Enter mobile number" autoComplete="off" /></label>
            {!ws && <label className="f">Date of birth (for birthday offers)<input type="date" max={todayStr()} value={cust.dob} onChange={e => setCust({ ...cust, dob: e.target.value })} /></label>}
          </div>
        </section>

        {!ws && (
          <section className="dpos-card"><h2><Icon n="box" />Find a product</h2>
            <input ref={searchBox} autoFocus type="search" value={q} onChange={e => setQ(e.target.value)} onKeyDown={onSearchEnter} placeholder="Search name, SKU, size, colour or category — or scan a barcode" aria-label="Search products" />
            <div className="dpos-results" aria-live="polite">
              {results === null || (searching && !results.length) ? <Empty>Loading…</Empty> : !results.length ? <Empty>No products match “{q}”.</Empty> : results.map(v => (
                <button key={v.variantId} className="dpos-res" disabled={v.stock < 1} onClick={() => add(v)}>
                  {v.image ? <img src={v.image} alt="" loading="lazy" /> : <img alt="" />}
                  <span><b>{v.name}</b><em>{[v.size, v.color !== 'Default' ? v.color : null].filter(Boolean).join(' · ')} · {v.sku}{v.category ? ` · ${v.category}` : ''}</em></span>
                  <span style={{ textAlign: 'right', flex: 'none' }}><b>{inr(v.price)}</b><em className={v.stock < 1 ? 'bad' : ''}>{v.stock < 1 ? 'Out of stock' : `${v.stock} in stock`}</em></span>
                </button>))}
            </div>
          </section>)}

        <section className="dpos-card"><h2><Icon n="orders" />Order items</h2>
          {ws && <datalist id="dpos-ws-list">{wsItems.map(i => <option key={i.id} value={[i.code, i.company, i.colour].filter(Boolean).join(' · ')} />)}</datalist>}
          {lines.length ? lineEls : <Empty>No items yet. Search above to add products.</Empty>}
          <button className="dpos-btn ghost sm" style={{ marginTop: 10 }} onClick={() => setLines(ls => [...ls, blankCustom()])}>+ {ws ? 'Add item' : 'Custom item (alteration, service…)'}</button>
        </section>
      </div>

      <div className="dpos-col dpos-sticky">
        <section className="dpos-card"><h2>Bill summary</h2>
          <div className="dpos-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
            <label className="f">Discount<select value={disc.type} disabled={!!coupon} onChange={e => setDisc({ ...disc, type: e.target.value })}><option value="fixed">₹ off</option><option value="percent">% off</option></select></label>
            <label className="f">&nbsp;<input inputMode="decimal" disabled={!!coupon} value={disc.value} onChange={e => setDisc({ ...disc, value: e.target.value })} placeholder="0" aria-label="Discount value" /></label>
          </div>
          {!ws && <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}><input value={couponIn} onChange={e => setCouponIn(e.target.value.toUpperCase())} placeholder="Coupon code" aria-label="Coupon code" disabled={!!coupon} />
              {coupon ? <button className="dpos-btn ghost sm" onClick={() => { setCoupon(null); setCouponMsg(); setCouponIn('') }}>Remove</button> : <button className="dpos-btn sm" disabled={!couponIn.trim()} onClick={applyCoupon}>Apply</button>}</div>
            {couponMsg && <p className={couponMsg.ok ? 'dpos-ok' : 'dpos-err'} style={{ marginTop: 8 }}>{couponMsg.t}</p>}
          </div>}
          <div className="dpos-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
            <label className="f">Delivery / packing ₹<input inputMode="decimal" value={delivery} onChange={e => setDelivery(e.target.value)} placeholder="0" /></label>
            <label className="f">Quick pick<select value="" onChange={e => e.target.value !== '' && setDelivery(rupees(+e.target.value))}><option value="">Choose…</option>{(shop?.deliveryPresets || []).map((p, i) => <option key={i} value={p.fee}>{p.name} · {inr(p.fee)}</option>)}</select></label>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0 14px', fontSize: 14 }}><input type="checkbox" checked={isGst} onChange={e => setIsGst(e.target.checked)} /> Charge GST on this bill</label>
          <div className="dpos-sum">
            <div><span>Subtotal</span><span>{inr(bill.subtotal)}</span></div>
            {bill.discount > 0 && <div><span>Discount</span><span>− {inr(bill.discount)}</span></div>}
            {isGst && <div><span>GST</span><span>{inr(bill.tax)}</span></div>}
            {deliveryFee > 0 && <div><span>Delivery</span><span>{inr(deliveryFee)}</span></div>}
            <div className="tot"><span>Total</span><span>{inr(bill.total)}</span></div>
          </div>
        </section>

        <section className="dpos-card"><h2>Payment</h2>
          <div className="dpos-seg" role="radiogroup" aria-label="Payment method" style={{ marginBottom: 12 }}>{MODES.map(([v, l]) => <button key={v} role="radio" aria-checked={mode === v} className={mode === v ? 'on' : ''} onClick={() => setMode(v)}>{l}</button>)}</div>
          {mode === 'cash' && <>
            <label className="f">Cash received ₹<input inputMode="decimal" value={tendered} onChange={e => setTendered(e.target.value)} placeholder={rupees(bill.total)} /></label>
            <p className="sub" style={{ marginTop: 8 }}>{tenderedP >= bill.total ? `Change to return: ${inr(tenderedP - bill.total)}` : `Short by ${inr(bill.total - tenderedP)}`}</p></>}
          {mode === 'split' && <>
            <div className="dpos-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>{['cash', 'upi', 'card'].map(m => <label className="f" key={m}>{MODE_LABEL[m]} ₹<input inputMode="decimal" value={split[m]} onChange={e => setSplit({ ...split, [m]: e.target.value })} placeholder="0" /></label>)}</div>
            <p className="sub" style={{ marginTop: 8 }}>{splitSum === bill.total ? 'Split matches the total ✓' : `${splitSum > bill.total ? 'Over' : 'Short'} by ${inr(Math.abs(bill.total - splitSum))}`}</p></>}
          {(mode === 'upi' || mode === 'card' || mode === 'split') && <label className="f" style={{ marginTop: 12 }}>{mode === 'card' ? 'Card slip / approval no.' : 'UPI transaction ID'} (optional)<input value={ref} onChange={e => setRef(e.target.value)} maxLength={80} /></label>}
          <p className="sub" style={{ marginTop: 10 }}>UPI and card are confirmed by the cashier at the counter; there is no payment gateway attached to Dhanya POS.</p>
          <label className="f" style={{ marginTop: 12 }}>Note (optional)<input value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} /></label>
        </section>

        <Err>{err}</Err>
        {problem && priced.length > 0 && <p className="sub" role="status">{problem}</p>}
        <button className="dpos-btn big" disabled={!!problem || busy} onClick={submit}>{busy ? 'Saving…' : `Complete sale · ${inr(bill.total)}`}</button>
      </div>
    </div>
  );
}

// ============================ bills list / analytics ============================
function BillsTable({ rows, onOpen, empty = 'No bills found.' }) {
  if (!rows) return <Empty>Loading…</Empty>;
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="dpos-tw"><table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Payment</th><th className="r">Items</th><th className="r">Total</th></tr></thead>
      <tbody>{rows.map(r => (
        <tr key={r.invoiceNo} className={`click ${r.status === 'voided' ? 'voided' : ''}`} tabIndex={0} onClick={() => onOpen(r.invoiceNo)} onKeyDown={e => e.key === 'Enter' && onOpen(r.invoiceNo)}>
          <td><b>{r.invoiceNo}</b>{r.status === 'voided' && <> <span className="dpos-pill bad">Void</span></>}</td><td>{dt(r.createdAt)}</td>
          <td>{r.customerName || <span className="muted">Walk-in</span>}{r.customerPhone ? <div className="muted small">{r.customerPhone}</div> : null}</td>
          <td>{MODE_LABEL[r.paymentMode]}</td><td className="r">{r.itemCount}</td><td className="r"><b>{inr(r.total)}</b></td></tr>))}</tbody></table></div>
  );
}

function Orders({ channel, openInvoice, tick, manager }) {
  const [q, setQ] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [rows, setRows] = useState(null); const [err, setErr] = useState();
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams({ q, channel }); if (from) p.set('from', from); if (to) p.set('to', to);
      api('/admin/pos/sales?' + p).then(r => { setRows(r); setErr() }).catch(e => setErr(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [q, from, to, channel, tick]);
  return (
    <section className="dpos-card">
      <div className="dpos-grid" style={{ marginBottom: 12 }}>
        <label className="f">Search<input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Invoice no., name or mobile" /></label>
        {manager && <><label className="f">From<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label className="f">To<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label></>}
      </div>
      {!manager && <p className="sub" style={{ marginBottom: 8 }}>Cashiers see today’s bills. Owners and admins can search the full history.</p>}
      <Err>{err}</Err><BillsTable rows={rows} onOpen={openInvoice} />
    </section>
  );
}

const PERIODS = [['all', 'All time'], ['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year'], ['custom', 'Custom']];
function rangeFor(p, custom) {
  const t = todayStr(), d = new Date(t + 'T00:00:00Z'), iso = x => x.toISOString().slice(0, 10);
  if (p === 'today') return [t, t];
  if (p === 'week') { const m = new Date(d); m.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return [iso(m), t] }
  if (p === 'month') return [t.slice(0, 8) + '01', t];
  if (p === 'year') return [t.slice(0, 4) + '-01-01', t];
  if (p === 'custom') return [custom.from || t, custom.to || t];
  return ['2000-01-01', t];
}

function Analytics({ channel, openInvoice, tick }) {
  const ws = channel === 'wholesale';
  const [period, setPeriod] = useState(ws ? 'all' : 'today'); const [custom, setCustom] = useState({ from: '', to: '' });
  const [rep, setRep] = useState(null); const [bills, setBills] = useState(null); const [err, setErr] = useState();
  const [from, to] = rangeFor(period, custom);
  useEffect(() => {
    setRep(null); setBills(null); setErr();
    api(`/admin/pos/reports?from=${from}&to=${to}&channel=${channel}`).then(setRep).catch(e => setErr(e.message));
    api(`/admin/pos/sales?from=${from}&to=${to}&channel=${channel}`).then(setBills).catch(() => {});
  }, [from, to, channel, tick]);
  const max = Math.max(1, ...(rep?.daily || []).map(d => d.revenue));
  const k = (label, v) => <div className="dpos-kpi"><span>{label}</span><b>{rep ? v : '…'}</b></div>;
  return (
    <>
      <div className="dpos-seg" role="radiogroup" aria-label="Period">{PERIODS.map(([v, l]) => <button key={v} role="radio" aria-checked={period === v} className={period === v ? 'on' : ''} onClick={() => setPeriod(v)}>{l}</button>)}</div>
      {period === 'custom' && <div className="dpos-grid" style={{ maxWidth: 440 }}><label className="f">From<input type="date" value={custom.from} onChange={e => setCustom({ ...custom, from: e.target.value })} /></label><label className="f">To<input type="date" value={custom.to} onChange={e => setCustom({ ...custom, to: e.target.value })} /></label></div>}
      <Err>{err}</Err>
      <div className="dpos-kpis">
        {k('Total revenue', inr(rep?.revenue ?? 0))}{k('Bills', rep?.bills ?? 0)}{k('Units sold', rep?.units ?? 0)}{k('Customers', rep?.customers ?? 0)}
        {k('Average bill', inr(rep?.average ?? 0))}{k('GST collected', inr(rep?.tax ?? 0))}{k('Discounts given', inr(rep?.discounts ?? 0))}{k('Voided bills', rep?.voided ?? 0)}
      </div>
      <section className="dpos-card"><h2>Payments</h2>
        {rep ? <div className="dpos-kpis">{[['Cash', rep.cash], ['UPI', rep.upi], ['Card', rep.card]].map(([l, v]) => <div key={l}><span className="muted small">{l}</span><br /><b style={{ fontSize: 20 }}>{inr(v)}</b></div>)}</div> : <Empty>Loading…</Empty>}</section>
      {rep?.daily?.length > 0 && <section className="dpos-card"><h2>Daily sales</h2>
        <div className="dpos-bars" role="img" aria-label="Revenue per day">{rep.daily.map(d => <div className="dpos-bar" key={d.day} title={`${d.day}: ${inr(d.revenue)} · ${d.bills} bills`}><i style={{ height: `${Math.max(3, d.revenue / max * 100)}%` }} /><span>{d.day.slice(8)}</span></div>)}</div></section>}
      {rep?.products?.length > 0 && <section className="dpos-card"><h2>Top items</h2>
        <div className="dpos-tw"><table><thead><tr><th>Item</th><th className="r">Units</th><th className="r">Revenue</th></tr></thead><tbody>{rep.products.map(p => <tr key={p.name}><td>{p.name}</td><td className="r">{p.qty}</td><td className="r">{inr(p.revenue)}</td></tr>)}</tbody></table></div></section>}
      <section className="dpos-card"><h2>{ws ? 'Wholesale bills' : 'Bills'}</h2><BillsTable rows={bills} onOpen={openInvoice} empty="No bills in this period yet." /></section>
    </>
  );
}

// ============================ inventory (shared with the online store) ============================
function Inventory() {
  const { toast } = useApp();
  const [q, setQ] = useState(''); const [low, setLow] = useState(false); const [rows, setRows] = useState(null); const [err, setErr] = useState();
  const [adj, setAdj] = useState({}); const [busy, setBusy] = useState(null);
  useEffect(() => { const t = setTimeout(() => api(`/admin/pos/catalog?limit=300&q=${encodeURIComponent(q)}`).then(r => { setRows(r); setErr() }).catch(e => setErr(e.message)), 200); return () => clearTimeout(t) }, [q]);
  const shown = (rows || []).filter(r => !low || r.stock <= 3);
  const apply = async (v, sign) => {
    const n = parseInt(adj[v.variantId], 10); if (!n || n < 1) return;
    setBusy(v.variantId);
    try {
      const out = await api(`/admin/variants/${v.variantId}/stock`, { method: 'PATCH', body: { delta: sign * n, reason: sign > 0 ? 'pos_restock' : 'pos_adjustment' } });
      setRows(rs => rs.map(r => r.variantId === v.variantId ? { ...r, stock: out.stock } : r)); setAdj(a => ({ ...a, [v.variantId]: '' })); toast(`Stock updated: ${out.stock} left`);
    } catch (e) { setErr(e.message) } finally { setBusy(null) }
  };
  return (
    <section className="dpos-card">
      <p className="sub" style={{ marginBottom: 12 }}>The same stock the online store sells from. Products, prices and photos are managed in Products &amp; images.</p>
      <div className="dpos-grid" style={{ marginBottom: 12, alignItems: 'end' }}>
        <label className="f">Search<input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Name, SKU, size, colour…" /></label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={low} onChange={e => setLow(e.target.checked)} /> Low stock only (3 or fewer)</label>
      </div>
      <Err>{err}</Err>
      {!rows ? <Empty>Loading…</Empty> : !shown.length ? <Empty>No items found.</Empty> : (
        <div className="dpos-tw"><table><thead><tr><th>Product</th><th>SKU</th><th>Variant</th><th className="r">Price</th><th className="r">Stock</th><th>Adjust</th></tr></thead>
          <tbody>{shown.map(v => (
            <tr key={v.variantId}><td><b>{v.name}</b></td><td>{v.sku}</td><td>{[v.size, v.color !== 'Default' ? v.color : null].filter(Boolean).join(' · ')}</td><td className="r">{inr(v.price)}</td>
              <td className="r"><b>{v.stock}</b> {v.stock < 1 ? <span className="dpos-pill bad">Out</span> : v.stock <= 3 ? <span className="dpos-pill warn">Low</span> : null}</td>
              <td><div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 190 }}>
                <input aria-label={`Quantity to adjust for ${v.sku}`} inputMode="numeric" style={{ width: 70 }} value={adj[v.variantId] || ''} onChange={e => setAdj({ ...adj, [v.variantId]: e.target.value.replace(/\D/g, '') })} placeholder="Qty" />
                <button className="dpos-btn sm" disabled={busy === v.variantId} onClick={() => apply(v, 1)}>+ Add</button><button className="dpos-btn ghost sm" disabled={busy === v.variantId} onClick={() => apply(v, -1)}>− Remove</button></div></td></tr>))}</tbody></table></div>)}
    </section>
  );
}

// ============================ coupons ============================
function Coupons() {
  const [list, setList] = useState(null); const [err, setErr] = useState();
  const [f, setF] = useState({ code: '', type: 'percent', value: '', min: '', expires: '', limit: '' });
  const load = useCallback(() => api('/admin/pos/coupons').then(setList).catch(e => setErr(e.message)), []);
  useEffect(() => { load() }, [load]);
  const create = async e => {
    e.preventDefault(); setErr();
    try {
      await api('/admin/pos/coupons', { method: 'POST', body: { code: f.code.trim(), discountType: f.type, discountValue: f.type === 'percent' ? Math.round(+f.value) : toPaise(f.value),
        minOrder: toPaise(f.min), expiresOn: f.expires || null, usageLimit: f.limit ? Math.round(+f.limit) : null } });
      setF({ code: '', type: 'percent', value: '', min: '', expires: '', limit: '' }); load();
    } catch (x) { setErr(x.issues?.[0]?.message || x.message) }
  };
  const toggle = async c => { try { await api(`/admin/pos/coupons/${c.id}`, { method: 'PATCH', body: { active: !c.active } }); load() } catch (x) { setErr(x.message) } };
  const del = async c => { if (!confirm(`Delete coupon ${c.code}?`)) return; try { await api(`/admin/pos/coupons/${c.id}`, { method: 'DELETE' }); load() } catch (x) { setErr(x.message) } };
  return (
    <>
      <form className="dpos-card" onSubmit={create}><h2>New coupon</h2>
        <div className="dpos-grid">
          <label className="f">Code<input required value={f.code} onChange={e => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="e.g. BIRTHDAY10" maxLength={40} /></label>
          <label className="f">Type<select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}><option value="percent">Percent off</option><option value="fixed">Fixed ₹ off</option></select></label>
          <label className="f">{f.type === 'percent' ? 'Percent' : 'Amount ₹'}<input required inputMode="decimal" value={f.value} onChange={e => setF({ ...f, value: e.target.value })} /></label>
          <label className="f">Minimum bill ₹<input inputMode="decimal" value={f.min} onChange={e => setF({ ...f, min: e.target.value })} placeholder="0" /></label>
          <label className="f">Expires on<input type="date" value={f.expires} onChange={e => setF({ ...f, expires: e.target.value })} /></label>
          <label className="f">Usage limit<input inputMode="numeric" value={f.limit} onChange={e => setF({ ...f, limit: e.target.value })} placeholder="Unlimited" /></label>
        </div>
        <div style={{ marginTop: 14 }}><button className="dpos-btn" type="submit">Create coupon</button></div>
      </form>
      <Err>{err}</Err>
      <section className="dpos-card"><h2>Coupons</h2>
        {!list ? <Empty>Loading…</Empty> : !list.length ? <Empty>No coupons yet.</Empty> : (
          <div className="dpos-tw"><table><thead><tr><th>Code</th><th>Discount</th><th className="r">Min bill</th><th>Expires</th><th className="r">Used</th><th>Status</th><th /></tr></thead>
            <tbody>{list.map(c => (
              <tr key={c.id}><td><b>{c.code}</b></td><td>{c.discountType === 'percent' ? `${c.discountValue}%` : inr(c.discountValue)}</td><td className="r">{c.minOrder ? inr(c.minOrder) : '—'}</td><td>{c.expiresOn || '—'}</td>
                <td className="r">{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td><td><span className={`dpos-pill ${c.active ? 'ok' : ''}`}>{c.active ? 'Active' : 'Off'}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}><button className="dpos-btn ghost sm" onClick={() => toggle(c)}>{c.active ? 'Turn off' : 'Turn on'}</button> <button className="dpos-btn danger sm" onClick={() => del(c)}>Delete</button></td></tr>))}</tbody></table></div>)}
      </section>
    </>
  );
}

// ============================ birthdays ============================
function Birthdays({ shop }) {
  const [days, setDays] = useState(30); const [rows, setRows] = useState(null); const [err, setErr] = useState();
  useEffect(() => { setRows(null); api('/admin/pos/birthdays?days=' + days).then(setRows).catch(e => setErr(e.message)) }, [days]);
  const wa = b => { const d = b.phone.replace(/\D/g, ''); return `https://wa.me/${d.length === 10 ? '91' + d : d}?text=${encodeURIComponent(`Happy birthday ${b.name || ''}! A little gift from ${shop?.name || 'DHANYA'} awaits you in store.`)}` };
  return (
    <section className="dpos-card">
      <p className="sub" style={{ marginBottom: 12 }}>Customers whose date of birth was captured at billing. Pair this with a birthday coupon from the Coupons tab.</p>
      <div className="dpos-seg" style={{ marginBottom: 12 }}>{[7, 30, 90, 366].map(n => <button key={n} className={days === n ? 'on' : ''} onClick={() => setDays(n)}>{n === 366 ? 'This year' : `Next ${n} days`}</button>)}</div>
      <Err>{err}</Err>
      {!rows ? <Empty>Loading…</Empty> : !rows.length ? <Empty>No upcoming birthdays. Add a date of birth while billing to see customers here.</Empty> : (
        <div className="dpos-tw"><table><thead><tr><th>Customer</th><th>Mobile</th><th>Date of birth</th><th>Next birthday</th><th /></tr></thead>
          <tbody>{rows.map(b => <tr key={b.phone}><td><b>{b.name || '—'}</b></td><td>{b.phone}</td><td>{b.dob}</td><td>{b.nextBirthday} <span className={`dpos-pill ${b.daysAway === 0 ? 'ok' : ''}`}>{b.daysAway === 0 ? 'Today' : `in ${b.daysAway}d`}</span></td>
            <td><a className="dpos-btn ghost sm" href={wa(b)} target="_blank" rel="noopener noreferrer">Message</a></td></tr>)}</tbody></table></div>)}
    </section>
  );
}

// ============================ delivery & GST settings ============================
function Settings({ onSaved }) {
  const [s, setS] = useState(null); const [err, setErr] = useState(); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { api('/admin/pos/settings').then(setS).catch(e => setErr(e.message)) }, []);
  if (!s) return err ? <Err>{err}</Err> : <Empty>Loading…</Empty>;
  const preset = (i, p) => setS({ ...s, deliveryPresets: s.deliveryPresets.map((x, n) => n === i ? { ...x, ...p } : x) });
  const save = async e => {
    e.preventDefault(); setBusy(true); setErr(); setOk(false);
    try { const out = await api('/admin/pos/settings', { method: 'PUT', body: { ...s, gstin: s.gstin.trim().toUpperCase(), deliveryPresets: s.deliveryPresets.filter(p => p.name.trim()).map(p => ({ name: p.name.trim(), fee: p.fee })) } }); setS(out); setOk(true); onSaved() }
    catch (x) { setErr(x.issues?.[0]?.message || x.message) } finally { setBusy(false) }
  };
  return (
    <form onSubmit={save} style={{ display: 'grid', gap: 18 }}>
      <section className="dpos-card"><h2><Icon n="doc" />GST &amp; invoice number</h2>
        <p className="sub" style={{ marginBottom: 12 }}>Print your GST number on invoices. Turn it on per bill type. Amounts are unchanged.</p>
        <label className="f">Business GST number (GSTIN)<input value={s.gstin} onChange={e => setS({ ...s, gstin: e.target.value })} maxLength={15} placeholder="15 characters, leave blank until you have one" style={{ fontFamily: 'monospace' }} /></label>
        <div className="dpos-grid" style={{ marginTop: 12 }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}><input type="checkbox" checked={s.showGstRetail} onChange={e => setS({ ...s, showGstRetail: e.target.checked })} /><span><b>Show on retail invoices</b><br /><span className="muted small">POS bills</span></span></label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}><input type="checkbox" checked={s.showGstWholesale} onChange={e => setS({ ...s, showGstWholesale: e.target.checked })} /><span><b>Show on wholesale invoices</b><br /><span className="muted small">Wholesale billing bills</span></span></label>
        </div>
        <p className="sub" style={{ marginTop: 12 }}>Invoice numbers run automatically: DP-YEAR-000001 for retail and DW-YEAR-000001 for wholesale.</p>
      </section>
      <section className="dpos-card"><h2><Icon n="truck" />Delivery &amp; packing quick picks</h2>
        {s.deliveryPresets.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input aria-label="Name" value={p.name} onChange={e => preset(i, { name: e.target.value })} placeholder="e.g. Within Kumbakonam" />
            <input aria-label="Fee in rupees" style={{ maxWidth: 140 }} inputMode="decimal" defaultValue={rupees(p.fee)} onBlur={e => preset(i, { fee: toPaise(e.target.value) })} placeholder="₹ fee" />
            <button type="button" className="dpos-btn ghost sm" aria-label="Remove" onClick={() => setS({ ...s, deliveryPresets: s.deliveryPresets.filter((_, n) => n !== i) })}>✕</button></div>))}
        <button type="button" className="dpos-btn ghost sm" onClick={() => setS({ ...s, deliveryPresets: [...s.deliveryPresets, { name: '', fee: 0 }] })}>+ Add delivery option</button>
        <p className="sub" style={{ marginTop: 10 }}>These appear as a quick pick on the billing screen. Online-store shipping is managed separately.</p>
      </section>
      <Err>{err}</Err>{ok && <p className="dpos-ok" role="status">Saved.</p>}
      <div><button className="dpos-btn" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save settings'}</button></div>
    </form>
  );
}

// ============================ wholesale inventory ============================
function WsRow({ it, manager, onSaved, onDelete, setErr }) {
  const [v, setV] = useState(it); const saved = useRef(it);
  const commit = async () => {
    if (!manager || (v.code === saved.current.code && v.company === saved.current.company && v.colour === saved.current.colour)) return;
    if (!v.code.trim()) { setV(saved.current); return }
    try { const out = await api(`/admin/pos/ws/items/${it.id}`, { method: 'PATCH', body: { code: v.code, company: v.company, colour: v.colour } }); saved.current = out; setV(out); setErr(); onSaved(out) }
    catch (e) { setErr(e.message); setV(saved.current) }
  };
  const f = k => ({ value: v[k], readOnly: !manager, onChange: e => setV({ ...v, [k]: e.target.value }), onBlur: commit });
  return <tr><td><input aria-label="Code" {...f('code')} /></td><td><input aria-label="Company" {...f('company')} /></td><td><input aria-label="Colour" {...f('colour')} /></td>
    <td className="r">{manager && <button className="dpos-btn danger sm" onClick={() => onDelete(it)}>Delete</button>}</td></tr>;
}
function WsInventory({ manager }) {
  const [q, setQ] = useState(''); const [rows, setRows] = useState(null); const [err, setErr] = useState(); const [nw, setNw] = useState({ code: '', company: '', colour: '' });
  const load = useCallback(() => api('/admin/pos/ws/items?q=' + encodeURIComponent(q)).then(r => { setRows(r); setErr() }).catch(e => setErr(e.message)), [q]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t) }, [load]);
  const add = async e => { e.preventDefault(); try { await api('/admin/pos/ws/items', { method: 'POST', body: nw }); setNw({ code: '', company: '', colour: '' }); load() } catch (x) { setErr(x.issues?.[0]?.message || x.message) } };
  const del = async it => { if (!confirm(`Delete ${it.code}?`)) return; try { await api(`/admin/pos/ws/items/${it.id}`, { method: 'DELETE' }); load() } catch (x) { setErr(x.message) } };
  return (
    <section className="dpos-card">
      <div className="dpos-head" style={{ marginBottom: 12 }}><p className="sub">Simple items — code, company / manufacturer and colour. Prices and quantities are entered on each wholesale bill.</p>
        <input type="search" style={{ maxWidth: 280 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Search items…" aria-label="Search wholesale items" /></div>
      <Err>{err}</Err>
      <div className="dpos-tw"><table><thead><tr><th>Code</th><th>Company / name</th><th>Colour</th><th className="r">Action</th></tr></thead>
        <tbody>
          {manager && <tr><td colSpan="4"><form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8 }}>
            <input aria-label="New code" required placeholder="e.g. SK-102" value={nw.code} onChange={e => setNw({ ...nw, code: e.target.value })} /><input aria-label="New company" placeholder="e.g. Ravi Textiles" value={nw.company} onChange={e => setNw({ ...nw, company: e.target.value })} />
            <input aria-label="New colour" placeholder="e.g. Navy" value={nw.colour} onChange={e => setNw({ ...nw, colour: e.target.value })} /><button className="dpos-btn" type="submit">+ Add</button></form></td></tr>}
          {!rows ? <tr><td colSpan="4"><Empty>Loading…</Empty></td></tr> : !rows.length ? <tr><td colSpan="4"><Empty>No items yet.</Empty></td></tr> : rows.map(it => <WsRow key={it.id + it.code + it.company + it.colour} it={it} manager={manager} onSaved={() => {}} onDelete={del} setErr={setErr} />)}
        </tbody></table></div>
      {manager && <p className="sub" style={{ marginTop: 10 }}>Edits save automatically when you click away from a field.</p>}
    </section>
  );
}

// ============================ page ============================
export default function AdminPos() {
  const { user, authReady } = useApp();
  const { tab = 'billing' } = useParams();
  const [shop, setShop] = useState(null); const [invoice, setInvoice] = useState(null); const [tick, setTick] = useState(0); const [err, setErr] = useState();
  const allowed = user && ['owner', 'admin', 'cashier'].includes(user.role);
  const manager = !!user && ['owner', 'admin'].includes(user.role);
  const loadShop = useCallback(() => api('/admin/pos/shop').then(setShop).catch(e => setErr(e.message)), []);
  useEffect(() => { if (allowed) loadShop() }, [allowed, loadShop]);
  const openInvoice = useCallback(no => api('/admin/pos/sales/' + encodeURIComponent(no)).then(setInvoice).catch(e => setErr(e.message)), []);

  if (!authReady) return <div className="page-pad"><p className="muted">Loading…</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!allowed) return <div className="empty page-pad"><p className="serif big">Staff access only.</p><Link className="btn dark" to="/">RETURN HOME</Link></div>;

  if (!(tab in TABS) || (TABS[tab] && !manager)) return <Navigate to="/admin/billing" replace />;
  const onSale = sale => { setInvoice(sale); setTick(t => t + 1) };
  const body = {
    billing: <Billing channel="retail" shop={shop} onSale={onSale} manager={manager} />,
    analytics: <Analytics channel="retail" openInvoice={openInvoice} tick={tick} />,
    orders: <Orders channel="retail" openInvoice={openInvoice} tick={tick} manager={manager} />,
    inventory: <Inventory />, coupons: <Coupons />, birthdays: <Birthdays shop={shop} />, settings: <Settings onSaved={loadShop} />,
    'ws-billing': <Billing channel="wholesale" shop={shop} onSale={onSale} manager={manager} />,
    'ws-inventory': <WsInventory manager={manager} />,
    'ws-analytics': <Analytics channel="wholesale" openInvoice={openInvoice} tick={tick} />,
  }[tab];
  const sub = {
    billing: 'Quick invoice generator · stock synced with the online store', analytics: 'Retail sales performance', orders: 'Every retail bill, searchable',
    inventory: 'Live stock for every product variant', coupons: 'Discount codes for the till', birthdays: 'Customers to wish and reward', settings: 'GST number on invoices and delivery quick picks',
    'ws-billing': 'Wholesale invoice generator', 'ws-inventory': 'Simple items — code, company/manufacturer, colour', 'ws-analytics': 'Performance of the wholesale billing centre',
  }[tab];

  const title = { billing: 'POS Billing Panel', analytics: 'POS Analytics', orders: 'Orders', inventory: 'Inventory', coupons: 'Coupons', birthdays: 'Date of Birth', settings: 'Delivery & GST',
    'ws-billing': 'WS Billing', 'ws-inventory': 'Wholesale Inventory', 'ws-analytics': 'Wholesale Analytics' }[tab];
  return (
    <AdminShell title={title} sub={sub}>
      <Err>{err}</Err>
      {body}
      {invoice && <Invoice key={invoice.invoiceNo} sale={invoice} shop={shop} manager={manager} onClose={() => setInvoice(null)} onChanged={() => setTick(t => t + 1)} />}
    </AdminShell>
  );
}
