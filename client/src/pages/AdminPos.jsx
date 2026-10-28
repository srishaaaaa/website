import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import { useApp } from '../context/App';
import AdminShell, { Icon } from '../components/AdminShell';
import Modal from '../components/Modal';
import MeasureModal, { measureSummary } from '../components/MeasureModal';
import LogoCard from '../components/LogoCard';
import PosInventory from './PosInventory';
import { AccentPicker, LoginPasswordCard, StaffAccessCard, StockAlertsCard, LowStockAlert } from '../components/PosSettingsParts';
import PosExpenses from './PosExpenses';
import PosCoupons from './PosCoupons';
import PosBirthdays from './PosBirthdays';
import { AdvanceDone, AdvanceModal, AdvanceOrders, BillDone, CouponPanel, OrderHistory } from './PosOrders';
import { STATES } from '../lib/invoiceFormat';
import { Chips, PeriodFilter, inPeriod, periodRange, todayStr, usePeriod } from '../components/PeriodFilter';
import StaffOnly from '../components/StaffOnly';

// Dhanya POS: the in-store billing module of the admin. Everything the screen shows comes from the API; prices, stock,
// totals and invoice numbers are decided on the server (the totals here are only a live preview).

const toPaise = s => { const n = Math.round(parseFloat(String(s || '').replace(/,/g, '')) * 100); return Number.isFinite(n) && n > 0 ? n : 0 };
const rupees = p => (p / 100).toFixed(2).replace(/\.00$/, '');
const dmy = d => d ? d.split('-').reverse().join('-') : '';
const k = p => p >= 10000000 ? `₹${(p / 10000000).toFixed(1).replace(/\.0$/, '')}Cr` : p >= 100000 ? `₹${(p / 10000000 * 100).toFixed(1).replace(/\.0$/, '')}L` : p >= 100000 / 100 ? `₹${(p / 100000).toFixed(1).replace(/\.0$/, '')}k`.replace(/^₹0\./, '₹0.') : `₹${Math.round(p / 100)}`;
const MODES = [['cash', 'Cash'], ['upi', 'GPay / UPI'], ['card', 'Card'], ['split', 'Split']];
const MODE_LABEL = { cash: 'Cash', upi: 'GPay / UPI', card: 'Card', split: 'Split' };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const TABS = { billing: false, analytics: true, advance: false, orders: false, inventory: true, customers: false, coupons: true, birthdays: true, expenses: true, settings: true };

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

const CheckI = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const ClockI = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;

// ============================ billing ============================
const blankCustom = (service = false) => ({ key: uuid(), custom: true, service, name: '', priceStr: '', qty: 1, taxRate: 5 });
const GST_RATES = [0, 5, 12, 18, 28];

// Browse by category first, then the product, then pick the size to add. (Typing in the search box above still gives the quick flat list.)
function Browse({ onAdd }) {
  const [cats, setCats] = useState(null); const [cat, setCat] = useState(null);
  const [vars, setVars] = useState(null); const [prod, setProd] = useState(null); const [err, setErr] = useState();
  useEffect(() => { api('/categories').then(c => setCats(c.filter(x => x.product_count > 0))).catch(e => setErr(e.message)) }, []);
  useEffect(() => {
    if (!cat) { setVars(null); return }
    let dead = false; setVars(null);
    api('/admin/pos/catalog?limit=300&q=' + encodeURIComponent(cat.name)).then(r => !dead && setVars(r.filter(v => v.category === cat.name))).catch(e => !dead && setErr(e.message));
    return () => { dead = true };
  }, [cat]);
  const products = useMemo(() => {
    const m = new Map();
    for (const v of vars || []) {
      const x = m.get(v.productId) || { id: v.productId, name: v.name, image: v.image, min: v.price, max: v.price, stock: 0, vars: [] };
      x.min = Math.min(x.min, v.price); x.max = Math.max(x.max, v.price); x.stock += v.stock; x.vars.push(v); m.set(v.productId, x);
    }
    return [...m.values()];
  }, [vars]);
  const sel = prod != null ? products.find(x => x.id === prod) : null;
  const back = () => { setErr(); prod != null ? setProd(null) : setCat(null) };
  return (
    <div className="dpos-browse">
      {err && <p className="dpos-err" role="alert">{err}</p>}
      <nav className="dpos-crumb" aria-label="Browse path">
        <button type="button" className={!cat ? 'on' : ''} onClick={() => { setCat(null); setProd(null) }}>Categories</button>
        {cat && <><i aria-hidden="true">›</i><button type="button" className={!sel ? 'on' : ''} onClick={() => setProd(null)}>{cat.name}</button></>}
        {sel && <><i aria-hidden="true">›</i><span className="on">{sel.name}</span></>}
        {cat && <button type="button" className="dpos-btn ghost sm" style={{ marginLeft: 'auto' }} onClick={back}>← Back</button>}
      </nav>
      {!cat && (!cats ? <Empty>Loading categories…</Empty> : !cats.length ? <Empty>No categories yet.</Empty> : (
        <div className="dpos-cats">{cats.map(c => <button key={c.slug} type="button" onClick={() => setCat(c)}><b>{c.name}</b><em>{c.product_count} {c.product_count === 1 ? 'piece' : 'pieces'}</em></button>)}</div>))}
      {cat && !sel && (vars === null ? <Empty>Loading…</Empty> : !products.length ? <Empty>No products in {cat.name}.</Empty> : (
        <div className="dpos-results">{products.map(x => (
          <button key={x.id} type="button" className="dpos-res" disabled={x.stock < 1} onClick={() => setProd(x.id)}>
            {x.image ? <img src={x.image} alt="" loading="lazy" /> : <img alt="" />}
            <span><b>{x.name}</b><em>{x.vars.length} {x.vars.length === 1 ? 'size' : 'sizes'}</em></span>
            <span style={{ textAlign: 'right', flex: 'none' }}><b>{x.min === x.max ? inr(x.min) : `${inr(x.min)} – ${inr(x.max)}`}</b><em>{x.stock < 1 ? 'Out of stock' : `${x.stock} in stock`}</em></span>
          </button>))}</div>))}
      {sel && (
        <div className="dpos-sizes" role="group" aria-label={`Sizes for ${sel.name}`}>
          {sel.vars.map(v => (
            <button key={v.variantId} type="button" disabled={v.stock < 1} onClick={() => onAdd(v)}>
              <b>{v.size}{v.color !== 'Default' ? ` · ${v.color}` : ''}</b><span>{inr(v.price)}</span><em>{v.stock < 1 ? 'Out of stock' : `${v.stock} in stock`}</em>
            </button>))}
        </div>)}
    </div>
  );
}

