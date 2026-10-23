import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/App';
import { api } from '../lib/api';
import Wordmark from './Wordmark';

function Newsletter() {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState({ s: 'idle', msg: '' });
  async function submit(e) {
    e.preventDefault();
    if (!consent) return setState({ s: 'error', msg: 'Please confirm your consent to receive emails.' });
    setState({ s: 'busy', msg: '' });
    try {
      const r = await api('/newsletter', { method: 'POST', body: { email, consent: true } });
      setState({ s: 'ok', msg: r.status === 'duplicate' ? 'You are already on the list.' : 'Welcome to DHANYA. You are subscribed.' });
      if (r.status !== 'duplicate') setEmail('');
    } catch (err) { setState({ s: 'error', msg: err.message === 'Validation failed' ? 'Please enter a valid email address.' : err.message }) }
  }
  return (
    <form onSubmit={submit} className="news" noValidate>
      <label htmlFor="nl-email" className="eyebrow">Letters from DHANYA</label>
      <div className="news-row">
        <input id="nl-email" type="email" placeholder="Your email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required aria-describedby="nl-msg" />
        <button className="btn" disabled={state.s === 'busy'}>{state.s === 'busy' ? '…' : 'SUBSCRIBE'}</button>
      </div>
      <label className="check small"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> I agree to receive marketing emails from DHANYA and can unsubscribe at any time.</label>
      <p id="nl-msg" className={`small ${state.s === 'error' ? 'err' : 'muted'}`} role={state.s === 'error' ? 'alert' : 'status'}>{state.msg}</p>
    </form>
  );
}

// Deep-plum footer. Contact details and social links come from the admin-managed store settings.
export default function LuxuryFooter() {
  const { catalog, site, replayIntro } = useApp();
  const { store, social } = site;
  const ig = social?.instagram;
  const socials = [ig?.url && { label: 'Instagram', url: ig.url }, ...(social?.links ?? [])].filter(Boolean);
  const tel = store?.phone && `tel:${store.phone.replace(/[^+\d]/g, '')}`;
  return (
    <>
      <div className="footer-fade" aria-hidden="true" />
      <footer className="site-footer">
        <div className="foot-grid">
          <div className="foot-brand">
            <Wordmark />
            <p className="foot-line">Timeless pieces. Extraordinary presence.</p>
            <Newsletter />
          </div>
          <nav aria-label="Shop"><h2 className="eyebrow">Shop</h2><ul>
            <li><Link to="/shop">All pieces</Link></li>
            <li><Link to="/collections">Collections</Link></li>
            {catalog.categories.slice(0, 5).map(c => <li key={c.slug}><Link to={`/shop?category=${c.slug}`}>{c.name}</Link></li>)}
          </ul></nav>
          <nav aria-label="DHANYA"><h2 className="eyebrow">DHANYA</h2><ul>
            <li><Link to="/about">Our story</Link></li>
            <li><Link to="/journal">Journal</Link></li>
            <li><Link to="/wishlist">Wishlist</Link></li>
            <li><Link to="/account">Account</Link></li>
            <li><button className="link-btn" onClick={() => { replayIntro(); scrollTo(0, 0) }}>Replay the entrance</button></li>
          </ul></nav>
          <div><h2 className="eyebrow">Visit &amp; contact</h2>
            {store?.address?.length ? <address>{store.address.map(l => <span key={l}>{l}<br /></span>)}</address> : <p className="muted small">Boutique location coming soon.</p>}
            {store?.hours && <p className="small">{store.hours.label}</p>}
            <ul>
              {tel && <li><a href={tel}>{store.phone}</a></li>}
              {store?.email && <li><a href={`mailto:${store.email}`}>{store.email}</a></li>}
              {socials.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></li>)}
            </ul>
          </div>
        </div>
        <div className="foot-base">
          <span>© {new Date().getFullYear()} DHANYA</span>
          <span className="foot-policies"><Link to="/shipping-returns">Shipping &amp; returns</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></span>
          <span>Prices in INR · Payments processed by Razorpay</span>
        </div>
      </footer>
    </>
  );
}
