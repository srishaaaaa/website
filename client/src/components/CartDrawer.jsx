import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../context/App';
import { useModal } from '../lib/hooks';
import { inr } from '../lib/format';
import { ProductMedia } from './ProductCard3D';

// Shipping figures come from the server's cart response (shipping_methods table).
export function ShippingNote({ subtotal }) {
  const { cartInfo } = useApp();
  if (!subtotal) return null;
  const { amount, freeOver } = cartInfo.shipping;
  return <p className="muted small">{amount === 0 ? 'Complimentary shipping applies.' : `Shipping ${inr(amount)}${freeOver != null ? ` — complimentary above ${inr(freeOver)}` : ''}.`} GST is calculated at checkout.</p>;
}

// Subtotal and shipping, the total, and a tinted box showing how much GST is already inside it (prices include GST).
export function BagTotals() {
  const { cartInfo } = useApp();
  const gst = cartInfo.gst?.byRate || [], ship = cartInfo.shipping || { amount: 0 };
  const total = cartInfo.total ?? (cartInfo.subtotal + ship.amount);
  return (
    <div className="bag-totals">
      <div className="row between"><span>Subtotal (incl. GST)</span><span>{inr(cartInfo.subtotal)}</span></div>
      <div className="row between"><span>Shipping</span><span>{ship.amount === 0 ? 'Free' : inr(ship.amount)}</span></div>
      <div className="row between bt-total"><strong>Total</strong><strong>{inr(total)}</strong></div>
      {gst.length > 0 && (
        <div className="bt-gst"><p>GST included in your total</p>
          {gst.map(g => <div key={g.rate} className="row between"><span>GST {g.rate}% on {inr(g.base)}</span><span>{inr(g.tax)}</span></div>)}
          {gst.length > 1 && <div className="row between bt-sum"><span>Total GST</span><span>{inr(cartInfo.gst.included)}</span></div>}</div>)}
    </div>
  );
}

// "Add ₹x more for free shipping" with a progress bar.
function FreeShipBar() {
  const { cartInfo } = useApp();
  const need = cartInfo.shipping?.freeOver;
  if (need == null || !cartInfo.subtotal) return null;
  const left = Math.max(0, need - cartInfo.subtotal);
  return (
    <div className="shipbar"><p>{left > 0 ? `Add ${inr(left)} more for free shipping.` : 'You have free shipping on this order.'}</p>
      <div className="shipbar-track"><i style={{ width: `${Math.min(100, Math.round(cartInfo.subtotal / need * 100))}%` }} /></div></div>
  );
}

export function BagLines({ compact = false }) {
  const { cart, setQty, removeItem } = useApp();
  return (
    <ul className={`bag-lines ${compact ? 'compact' : ''}`}>
      <AnimatePresence initial={false}>
        {cart.map(i => (
          <motion.li key={i.variantId} layout initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 60, height: 0, marginBottom: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
            <Link to={`/product/${i.slug}`} className="bag-thumb" aria-label={`View ${i.name}`}><ProductMedia p={{ slug: i.slug, name: i.name, image: i.image }} /></Link>
            <div className="bag-info">
              <Link to={`/product/${i.slug}`} className="serif">{i.name}</Link>
              <p className="muted small">{[i.color && i.color !== 'Default' ? i.color : null, `Size ${i.size}`].filter(Boolean).join(' · ')}</p>
              {i.issue && <p className="err small" role="alert">{i.issue === 'insufficient_stock' ? `Only ${i.stock} left` : 'No longer available'}</p>}
              <div className="qty" role="group" aria-label={`Quantity for ${i.name}`}>
                <button onClick={() => setQty(i.variantId, i.qty - 1)} aria-label="Decrease quantity">−</button>
                <output aria-live="polite">{i.qty}</output>
                <button onClick={() => setQty(i.variantId, i.qty + 1)} aria-label="Increase quantity" disabled={i.qty >= Math.min(10, i.stock ?? 10)}>+</button>
              </div>
            </div>
            <div className="bag-price">
              <span>{inr(i.price * i.qty)}</span>
              <button className="link-u small" onClick={() => removeItem(i.variantId)}>Remove</button>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

export default function CartDrawer() {
  const { bagOpen, setBagOpen, cart, bagSubtotal, bagCount, cartInfo } = useApp();
  const ref = useRef();
  const close = () => setBagOpen(false);
  useModal(bagOpen, close, ref);
  return (
    <AnimatePresence>
      {bagOpen && (
        <div className="overlay-root">
          <motion.div className="scrim" onClick={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.aside ref={ref} className="drawer glass refine" role="dialog" aria-modal="true" aria-label="Shopping bag"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
            <header className="drawer-head">
              <h2 className="serif">Your Bag <span className="muted">({bagCount})</span></h2>
              <button className="icon-btn" onClick={close} aria-label="Close shopping bag">✕</button>
            </header>
            <div className="drawer-body">
              {cart.length > 0 && <FreeShipBar />}
              {!cart.length
                ? <div className="empty"><p className="serif big">Your bag is empty.</p><p className="muted">Pieces you add will wait for you here.</p><Link className="btn" to="/shop" onClick={close}>EXPLORE THE SHOP</Link></div>
                : <BagLines compact />}
            </div>
            {cart.length > 0 && (
              <footer className="drawer-foot">
                <BagTotals />
                <Link className="btn solid wide bag-go" to="/checkout" onClick={close} data-cursor="PAY">CHECKOUT · {inr(cartInfo.total ?? bagSubtotal)}</Link>
                <p className="muted small center">Secure payment · Prices include GST</p>
                <Link className="link-u center" to="/cart" onClick={close}>View bag</Link>
              </footer>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
