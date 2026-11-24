import { useEffect, useRef, useState } from 'react';
import { DEFAULT_LOGO } from '../components/Wordmark';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import '../coupon.css';

const dmy = d => d ? String(d).slice(0, 10).split('-').reverse().join('-') : '';

// The public coupon card (/coupon/CODE): what a customer receives on WhatsApp. "Download coupon (PDF)" saves a PDF that looks exactly
// like the card on screen (the page is pictured, then placed in the PDF). ?print=1 downloads it straight away.
export default function CouponCard() {
  const { code } = useParams(); const [copied, setCopied] = useState(false); const [d, setD] = useState(null); const [err, setErr] = useState(); const [busy, setBusy] = useState(false); const page = useRef();
  useEffect(() => { api('/coupon/' + encodeURIComponent(code)).then(setD).catch(e => setErr(e.status === 404 ? 'This coupon could not be found.' : e.message)) }, [code]);
  useEffect(() => { if (d && new URLSearchParams(location.search).get('print') === '1') setTimeout(() => pdfRef.current?.(), 600) }, [d]);
  const pdfRef = useRef();
  if (err) return <div className="pc-page"><p className="pc-foot">{err}</p></div>;
  if (!d) return <div className="pc-page" />;
  const c = d.coupon, off = c.discountType === 'percent' ? `${c.discountValue}% OFF` : `${inr(c.discountValue)} OFF`;
  const rules = [c.minOrder ? `Valid on purchases of ${inr(c.minOrder)} or more` : 'No minimum purchase', c.expiresOn ? `Valid till ${dmy(c.expiresOn)}` : 'No expiry date', ...(c.sentOnly ? ['Only for the mobile number it was sent to'] : []), 'Discount applies to the item value only'];
  const savePdf = async () => {
    if (busy || !page.current) return; setBusy(true);
    try {
      const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
      await document.fonts?.ready;
      const el = page.current; el.classList.add('pc-snap'); // the card only: no full-screen height, no buttons
      const w = el.offsetWidth, h = el.offsetHeight;
      const img = await toPng(el, { pixelRatio: 2, cacheBust: true }).finally(() => el.classList.remove('pc-snap'));
      const pdf = new jsPDF({ orientation: w > h ? 'landscape' : 'portrait', unit: 'px', format: [w, h], hotfixes: ['px_scaling'] });
      pdf.addImage(img, 'PNG', 0, 0, w, h); pdf.save(`coupon-${c.code}.pdf`);
    } catch { window.print() } finally { setBusy(false) }
  };
  pdfRef.current = savePdf;
  const copy = async () => { try { await navigator.clipboard.writeText(c.code); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { window.prompt('Copy this code', c.code) } };
  return (
    <div className="pc-page" ref={page}>
      <div className="pc-wrap">
        <img className="pc-logo" src={d.shop.logo || DEFAULT_LOGO} alt="" crossOrigin="anonymous" onError={e => { if (!e.currentTarget.src.endsWith(DEFAULT_LOGO)) e.currentTarget.src = DEFAULT_LOGO }} />
        <div className="pc-brand"><b>{(d.shop.name || 'DHANYA').toUpperCase()}</b><span>BOUTIQUE &amp; TAILORING</span></div>
        <div className="pc-ticket">
          <div className="pc-top"><p className="pc-gift">A GIFT FOR YOU</p><p className="pc-off">{off}</p><p className="pc-sub">on your next purchase</p></div>
          <div className="pc-cut" aria-hidden="true" />
          <div className="pc-body">
            <div><p className="pc-lab">YOUR COUPON CODE</p><div className="pc-code">{c.code}</div></div>
            <button type="button" className="pc-copy" onClick={copy}>{copied ? 'Code copied ✓' : 'Copy code'}</button>
            <ul className="pc-rules">{rules.map(r => <li key={r}>{r}</li>)}</ul>
            {!c.active && <p className="pc-warn">This coupon is not active at the moment.</p>}
          </div>
        </div>
        <div className="pc-acts"><a className="pc-shop" href="/shop">SHOP NOW</a><button className="pc-dl" onClick={savePdf} disabled={busy}>{busy ? 'Preparing PDF…' : '⬇ Download coupon (PDF)'}</button></div>
        <p className="pc-foot">Show this code at the store or enter it at checkout.{d.shop.phone ? ` · ${d.shop.phone}` : ''}</p>
      </div>
    </div>
  );
}