function Billing({ channel, shop, onSale, onAdvance }) {
  const ws = channel === 'wholesale';
  const [q, setQ] = useState(''); const [results, setResults] = useState(null); const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState(ws ? [blankCustom()] : []);
  const [measureFor, setMeasureFor] = useState(null); // key of the service line whose Measurements window is open
  const [wsItems, setWsItems] = useState([]);
  const [cust, setCust] = useState({ name: '', phone: '', dob: '', address: '' }); const [billDate, setBillDate] = useState(todayStr()); const [source, setSource] = useState('offline');
  const [isGst, setIsGst] = useState(false); const gstTouched = useRef(false); const [gstRate, setGstRate] = useState('item');
  const [disc, setDisc] = useState({ type: 'fixed', value: '' });
  const [coupon, setCoupon] = useState(null); const [couponIn, setCouponIn] = useState(''); const [couponMsg, setCouponMsg] = useState();
  const [delivery, setDelivery] = useState('');
  const [mode, setMode] = useState('cash'); const [tendered, setTendered] = useState('');
  const [split, setSplit] = useState({ cash: '', upi: '', card: '' }); const [splitOn, setSplitOn] = useState({ cash: true, upi: true, card: false }); const [ref, setRef] = useState(''); const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  const key = useRef(null); const [advOpen, setAdvOpen] = useState(false);

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
  const splitAmt = { cash: splitOn.cash ? toPaise(split.cash) : 0, upi: splitOn.upi ? toPaise(split.upi) : 0, card: splitOn.card ? toPaise(split.card) : 0 };
  const splitSum = splitAmt.cash + splitAmt.upi + splitAmt.card;
  const splitOver = Math.max(0, splitSum - bill.total); // change to hand back; it can only come out of the cash taken
  const splitNet = { ...splitAmt, cash: Math.max(0, splitAmt.cash - splitOver) };
  const splitOk = splitSum >= bill.total && (splitOver === 0 || splitAmt.cash >= splitOver);
  const pickedN = Object.values(splitOn).filter(Boolean).length;
  const toggleSplit = m => { if (splitOn[m] && pickedN <= 2) return; if (splitOn[m]) setSplit(s => ({ ...s, [m]: '' })); setSplitOn(o => ({ ...o, [m]: !o[m] })) };

  const body = useMemo(() => ({
    channel, source: ws ? 'offline' : source, billDate,
    items: priced.map(l => l.custom ? { name: l.name.trim(), price: l.price, qty: l.qty, taxRate: l.taxRate, ...(l.service && l.measure ? { measure: l.measure } : {}) } : { variantId: l.variantId, qty: l.qty }),
    customerName: cust.name.trim(), customerPhone: cust.phone.trim(), customerAddress: cust.address.trim(), ...(cust.dob && !ws ? { customerDob: cust.dob } : {}),
    isGst, ...(flat != null ? { gstRate: flat } : {}), ...(coupon ? { couponCode: coupon.code } : { discountType: disc.type, discountValue }), deliveryFee,
    paymentMode: mode, ...(mode === 'cash' ? { cashTendered: tenderedP } : {}),
    ...(mode === 'split' ? { payments: splitNet } : {}),
    ...(ref.trim() ? { paymentRef: ref.trim() } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [channel, ws, source, billDate, priced, cust, isGst, flat, coupon, disc.type, discountValue, deliveryFee, mode, tenderedP, splitNet.cash, splitNet.upi, splitNet.card, ref, notes]);
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

  const problem = !priced.length ? 'Add at least one item.' : mode === 'split' && !splitOk ? (splitSum < bill.total ? `Received ${inr(splitSum)}; the bill is ${inr(bill.total)}.` : 'The extra can only be returned out of the cash amount.')
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

  // Save as advance order: books the items at today's prices with a deposit; stock is taken and the bill is made when the customer collects.
  const saveAdvance = async ({ deposit, depositMode, deliveryDate, notes: n }) => {
    const note = [n, notes.trim()].filter(Boolean).join(' · ');
    const adv = await api('/admin/pos/advances', { method: 'POST', body: { items: body.items, customerName: body.customerName, customerPhone: body.customerPhone, customerAddress: body.customerAddress,
      isGst, ...(flat != null ? { gstRate: flat } : {}), discountType, discountValue, deliveryFee, deposit, depositMode, ...(deliveryDate ? { deliveryDate } : {}), ...(note ? { notes: note } : {}) } });
    setAdvOpen(false); clearOrder(); onAdvance(adv);
  };

  const measureLine = lines.find(l => l.key === measureFor);
  const lineEls = lines.map(l => (
    <div className="dpos-line" key={l.key}>
      {l.custom ? (
        <div className="dpos-grid" style={{ gridTemplateColumns: 'minmax(150px,2fr) minmax(90px,1fr) 90px' }}>
          <input aria-label="Item name or description" placeholder={l.service ? 'Service (alteration, stitching…)' : 'Item name / description…'} list={ws ? 'dpos-ws-list' : undefined} value={l.name} onChange={e => patch(l.key, { name: e.target.value })} />
          <input aria-label="Price in rupees" inputMode="decimal" placeholder="Price ₹" value={l.priceStr} onChange={e => patch(l.key, { priceStr: e.target.value })} />
          <select aria-label="GST rate" value={l.taxRate} onChange={e => patch(l.key, { taxRate: +e.target.value })}>{GST_RATES.map(r => <option key={r} value={r}>{r}% GST</option>)}</select>
          {l.service && <div className="msr-line">
            <button type="button" className="dpos-btn ghost sm" onClick={() => setMeasureFor(l.key)}>📏 {l.measure ? 'Edit measurements' : 'Add measurements'}</button>
            {l.measure && <span className="msr-sum">{measureSummary(l.measure)}</span>}
          </div>}
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
            {q.trim() ? (
              <div className="dpos-results" aria-live="polite">
                {results === null || (searching && !results.length) ? <Empty>Loading…</Empty> : !results.length ? <Empty>No products match “{q}”.</Empty> : results.map(v => (
                  <button key={v.variantId} className="dpos-res" disabled={v.stock < 1} onClick={() => add(v)}>
                    {v.image ? <img src={v.image} alt="" loading="lazy" /> : <img alt="" />}
                    <span><b>{v.name}</b><em>{[v.size, v.color !== 'Default' ? v.color : null].filter(Boolean).join(' · ')} · {v.sku}{v.category ? ` · ${v.category}` : ''}</em></span>
                    <span style={{ textAlign: 'right', flex: 'none' }}><b>{inr(v.price)}</b><em>{v.stock < 1 ? 'Out of stock' : `${v.stock} in stock`}</em></span>
                  </button>))}
              </div>
            ) : <Browse onAdd={add} />}
          </section>)}

        <section className="dpos-card">
          <div className="dpos-head" style={{ marginBottom: 6 }}><h2 style={{ marginBottom: 0 }}><Icon n="orders" />Order items</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="dpos-btn ghost sm" onClick={clearOrder}><Icon n="trash" size={14} />Clear order</button>
              {!ws && <button className="dpos-btn ghost sm" onClick={() => setLines(ls => [...ls, blankCustom(true)])}>✂ Add service</button>}
              <button className="dpos-btn ghost sm" onClick={() => setLines(ls => [...ls, blankCustom()])}>+ Add {ws ? 'item' : 'custom item'}</button></div></div>
          {ws && <datalist id="dpos-ws-list">{wsItems.map(i => <option key={i.id} value={[i.code, i.company, i.colour].filter(Boolean).join(' · ')} />)}</datalist>}
          {lines.length ? lineEls : <Empty>No items yet. Search above to add products.</Empty>}
          {measureLine && <MeasureModal value={measureLine.measure} onClose={() => setMeasureFor(null)} onSave={m => patch(measureLine.key, { measure: m || undefined })} />}
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
          <label className="f" style={{ marginBottom: 16 }}>Note (optional)<input value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} placeholder="Shown on the bill" /></label>
          <div className="dpos-ledger">
            <div className="dpos-lrow"><span>Subtotal ({priced.reduce((t, l) => t + l.qty, 0)} items) <small className="dpos-excl">EXCL. GST</small></span><b>{inr(bill.subtotal)}</b></div>
            {bill.discount > 0 && <div className="dpos-lrow"><span>Discount</span><span>− {inr(bill.discount)}</span></div>}
            <div className="dpos-lrow"><span>Delivery</span><input aria-label="Delivery charge in rupees" inputMode="decimal" value={delivery} onChange={e => setDelivery(e.target.value)} placeholder="0" /></div>
            {(shop?.deliveryPresets || []).length > 0 && <div className="dpos-lrow"><span className="muted small">Quick pick</span><select aria-label="Delivery quick pick" value="" onChange={e => e.target.value !== '' && setDelivery(rupees(+e.target.value))}><option value="">Choose…</option>{shop.deliveryPresets.map((p, i) => <option key={i} value={p.fee}>{p.name} · {inr(p.fee)}</option>)}</select></div>}
          </div>
          <div className="dpos-two" role="radiogroup" aria-label="Invoice type">
            <button role="radio" aria-checked={!isGst} className={!isGst ? 'on' : ''} onClick={() => { gstTouched.current = true; setIsGst(false) }}>Non-GST bill</button>
            <button role="radio" aria-checked={isGst} className={isGst ? 'on' : ''} onClick={() => { gstTouched.current = true; setIsGst(true) }}>GST invoice</button></div>
          {isGst && <>
            <div className="dpos-gstrow"><b>GST <small>(+ ADDED)</small></b>
              <label className="dpos-pct"><input aria-label="GST percentage for the whole bill" inputMode="numeric" value={gstRate === 'item' ? '' : gstRate} placeholder="item" onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 2); setGstRate(v === '' ? 'item' : String(Math.min(28, +v))) }} /> %</label>
              <b className="acc">{inr(bill.tax)}</b></div>
            <p className="sub" style={{ margin: '6px 0 0' }}>{gstRate === 'item' ? 'Each item uses its own GST rate. Type a % to charge one rate on the whole bill.' : `${gstRate}% GST on the whole bill. Clear the box to use each item’s own rate.`}{shop?.gstin ? '' : ' Add your GSTIN in Delivery & GST to print it on invoices.'}</p></>}
          <p className="dpos-flabel">FINANCIAL OPTION</p>
          <div className="dpos-pills" role="radiogroup" aria-label="Payment method">{MODES.map(([v, l]) => <button key={v} role="radio" aria-checked={mode === v} className={mode === v ? 'on' : ''} onClick={() => setMode(v)}>{l.replace('GPay / UPI', 'QR / GPay')}</button>)}</div>
          <hr className="dpos-hr" />
          <div className="dpos-grand"><span>GRAND TOTAL</span><b>{inr(bill.total)}</b></div>
          <div className="dpos-paybox" id="dpos-pay">
            <p className="dpos-pl">{mode === 'upi' ? 'GPAY' : mode.toUpperCase()} PAYMENT</p>
            {mode === 'cash' && <><label className="f">Amount Received (₹)<input className="bigin" inputMode="decimal" value={tendered} onChange={e => setTendered(e.target.value)} placeholder={bill.total ? rupees(bill.total) : '0.00'} /></label>
              <p className="sub" style={{ marginTop: 8 }}>{tenderedP >= bill.total ? `Change to return: ${inr(tenderedP - bill.total)}` : `Short by ${inr(bill.total - tenderedP)}`}</p></>}
            {mode === 'split' && <>
              <p className="dpos-flabel" style={{ marginTop: 0 }}>SPLIT BETWEEN (PICK 2 OR 3)</p>
              <div className="dpos-splitpick" role="group" aria-label="Split between">{['cash', 'upi', 'card'].map(m => <button key={m} type="button" aria-pressed={splitOn[m]} className={splitOn[m] ? 'on' : ''} onClick={() => toggleSplit(m)}>{splitOn[m] ? '✓ ' : ''}{m === 'upi' ? 'QR / GPAY' : MODE_LABEL[m].toUpperCase()}</button>)}</div>
              <div className="dpos-grid" style={{ gridTemplateColumns: `repeat(${pickedN}, 1fr)` }}>{['cash', 'upi', 'card'].filter(m => splitOn[m]).map(m => <label className="f" key={m}>{m === 'upi' ? 'QR / GPay' : MODE_LABEL[m]} (₹)<input className="bigin" inputMode="decimal" value={split[m]} onChange={e => setSplit({ ...split, [m]: e.target.value })} placeholder="0.00" /></label>)}</div>
              <div className="dpos-recv"><span>TOTAL RECEIVED</span><b className={splitSum >= bill.total && bill.total > 0 ? 'ok' : 'short'}>{inr(splitSum)}</b></div>
              <div className="dpos-recv"><span>CHANGE TO RETURN</span><b className="ok">{inr(splitOver)}</b></div></>}
            {mode !== 'cash' && <label className="f" style={{ marginTop: mode === 'split' ? 12 : 0 }}>{mode === 'card' ? 'Slip / approval no.' : 'Transaction ID'} (optional)<input value={ref} onChange={e => setRef(e.target.value)} maxLength={80} /></label>}
          </div>
          <p className="sub" style={{ margin: '8px 2px 14px' }}>GPay / UPI and card are confirmed by the cashier at the counter; no payment gateway is attached.</p>
          <Err>{err}</Err>
          {problem && priced.length > 0 && <p className="sub" role="status" style={{ marginBottom: 10 }}>{problem}</p>}
          <button className="dpos-cta" disabled={!!problem || busy} onClick={submit}><CheckI /> {busy ? 'SAVING…' : 'COMPLETE SALE'}</button>
          {!ws && <button className="dpos-cta amber" disabled={!priced.length || busy} onClick={() => setAdvOpen(true)}><ClockI /> SAVE AS ADVANCE ORDER</button>}
        </section>
      </div>
      <div className="dpos-mbar"><span>{priced.reduce((t, l) => t + l.qty, 0)} items<b>{inr(bill.total)}</b></span>
        <button className="dpos-cta" onClick={() => document.getElementById('dpos-pay')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Review &amp; pay</button></div>
      {advOpen && <AdvanceModal total={bill.total} onClose={() => setAdvOpen(false)} onSave={saveAdvance} />}
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
        <tr key={r.invoiceNo} className={`click ${r.status === 'voided' ? 'voided' : ''}`} tabIndex={0} onClick={() => onOpen(r.invoiceNo, r)} onKeyDown={e => e.key === 'Enter' && onOpen(r.invoiceNo, r)}>
          <td><b>{r.invoiceNo}</b>{r.status === 'voided' && <> <span className="dpos-pill bad">Void</span></>}</td><td>{dmy(r.billDate)}</td>
          <td>{r.customerName || <span className="muted">Walk-in</span>}{r.customerPhone ? <div className="muted small">{r.customerPhone}</div> : null}</td>
          <td><span className="dpos-pill">{r.isGst ? 'GST' : 'Non-GST'}</span> {r.source === 'online' && <span className="dpos-pill ok">Online</span>}</td>
          <td>{MODE_LABEL[r.paymentMode]}</td><td className="r">{r.itemCount}</td><td className="r"><b>{inr(r.total)}</b></td></tr>))}</tbody></table></div>
  );
}
const GST_CHIPS = [['all', 'All bills'], ['gst', 'GST invoices'], ['nongst', 'Non-GST bills']];

