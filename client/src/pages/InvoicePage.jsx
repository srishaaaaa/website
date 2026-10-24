import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../context/App';
import { DEFAULT_LOGO } from '../components/Wordmark';
import PrintSettings, { readPrintPrefs } from '../components/PrintSettings';
import { PrintIcon } from '../components/PrintIcon';
import { CHANNEL, MODE, clock, inWords, longDate, money, num2, taxLines } from '../lib/invoiceFormat';
import '../invoice.css';

const phoneShown = p => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? `+91 ${d}` : p || '' };
const paidLine = s => {
  if (s.paymentMode === 'cash') return `Cash Received: ${money(s.cashTendered || s.total)}`;
  if (s.paymentMode === 'split') return `Paid: ${[['Cash', s.payCash], ['GPay / UPI', s.payUpi], ['Card', s.payCard]].filter(([, v]) => v > 0).map(([l, v]) => `${l} ${money(v)}`).join(' · ')}`;
  return `Paid by ${MODE[s.paymentMode]}`;
};

// The full A4 / A5 invoice.
function A4Doc({ sale, shop }) {
  const showGst = shop.gstin && shop.showGst?.[sale.channel];
  const tax = sale.isGst ? taxLines(sale.items) : [];
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
          <p className="inv-no">#{sale.invoiceNo}</p>
          <dl>
            <div><dt>Date:</dt><dd>{longDate(sale.billDate)}</dd></div>
            <div><dt>Time:</dt><dd>{clock(sale.createdAt)}</dd></div>
            <div><dt>Payment:</dt><dd>{MODE[sale.paymentMode].toUpperCase()} • {sale.status === 'voided' ? 'VOID' : 'COMPLETED'}</dd></div>
            <div><dt>Channel:</dt><dd>{CHANNEL(sale)}</dd></div>
          </dl>
        </div>
      </header>
      <hr className="inv-rule" />
      <section className="inv-bill">
        <div><p className="inv-l">BILLED TO</p><b className="inv-who">{sale.customerName || 'Walk-in Customer'}</b>{sale.customerPhone && <p className="inv-sm">{phoneShown(sale.customerPhone)}</p>}{sale.customerAddress && <p className="inv-sm">{sale.customerAddress}</p>}</div>
        <div className="inv-r"><p className="inv-l">PLACE OF SUPPLY</p><b>{shop.state}</b></div>
      </section>
      <table className="inv-items">
        <thead><tr><th>#</th><th>ITEM DESCRIPTION</th><th className="c">QTY</th><th className="r">RATE (₹)</th><th className="r">AMOUNT (₹)</th></tr></thead>
        <tbody>{sale.items.map((i, n) => (
          <tr key={n}><td className="n">{n + 1}</td>
            <td><b>{i.name}</b>{i.variant?.size ? <span className="inv-var"> ({i.variant.size}{i.variant.color && i.variant.color !== 'Default' ? `, ${i.variant.color}` : ''})</span> : null}</td>
            <td className="c mono">{i.quantity}</td><td className="r mono muted">{num2(i.unitPrice)}</td><td className="r mono"><b>{num2(i.lineTotal)}</b></td></tr>))}</tbody>
      </table>
      <section className="inv-foot">
        <div className="inv-words">
          <p className="inv-l">AMOUNT IN WORDS</p>
          <p className="inv-wd">{inWords(sale.total)}</p>
          <p className="inv-recv">{paidLine(sale)}</p>
          {(terms.length > 0 || sale.notes) && <div className="inv-terms"><b>Terms &amp; Notes:</b>{terms.map((t, i) => <p key={i}>• {t}</p>)}{sale.notes && <p>• {sale.notes}</p>}</div>}
        </div>
        <div className="inv-sum">
          <div><span>Subtotal</span><b className="mono">{money(sale.subtotal)}</b></div>
          {sale.discount > 0 && <div><span>Discount{sale.couponCode ? ` (${sale.couponCode})` : ''}</span><b className="mono">- {money(sale.discount)}</b></div>}
          {tax.map(t => <div key={t.label}><span>{t.label}</span><b className="mono">{money(t.amount)}</b></div>)}
          {sale.deliveryFee > 0 && <div><span>Delivery</span><b className="mono">{money(sale.deliveryFee)}</b></div>}
          <div className="inv-total"><span>TOTAL</span><b>{money(sale.total)}</b></div>
          {sale.discount > 0 && <p className="inv-saved">You saved {money(sale.discount)} on this bill</p>}
        </div>
      </section>
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
  const tax = sale.isGst ? taxLines(sale.items) : [];
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
      {row('Subtotal:', num2(sale.subtotal))}
      {sale.discount > 0 && row('Discount:', `- ${num2(sale.discount)}`)}
      {tax.map(t => row(t.label + ':', num2(t.amount)))}
      {sale.deliveryFee > 0 && row('Delivery:', num2(sale.deliveryFee))}
      <hr />
      {row('TOTAL:', money(sale.total), 'tot')}
      <hr />
      <p className="c b">{MODE[sale.paymentMode]}</p>
      <hr className="soft" />
      <p className="c words">{inWords(sale.total).toUpperCase()}</p>
      <p className="c thanks">Thank you for your business!</p>
    </article>
  );
}

const PAGE = { a4: 'A4; margin: 10mm', a5: 'A5; margin: 8mm', 80: '80mm auto; margin: 2mm', 58: '58mm auto; margin: 2mm' };

export default function InvoicePage() {
  const { token } = useParams(); const [qs] = useSearchParams(); const { user } = useApp();
  const [d, setD] = useState(null); const [err, setErr] = useState(); const [copied, setCopied] = useState(false); const [ps, setPs] = useState(false); const [busy, setBusy] = useState(false);
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
  useEffect(() => { document.title = d ? `Invoice ${d.sale.invoiceNo} · ${d.shop.name}` : 'Invoice' }, [d]);

  if (err) return <div className="inv-page"><p className="inv-err">{err}</p></div>;
  if (!d) return <div className="inv-page"><p className="inv-err">Loading invoice…</p></div>;
  const { sale, shop } = d;
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
      <div className="inv-bar">
        {staff ? <Link className="inv-btn" to="/admin/billing/orders">← Return to POS</Link> : <Link className="inv-btn" to="/">← {shop.name}</Link>}
        <span className="inv-grow" />
        <a className="inv-btn" href={wa} target="_blank" rel="noopener noreferrer">Share WhatsApp</a>
        <button className="inv-btn" onClick={copy}>{copied ? 'Link copied ✓' : 'Copy Link'}</button>
        {manager && sale.status === 'completed' && <button className="inv-btn bad" onClick={voidIt} disabled={busy}>Void</button>}
        <button className="inv-btn dark" onClick={() => setPs(true)}><PrintIcon size={15} /> Print</button>
      </div>
      {fmt === 'thermal' ? <Thermal sale={sale} shop={shop} paper={paper} /> : <A4Doc sale={sale} shop={shop} />}
      {ps && <PrintSettings onClose={() => setPs(false)} onPrint={printNow} />}
    </div>
  );
}
