import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/App';
import { api } from '../lib/api';
import { Emblem } from './Wordmark';
import { brand } from '../config/content';

const Ig = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" /></svg>;
const Fb = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 21v-8h2.7l.5-3.2h-3.2V7.9c0-.9.4-1.6 1.7-1.6h1.6V3.5c-.3 0-1.3-.2-2.4-.2-2.5 0-4 1.5-4 4.2v2.3H7.7V13h2.7v8h3.1Z" /></svg>;
const Yt = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8ZM10 15V9l5.2 3L10 15Z" /></svg>;
const iconFor = label => (/insta/i.test(label) ? <Ig /> : /face/i.test(label) ? <Fb /> : /you/i.test(label) ? <Yt /> : <span className="soc-t">{label.slice(0, 2).toUpperCase()}</span>);

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
      <label htmlFor="nl-email" className="foot-sub">Letters from DHANYA</label>
      <div className="news-row">
        <input id="nl-email" type="email" placeholder="Your email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required aria-describedby="nl-msg" />
        <button className="btn" disabled={state.s === 'busy'}>{state.s === 'busy' ? '…' : 'SUBSCRIBE'}</button>
      </div>
      <label className="check small"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> I agree to receive marketing emails from DHANYA and can unsubscribe at any time.</label>
      <p id="nl-msg" className={`small ${state.s === 'error' ? 'err' : 'muted'}`} role={state.s === 'error' ? 'alert' : 'status'}>{state.msg}</p>
    </form>
  );
}

// Dark footer: Shop / Visit Us / Follow Us columns, an oversized wordmark, policies. Contact details and social
// links come from the admin-managed store settings.
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
          <nav aria-label="Shop"><h2 className="foot-h">Shop</h2><ul>
            <li><Link to="/shop">All Products</Link></li>
            <li><Link to="/shop?sort=newest">New Arrivals</Link></li>
            <li><Link to="/collections">Collections</Link></li>
            <li><Link to="/wishlist">Wishlist</Link></li>
            <li><Link to="/cart">Cart</Link></li>
            <li><Link to="/account">My Account</Link></li>
          </ul></nav>
          <div><h2 className="foot-h">Visit Us</h2>
            {store?.address?.length ? <address>{store.address.join(', ')}</address> : <p className="muted">Boutique location coming soon.</p>}
            {store?.hours && <p className="muted">{store.hours.label}</p>}
            <ul>
              {tel && <li><a href={tel}>{store.phone}</a></li>}
              {store?.email && <li><a href={`mailto:${store.email}`}>{store.email}</a></li>}
            </ul>
            <p className="foot-pol"><Link to="/shipping-returns">Shipping &amp; returns</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/about">Our story</Link></p>
          </div>
          <div><h2 className="foot-h">Follow Us</h2>
            <p className="muted">See our latest drops and store moments across our channels.</p>
            {socials.length > 0
              ? <ul className="soc">{socials.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.label}>{iconFor(s.label)}</a></li>)}</ul>
              : <p className="muted small">Social channels coming soon.</p>}
            <Newsletter />
          </div>
        </div>
        <div className="foot-mark" aria-hidden="true"><span>DHANYA</span><small>BOUTIQUE</small></div>
        <div className="foot-base">
          <span>© {new Date().getFullYear()} DHANYA BOUTIQUE. All Rights Reserved</span>
          <span>Powered by <strong>{brand.credit}</strong> © {new Date().getFullYear()}</span>
          <span className="foot-tag">ELEGANCE <i>•</i> BEYOND <i>•</i> ORDINARY</span>
        </div>
      </footer>
    </>
  );
}