// ============================ analytics ============================
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
function Stat({ cls = '', icon, label, value, sub, txt, children, onOpen }) {
  const open = onOpen ? { role: 'button', tabIndex: 0, onClick: onOpen, onKeyDown: e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen()), 'aria-label': `${label}: open details` } : {};
  return <div className={`dpos-card2 ${cls} ${onOpen ? 'openable' : ''}`} {...open}><div className="t"><span>{label}</span><span className="ic"><Icon n={icon} size={16} /></span></div><div className={`v ${txt ? 'txt' : ''}`}>{value}</div>{sub && <div className="s">{sub}</div>}{onOpen && <div className="s more">View details →</div>}{children}</div>;
}
function Chart({ values, labels, cap }) {
  const max = Math.max(1, ...values);
  return <div className={`dpos-ch ${cap ? 'cap' : ''}`} role="img" aria-label="Revenue chart">{values.map((v, i) => <div className="c" key={i}><div className="col">{v > 0 && <em>{k(v)}</em>}<i style={{ height: `${Math.max(v ? 4 : 0, v / max * 100)}%` }} /></div><span>{labels[i]}</span></div>)}</div>;
}

const SearchGlyph = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>;

// "Today's sales" tab: the day's transactions with a search, the channel split and the top items.
function TodayPanels({ rep, bills, openInvoice }) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const rows = bills && bills.filter(b => !needle || `${b.invoiceNo} ${b.customerPhone || ''} ${b.customerName || ''}`.toLowerCase().includes(needle));
  const off = rep?.offlineSales || 0, on = rep?.onlineSales || 0, mx = Math.max(off, on, 1);
  const top = (rep?.products || []).slice(0, 5), topMax = Math.max(1, ...top.map(p => p.revenue));
  return (
    <div className="an-today">
      <section className="dpos-card">
        <div className="an-head"><h2>Today’s Transactions</h2>
          <label className="an-search"><SearchGlyph /><span className="sr">Search transactions</span><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search contact/invoice…" /></label></div>
        {!rows ? <Empty>Loading…</Empty> : !rows.length ? <Empty>{needle ? 'No transactions match.' : 'No bills today yet.'}</Empty> : (
          <div className="dpos-tw"><table><thead><tr><th>Invoice ID</th><th>Customer No</th><th>Source</th><th className="r">Items</th><th className="r">Grand total</th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.invoiceNo} className={`click ${r.status === 'voided' ? 'voided' : ''}`} tabIndex={0} onClick={() => openInvoice(r.invoiceNo, r)} onKeyDown={e => e.key === 'Enter' && openInvoice(r.invoiceNo, r)}>
                <td><b>{r.invoiceNo}</b></td><td>{r.customerPhone || <span className="muted">—</span>}</td>
                <td><span className="an-src">{r.source === 'online' ? 'ONLINE' : 'OFFLINE'}</span></td>
                <td className="r">{r.itemCount} pcs</td><td className="r an-red">{inr(r.total)}</td></tr>))}</tbody></table></div>)}
      </section>
      <div className="an-side">
        <section className="dpos-card"><h2>Today’s Channel Split</h2>
          {[['Offline', off, '#1c1c1f'], ['Online', on, '#0a8a5c']].map(([l, n, c]) => (
            <div className="an-bar" key={l}><span style={{ color: c }}>{l.toUpperCase()}</span><i><u style={{ width: `${n / mx * 100}%`, background: c }} /></i><b>{inr(n)}</b></div>))}
        </section>
        <section className="dpos-card"><h2>Today’s Top Items</h2>
          {!top.length ? <Empty>No sales today yet.</Empty> : top.map((p, i) => (
            <div className="an-top" key={p.name}><b>{i + 1}</b><div><div className="an-toprow"><span>{p.name}</span><em>{inr(p.revenue)}</em></div><i><u style={{ width: `${p.revenue / topMax * 100}%` }} /></i></div><span>{p.qty} pcs</span></div>))}
        </section>
      </div>
    </div>
  );
}

