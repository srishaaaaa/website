import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../lib/api';
import { FREE_SHIPPING_AT, SHIPPING_FLAT, inr, sortSizes } from '../lib/format';
import { useApp } from '../context/App';
import { useFinePointer, useModal, useReduced } from '../lib/hooks';
import { ProductMedia } from '../components/ProductCard3D';
import ProductCard from '../components/ProductCard3D';
import { Magnetic, Reveal } from '../components/Motion';

// Real photography when the product has images; otherwise four generated views.
// Photos tagged with the chosen colour come first, then the untagged ones; a colour with no tagged photos shows the untagged (or all) photos.
const slidesOf = (p, color) => {
  if (!p.images?.length) return [0, 1, 2, 3].map(v => ({ p, view: v }));
  const mine = p.images.filter(im => im.color && color && im.color.toLowerCase() === color.toLowerCase());
  const general = p.images.filter(im => !im.color);
  const list = mine.length ? [...mine, ...general] : general.length ? general : p.images;
  return list.map(im => ({ p: { ...p, image: im.url, name: im.alt || p.name }, view: 0 }));
};

function Lightbox({ p, color, index, setIndex, onClose }) {
  const slides = slidesOf(p, color), N = slides.length;
  const ref = useRef(); useModal(true, onClose, ref);
  useEffect(() => {
    const k = e => { if (e.key === 'ArrowRight') setIndex(i => (i + 1) % N); if (e.key === 'ArrowLeft') setIndex(i => (i + N - 1) % N) };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [setIndex]);
  return (
    <motion.div ref={ref} className="lightbox" role="dialog" aria-modal="true" aria-label={`${p.name} images`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button className="icon-btn close" onClick={onClose} aria-label="Close image viewer">✕</button>
      <button className="icon-btn nav prev" onClick={() => setIndex(i => (i + N - 1) % N)} aria-label="Previous image">‹</button>
      <AnimatePresence mode="wait"><motion.div key={index} className="lb-img" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}><ProductMedia p={slides[index].p} view={slides[index].view} /></motion.div></AnimatePresence>
      <button className="icon-btn nav next" onClick={() => setIndex(i => (i + 1) % N)} aria-label="Next image">›</button>
      <p className="lb-count" aria-live="polite">{index + 1} / {N}</p>
    </motion.div>
  );
}

function Gallery({ p, color }) {
  const slides = slidesOf(p, color), N = slides.length;
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [pan, setPan] = useState({ x: 50, y: 50 });
  const [hover, setHover] = useState(false);
  const fine = useFinePointer(), reduced = useReduced();
  const touch = useRef(null);
  return (
    <div className="gallery">
      <ul className="thumbs" aria-label="Product images">
        {slides.map((s, i) => <li key={i}><button className={i === index ? 'on' : ''} onClick={() => setIndex(i)} aria-label={`Show image ${i + 1}`} aria-current={i === index}><ProductMedia p={s.p} view={s.view} /></button></li>)}
      </ul>
      <div className="stage" data-cursor="ZOOM" role="button" tabIndex={0} aria-label="Open full-screen image viewer" onClick={() => setZoom(true)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setZoom(true))}
        onPointerMove={fine && !reduced ? e => { const r = e.currentTarget.getBoundingClientRect(); setPan({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }) } : undefined}
        onPointerEnter={() => setHover(true)} onPointerLeave={() => { setPan({ x: 50, y: 50 }); setHover(false) }}
        onTouchStart={e => { touch.current = e.touches[0].clientX }}
        onTouchEnd={e => { if (touch.current == null) return; const d = e.changedTouches[0].clientX - touch.current; if (Math.abs(d) > 45) setIndex(i => (i + (d < 0 ? 1 : N - 1)) % N); touch.current = null }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={index} className="stage-img" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
            <div className="pan" style={fine && !reduced ? { transform: `scale(${hover ? 1.12 : 1}) translate(${(50 - pan.x) * 0.06}%, ${(50 - pan.y) * 0.06}%)` } : undefined}><ProductMedia p={slides[index].p} view={slides[index].view} /></div>
          </motion.div>
        </AnimatePresence>
        <span className="stage-count" aria-hidden="true">{index + 1} / {N}</span>
      </div>
      <AnimatePresence>{zoom && <Lightbox p={p} color={color} index={index} setIndex={setIndex} onClose={() => setZoom(false)} />}</AnimatePresence>
    </div>
  );
}

function Accordion({ title, children, open = false }) {
  return <details className="acc" open={open}><summary>{title}</summary><div>{children}</div></details>;
}

export default function Product() {
  const { slug } = useParams();
  const { addToBag, wish, toggleWish, toast } = useApp();
  const [p, setP] = useState(null);
  const [err, setErr] = useState(null);
  const [color, setColor] = useState(null);
  const [size, setSize] = useState(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setP(null); setErr(null); setColor(null); setSize(null);
    let dead = false;
    api('/products/' + slug).then(d => { if (dead) return; setP(d); const first = d.variants.find(v => v.stock > 0) || d.variants[0]; setColor(first?.color ?? null) }).catch(e => !dead && setErr(e.status === 404 ? 'notfound' : 'error'));
    return () => { dead = true };
  }, [slug]);

  const colors = useMemo(() => p ? [...new Set(p.variants.map(v => v.color))] : [], [p]);
  const sizes = useMemo(() => {
    if (!p) return [];
    const bySize = p.variants.filter(v => v.color === color);
    const order = sortSizes(bySize.map(v => v.size));
    return bySize.sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size));
  }, [p, color]);
  const variant = sizes.find(v => v.size === size) || null;
  const related = p?.related ?? [];

  if (err) return <div className="empty page-pad"><p className="serif big">{err === 'notfound' ? 'This piece could not be found.' : 'This piece could not be loaded.'}</p><Link className="btn" to="/shop">BACK TO THE COLLECTION</Link></div>;
  if (!p) return <div className="pdp skeleton-pdp page-pad" aria-busy="true" aria-label="Loading product"><div className="sk-block" /><div><div className="sk-line" /><div className="sk-line short" /></div></div>;

  const liked = wish.includes(p.slug);
  const label = !variant ? 'SELECT A SIZE' : variant.stock < 1 ? 'SOLD OUT' : added ? 'ADDED TO BAG ✓' : 'ADD TO BAG';
  const add = async () => {
    if (!variant || variant.stock < 1) return;
    if (await addToBag({ variantId: variant.id })) { setAdded(true); setTimeout(() => setAdded(false), 1800) }
  };
  const stockNote = !variant ? 'Select a size to see availability.' : variant.stock < 1 ? 'Sold out in this size.' : variant.stock <= 3 ? `Only ${variant.stock} left in this size.` : 'In stock.';
  const total = p.variants.reduce((s, v) => s + v.stock, 0);

  return (
    <div className="pdp-wrap">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/shop">Shop</Link><span aria-hidden="true">/</span>{p.category && <><Link to={`/shop?category=${p.category_slug}`}>{p.category}</Link><span aria-hidden="true">/</span></>}<span aria-current="page">{p.name}</span></nav>
      <div className="pdp">
        <Gallery key={color || 'all'} p={p} color={color} />
        <div className="pdp-info">
          <p className="eyebrow">{p.category}</p>
          <h1 className="serif">{p.name}</h1>
          <p className="price big">{inr(variant?.price ?? (sizes.length && sizes.every(v => v.price === sizes[0].price) ? sizes[0].price : p.price))} <small>+ {p.gst_rate}% GST</small></p>

          {colors.length > 1 && (
            <fieldset><legend className="eyebrow">Colour — {color}</legend>
              <div className="chips" role="radiogroup" aria-label="Colour">{colors.map(c => <button key={c} role="radio" aria-checked={c === color} className={`chip ${c === color ? 'on' : ''}`} onClick={() => { setColor(c); setSize(null) }}>{c}</button>)}</div></fieldset>
          )}
          <fieldset><legend className="eyebrow">Size{variant ? ` — ${variant.size}` : ''}</legend>
            <div className="chips" role="radiogroup" aria-label="Size">{sizes.map(v => (
              <button key={v.id} role="radio" aria-checked={v.size === size} className={`chip ${v.size === size ? 'on' : ''} ${v.stock < 1 ? 'out' : ''}`} onClick={() => setSize(v.size)} disabled={v.stock < 1}>{v.size}{v.stock < 1 && <span className="sr"> sold out</span>}</button>))}</div>
            <p className={`small ${variant && variant.stock < 1 ? 'err' : 'muted'}`} aria-live="polite">{stockNote}</p></fieldset>

          <div className="pdp-actions">
            <Magnetic><button className={`btn solid wide ${added ? 'done' : ''}`} onClick={add} disabled={!variant || variant.stock < 1} data-cursor="ADD">{label}</button></Magnetic>
            <button className={`icon-btn lg ${liked ? 'on' : ''}`} onClick={() => toggleWish(p.slug, p.name)} aria-pressed={liked} aria-label={liked ? 'Remove from wishlist' : 'Save to wishlist'}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.3A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3Z" /></svg>
            </button>
          </div>
          {total < 1 && <p className="err small">This piece is currently sold out.</p>}

          <Accordion title="Description" open><p>{p.description || 'Details for this piece will be added soon.'}</p></Accordion>
          <Accordion title="Shipping"><p>Shipping is {inr(SHIPPING_FLAT)}, complimentary on bag totals above {inr(FREE_SHIPPING_AT)}. GST at {p.gst_rate}% is added at checkout, and the final total is always calculated securely on our server.</p></Accordion>
        </div>
      </div>

      {related.length > 0 && (
        <section className="related" aria-labelledby="rel-h">
          <Reveal><h2 id="rel-h" className="serif">Complete the look</h2></Reveal>
          <div className="pgrid cols-4">{related.map(r => <ProductCard key={r.id} p={r} />)}</div>
        </section>
      )}

      <div className="sticky-buy" aria-hidden={false}>
        <div><strong>{inr(p.price)}</strong><span className="muted small"> {p.name}</span></div>
        <button className="btn solid" onClick={variant ? add : () => { document.querySelector('.pdp-info fieldset:last-of-type')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('Please select a size.') }} disabled={variant && variant.stock < 1}>{variant ? label : 'SELECT SIZE'}</button>
      </div>
    </div>
  );
}
