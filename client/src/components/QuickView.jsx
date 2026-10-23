import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../context/App';
import { useModal, useReduced } from '../lib/hooks';
import { api } from '../lib/api';
import { inr, sortSizes } from '../lib/format';
import { ProductMedia } from './ProductCard3D';

// Quick view fetches fresh variant/stock data from the server before offering add-to-bag.
export default function QuickView() {
  const { quick, setQuick, addToBag, toast } = useApp();
  const reduced = useReduced();
  const ref = useRef();
  const close = () => setQuick(null);
  useModal(!!quick, close, ref);
  const [full, setFull] = useState(null);
  const [sel, setSel] = useState(null);
  const [state, setState] = useState('idle');

  useEffect(() => {
    setFull(null); setSel(null); setState('loading');
    if (!quick) return;
    let dead = false;
    api('/products/' + quick.slug).then(d => { if (!dead) { setFull(d); setState('ready') } }).catch(() => !dead && setState('error'));
    return () => { dead = true };
  }, [quick]);

  const order = full ? sortSizes(full.variants.map(v => v.size)) : [];
  const variants = full ? [...full.variants].sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size)) : [];
  return (
    <AnimatePresence>
      {quick && (
        <div className="overlay-root">
          <motion.div className="scrim" onClick={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div ref={ref} className="quick glass" role="dialog" aria-modal="true" aria-label={`Quick view: ${quick.name}`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, rotateX: 16, y: 60, scale: 0.95 }} animate={{ opacity: 1, rotateX: 0, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, rotateX: -10, y: 30, scale: 0.97 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} style={{ transformPerspective: 1200 }}>
            <button className="icon-btn close" onClick={close} aria-label="Close quick view">✕</button>
            <div className="quick-media"><ProductMedia p={quick} /></div>
            <div className="quick-body">
              <p className="eyebrow">{quick.category}</p>
              <h2 className="serif">{quick.name}</h2>
              <p className="price">{inr(quick.price)} <small>+ {quick.gst_rate}% GST</small></p>
              {quick.description && <p className="muted clamp">{quick.description}</p>}
              {state === 'loading' && <p className="muted">Checking availability…</p>}
              {state === 'error' && <p role="alert" className="err">Availability could not be loaded. Please try again.</p>}
              {full && (
                <>
                  <div className="chips" role="radiogroup" aria-label="Size">
                    {variants.map(v => (
                      <button key={v.id} role="radio" aria-checked={sel?.id === v.id} className={`chip ${sel?.id === v.id ? 'on' : ''}`} disabled={!v.stock} onClick={() => setSel(v)}>{v.size}{!v.stock && <span className="sr"> sold out</span>}</button>
                    ))}
                  </div>
                  <button className="btn solid" disabled={!sel} data-cursor="ADD" onClick={async () => { if (await addToBag({ variantId: sel.id })) { close(); toast(`${full.name} added to your bag.`) } }}>
                    {sel ? 'ADD TO BAG' : 'SELECT A SIZE'}
                  </button>
                </>
              )}
              <Link to={`/product/${quick.slug}`} onClick={close} className="link-u">View full details</Link>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