// "Products" tab: every product ranked by revenue, with its share of all product revenue.
function ProductsBoard({ rep }) {
  const [q, setQ] = useState('');
  const all = rep?.products || []; const total = all.reduce((s, p) => s + p.revenue, 0) || 1;
  const needle = q.trim().toLowerCase();
  const rows = all.map((p, i) => ({ ...p, rank: i + 1 })).filter(p => !needle || p.name.toLowerCase().includes(needle));
  return (
    <section className="dpos-card">
      <div className="an-head"><h2>Product Sales Leaderboard</h2>
        <label className="an-search"><SearchGlyph /><span className="sr">Search product</span><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search product…" /></label></div>
      {!rep ? <Empty>Loading…</Empty> : !all.length ? <Empty>No sales in this period.</Empty> : !rows.length ? <Empty>No product matches.</Empty> : (
        <div className="dpos-tw"><table><thead><tr><th>Rank</th><th>Product name</th><th className="r">Qty sold</th><th className="r">Revenue</th><th>Market share</th></tr></thead>
          <tbody>{rows.map(p => { const pct = p.revenue / total * 100; return (
            <tr key={p.name}><td><b>{p.rank}</b></td><td><b>{p.name}</b></td><td className="r"><b>{p.qty} pcs</b></td><td className="r an-red">{inr(p.revenue)}</td>
              <td><div className="an-share"><i><u style={{ width: `${pct}%` }} /></i><span>{pct.toFixed(1)}%</span></div></td></tr>) })}</tbody></table></div>)}
    </section>
  );
}

