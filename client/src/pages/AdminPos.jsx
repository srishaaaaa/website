import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import { useApp } from '../context/App';
import AdminShell, { Icon } from '../components/AdminShell';
import Modal from '../components/Modal';
import LogoCard from '../components/LogoCard';
import { DEFAULT_LOGO } from '../components/Wordmark';
import PosInventory from './PosInventory';
import { Chips, PeriodFilter, inPeriod, periodRange, todayStr, usePeriod } from '../components/PeriodFilter';

// Dhanya POS: the in-store billing module of the admin. Everything the screen shows comes from the API; prices, stock,
// totals and invoice numbers are decided on the server (the totals here are only a live preview).

const toPaise = s => { const n = Math.round(parseFloat(String(s || '').replace(/,/g, '')) * 100); return Number.isFinite(n) && n > 0 ? n : 0 };
const rupees = p => (p / 100).toFixed(2).replace(/\.00$/, '');
const dmy = d => d ? d.split('-').reverse().join('-') : '';
const k = p => p >= 10000000 ? `₹${(p / 10000000).toFixed(1).replace(/\.0$/, '')}Cr` : p >= 100000 ? `₹${(p / 10000000 * 100).toFixed(1).replace(/\.0$/, '')}L` : p >= 100000 / 100 ? `₹${(p / 100000).toFixed(1).replace(/\.0$/, '')}k`.replace(/^₹0\./, '₹0.') : `₹${Math.round(p / 100)}`;
const MODES = [['cash', 'Cash'], ['upi', 'GPay / UPI'], ['card', 'Card'], ['split', 'Split']];
const MODE_LABEL = { cash: 'Cash', upi: 'GPay / UPI', card: 'Card', split: 'Split' };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const TABS = { billing: false, analytics: true, orders: false, inventory: true, customers: false, coupons: true, birthdays: true, expenses: true, settings: true, 'ws-billing': false, 'ws-inventory': false, 'ws-analytics': true };

