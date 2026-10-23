import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useApp } from '../context/App';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import ProductCard from '../components/ProductCard';
import { BagLines, ShippingNote } from '../components/CartDrawer';

export function Wishlist() {
  const { wish } = useApp();
  const key = wish.join(',');
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!wish.length) { setItems([]); return }
    let dead = false;
    api(`/products?slugs=${encodeURIComponent(key)}&limit=48`).then(d => !dead && setItems(d.items)).catch(() => !dead && setItems([]));
    return () => { dead = true };
  }, [key]); // eslint-disable-line
  const shown = items?.filter(p => wish.includes(p.slug));
  return (
    <div className="catalog">
      <header className="cat-hero"><div className="cat-hero-in"><p className="eyebrow">WISHLIST</p><h1 className="serif">Saved for later.</h1></div></header>
      {!shown && <p className="muted page-pad">Loading…</p>}
      {shown && !shown.length && <div className="empty"><p className="serif big">Nothing saved yet.</p><p className="muted">Tap the heart on any piece to keep it here.</p><Link className="btn" to="/shop">EXPLORE THE COLLECTION</Link></div>}
      <div className="pgrid cols-3">{shown?.map(p => <ProductCard key={p.id} p={p} />)}</div>
    </div>
  );
}

export function CartPage() {
  const { cart, bagSubtotal, cartInfo } = useApp();
  return (
    <div className="cart-page">
      <h1 className="serif">Your Bag</h1>
      {!cart.length ? (
        <div className="empty"><p className="serif big">Your bag is empty.</p><Link className="btn dark" to="/shop">EXPLORE THE COLLECTION</Link></div>
      ) : (
        <div className="cart-cols">
          <BagLines />
          <aside className="summary">
            <h2 className="eyebrow">Summary</h2>
            <div className="row between"><span>Subtotal</span><strong>{inr(bagSubtotal)}</strong></div>
            <ShippingNote subtotal={bagSubtotal} />
            {cartInfo.hasIssues && <p role="alert" className="err small">Some items in your bag need attention before checkout.</p>}
            <Link className="btn solid wide" to="/checkout" aria-disabled={cartInfo.hasIssues}>PROCEED TO CHECKOUT</Link>
          </aside>
        </div>
      )}
    </div>
  );
}

const FIELDS = [['email', 'Email', 'email'], ['name', 'Full name', 'name'], ['phone', 'Phone', 'tel'], ['line1', 'Address', 'address-line1'], ['city', 'City', 'address-level2'], ['state', 'State', 'address-level1'], ['pin', 'PIN code', 'postal-code']];

// The order is built from the SERVER cart; the browser sends only contact + address.
// Phase 4 rebuilds this into the full multi-step checkout.
export function Checkout() {
  const { cart, cartInfo, clearCart, loadCart, bagSubtotal, user } = useApp();
  const [f, setF] = useState({ email: user?.email || '', name: user?.name || '', phone: '', line1: '', city: '', state: '', pin: '' });
  const [err, setErr] = useState(); const [busy, setBusy] = useState(false); const [done, setDone] = useState(); const [test, setTest] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });

  async function pay(e) {
    e.preventDefault(); setErr(); setBusy(true);
    try {
      const { email, ...address } = f;
      const o = await api('/checkout', { method: 'POST', body: { email, address } });
      setTest(o.testMode);
      await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the payment window.')); document.body.append(s) });
      new window.Razorpay({
        key: o.keyId, amount: o.total, currency: o.currency, order_id: o.providerOrderId, name: 'DHANYA',
        handler: async r => {
          try { const v = await api('/payments/verify', { method: 'POST', body: r }); if (v.ok) { await loadCart(); setDone(o.orderNumber) } else setErr('Your payment needs manual review. Please contact us with order ' + o.orderNumber + '.') }
          catch (x) { setErr(x.message) } finally { setBusy(false) }
        },
        modal: { ondismiss: () => { setBusy(false); loadCart() } },
      }).open();
    } catch (x) { setErr(x.message); setBusy(false); loadCart() }
  }
  if (done) return <div className="empty page-pad"><p className="serif big">Thank you.</p><p>Order {done} is confirmed.</p><Link className="btn dark" to="/shop">CONTINUE SHOPPING</Link></div>;
  if (!cart.length) return <Navigate to="/shop" replace />;
  return (
    <div className="checkout">
      <form onSubmit={pay}>
        <h1 className="serif">Checkout</h1>
        {test && <p className="small gold">Test mode — no real money is moved.</p>}
        {FIELDS.map(([k, l, ac]) => <label key={k} className="field"><span>{l}</span><input required autoComplete={ac} type={k === 'email' ? 'email' : 'text'} value={f[k]} onChange={set(k)} /></label>)}
        {cartInfo.hasIssues && <p role="alert" className="err">Some items in your bag are no longer available in the requested quantity. Please review your bag.</p>}
        {err && <p role="alert" className="err">{err}</p>}
        <button className="btn solid wide" disabled={busy || cartInfo.hasIssues}>{busy ? 'PROCESSING…' : 'PAY SECURELY'}</button>
        <p className="muted small">Totals, GST and shipping are calculated on our server. Payments are verified by signature before any order is marked paid.</p>
      </form>
      <aside className="summary"><h2 className="eyebrow">Your bag</h2><BagLines compact /><div className="row between"><span>Subtotal</span><strong>{inr(bagSubtotal)}</strong></div><ShippingNote subtotal={bagSubtotal} /></aside>
    </div>
  );
}

export function Auth({ mode }) {
  const { signIn, toast, user } = useApp();
  const nav = useNavigate();
  const reg = mode === 'register';
  const [f, setF] = useState({ name: '', email: '', password: '' }); const [err, setErr] = useState(); const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={user.role === 'customer' ? '/account' : '/admin'} replace />;
  async function submit(e) {
    e.preventDefault(); setErr(); setBusy(true);
    try {
      const d = await api(reg ? '/auth/register' : '/auth/login', { method: 'POST', body: reg ? f : { email: f.email, password: f.password } });
      signIn(d.user); toast(reg ? 'Welcome to DHANYA.' : 'Welcome back.');
      nav(d.user.role === 'customer' ? '/account' : '/admin');
    } catch (x) { setErr(x.message === 'Validation failed' ? 'Please enter a valid email and a password of at least 8 characters.' : x.message); setBusy(false) }
  }
  return (
    <div className="auth">
      <form onSubmit={submit} noValidate>
        <p className="eyebrow">{reg ? 'JOIN' : 'WELCOME BACK'}</p>
        <h1 className="serif">{reg ? 'Create your account' : 'Sign in'}</h1>
        {reg && <label className="field"><span>Full name</span><input autoComplete="name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>}
        <label className="field"><span>Email</span><input type="email" required autoComplete="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
        <label className="field"><span>Password</span><input type="password" required minLength={8} autoComplete={reg ? 'new-password' : 'current-password'} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></label>
        {err && <p role="alert" className="err">{err}</p>}
        <button className="btn solid wide" disabled={busy}>{busy ? 'ONE MOMENT…' : reg ? 'CREATE ACCOUNT' : 'SIGN IN'}</button>
        <p className="muted small center">{reg ? <>Already have an account? <Link className="link-u" to="/login">Sign in</Link></> : <>New to DHANYA? <Link className="link-u" to="/register">Create an account</Link></>}</p>
      </form>
    </div>
  );
}