// Opens from the Net profit and Total expenses boxes: where the money went, by category and entry.
function MoneyDetail({ kind, rep, from, to, onClose, goExpenses }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api(`/admin/pos/expenses?from=${from}&to=${to}`).then(setRows).catch(() => setRows([])) }, [from, to]);
  const cats = rep.expenseByCategory || [];
  return (
    <Modal wide className="money" title={kind === 'net' ? 'Net profit, step by step' : 'Where the money went'} sub={`${dmy(from)} to ${dmy(to)}`} onClose={onClose}>
      <div className="money-sum">
        <div><span>Sales (revenue)</span><b>{inr(rep.revenue)}</b></div>
        {rep.costs?.enabled && <div><span>− Cost of goods sold</span><b className="neg">{inr(rep.cogs)}</b></div>}
        <div><span>− Expenses</span><b className="neg">{inr(rep.expenses)}</b></div>
        <div className="tot"><span>= Net profit</span><b className={rep.net < 0 ? 'neg' : 'pos'}>{inr(rep.net)}</b></div>
      </div>
      <h4 className="money-h">Spend by category</h4>
      {!cats.length ? <p className="dpos-empty">No expenses in this period.</p> : <ul className="ex-bars">{cats.map(c => <li key={c.category}><span>{c.category}</span><i><u style={{ width: `${c.amount / cats[0].amount * 100}%` }} /></i><b>{inr(c.amount)}</b></li>)}</ul>}
      <h4 className="money-h">Every expense</h4>
      {!rows ? <p className="dpos-empty">Loading…</p> : !rows.length ? <p className="dpos-empty">Nothing recorded.</p> : (
        <div className="dpos-tw" style={{ maxHeight: 260, overflow: 'auto' }}><table><thead><tr><th>Date</th><th>Expense</th><th>Category</th><th className="r">Amount</th></tr></thead>
          <tbody>{rows.map(x => <tr key={x.id}><td>{dmy(x.date)}</td><td><b>{x.title}</b></td><td>{x.category}</td><td className="r"><b>{inr(x.amount)}</b></td></tr>)}</tbody></table></div>)}
      <div style={{ marginTop: 14 }}><button type="button" className="dpos-btn" onClick={() => { onClose(); goExpenses() }}>Open Expense Tracker</button></div>
    </Modal>
  );
}

