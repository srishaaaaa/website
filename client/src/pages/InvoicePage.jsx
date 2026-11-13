import { useEffect, useState } from 'react';
import ReturnWindow from '../components/ReturnWindow';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../context/App';
import { DEFAULT_LOGO } from '../components/Wordmark';
import PrintSettings, { readPrintPrefs } from '../components/PrintSettings';
import { PrintIcon } from '../components/PrintIcon';
import { CHANNEL, MODE, clock, inWords, longDate, money, num2 } from '../lib/invoiceFormat';
import { measureSummary } from '../components/MeasureModal';
import { billRows, modeName } from '../lib/billSummary';
import Modal from '../components/Modal';
import '../invoice.css';

const phoneShown = p => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? `+91 ${d}` : p || '' };
const amt = v => v < 0 ? `- ${money(-v)}` : money(v);

// The full A4 / A5 invoice.
function A4Doc({ sale, shop }) {
  const showGst = shop.gstin && shop.showGst?.[sale.channel];
  const terms = String(shop.terms || '').split('\n').map(t => t.trim()).filter(Boolean);
  return (
    <article className="inv-doc">
      {sale.status === 'voided' && <div className="inv-void" aria-hidden="true">VOID</div>}
      <header className="inv-head">
        <div className="inv-brand">
          <div className="inv-logo"><img src={shop.logo || DEFAULT_LOGO} alt="" /></div>
          <div>
            <h1>{shop.name}</h1>
            <p className="inv-addr">{(shop.address || []).join(', ')}</p>
            {shop.phone && <p>Phone: {phoneShown(shop.phone)}</p>}
            {shop.email && <p>Email: {shop.email}</p>}
            {showGst && <p>GSTIN: <b>{shop.gstin}</b></p>}
          </div>
        </div>
        <div className="inv-meta">
          <h2>{sale.isGst ? 'TAX INVOICE' : 'INVOICE'}</h2>
          <p className="inv-no">#{sale.invoiceNo}</p>{sale.editedAt && <p className="inv-edited">EDITED</p>}
          <dl>
            <div><dt>Date:</dt><dd>{longDate(sale.billDate)}</dd></div>
            <div><dt>Time:</dt><dd>{clock(sale.createdAt)}</dd></div>
            <div><dt>Payment:</dt><dd>{MODE[sale.paymentMode].toUpperCase()} • {sale.status === 'voided' ? 'VOID' : 'COMPLETED'}</dd></div>
            <div><dt>Channel:</dt><dd>{CHANNEL(sale)}</dd></div>
          </dl>
        </div>
      </header>
      {sale.returns?.length > 0 && <div className="inv-retbanner" role="note"><b>{sale.items.every(i => (i.returnedQty || 0) >= i.quantity) ? 'RETURNED: every item on this bill has been returned' : 'PARTLY RETURNED: some items on this bill have been returned'}</b>
        <span>{sale.returns.map(r => <a key={r.returnNo} href={`/invoice/${r.shareToken}`}>{r.returnNo} · {money(r.total)}</a>)}</span></div>}
      <hr className="inv-rule" />
      <section className="inv-bill">
        <div><p className="inv-l">BILLED TO</p><b className="inv-who">{sale.customerName || 'Walk-in Customer'}</b>{sale.customerPhone && <p className="inv-sm">{phoneShown(sale.customerPhone)}</p>}{sale.customerAddress && <p className="inv-sm">{sale.customerAddress}</p>}</div>
        <div className="inv-r"><p className="inv-l">PLACE OF SUPPLY</p><b>{shop.state}</b></div>
      </section>
      <table className="inv-items">
        <thead><tr><th>#</th><th>ITEM DESCRIPTION</th><th className="c">QTY</th><th className="r">RATE (₹)</th><th className="r">AMOUNT (₹)</th></tr></thead>
        <tbody>{sale.items.map((i, n) => (
          <tr key={n}><td className="n">{n + 1}</td>
            <td><b>{i.name}</b>{i.variant?.size ? <span className="inv-var"> ({i.variant.size}{i.variant.color && i.variant.color !== 'Default' ? `, ${i.variant.color}` : ''})</span> : null}{i.variant?.measure && <span className="inv-msr">{measureSummary(i.variant.measure)}</span>}</td>
            <td className="c mono">{i.quantity}{i.returnedQty > 0 && <small className="inv-ret">returned {i.returnedQty}</small>}</td><td className="r mono muted">{num2(i.unitPrice)}</td><td className="r mono"><b>{num2(i.lineTotal)}</b></td></tr>))}</tbody>
      </table>
      <section className="inv-foot">
        <div className="inv-words">
          <p className="inv-l">AMOUNT IN WORDS</p>
          <p className="inv-wd">{inWords(sale.total)}</p>
          <p className="inv-recv">{sale.status === 'voided' ? 'VOID — this bill was cancelled' : <>Paid: <b className="mono">{money(sale.total)}</b><br /><span>{modeName(sale)}</span></>}</p>
          {(terms.length > 0 || sale.notes) && <div className="inv-terms"><b>Terms &amp; Notes:</b>{terms.map((t, i) => <p key={i}>• {t}</p>)}{sale.notes && <p>• {sale.notes}</p>}</div>}
        </div>
        <div className="inv-sum">
          {billRows(sale).map((r, n) => r.kind === 'total'
            ? <div key={n} className="inv-total"><span>TOTAL</span><b>{money(r.value)}</b></div>
            : <div key={n} className={`inv-k-${r.kind}`}><span>{r.label}{r.note && <small> {r.note}</small>}</span>{r.value != null && <b className="mono">{amt(r.value)}</b>}</div>)}
          {sale.discount > 0 && <p className="inv-saved">You saved {money(sale.discount)} on this bill</p>}
        </div>
      </section>
      {sale.returns?.length > 0 && <div className="inv-returns"><b>RETURNS AGAINST THIS INVOICE</b>{sale.returns.map(r => <p key={r.returnNo}><span>{r.returnNo} · {longDate(String(r.createdAt).slice(0, 10))}</span><span>{money(r.total)} refunded by {MODE[r.refundMode] || r.refundMode}</span></p>)}</div>}
      <hr className="inv-rule thin" />
      <footer className="inv-end">
        <p>Thank you for your visit! • {shop.name}</p>
        <div className="inv-sign"><span>Authorised Signatory</span><small>For {shop.name}</small></div>
      </footer>
    </article>
  );
}