// ---- live preview of the bill (the server recomputes everything on checkout) ----
function preview(lines, { isGst, gstRate, discountType, discountValue, deliveryFee }) {
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const discount = Math.min(subtotal, discountType === 'percent' ? Math.round(subtotal * Math.min(discountValue, 100) / 100) : discountValue);
  let tax = 0;
  if (isGst && subtotal) for (const l of lines) { const lt = l.price * l.qty; tax += Math.round((lt - Math.floor(discount * lt / subtotal)) * (gstRate ?? l.taxRate) / 100) }
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
          <img className="dpos-inv-logo" src={shop?.logo || DEFAULT_LOGO} alt="" />
          <h2>{shop?.name || 'DHANYA'}</h2>
          <p className="c">{(shop?.address || []).join(', ')}{shop?.phone ? ` · ${shop.phone}` : ''}{showGst ? ` · GSTIN ${shop.gstin}` : ''}</p>
          <p className="c"><b>{s.isGst ? 'TAX INVOICE' : 'BILL OF SUPPLY'}{s.channel === 'wholesale' ? ' · WHOLESALE' : ''}{s.source === 'online' ? ' · ONLINE ORDER' : ''}</b></p>
          {s.status === 'voided' && <p className="dpos-void-stamp">VOID{s.voidReason ? ` · ${s.voidReason}` : ''}</p>}
          <hr />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span><b>{s.invoiceNo}</b><br />{dmy(s.billDate)} · {new Date(s.createdAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' })}</span>
            <span style={{ textAlign: 'right' }}>{s.customerName || 'Walk-in customer'}{s.customerPhone ? <><br />{s.customerPhone}</> : null}{s.customerAddress ? <><br /><span className="muted">{s.customerAddress}</span></> : null}{s.cashier ? <><br /><span className="muted">Billed by {s.cashier}</span></> : null}</span>
          </div>
          <table><thead><tr><th>Item</th><th className="r">Qty</th><th className="r">Price</th><th className="r">Amount</th></tr></thead>
            <tbody>{s.items.map((i, n) => (
              <tr key={n}><td>{i.name}{i.variant?.size ? <span className="muted"> ({i.variant.size}{i.variant.color && i.variant.color !== 'Default' ? `, ${i.variant.color}` : ''})</span> : null}{i.sku ? <div className="muted small">{i.sku}</div> : null}</td>
                <td className="r">{i.quantity}</td><td className="r">{inr(i.unitPrice)}</td><td className="r">{inr(i.lineTotal)}</td></tr>))}</tbody></table>
          <hr />
          <div className="dpos-sum">
            <div><span>Subtotal</span><span>{inr(s.subtotal)}</span></div>
            {s.discount > 0 && <div><span>Discount{s.couponCode ? ` (${s.couponCode})` : s.discountType === 'percent' ? ` (${s.discountValue}%)` : ''}</span><span>− {inr(s.discount)}</span></div>}
            {s.isGst && <div><span>GST{s.gstRate != null ? ` @ ${s.gstRate}%` : ''}</span><span>{inr(s.tax)}</span></div>}
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
const blankCustom = (service = false) => ({ key: uuid(), custom: true, service, name: '', priceStr: '', qty: 1, taxRate: 5 });
const GST_RATES = [0, 5, 12, 18, 28];

function Billing({ channel, shop, onSale }) {
  const ws = channel === 'wholesale';
  const [q, setQ] = useState(''); const [results, setResults] = useState(null); const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState(ws ? [blankCustom()] : []);
  const [wsItems, setWsItems] = useState([]);
  const [cust, setCust] = useState({ name: '', phone: '', dob: '', address: '' }); const [billDate, setBillDate] = useState(todayStr()); const [source, setSource] = useState('offline');
  const [isGst, setIsGst] = useState(false); const gstTouched = useRef(false); const [gstRate, setGstRate] = useState('item');
  const [disc, setDisc] = useState({ type: 'fixed', value: '' });
  const [coupon, setCoupon] = useState(null); const [couponIn, setCouponIn] = useState(''); const [couponMsg, setCouponMsg] = useState();
  const [delivery, setDelivery] = useState('');
  const [mode, setMode] = useState('cash'); const [tendered, setTendered] = useState('');
  const [split, setSplit] = useState({ cash: '', upi: '', card: '' }); const [ref, setRef] = useState(''); const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  const key = useRef(null);

  useEffect(() => { if (shop?.gstin && !gstTouched.current) setIsGst(true) }, [shop]);
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
  const flat = isGst && gstRate !== 'item' ? +gstRate : null;
  const bill = useMemo(() => preview(priced, { isGst, gstRate: flat, discountType, discountValue, deliveryFee }), [priced, isGst, flat, discountType, discountValue, deliveryFee]);
  const tenderedP = tendered === '' ? bill.total : toPaise(tendered);
  const splitSum = toPaise(split.cash) + toPaise(split.upi) + toPaise(split.card);

  const body = useMemo(() => ({
    channel, source: ws ? 'offline' : source, billDate,
    items: priced.map(l => l.custom ? { name: l.name.trim(), price: l.price, qty: l.qty, taxRate: l.taxRate } : { variantId: l.variantId, qty: l.qty }),
    customerName: cust.name.trim(), customerPhone: cust.phone.trim(), customerAddress: cust.address.trim(), ...(cust.dob && !ws ? { customerDob: cust.dob } : {}),
    isGst, ...(flat != null ? { gstRate: flat } : {}), ...(coupon ? { couponCode: coupon.code } : { discountType: disc.type, discountValue }), deliveryFee,
    paymentMode: mode, ...(mode === 'cash' ? { cashTendered: tenderedP } : {}),
    ...(mode === 'split' ? { payments: { cash: toPaise(split.cash), upi: toPaise(split.upi), card: toPaise(split.card) } } : {}),
    ...(ref.trim() ? { paymentRef: ref.trim() } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [channel, ws, source, billDate, priced, cust, isGst, flat, coupon, disc.type, discountValue, deliveryFee, mode, tenderedP, split, ref, notes]);
  // A new idempotency key is used whenever the bill changes; an unchanged retry (e.g. after a network drop) reuses it, so it can never double-bill.
  useEffect(() => { key.current = null }, [body]);

  const lookup = async () => {
    if (cust.phone.replace(/\D/g, '').length < 10) return;
    try { const c = await api('/admin/pos/customers/lookup?phone=' + encodeURIComponent(cust.phone)); if (c) setCust(x => ({ ...x, name: x.name || c.name, dob: x.dob || c.dob || '' })) } catch { /* optional convenience */ }
  };
  const add = v => setLines(ls => {
    const i = ls.findIndex(l => l.variantId === v.variantId);
    if (i >= 0) return ls.map((l, n) => n === i ? { ...l, qty: Math.min(l.qty + 1, v.stock) } : l);
    return [...ls, { key: uuid(), variantId: v.variantId, name: v.name, detail: [v.size, v.color !== 'Default' ? v.color : null].filter(Boolean).join(' · '), sku: v.sku, price: v.price, qty: 1, stock: v.stock, taxRate: v.taxRate }];
  });
  const patch = (kk, p) => setLines(ls => ls.map(l => l.key === kk ? { ...l, ...p } : l));
  const setQty = (l, n) => { const max = l.stock ?? 99999; patch(l.key, { qty: Math.max(1, Math.min(max, Math.floor(n) || 1)) }) };
  const drop = kk => setLines(ls => ls.filter(l => l.key !== kk));
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
  const clearOrder = () => {
    setLines(ws ? [blankCustom()] : []); setCust({ name: '', phone: '', dob: '', address: '' }); setBillDate(todayStr()); setSource('offline'); setDisc({ type: 'fixed', value: '' }); setCoupon(null); setCouponIn(''); setCouponMsg();
    setDelivery(''); setTendered(''); setSplit({ cash: '', upi: '', card: '' }); setRef(''); setNotes(''); key.current = null; setErr();
  };

  const problem = !priced.length ? 'Add at least one item.' : mode === 'split' && splitSum !== bill.total ? `Split payments add up to ${inr(splitSum)}; the bill is ${inr(bill.total)}.`
    : mode === 'cash' && tenderedP < bill.total ? 'Cash received is less than the total.' : lines.some(l => l.custom && (l.name.trim() || l.priceStr) && !(l.name.trim() && toPaise(l.priceStr) > 0)) ? 'Finish or remove the incomplete item.' : null;

  const submit = async () => {
    if (problem || busy) return;
    setBusy(true); setErr();
    try {
      const sale = await api('/admin/pos/sales', { method: 'POST', body: { ...body, idempotencyKey: (key.current ??= uuid()) } });
      onSale(sale); clearOrder();
      if (!ws) { setQ(''); api('/admin/pos/catalog').then(setResults).catch(() => {}) }
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  };

  const lineEls = lines.map(l => (
    <div className="dpos-line" key={l.key}>
      {l.custom ? (
        <div className="dpos-grid" style={{ gridTemplateColumns: 'minmax(150px,2fr) minmax(90px,1fr) 90px' }}>
          <input aria-label="Item name or description" placeholder={l.service ? 'Service (alteration, stitching…)' : 'Item name / description…'} list={ws ? 'dpos-ws-list' : undefined} value={l.name} onChange={e => patch(l.key, { name: e.target.value })} />
          <input aria-label="Price in rupees" inputMode="decimal" placeholder="Price ₹" value={l.priceStr} onChange={e => patch(l.key, { priceStr: e.target.value })} />
          <select aria-label="GST rate" value={l.taxRate} onChange={e => patch(l.key, { taxRate: +e.target.value })}>{GST_RATES.map(r => <option key={r} value={r}>{r}% GST</option>)}</select>
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
        <section className="dpos-card"><h2><Icon n="user" />Customer details</h2>
          <div className="dpos-grid">
            <label className="f">Customer name<input value={cust.name} onChange={e => setCust({ ...cust, name: e.target.value })} placeholder="Walk-in customer" autoComplete="off" /></label>
            <label className="f">Mobile number (WhatsApp)<input value={cust.phone} inputMode="tel" onChange={e => setCust({ ...cust, phone: e.target.value })} onBlur={lookup} placeholder="Enter 10-digit number" autoComplete="off" /></label>
            <label className="f">Bill date · custom / past<input type="date" max={todayStr()} value={billDate} onChange={e => setBillDate(e.target.value || todayStr())} /></label>
            {!ws && <label className="f">Date of birth (for birthday offers)<input type="date" max={todayStr()} value={cust.dob} onChange={e => setCust({ ...cust, dob: e.target.value })} /></label>}
          </div>
          <label className="f" style={{ marginTop: 14 }}>Customer address (optional)<input value={cust.address} maxLength={300} onChange={e => setCust({ ...cust, address: e.target.value })} placeholder="Enter full address" /></label>
        </section>

        {!ws && (
          <section className="dpos-card"><h2><Icon n="box" />Find a product</h2>
            <input autoFocus type="search" value={q} onChange={e => setQ(e.target.value)} onKeyDown={onSearchEnter} placeholder="Search name, SKU, size, colour or category — or scan a barcode" aria-label="Search products" />
            <div className="dpos-results" aria-live="polite">
              {results === null || (searching && !results.length) ? <Empty>Loading…</Empty> : !results.length ? <Empty>No products match “{q}”.</Empty> : results.map(v => (
                <button key={v.variantId} className="dpos-res" disabled={v.stock < 1} onClick={() => add(v)}>
                  {v.image ? <img src={v.image} alt="" loading="lazy" /> : <img alt="" />}
                  <span><b>{v.name}</b><em>{[v.size, v.color !== 'Default' ? v.color : null].filter(Boolean).join(' · ')} · {v.sku}{v.category ? ` · ${v.category}` : ''}</em></span>
                  <span style={{ textAlign: 'right', flex: 'none' }}><b>{inr(v.price)}</b><em>{v.stock < 1 ? 'Out of stock' : `${v.stock} in stock`}</em></span>
                </button>))}
            </div>
          </section>)}

        <section className="dpos-card">
          <div className="dpos-head" style={{ marginBottom: 6 }}><h2 style={{ marginBottom: 0 }}><Icon n="orders" />Order items</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="dpos-btn ghost sm" onClick={clearOrder}><Icon n="trash" size={14} />Clear order</button>
              {!ws && <button className="dpos-btn ghost sm" onClick={() => setLines(ls => [...ls, blankCustom(true)])}>✂ Add service</button>}
              <button className="dpos-btn ghost sm" onClick={() => setLines(ls => [...ls, blankCustom()])}>+ Add {ws ? 'item' : 'custom item'}</button></div></div>
          {ws && <datalist id="dpos-ws-list">{wsItems.map(i => <option key={i.id} value={[i.code, i.company, i.colour].filter(Boolean).join(' · ')} />)}</datalist>}
          {lines.length ? lineEls : <Empty>No items yet. Search above to add products.</Empty>}
        </section>
      </div>

      <div className="dpos-col dpos-sticky">
        <section className="dpos-card"><div className="dpos-head" style={{ marginBottom: 10 }}><h2 style={{ marginBottom: 0 }}><Icon n="orders" />Current order</h2>
          {!ws && <div className="dpos-src" role="radiogroup" aria-label="Order source"><button role="radio" aria-checked={source === 'offline'} className={source === 'offline' ? 'on' : ''} onClick={() => setSource('offline')}>Offline (POS)</button><button role="radio" aria-checked={source === 'online'} className={source === 'online' ? 'on' : ''} onClick={() => setSource('online')}><i />Online order</button></div>}</div>
          <div className="dpos-box dpos-sum" style={{ marginBottom: 14 }}>
            <div><span>SOURCE</span><span className="dpos-pill">{ws ? 'Wholesale' : source === 'online' ? 'Online' : 'Offline'}</span></div>
            <div><span>CUSTOMER</span><span>{cust.name || '-'}</span></div><div><span>PHONE</span><span>{cust.phone || '-'}</span></div>
            <div><span>DATE</span><span>{dmy(billDate)}</span></div>
            <hr style={{ border: 0, borderTop: '1px solid var(--d-line)', width: '100%' }} />
            {priced.length ? priced.map(l => <div key={l.key}><span>{l.name} × {l.qty}</span><span>{inr(l.price * l.qty)}</span></div>) : <em className="muted" style={{ textAlign: 'center', display: 'block' }}>No items added yet</em>}
          </div>
          <p className="muted small" style={{ fontWeight: 800, letterSpacing: '.1em', margin: '0 0 6px' }}>MANUAL DISCOUNT</p>
          <div className="dpos-grid" style={{ gridTemplateColumns: '110px 1fr', marginBottom: 12 }}>
            <select aria-label="Discount type" value={disc.type} disabled={!!coupon} onChange={e => setDisc({ ...disc, type: e.target.value })}><option value="fixed">₹</option><option value="percent">%</option></select>
            <input inputMode="decimal" disabled={!!coupon} value={disc.value} onChange={e => setDisc({ ...disc, value: e.target.value })} placeholder="0" aria-label="Discount value" style={{ textAlign: 'right' }} />
          </div>
          {!ws && <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}><input value={couponIn} onChange={e => setCouponIn(e.target.value.toUpperCase())} placeholder="Coupon code" aria-label="Coupon code" disabled={!!coupon} />
              {coupon ? <button className="dpos-btn ghost sm" onClick={() => { setCoupon(null); setCouponMsg(); setCouponIn('') }}>Remove</button> : <button className="dpos-btn sm" disabled={!couponIn.trim()} onClick={applyCoupon}>Apply</button>}</div>
            {couponMsg && <p className={couponMsg.ok ? 'dpos-ok' : 'dpos-err'} style={{ marginTop: 8 }}>{couponMsg.t}</p>}
          </div>}
          <div className="dpos-sum" style={{ marginBottom: 12 }}>
            <div><span>Subtotal ({priced.reduce((s, l) => s + l.qty, 0)} items)</span><b>{inr(bill.subtotal)}</b></div>
            <div style={{ alignItems: 'center' }}><span>Delivery</span><input aria-label="Delivery charge in rupees" inputMode="decimal" value={delivery} onChange={e => setDelivery(e.target.value)} placeholder="0" style={{ maxWidth: 130, textAlign: 'right' }} /></div>
            {(shop?.deliveryPresets || []).length > 0 && <div style={{ alignItems: 'center' }}><span className="muted small">Quick pick</span><select aria-label="Delivery quick pick" value="" onChange={e => e.target.value !== '' && setDelivery(rupees(+e.target.value))} style={{ maxWidth: 200 }}><option value="">Choose…</option>{shop.deliveryPresets.map((p, i) => <option key={i} value={p.fee}>{p.name} · {inr(p.fee)}</option>)}</select></div>}
          </div>
          <div className="dpos-two" role="radiogroup" aria-label="Invoice type">
            <button role="radio" aria-checked={!isGst} className={!isGst ? 'on' : ''} onClick={() => { gstTouched.current = true; setIsGst(false) }}>Non-GST bill</button>
            <button role="radio" aria-checked={isGst} className={isGst ? 'on' : ''} onClick={() => { gstTouched.current = true; setIsGst(true) }}>GST invoice</button></div>
          {isGst && <div style={{ marginTop: 10 }}><label className="f">GST rate<select value={gstRate} onChange={e => setGstRate(e.target.value)}><option value="item">Each item’s own GST rate</option>{GST_RATES.map(r => <option key={r} value={r}>{r}% on the whole bill</option>)}</select></label>
            {shop?.gstin ? <p className="sub" style={{ marginTop: 6 }}>GSTIN {shop.gstin}{shop.showGst?.[channel] ? ' is printed on the invoice.' : ' is saved (turn on “show on invoices” in Delivery & GST to print it).'}</p> : <p className="sub" style={{ marginTop: 6 }}>Add your GSTIN in Delivery &amp; GST to print it on invoices.</p>}</div>}
          <div className="dpos-sum" style={{ marginTop: 14 }}>
            {bill.discount > 0 && <div><span>Discount</span><span>− {inr(bill.discount)}</span></div>}
            {isGst && <div><span>GST{flat != null ? ` @ ${flat}%` : ''}</span><span>{inr(bill.tax)}</span></div>}
            {deliveryFee > 0 && <div><span>Delivery</span><span>{inr(deliveryFee)}</span></div>}
            <div className="tot"><span>Total</span><span>{inr(bill.total)}</span></div>
          </div>
        </section>

        <section className="dpos-card"><h2>Financial option</h2>
          <div className="dpos-seg" role="radiogroup" aria-label="Payment method" style={{ marginBottom: 12 }}>{MODES.map(([v, l]) => <button key={v} role="radio" aria-checked={mode === v} className={mode === v ? 'on' : ''} onClick={() => setMode(v)}>{l}</button>)}</div>
          {mode === 'cash' && <>
            <label className="f">Cash received ₹<input inputMode="decimal" value={tendered} onChange={e => setTendered(e.target.value)} placeholder={rupees(bill.total)} /></label>
            <p className="sub" style={{ marginTop: 8 }}>{tenderedP >= bill.total ? `Change to return: ${inr(tenderedP - bill.total)}` : `Short by ${inr(bill.total - tenderedP)}`}</p></>}
          {mode === 'split' && <>
            <div className="dpos-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>{['cash', 'upi', 'card'].map(m => <label className="f" key={m}>{m === 'upi' ? 'GPay / UPI' : MODE_LABEL[m]} ₹<input inputMode="decimal" value={split[m]} onChange={e => setSplit({ ...split, [m]: e.target.value })} placeholder="0" /></label>)}</div>
            <p className="sub" style={{ marginTop: 8 }}>{splitSum === bill.total ? 'Split matches the total ✓' : `${splitSum > bill.total ? 'Over' : 'Short'} by ${inr(Math.abs(bill.total - splitSum))}`}</p></>}
          {(mode === 'upi' || mode === 'card' || mode === 'split') && <label className="f" style={{ marginTop: 12 }}>{mode === 'card' ? 'Card slip / approval no.' : 'UPI transaction ID'} (optional)<input value={ref} onChange={e => setRef(e.target.value)} maxLength={80} /></label>}
          <p className="sub" style={{ marginTop: 10 }}>GPay / UPI and card are confirmed by the cashier at the counter; there is no payment gateway attached to Dhanya POS.</p>
          <label className="f" style={{ marginTop: 12 }}>Note (optional)<input value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} /></label>
        </section>

        <Err>{err}</Err>
        {problem && priced.length > 0 && <p className="sub" role="status">{problem}</p>}
        <button className="dpos-btn big" disabled={!!problem || busy} onClick={submit}>{busy ? 'Saving…' : `Complete sale · ${inr(bill.total)}`}</button>
      </div>
    </div>
  );
}

// ============================ bills list / orders ============================
function BillsTable({ rows, onOpen, empty = 'No bills found.' }) {
  if (!rows) return <Empty>Loading…</Empty>;
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="dpos-tw"><table><thead><tr><th>Invoice</th><th>Bill date</th><th>Customer</th><th>Type</th><th>Payment</th><th className="r">Items</th><th className="r">Total</th></tr></thead>
      <tbody>{rows.map(r => (
        <tr key={r.invoiceNo} className={`click ${r.status === 'voided' ? 'voided' : ''}`} tabIndex={0} onClick={() => onOpen(r.invoiceNo)} onKeyDown={e => e.key === 'Enter' && onOpen(r.invoiceNo)}>
          <td><b>{r.invoiceNo}</b>{r.status === 'voided' && <> <span className="dpos-pill bad">Void</span></>}</td><td>{dmy(r.billDate)}</td>
          <td>{r.customerName || <span className="muted">Walk-in</span>}{r.customerPhone ? <div className="muted small">{r.customerPhone}</div> : null}</td>
          <td><span className="dpos-pill">{r.isGst ? 'GST' : 'Non-GST'}</span> {r.source === 'online' && <span className="dpos-pill ok">Online</span>}</td>
          <td>{MODE_LABEL[r.paymentMode]}</td><td className="r">{r.itemCount}</td><td className="r"><b>{inr(r.total)}</b></td></tr>))}</tbody></table></div>
  );
}
const GST_CHIPS = [['all', 'All bills'], ['gst', 'GST invoices'], ['nongst', 'Non-GST bills']];

function Orders({ channel, openInvoice, tick, manager }) {
  const [q, setQ] = useState(''); const [per, setPer] = usePeriod('all'); const [gst, setGst] = useState('all');
  const [rows, setRows] = useState(null); const [err, setErr] = useState();
  const [from, to] = periodRange(per);
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams({ q, channel, gst }); if (manager) { p.set('from', from); p.set('to', to) }
      api('/admin/pos/sales?' + p).then(r => { setRows(r); setErr() }).catch(e => setErr(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [q, from, to, gst, channel, tick, manager]);
  return (
    <section className="dpos-card">
      <div className="dpos-bar-tools" style={{ marginBottom: 14 }}>
        <input type="search" style={{ maxWidth: 320 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Invoice no., name or mobile" aria-label="Search bills" />
        <Chips label="Bills" value={gst} onChange={setGst} options={GST_CHIPS} />
        {manager && <PeriodFilter value={per} onChange={setPer} />}
      </div>
      {!manager && <p className="sub" style={{ marginBottom: 8 }}>Cashiers see today’s bills. Owners and admins can search the full history.</p>}
      <Err>{err}</Err><BillsTable rows={rows} onOpen={openInvoice} />
    </section>
  );
}

// ============================ analytics ============================
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
function Stat({ cls = '', icon, label, value, sub, txt, children }) {
  return <div className={`dpos-card2 ${cls}`}><div className="t"><span>{label}</span><span className="ic"><Icon n={icon} size={16} /></span></div><div className={`v ${txt ? 'txt' : ''}`}>{value}</div>{sub && <div className="s">{sub}</div>}{children}</div>;
}
function Chart({ values, labels, cap }) {
  const max = Math.max(1, ...values);
  return <div className={`dpos-ch ${cap ? 'cap' : ''}`} role="img" aria-label="Revenue chart">{values.map((v, i) => <div className="c" key={i}><div className="col">{v > 0 && <em>{k(v)}</em>}<i style={{ height: `${Math.max(v ? 4 : 0, v / max * 100)}%` }} /></div><span>{labels[i]}</span></div>)}</div>;
}

function Analytics({ channel, openInvoice, tick, goExpenses }) {
  const ws = channel === 'wholesale';
  const [tab, setTab] = useState('revenue'); const [gst, setGst] = useState('all'); const [per, setPer] = usePeriod('all');
  const [rep, setRep] = useState(null); const [bills, setBills] = useState(null); const [err, setErr] = useState();
  const today = todayStr();
  const [from, to] = tab === 'today' ? [today, today] : periodRange(per);
  useEffect(() => {
    setRep(null); setBills(null); setErr();
    api(`/admin/pos/reports?from=${from}&to=${to}&channel=${channel}&gst=${gst}`).then(setRep).catch(e => setErr(e.message));
    if (tab === 'today') api(`/admin/pos/sales?from=${from}&to=${to}&channel=${channel}&gst=${gst}`).then(setBills).catch(() => {});
  }, [from, to, channel, gst, tab, tick]);
  const v = (f, d = '…') => rep ? f(rep) : d;
  return (
    <>
      <div className="dpos-bar-tools"><Chips value={gst} onChange={setGst} options={GST_CHIPS} />{tab !== 'today' && <PeriodFilter value={per} onChange={setPer} />}</div>
      <div className="dpos-tabs" role="tablist">{[['revenue', 'Revenue'], ['today', 'Today’s sales'], ['products', 'Products'], ['coupons', 'Coupons']].map(([id, l]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{l}</button>)}</div>
      <Err>{err}</Err>

      {(tab === 'revenue' || tab === 'today') && <>
        <div className="dpos-k4">
          <Stat cls="net" icon="wallet" label="Net earnings" value={v(r => inr(r.net))} sub={ws ? 'Wholesale sales' : 'GST + Non-GST − Expenses'} />
          <Stat cls="gstc" icon="doc" label="GST sales" value={v(r => inr(r.gstSales))} sub={v(r => `${r.gstBills} GST invoices`, ' ')} />
          <Stat cls="nong" icon="trend" label="Non-GST sales" value={v(r => `+ ${inr(r.nonGstSales)}`)} sub={v(r => `${r.nonGstBills} ${ws ? 'wholesale' : 'retail'} bills`, ' ')} />
          {!ws && <Stat cls="exp" icon="wallet" label="Total expenses" value={v(r => `− ${inr(r.expenses)}`)}><button className="s" style={{ textAlign: 'left', color: '#b3261e', textDecoration: 'underline' }} onClick={goExpenses}>Money out — Expense Tracker</button></Stat>}
        </div>
        {!ws && rep && <div className="dpos-formula"><span><b className="tag">Calculation formula</b> &nbsp;GST ({inr(rep.gstSales)}) + Non-GST ({inr(rep.nonGstSales)}) − Expenses ({inr(rep.expenses)})</span><span>= Net Profit: <span className="np">{inr(rep.net)}</span></span></div>}
        <div className="dpos-k4">
          <Stat icon="wallet" label="Total revenue" value={v(r => inr(r.revenue))} sub={v(r => `GST (${inr(r.gstSales)}) + Non-GST (${inr(r.nonGstSales)})`, ' ')} />
          <Stat icon="doc" label="Completed bills" value={v(r => r.bills)} sub="POS + manual bills" />
          <Stat icon="shop" label="Offline bills" value={v(r => inr(r.offlineSales))} sub="Walk-in POS sales" />
          <Stat icon="trend" label="Online bills" value={v(r => inr(r.onlineSales))} sub="Online POS sales" />
          <Stat icon="shop" label="Total offline bills" value={v(r => r.offlineBills)} sub="Walk-in POS orders" />
          <Stat icon="orders" label="Total online bills" value={v(r => r.onlineBills)} sub="Online channel orders" />
          <Stat icon="box" label="Total items sold" value={v(r => r.units)} sub="From completed bills" />
          <Stat icon="star" label="Top product" txt value={v(r => r.topProduct || '—')} sub="Most sold item" />
        </div>
      </>}

      {tab === 'revenue' && rep && <>
        <div className="dpos-split">
          <div style={{ display: 'grid', gap: 18 }}>
            <section className="dpos-card"><h2>Revenue trend <span className="muted">this year {rep.year}</span></h2>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}><b style={{ fontSize: 28 }}>{inr(rep.monthly.reduce((a, b) => a + b, 0))}</b><span className="dpos-pill">Avg {k(Math.round(rep.monthly.reduce((a, b) => a + b, 0) / (new Date().getMonth() + 1)))}/mo</span></div>
              <Chart values={rep.monthly} labels={MONTHS} /></section>
            <section className="dpos-card"><h2>Revenue this week <span className="muted">(Week {rep.weekNo} of {rep.year})</span></h2>
              <p className="sub">{inr(rep.week.reduce((a, b) => a + b, 0))} total</p><Chart values={rep.week} labels={DAYS} cap /></section>
          </div>
          <div style={{ display: 'grid', gap: 18 }}>
            <section className="dpos-card"><h2>Order source</h2>
              <div className="dpos-bars2">{[['Offline', rep.offlineBills, '#0d0d10'], ['Online', rep.onlineBills, '#0a8a5c']].map(([l, n, c]) => <div className="dpos-b2" key={l}><span style={{ color: c }}>{l}</span><span className="tr"><i style={{ width: `${rep.bills ? n / rep.bills * 100 : 0}%` }} /></span><span className="n">{n}</span></div>)}</div></section>
            <section className="dpos-card"><h2>Top items by revenue</h2>
              {!rep.products.length ? <Empty>No sales in this period.</Empty> : <div className="dpos-rank">{rep.products.slice(0, 5).map((p, i) => <div className="dpos-rk" key={p.name}><b>{i + 1}</b><div><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontWeight: 700 }}><span>{p.name}</span><b>{inr(p.revenue)}</b></div><div className="tr"><i style={{ width: `${p.revenue / rep.products[0].revenue * 100}%` }} /></div></div><span className="muted small">{p.qty} pcs</span></div>)}</div>}</section>
          </div>
        </div>
      </>}

      {tab === 'today' && <section className="dpos-card"><h2>Today’s bills</h2><BillsTable rows={bills} onOpen={openInvoice} empty="No bills today yet." /></section>}

      {tab === 'products' && <section className="dpos-card"><h2>Product-wise sales</h2>
        {!rep ? <Empty>Loading…</Empty> : !rep.products.length ? <Empty>No sales in this period.</Empty> : <div className="dpos-tw"><table><thead><tr><th>#</th><th>Item</th><th className="r">Units</th><th className="r">Revenue</th></tr></thead><tbody>{rep.products.map((p, i) => <tr key={p.name}><td>{i + 1}</td><td>{p.name}</td><td className="r">{p.qty}</td><td className="r"><b>{inr(p.revenue)}</b></td></tr>)}</tbody></table></div>}</section>}

      {tab === 'coupons' && <section className="dpos-card"><h2>Coupon usage</h2>
        {!rep ? <Empty>Loading…</Empty> : !rep.coupons.length ? <Empty>No coupons were used in this period.</Empty> : <div className="dpos-tw"><table><thead><tr><th>Code</th><th className="r">Times used</th><th className="r">Discount given</th><th className="r">Sales with coupon</th></tr></thead><tbody>{rep.coupons.map(c => <tr key={c.code}><td><b>{c.code}</b></td><td className="r">{c.uses}</td><td className="r">{inr(c.discount)}</td><td className="r">{inr(c.revenue)}</td></tr>)}</tbody></table></div>}</section>}
    </>
  );
}

// ============================ customers (name, mobile, date of birth) ============================
function CustomerModal({ c, onClose, onDone }) {
  const [f, setF] = useState({ name: c?.name || '', phone: c?.phone || '', dob: c?.dob || '', notes: c?.notes || '' }); const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  const submit = async e => {
    e.preventDefault(); setBusy(true); setErr();
    try { await api(c ? `/admin/pos/customers/${c.id}` : '/admin/pos/customers', { method: c ? 'PATCH' : 'POST', body: { name: f.name.trim(), phone: f.phone.trim(), dob: f.dob || null, notes: f.notes.trim() || null } }); onDone(); onClose() }
    catch (x) { setErr(x.issues?.[0]?.message || x.message) } finally { setBusy(false) }
  };
  return (
    <Modal title={c ? 'Edit customer' : 'Add customer'} sub="Name, mobile and date of birth for birthday offers" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <label className="f">Customer name<input autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} maxLength={120} /></label>
        <label className="f">Mobile number<input required inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="10-digit number" /></label>
        <label className="f">Date of birth<input type="date" max={todayStr()} value={f.dob} onChange={e => setF({ ...f, dob: e.target.value })} /></label>
        <label className="f">Notes (optional)<input value={f.notes} maxLength={300} onChange={e => setF({ ...f, notes: e.target.value })} /></label>
        <Err>{err}</Err>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" className="dpos-btn ghost" onClick={onClose}>Cancel</button><button className="dpos-btn" disabled={busy}>{busy ? 'Saving…' : 'Save customer'}</button></div>
      </form>
    </Modal>
  );
}
function Customers({ manager }) {
  const { toast } = useApp();
  const [q, setQ] = useState(''); const [per, setPer] = usePeriod('all'); const [rows, setRows] = useState(null); const [err, setErr] = useState(); const [modal, setModal] = useState(null);
  const load = useCallback(() => api('/admin/pos/customers?q=' + encodeURIComponent(q)).then(r => { setRows(r); setErr() }).catch(e => setErr(e.message)), [q]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t) }, [load]);
  const shown = (rows || []).filter(c => inPeriod(c.createdAt, per));
  const del = async c => { if (!confirm(`Delete ${c.name || c.phone}? Their past bills are kept.`)) return; try { await api('/admin/pos/customers/' + c.id, { method: 'DELETE' }); toast('Customer deleted.'); load() } catch (e) { setErr(e.message) } };
  return (
    <>
      <div className="dpos-bar-tools"><input type="search" style={{ maxWidth: 320 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or mobile…" aria-label="Search customers" />
        {manager && <PeriodFilter value={per} onChange={setPer} />}<button className="dpos-btn" onClick={() => setModal({})}><Icon n="plus" size={16} />Add customer</button></div>
      <Err>{err}</Err>
      <section className="dpos-card">
        {!rows ? <Empty>Loading…</Empty> : !shown.length ? <Empty>No customers yet. They are added automatically when you bill with a mobile number.</Empty> : (
          <div className="dpos-tw"><table><thead><tr><th>Name</th><th>Mobile</th><th>Date of birth</th><th className="r">Bills</th><th className="r">Spent</th><th /></tr></thead>
            <tbody>{shown.map(c => <tr key={c.id}><td><b>{c.name || '—'}</b></td><td>{c.phone}</td><td>{c.dob ? dmy(c.dob) : <span className="muted">—</span>}</td><td className="r">{c.bills}</td><td className="r">{inr(c.spent)}</td>
              <td className="r" style={{ whiteSpace: 'nowrap' }}>{manager && <><button className="dpos-btn ghost sm" onClick={() => setModal(c)}>Edit</button> <button className="dpos-btn danger sm" onClick={() => del(c)}>Delete</button></>}</td></tr>)}</tbody></table></div>)}
      </section>
      {modal && <CustomerModal c={modal.id ? modal : null} onClose={() => setModal(null)} onDone={() => { toast('Customer saved.'); load() }} />}
    </>
  );
}

// ============================ expenses ============================
function Expenses() {
  const { toast } = useApp();
  const [per, setPer] = usePeriod('month'); const [rows, setRows] = useState(null); const [err, setErr] = useState();
  const [f, setF] = useState({ title: '', category: 'General', amount: '', mode: 'cash', date: todayStr() });
  const [from, to] = periodRange(per);
  const load = useCallback(() => api(`/admin/pos/expenses?from=${from}&to=${to}`).then(r => { setRows(r); setErr() }).catch(e => setErr(e.message)), [from, to]);
  useEffect(() => { load() }, [load]);
  const add = async e => {
    e.preventDefault(); setErr();
    try { await api('/admin/pos/expenses', { method: 'POST', body: { title: f.title.trim(), category: f.category.trim() || 'General', amount: toPaise(f.amount), paymentMode: f.mode, date: f.date } }); setF({ ...f, title: '', amount: '' }); toast('Expense added.'); load() }
    catch (x) { setErr(x.issues?.[0]?.message || x.message) }
  };
  const del = async x => { if (!confirm(`Delete expense “${x.title}”?`)) return; try { await api('/admin/pos/expenses/' + x.id, { method: 'DELETE' }); load() } catch (e) { setErr(e.message) } };
  const total = (rows || []).reduce((s, x) => s + x.amount, 0);
  return (
    <>
      <div className="dpos-bar-tools"><PeriodFilter value={per} onChange={setPer} /><div className="dpos-card2 exp" style={{ minHeight: 0, padding: '10px 18px' }}><span className="s">Total expenses</span><b style={{ fontSize: 22, color: '#b3261e' }}>− {inr(total)}</b></div></div>
      <form className="dpos-card" onSubmit={add}><h2>Add expense</h2>
        <div className="dpos-grid">
          <label className="f">What was it for<input required value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="e.g. Shop rent, packing material" maxLength={120} /></label>
          <label className="f">Category<input value={f.category} onChange={e => setF({ ...f, category: e.target.value })} maxLength={60} list="dpos-exp-cats" /></label>
          <label className="f">Amount ₹<input required inputMode="decimal" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></label>
          <label className="f">Paid by<select value={f.mode} onChange={e => setF({ ...f, mode: e.target.value })}><option value="cash">Cash</option><option value="upi">GPay / UPI</option><option value="card">Card</option></select></label>
          <label className="f">Date<input type="date" max={todayStr()} value={f.date} onChange={e => setF({ ...f, date: e.target.value || todayStr() })} /></label>
        </div>
        <datalist id="dpos-exp-cats">{['Rent', 'Salary', 'Electricity', 'Packing', 'Transport', 'Marketing', 'Repairs', 'Tea & snacks'].map(c => <option key={c} value={c} />)}</datalist>
        <div style={{ marginTop: 14 }}><button className="dpos-btn">Add expense</button></div>
      </form>
      <Err>{err}</Err>
      <section className="dpos-card"><h2>Money out</h2>
        {!rows ? <Empty>Loading…</Empty> : !rows.length ? <Empty>No expenses in this period.</Empty> : <div className="dpos-tw"><table><thead><tr><th>Date</th><th>Expense</th><th>Category</th><th>Paid by</th><th className="r">Amount</th><th /></tr></thead>
          <tbody>{rows.map(x => <tr key={x.id}><td>{dmy(x.date)}</td><td><b>{x.title}</b></td><td>{x.category}</td><td>{MODE_LABEL[x.paymentMode]}</td><td className="r"><b>{inr(x.amount)}</b></td><td className="r"><button className="dpos-btn danger sm" onClick={() => del(x)}>Delete</button></td></tr>)}</tbody></table></div>}</section>
    </>
  );
}

// ============================ coupons ============================
function Coupons() {
  const [list, setList] = useState(null); const [err, setErr] = useState(); const [st, setSt] = useState('all');
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
  const shown = (list || []).filter(c => st === 'all' || (st === 'active' ? c.active : !c.active));
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
      <section className="dpos-card"><div className="dpos-bar-tools" style={{ marginBottom: 10 }}><h2 style={{ marginBottom: 0 }}>Coupons</h2><Chips label="Status" value={st} onChange={setSt} options={[['all', 'All'], ['active', 'Active'], ['off', 'Off']]} /></div>
        {!list ? <Empty>Loading…</Empty> : !shown.length ? <Empty>No coupons here.</Empty> : (
          <div className="dpos-tw"><table><thead><tr><th>Code</th><th>Discount</th><th className="r">Min bill</th><th>Expires</th><th className="r">Used</th><th>Status</th><th /></tr></thead>
            <tbody>{shown.map(c => (
              <tr key={c.id}><td><b>{c.code}</b></td><td>{c.discountType === 'percent' ? `${c.discountValue}%` : inr(c.discountValue)}</td><td className="r">{c.minOrder ? inr(c.minOrder) : '—'}</td><td>{c.expiresOn ? dmy(c.expiresOn) : '—'}</td>
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
      <p className="sub" style={{ marginBottom: 12 }}>Customers whose date of birth is saved in Customers. Pair this with a birthday coupon from the Coupons tab.</p>
      <div style={{ marginBottom: 12 }}><Chips label="Range" value={days} onChange={setDays} options={[[7, 'Next 7 days'], [30, 'Next 30 days'], [90, 'Next 90 days'], [366, 'This year']]} /></div>
      <Err>{err}</Err>
      {!rows ? <Empty>Loading…</Empty> : !rows.length ? <Empty>No upcoming birthdays. Add a date of birth while billing, or in Customers.</Empty> : (
        <div className="dpos-tw"><table><thead><tr><th>Customer</th><th>Mobile</th><th>Date of birth</th><th>Next birthday</th><th /></tr></thead>
          <tbody>{rows.map(b => <tr key={b.phone}><td><b>{b.name || '—'}</b></td><td>{b.phone}</td><td>{dmy(b.dob)}</td><td>{dmy(b.nextBirthday)} <span className={`dpos-pill ${b.daysAway === 0 ? 'ok' : ''}`}>{b.daysAway === 0 ? 'Today' : `in ${b.daysAway}d`}</span></td>
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
    <div style={{ display: 'grid', gap: 18 }}>
      <LogoCard />
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
    </div>
  );
}

// ============================ wholesale inventory ============================
function WsRow({ it, manager, onDelete, setErr }) {
  const [v, setV] = useState(it); const saved = useRef(it);
  const commit = async () => {
    if (!manager || (v.code === saved.current.code && v.company === saved.current.company && v.colour === saved.current.colour)) return;
    if (!v.code.trim()) { setV(saved.current); return }
    try { const out = await api(`/admin/pos/ws/items/${it.id}`, { method: 'PATCH', body: { code: v.code, company: v.company, colour: v.colour } }); saved.current = out; setV(out); setErr() }
    catch (e) { setErr(e.message); setV(saved.current) }
  };
  const f = kk => ({ value: v[kk], readOnly: !manager, onChange: e => setV({ ...v, [kk]: e.target.value }), onBlur: commit });
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
          {!rows ? <tr><td colSpan="4"><Empty>Loading…</Empty></td></tr> : !rows.length ? <tr><td colSpan="4"><Empty>No items yet.</Empty></td></tr> : rows.map(it => <WsRow key={it.id + it.code + it.company + it.colour} it={it} manager={manager} onDelete={del} setErr={setErr} />)}
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
  const stocker = !!user && ['owner', 'admin', 'inventory'].includes(user.role);
  const loadShop = useCallback(() => api('/admin/pos/shop').then(setShop).catch(e => setErr(e.message)), []);
  useEffect(() => { if (allowed) loadShop() }, [allowed, loadShop]);
  const openInvoice = useCallback(no => api('/admin/pos/sales/' + encodeURIComponent(no)).then(setInvoice).catch(e => setErr(e.message)), []);

  if (!authReady) return <div className="page-pad"><p className="muted">Loading…</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!allowed) return <div className="empty page-pad"><p className="serif big">Staff access only.</p><Link className="btn dark" to="/">RETURN HOME</Link></div>;
  if (!(tab in TABS) || (TABS[tab] && !manager)) return <Navigate to="/admin/billing" replace />;

  const onSale = sale => { setInvoice(sale); setTick(t => t + 1) };
  const goExpenses = () => { window.location.assign('/admin/billing/expenses') };
  const body = {
    billing: <Billing channel="retail" shop={shop} onSale={onSale} />,
    analytics: <Analytics channel="retail" openInvoice={openInvoice} tick={tick} goExpenses={goExpenses} />,
    orders: <Orders channel="retail" openInvoice={openInvoice} tick={tick} manager={manager} />,
    inventory: <PosInventory manager={manager} stocker={stocker} />, customers: <Customers manager={manager} />, coupons: <Coupons />, birthdays: <Birthdays shop={shop} />,
    expenses: <Expenses />, settings: <Settings onSaved={loadShop} />,
    'ws-billing': <Billing channel="wholesale" shop={shop} onSale={onSale} />,
    'ws-inventory': <WsInventory manager={manager} />,
    'ws-analytics': <Analytics channel="wholesale" openInvoice={openInvoice} tick={tick} goExpenses={goExpenses} />,
  }[tab];
  const sub = {
    billing: 'Quick invoice generator · stock synced with the online store · for in-store (offline) and online-order billing', analytics: 'All bills — full store & channel insights', orders: 'Every retail bill, searchable',
    inventory: 'Manage products and stock — add, edit and adjust', customers: 'Customer details with date of birth', coupons: 'Discount codes for the till', birthdays: 'Customers to wish and reward',
    expenses: 'Money out, subtracted from net earnings', settings: 'Logo, GST number on invoices and delivery quick picks',
    'ws-billing': 'Wholesale invoice generator with GST', 'ws-inventory': 'Simple items — code, company/manufacturer, colour', 'ws-analytics': 'Performance of the wholesale billing centre',
  }[tab];
  const title = { billing: 'POS Billing Panel', analytics: 'Revenue Analytics', orders: 'Orders', inventory: 'Inventory', customers: 'Customers', coupons: 'Coupons', birthdays: 'Date of Birth', expenses: 'Expense Tracker', settings: 'Settings',
    'ws-billing': 'WS Billing', 'ws-inventory': 'Wholesale Inventory', 'ws-analytics': 'Wholesale Analytics' }[tab];
  return (
    <AdminShell title={title} sub={sub}>
      <Err>{err}</Err>
      {body}
      {invoice && <Invoice key={invoice.invoiceNo} sale={invoice} shop={shop} manager={manager} onClose={() => setInvoice(null)} onChanged={() => setTick(t => t + 1)} />}
    </AdminShell>
  );
}