function Analytics({ channel, openInvoice, tick, goExpenses }) {
  const ws = channel === 'wholesale';
  const [tab, setTab] = useState('revenue'); const [gst, setGst] = useState('all'); const [per, setPer] = usePeriod('all');
  const [rep, setRep] = useState(null); const [bills, setBills] = useState(null); const [err, setErr] = useState(); const [detail, setDetail] = useState(null);
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
          <Stat cls="net" icon="wallet" label="Net profit" value={v(r => r.net < 0 ? `− ${inr(-r.net)}` : inr(r.net))} sub={ws ? 'Wholesale sales' : 'Sales − Expenses'} onOpen={!ws && rep ? () => setDetail('net') : undefined} />
          <Stat cls="gstc" icon="doc" label="GST sales" value={v(r => inr(r.gstSales))} sub={v(r => `${r.gstBills} GST invoices`, ' ')} />
          <Stat cls="nong" icon="trend" label="Non-GST sales" value={v(r => `+ ${inr(r.nonGstSales)}`)} sub={v(r => `${r.nonGstBills} ${ws ? 'wholesale' : 'retail'} bills`, ' ')} />
          {!ws && <Stat cls="exp" icon="wallet" label="Total expenses" value={v(r => `− ${inr(r.expenses)}`)} sub={v(r => r.expenseByCategory?.length ? `${r.expenseByCategory.length} categor${r.expenseByCategory.length === 1 ? 'y' : 'ies'} · top: ${r.expenseByCategory[0].category}` : 'No expenses yet', ' ')} onOpen={rep ? () => setDetail('expenses') : undefined} />}
        </div>
        {!ws && rep && <div className="dpos-formula"><span><b className="tag">Calculation formula</b> &nbsp;Sales ({inr(rep.revenue)}){rep.costs?.enabled ? ` − Cost of goods (${inr(rep.cogs)})` : ''} − Expenses ({inr(rep.expenses)})</span><span>= Net profit: <span className="np">{rep.net < 0 ? `− ${inr(-rep.net)}` : inr(rep.net)}</span></span></div>}
        {!ws && rep && (
          <div className="cost-row">
            <div className="cost-card teal"><div className="cc-t"><span>TOTAL COST PRICE (STOCK IN HAND)</span><i><Icon n="box" size={22} /></i></div>
              <b>{inr(rep.costs.stockCost)}</b><small>{rep.costs.enabled ? `Cost price × current stock · ${rep.costs.stockProducts} product${rep.costs.stockProducts === 1 ? '' : 's'} in stock` : 'Add each product’s cost price in Inventory → Edit'}</small></div>
            <div className="cost-card amber"><div className="cc-t"><span>COST PRICE OF PRODUCTS SOLD</span><i><Icon n="swap" size={22} /></i></div>
              <b>{inr(rep.costs.soldCost)}</b><small>{rep.costs.enabled ? <>Cost price × qty sold · {rep.costs.soldUnits} unit{rep.costs.soldUnits === 1 ? '' : 's'} · Margin <em className={rep.costs.margin < 0 ? 'neg' : ''}>{inr(rep.costs.margin)}</em></> : 'Cost prices are not set up yet'}</small></div>
          </div>)}
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

      {tab === 'today' && <TodayPanels rep={rep} bills={bills} openInvoice={openInvoice} />}

      {tab === 'products' && <ProductsBoard rep={rep} />}

      {tab === 'coupons' && <CouponPanel rep={rep} openInvoice={openInvoice} />}
      {detail && rep && <MoneyDetail kind={detail} rep={rep} from={from} to={to} onClose={() => setDetail(null)} goExpenses={goExpenses} />}
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
// ============================ coupons ============================

// ============================ birthdays ============================

// ============================ delivery & GST settings ============================
function Settings({ onSaved }) {
  const [s, setS] = useState(null); const [err, setErr] = useState(); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { api('/admin/pos/settings').then(setS).catch(e => setErr(e.message)) }, []);
  useEffect(() => { if (s) document.documentElement.style.setProperty('--pos-accent', s.accent || '') }, [s?.accent]); // eslint-disable-line
  if (!s) return err ? <Err>{err}</Err> : <Empty>Loading…</Empty>;
  const preset = (i, p) => setS({ ...s, deliveryPresets: s.deliveryPresets.map((x, n) => n === i ? { ...x, ...p } : x) });
  const save = async e => {
    e.preventDefault(); setBusy(true); setErr(); setOk(false);
    try { const out = await api('/admin/pos/settings', { method: 'PUT', body: { ...s, gstin: s.gstin.trim().toUpperCase(), deliveryPresets: s.deliveryPresets.filter(p => p.name.trim()).map(p => ({ name: p.name.trim(), fee: p.fee })) } }); setS(out); setOk(true); onSaved() }
    catch (x) { setErr(x.issues?.[0]?.message || x.message) } finally { setBusy(false) }
  };
  const f = (k, label, extra = {}) => <label className="f">{label}<input value={s[k] || ''} maxLength={extra.max || 80} inputMode={extra.mode} type={extra.type} placeholder={extra.ph} onChange={e => setS({ ...s, [k]: e.target.value })} /></label>;
  return (
    <div className="pset">
      <section className="dpos-card pset-top"><span className="pset-ico"><Icon n="gear" /></span><div><h2 style={{ margin: 0 }}>Shop settings</h2><p className="sub">Update the shop profile, logo, colour and stock alerts used across the POS and invoices.</p></div></section>
      <form onSubmit={save} className="pset-grid">
        <div className="pset-col">
          <AccentPicker value={s.accent || ''} onChange={v => setS({ ...s, accent: v })} />
          <StockAlertsCard />
        </div>
        <div className="pset-col">
          <section className="dpos-card"><h2><Icon n="shop" />Shop profile</h2>
            <p className="sub" style={{ marginBottom: 10 }}>Printed on POS bills. Leave a box empty to use your website’s store details.</p>
            <div className="dpos-grid">{f('ownerName', 'Shop owner name')}{f('shopName', 'Shop name')}</div>
            <div className="dpos-grid">{f('shopPhone', 'Contact number', { max: 30, mode: 'tel', ph: '98765 43210' })}{f('shopEmail', 'Email ID', { max: 120, type: 'email', ph: 'shop@example.com' })}</div>
            <div className="dpos-grid">{f('ownerPhone', 'Owner phone number', { max: 30, mode: 'tel' })}{f('whatsapp', 'WhatsApp number', { max: 30, mode: 'tel', ph: 'Same as contact number' })}</div>
            <label className="f">Shop address (one line per row)<textarea rows={3} maxLength={400} value={s.shopAddress || ''} onChange={e => setS({ ...s, shopAddress: e.target.value })} placeholder={'Street, area\nCity - PIN'} /></label>
            <div className="dpos-grid">{f('city', 'City / location', { max: 80 })}{f('hours', 'Business hours', { max: 120, ph: 'e.g. Open daily, 10 AM – 9 PM' })}</div>
            <div className="dpos-grid">{f('shopNameTamil', 'Shop name (Tamil)')}{f('instagram', 'Instagram ID', { max: 60, ph: 'yourshop.official' })}</div>
            <label className="f">GSTIN (on GST invoices)<input value={s.gstin} onChange={e => setS({ ...s, gstin: e.target.value })} maxLength={15} placeholder="Optional · 15 characters" style={{ fontFamily: 'monospace' }} /></label>
            <LogoCard />
          </section>
        </div>
        <div className="pset-wide">
        <section className="dpos-card"><h2><Icon n="doc" />GST &amp; invoice number</h2>
          <p className="sub" style={{ marginBottom: 12 }}>Your GSTIN is in Shop profile above. Turn it on per bill type here. Amounts are unchanged.</p>
          <div className="dpos-grid" style={{ marginTop: 12 }}>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}><input type="checkbox" checked={s.showGstRetail} onChange={e => setS({ ...s, showGstRetail: e.target.checked })} /><span><b>Show on retail invoices</b><br /><span className="muted small">POS bills</span></span></label>
          </div>
          <div className="dpos-grid" style={{ marginTop: 14 }}>
            <label className="f">State · place of supply (printed on invoices)<select value={s.state || 'Tamil Nadu (33)'} onChange={e => setS({ ...s, state: e.target.value })}>{STATES.map(x => <option key={x}>{x}</option>)}</select></label>
          </div>
          <label className="f" style={{ marginTop: 14 }}>Terms &amp; notes printed on the invoice (one point per line)<textarea rows={3} maxLength={600} value={s.terms || ''} onChange={e => setS({ ...s, terms: e.target.value })} placeholder="e.g. Custom-stitched and altered garments are made to order and are non-returnable." /></label>
          <p className="sub" style={{ marginTop: 12 }}>Invoice numbers are created automatically, like INV-2026-G3AKL.</p>
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
        </div>
      </form>
      <LoginPasswordCard />
      <StaffAccessCard />
    </div>
  );
}