// The thermal roll receipt (58 or 80 mm).
function Thermal({ sale, shop, paper }) {
  const showGst = shop.gstin && shop.showGst?.[sale.channel];
  const row = (l, v, cls = '') => <div className={`inv-tr ${cls}`}><span>{l}</span><span>{v}</span></div>;
  return (
    <article className={`inv-th w${paper}`}>
      {sale.status === 'voided' && <p className="inv-th-void">*** VOID ***</p>}
      <h1>{shop.name}</h1>
      <p className="c">{(shop.address || []).join(', ')}</p>
      {shop.phone && <p className="c">Ph: {phoneShown(shop.phone)}</p>}
      {showGst && <p className="c">GSTIN: {shop.gstin}</p>}
      <hr />
      {row('INVOICE', `#${sale.invoiceNo}`, 'b')}
      {row('Date:', `${longDate(sale.billDate)} ${clock(sale.createdAt)}`)}
      {row('Customer:', sale.customerName || 'Guest', 'cb')}
      <hr />
      <div className="inv-tr b"><span>Item</span><span className="q">Qty</span><span>Amt</span></div>
      <hr className="soft" />
      {sale.items.map((i, n) => (
        <div key={n} className="inv-ti"><div className="inv-tr"><span className="nm">{i.name}</span><span className="q">{i.quantity}</span><span>{num2(i.lineTotal)}</span></div><hr className="soft" /></div>))}
      {billRows(sale).map((r, n) => r.kind === 'total'
        ? <div key={n}><hr />{row('TOTAL:', money(r.value), 'tot')}<hr /></div>
        : <div key={n}>{row(r.kind === 'paysub' ? `  ${r.label}` : r.label, r.value == null ? '' : r.value < 0 ? `- ${num2(-r.value)}` : num2(r.value), r.kind === 'paysub' ? 'sub' : r.kind === 'pay' || r.kind === 'strong' ? 'b' : r.kind === 'muted' ? 'sub' : '')}</div>)}
      <hr className="soft" />
      <p className="c words">{inWords(sale.total).toUpperCase()}</p>
      <p className="c thanks">Thank you for your business!</p>
    </article>
  );
}

