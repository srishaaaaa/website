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

export default function Footer() {
  const { catalog, replayIntro } = useApp();
  return (
    <footer className="site-footer">
      <div className="foot-grid">
        <div className="foot-brand">
          <Wordmark />
          <p className="muted">Contemporary luxury with an Indian soul.</p>
          <Newsletter />
        </div>
        <nav aria-label="Shop"><h2 className="eyebrow">Shop</h2><ul>
          <li><Link to="/shop">All pieces</Link></li>
          <li><Link to="/collections">Collections</Link></li>
          {catalog.categories.slice(0, 5).map(c => <li key={c.slug}><Link to={`/shop?category=${c.slug}`}>{c.name}</Link></li>)}
        </ul></nav>
        <nav aria-label="DHANYA"><h2 className="eyebrow">DHANYA</h2><ul>
          <li><Link to="/about">Our World</Link></li>
          <li><Link to="/journal">Journal</Link></li>
          <li><Link to="/wishlist">Wishlist</Link></li>
          <li><Link to="/account">Account</Link></li>
          <li><button className="link-btn" onClick={() => { replayIntro(); scrollTo(0, 0) }}>Replay the entrance</button></li>
        </ul></nav>
      </div>
      <div className="foot-base">
        <span>© {new Date().getFullYear()} DHANYA</span>
        <span>Prices in INR · Payments processed by Razorpay</span>
      </div>
    </footer>
  );
}