// ============================ page ============================
export default function AdminPos() {
  const { user, authReady } = useApp();
  const { tab = 'billing' } = useParams();
  const nav = useNavigate();
  const [shop, setShop] = useState(null); const [done, setDone] = useState(null); const [advDone, setAdvDone] = useState(null); const [tick, setTick] = useState(0); const [err, setErr] = useState();
  const allowed = user && ['owner', 'admin', 'cashier'].includes(user.role);
  const manager = !!user && ['owner', 'admin'].includes(user.role);
  const stocker = !!user && ['owner', 'admin', 'inventory'].includes(user.role);
  const loadShop = useCallback(() => api('/admin/pos/shop').then(setShop).catch(e => setErr(e.message)), []);
  useEffect(() => { if (allowed) loadShop() }, [allowed, loadShop]);
  useEffect(() => { document.documentElement.style.setProperty('--pos-accent', shop?.accent || ''); return () => document.documentElement.style.removeProperty('--pos-accent') }, [shop?.accent]);
  // The invoice is a page of its own (/invoice/<token>): print it, share it, copy its link.
  const openInvoice = useCallback((no, row) => row?.shareToken ? nav('/invoice/' + row.shareToken) : api('/admin/pos/sales/' + encodeURIComponent(no)).then(x => nav('/invoice/' + x.shareToken)).catch(e => setErr(e.message)), [nav]);

  if (!authReady) return <div className="page-pad"><p className="muted">Loading…</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!allowed) return <StaffOnly />;
  if (!(tab in TABS) || (TABS[tab] && !manager)) return <Navigate to="/admin/billing" replace />;

  const onSale = sale => { setDone(sale); setTick(t => t + 1) };
  const onAdvance = adv => { setTick(t => t + 1); setAdvDone(adv) }; // the saved advance order is kept in Advance Orders; its receipt shows first
  const onBilled = (sale, invoiceNo) => { setTick(t => t + 1); if (sale) setDone(sale); else if (invoiceNo) openInvoice(invoiceNo) };
  const goExpenses = () => { window.location.assign('/admin/billing/expenses') };
  const body = {
    billing: <Billing channel="retail" shop={shop} onSale={onSale} onAdvance={onAdvance} />,
    analytics: <Analytics channel="retail" openInvoice={openInvoice} tick={tick} goExpenses={goExpenses} />,
    advance: <AdvanceOrders manager={manager} tick={tick} onBilled={onBilled} />,
    orders: <OrderHistory manager={manager} tick={tick} openInvoice={openInvoice} onChanged={() => setTick(t => t + 1)} />,
    inventory: <PosInventory manager={manager} stocker={stocker} />, customers: <Customers manager={manager} />, coupons: <PosCoupons />, birthdays: <PosBirthdays shop={shop} CustomerModal={CustomerModal} />,
    expenses: <PosExpenses />, settings: <Settings onSaved={loadShop} />,
  }[tab];
  const sub = {
    billing: 'Quick invoice generator · stock synced with the online store · for in-store (offline) and online-order billing', analytics: 'All bills — full store & channel insights', advance: 'Orders booked with a deposit, billed when the customer collects', orders: 'Manage and track past invoices',
    inventory: 'Manage products and stock — add, edit and adjust', customers: 'Customer details with date of birth', coupons: 'Discount codes for the till', birthdays: 'Customers to wish and reward',
    expenses: 'Record spending by category and see your real net profit', settings: 'POS logo, shop details on bills, GST number and delivery quick picks',
  }[tab];
  const title = { billing: 'POS Billing Panel', analytics: 'Revenue Analytics', orders: 'Order History', inventory: 'Inventory', advance: 'Advance Orders', customers: 'Customers', coupons: 'Coupons', birthdays: 'Date of Birth', expenses: 'Expense Tracker', settings: 'Settings' }[tab];
  return (
    <AdminShell title={title} sub={sub}>
      <Err>{err}</Err>
      {body}
      {allowed && <LowStockAlert />}
      {done && <BillDone sale={done} shop={shop} onClose={() => setDone(null)} />}
      {advDone && <AdvanceDone adv={advDone} shop={shop} onClose={() => setAdvDone(null)} onView={() => { setAdvDone(null); nav('/admin/billing/advance') }} />}
    </AdminShell>
  );
}