// The credit note for a return: what came back, what the customer kept, and the refund.
function ReturnDoc({ ret, shop }) {
  const gst = ret.isGst && ret.tax > 0;
  const half = Math.floor(ret.tax / 2);
  const row = (label, v, cls = '') => <div className={cls}><span>{label}</span><b className="mono">{v}</b></div>;
  return (
    <article className="inv-doc">
      <div className="inv-retbanner" role="note"><b>RETURN INVOICE for bill #{ret.invoiceNo}</b>{ret.origToken && <span><a href={`/invoice/${ret.origToken}`}>View the original bill #{ret.invoiceNo}</a>{ret.otherReturns?.map(o => <i key={o.returnNo}> · {o.returnNo}</i>)}</span>}</div>
      <header className="inv-head">
        <div className="inv-brand"><div className="inv-logo"><img src={shop.logo || DEFAULT_LOGO} alt="" /></div>
          <div><h1>{shop.name}</h1><p className="inv-addr">{(shop.address || []).join(', ')}</p>{shop.phone && <p>Phone: {phoneShown(shop.phone)}</p>}</div></div>
        <div className="inv-meta"><h2>RETURN INVOICE</h2><p className="inv-no">#{ret.returnNo}</p>
          <dl><div><dt>Date:</dt><dd>{longDate(String(ret.createdAt).slice(0, 10))}</dd></div><div><dt>Time:</dt><dd>{clock(ret.createdAt)}</dd></div>
            <div><dt>Original:</dt><dd>#{ret.invoiceNo} · {longDate(ret.billDate)}</dd></div><div><dt>Type:</dt><dd>CREDIT NOTE</dd></div></dl></div>
      </header>
      <hr className="inv-rule" />
      <section className="inv-bill"><div><p className="inv-l">CUSTOMER</p><b className="inv-who">{ret.customerName || 'Walk-in Customer'}</b>{ret.customerPhone && <p className="inv-sm">{phoneShown(ret.customerPhone)}</p>}</div></section>
      <p className="inv-l" style={{ marginTop: 18 }}>ITEMS RETURNED</p>
      <table className="inv-items"><thead><tr><th>#</th><th>ITEM</th><th className="c">QTY</th><th className="r">RATE (₹)</th><th className="r">AMOUNT (₹)</th></tr></thead>
        <tbody>{ret.returned.map((i, n) => <tr key={n}><td className="n">{n + 1}</td><td><b>{i.name}</b>{i.variant?.size ? <span className="inv-var"> ({i.variant.size}{i.variant.color && i.variant.color !== 'Default' ? `, ${i.variant.color}` : ''})</span> : null}</td><td className="c mono">{i.qty} of {i.sold}</td><td className="r mono muted">{num2(i.unitPrice)}</td><td className="r mono"><b>{num2(i.amount)}</b></td></tr>)}</tbody></table>
      <p className="inv-l" style={{ marginTop: 18 }}>ITEMS NOT RETURNED (KEPT BY THE CUSTOMER)</p>
      {ret.kept.length ? <table className="inv-items"><tbody>{ret.kept.map((i, n) => <tr key={n}><td className="n">{n + 1}</td><td><b>{i.name}</b></td><td className="c mono">{i.qty} of {i.sold}</td><td className="r mono muted">{num2(i.unitPrice)}</td></tr>)}</tbody></table>
        : <p className="inv-sm">Nothing — every item on invoice #{ret.invoiceNo} has now been returned.</p>}
      <section className="inv-foot"><div className="inv-words"><p className="inv-l">REFUND IN WORDS</p><p className="inv-wd">{inWords(ret.total)}</p>
          {ret.reason && <p className="inv-sm">Reason: {ret.reason}</p>}
          {ret.otherReturns?.length > 0 && <div className="inv-terms"><b>Other returns on this invoice:</b>{ret.otherReturns.map(r => <p key={r.returnNo}>• {r.returnNo} · {money(r.total)}</p>)}</div>}</div>
        <div className="inv-sum">
          {row('Returned items value', money(ret.subtotal), 'inv-k-row')}
          {ret.discount > 0 && row(ret.couponCode ? 'Coupon discount reversed' : 'Discount reversed', `- ${money(ret.discount)}`, 'inv-k-row')}
          {gst && <>{row('TAXABLE VALUE', money(ret.subtotal - ret.discount), 'inv-k-muted')}{row('CGST reversed', money(half), 'inv-k-row')}{row('SGST reversed', money(ret.tax - half), 'inv-k-row')}</>}
          <div className="inv-total"><span>REFUND TOTAL</span><b>{money(ret.total)}</b></div>
          {ret.refundMode === 'split' ? <>{ret.refundCash > 0 && row('Refunded in cash', money(ret.refundCash), 'inv-k-pay')}{ret.refundUpi > 0 && row('Refunded by GPay / UPI', money(ret.refundUpi), 'inv-k-pay')}{ret.refundCard > 0 && row('Refunded by card', money(ret.refundCard), 'inv-k-pay')}</> : row(`Refunded by ${MODE[ret.refundMode] || ret.refundMode}`, money(ret.total), 'inv-k-pay')}
          <p className="inv-saved">{ret.deliveryFee > 0 ? `Delivery charge ${money(ret.deliveryFee)} is never refunded` : 'Delivery charge is never refunded'}</p>{ret.approvedBy && <p className="inv-sm">Refund approved by {ret.approvedBy}</p>}</div></section>
      <hr className="inv-rule thin" />
      <footer className="inv-end"><p>This credit note is issued against invoice #{ret.invoiceNo}. • {shop.name}</p><div className="inv-sign"><span>Authorised Signatory</span><small>For {shop.name}</small></div></footer>
    </article>
  );
}

const PAGE = { a4: 'A4; margin: 10mm', a5: 'A5; margin: 8mm', 80: '80mm auto; margin: 2mm', 58: '58mm auto; margin: 2mm' };

export default function InvoicePage() {
  const { token } = useParams(); const [qs] = useSearchParams(); const { user } = useApp();
  const [d, setD] = useState(null); const [err, setErr] = useState(); const [copied, setCopied] = useState(false); const [ps, setPs] = useState(false); const [busy, setBusy] = useState(false); const [ret, setRet] = useState(false); const nav = useNavigate();
  const wantsThermal = qs.get('fmt') === 'thermal';
  const [fmt, setFmt] = useState(wantsThermal ? 'thermal' : 'a4');
  const [paper, setPaper] = useState(qs.get('size') || (wantsThermal ? readPrintPrefs().paper : 'a4'));
  const load = () => api('/invoice/' + encodeURIComponent(token)).then(setD).catch(e => setErr(e.message));
  useEffect(() => { load() }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // the paper the browser prints on
    let el = document.getElementById('inv-page-size'); if (!el) { el = document.createElement('style'); el.id = 'inv-page-size'; document.head.appendChild(el) }
    el.textContent = `@page { size: ${PAGE[paper] || PAGE.a4} }`;
  }, [paper]);
  useEffect(() => { if (d && qs.get('print') === '1') { const t = setTimeout(() => window.print(), 700); return () => clearTimeout(t) } }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = d ? (d.kind === 'return' ? `Return ${d.ret.returnNo} · ${d.shop.name}` : `Invoice ${d.sale.invoiceNo} · ${d.shop.name}`) : 'Invoice' }, [d]);

  if (err) return <div className="inv-page"><p className="inv-err">{err}</p></div>;
  if (!d) return <div className="inv-page"><p className="inv-err">Loading invoice…</p></div>;
  const { shop } = d;
  if (d.kind === 'return') return (
    <div className="inv-page">
      {window.self === window.top && <div className="inv-bar"><Link className="inv-btn" to={`/invoice/${d.ret.invoiceNo ? '' : ''}`} onClick={e => { e.preventDefault(); history.back() }}>← Back</Link><span className="inv-grow" /><button className="inv-btn dark" onClick={() => window.print()}><PrintIcon size={15} /> Print</button></div>}
      <ReturnDoc ret={d.ret} shop={shop} />
    </div>
  );
  const { sale } = d;
  const staff = !!user && ['owner', 'admin', 'cashier'].includes(user.role), manager = !!user && ['owner', 'admin'].includes(user.role);
  const link = `${location.origin}/invoice/${token}`;
  const digits = String(sale.customerPhone || '').replace(/\D/g, '').slice(-10);
  const wa = `https://wa.me/${digits.length === 10 ? '91' + digits : ''}?text=${encodeURIComponent(`Hello${sale.customerName ? ' ' + sale.customerName : ''}, here is your invoice ${sale.invoiceNo} from ${shop.name} for ${money(sale.total)}: ${link}`)}`;
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { window.prompt('Copy this link', link) } };
  const printNow = ({ type, paper: p }) => { setFmt(type === 'thermal' ? 'thermal' : 'a4'); setPaper(p); setPs(false); setTimeout(() => window.print(), 350) };
  const voidIt = async () => {
    const reason = window.prompt('Reason for voiding this invoice? Stock will be returned.'); if (!reason) return;
    setBusy(true);
    try { await api(`/admin/pos/sales/${encodeURIComponent(sale.invoiceNo)}/void`, { method: 'POST', body: { reason } }); await load() } catch (e) { window.alert(e.message) } finally { setBusy(false) }
  };
  return (
    <div className="inv-page">
      {window.self === window.top && <div className="inv-bar">
        {staff ? <Link className="inv-btn" to="/admin/billing/orders">← Return to POS</Link> : <Link className="inv-btn" to="/">← {shop.name}</Link>}
        <span className="inv-grow" />
        <a className="inv-btn" href={wa} target="_blank" rel="noopener noreferrer">Share WhatsApp</a>
        <button className="inv-btn" onClick={copy}>{copied ? 'Link copied ✓' : 'Copy Link'}</button>
        {manager && sale.status === 'completed' && sale.items.some(i => i.quantity > (i.returnedQty || 0)) && <button className="inv-btn" onClick={() => setRet(true)}>↩ Return items</button>}
        {manager && sale.status === 'completed' && !(sale.returns?.length) && <button className="inv-btn bad" onClick={voidIt} disabled={busy}>Void</button>}
        <button className="inv-btn dark" onClick={() => setPs(true)}><PrintIcon size={15} /> Print</button>
      </div>}
      {fmt === 'thermal' ? <Thermal sale={sale} shop={shop} paper={paper} /> : <A4Doc sale={sale} shop={shop} />}
      {ret && <ReturnWindow invoiceNo={sale.invoiceNo} onClose={() => setRet(false)} onDone={r => { setRet(false); nav('/invoice/' + r.shareToken) }} />}
      {ps && <PrintSettings onClose={() => setPs(false)} onPrint={printNow} />}
    </div>
  );
}
