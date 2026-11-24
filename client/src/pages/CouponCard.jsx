import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import '../coupon.css';

const dmy = d => d ? String(d).slice(0, 10).split('-').reverse().join('-') : '';

// The public coupon card (/coupon/CODE): what a customer receives on WhatsApp. "Download coupon" draws the card on a canvas and saves a PNG;
// ?print=1 opens the print dialog (Save as PDF).
export default function CouponCard() {
  const { code } = useParams(); const [copied, setCopied] = useState(false); const [d, setD] = useState(null); const [err, setErr] = useState();
  useEffect(() => { api('/coupon/' + encodeURIComponent(code)).then(setD).catch(e => setErr(e.status === 404 ? 'This coupon could not be found.' : e.message)) }, [code]);
  useEffect(() => { if (d && new URLSearchParams(location.search).get('print') === '1') setTimeout(() => print(), 400) }, [d]);
  if (err) return <div className="pc-page"><p className="pc-foot">{err}</p></div>;
  if (!d) return <div className="pc-page" />;
  const c = d.coupon, off = c.discountType === 'percent' ? `${c.discountValue}% OFF` : `${inr(c.discountValue)} OFF`;
  const rules = [c.minOrder ? `Valid on purchases of ${inr(c.minOrder)} or more` : 'No minimum purchase', c.expiresOn ? `Valid till ${dmy(c.expiresOn)}` : 'No expiry date', ...(c.sentOnly ? ['Only for the mobile number it was sent to'] : []), 'Discount applies to the item value only'];
  const download = () => {
    const cv = document.createElement('canvas'); cv.width = 900; cv.height = 1100; const x = cv.getContext('2d');
    const g = x.createLinearGradient(0, 0, 900, 1100); g.addColorStop(0, '#330533'); g.addColorStop(1, '#5a1560'); x.fillStyle = g; x.fillRect(0, 0, 900, 1100); x.fillStyle = '#fbf5ea'; x.beginPath(); x.roundRect(40, 40, 820, 1020, 36); x.fill(); x.setLineDash([14, 10]); x.lineWidth = 4; x.strokeStyle = '#330533'; x.strokeRect(40, 40, 820, 1020); x.setLineDash([]); x.textAlign = 'center';
    x.fillStyle = '#330533'; x.font = '700 44px Georgia, serif'; x.fillText(d.shop.name, 450, 150);
    x.fillStyle = '#C6A052'; x.font = '700 26px Arial'; x.fillText('GIFT COUPON', 450, 210);
    x.fillStyle = '#211714'; x.font = '800 130px Georgia, serif'; x.fillText(off, 450, 440);
    x.fillStyle = '#330533'; x.beginPath(); x.roundRect(180, 520, 540, 130, 28); x.fill(); x.fillStyle = '#fff'; x.font = '700 64px monospace'; x.fillText(c.code, 450, 605);
    x.fillStyle = '#211714'; x.font = '28px Arial'; rules.forEach((r, i) => x.fillText(r, 450, 740 + i * 52));
    if (d.shop.phone) { x.fillStyle = '#6f6270'; x.font = '26px Arial'; x.fillText(d.shop.phone, 450, 1000) }
    const a = Object.assign(document.createElement('a'), { href: cv.toDataURL('image/png'), download: `coupon-${c.code}.png` }); a.click();
  };
  const copy = async () => { try { await navigator.clipboard.writeText(c.code); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { window.prompt('Copy this code', c.code) } };
  return (
    <div className="pc-page">
      <div className="pc-wrap">
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
        <div className="pc-acts"><a className="pc-shop" href="/shop">SHOP NOW</a><button className="pc-dl" onClick={() => window.print()}>⬇ Download coupon (PDF)</button></div>
        <p className="pc-foot">Show this code at the store or enter it at checkout.{d.shop.phone ? ` · ${d.shop.phone}` : ''}</p>
      </div>
    </div>
  );
}
