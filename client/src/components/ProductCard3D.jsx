import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import ProductArt from './ProductArt';
import { useApp } from '../context/App';
import { useFinePointer, useReduced } from '../lib/hooks';
import { inr } from '../lib/format';

// A photo fades in once it has loaded (never a half-drawn image) and is framed on the focus point chosen in the admin.
function Photo({ className = '', style, ...rest }) {
  const [ok, setOk] = useState(false);
  return <img {...rest} className={`${className} ${ok ? 'is-in' : ''}`} style={style} onLoad={() => setOk(true)} ref={el => { if (el && el.complete && el.naturalWidth && !ok) setOk(true) }} />;
}

export function ProductMedia({ p, view = 0, className = '', priority = false, eager = false }) {
  const load = priority ? { loading: 'eager', fetchpriority: 'high', decoding: 'async' } : { loading: eager ? 'eager' : 'lazy', decoding: 'async' };
  if (p.image) {
    if (view === 1 && p.image2) return <Photo className={`media ${className}`} src={p.image2} alt="" {...load} />;
    // A real photo is always shown whole: the old zoomed/shifted "views" only suit the generated artwork below.
    return <Photo className={`media ${className}`} src={p.image} alt={view ? '' : p.name} style={p.image_pos ? { objectPosition: p.image_pos } : undefined} {...load} />;
  }
  return <ProductArt seed={p.slug} view={view} className={className} />;
}

const HeartIcon = ({ on }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.3A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3Z" /></svg>
);

// Perspective tilt + layered parallax + moving specular glare. Disabled on touch / reduced motion.
export default function ProductCard({ p, tall = false, className = '', index = null }) {
  const { wish, toggleWish, setQuick, addToBag, toast } = useApp();
  const fine = useFinePointer(), reduced = useReduced();
  const ref = useRef();
  const mx = useMotionValue(0), my = useMotionValue(0);
  const rotY = useSpring(useTransform(mx, [-0.5, 0.5], [-6, 6]), { stiffness: 160, damping: 18 });
  const rotX = useSpring(useTransform(my, [-0.5, 0.5], [5, -5]), { stiffness: 160, damping: 18 });
  const lx = useSpring(useTransform(mx, [-0.5, 0.5], [-10, 10]), { stiffness: 120, damping: 20 });
  const ly = useSpring(useTransform(my, [-0.5, 0.5], [-10, 10]), { stiffness: 120, damping: 20 });
  const liked = wish.includes(p.slug);
  const out = p.stock < 1;
  const tilt = false; // no 3D tilt or glare on product cards
  const [adding, setAdding] = useState(false);
  // Pieces with a single purchasable variant add straight to the bag; otherwise the visitor picks a size first.
  const add = async () => {
    if (!p.single_variant) return setQuick(p);
    setAdding(true);
    if (await addToBag({ variantId: p.single_variant })) toast(`${p.name} added to your bag.`);
    setAdding(false);
  };

  return (
    <motion.article className={`pcard ${tall ? 'tall' : ''} ${className}`} style={tilt ? { rotateX: rotX, rotateY: rotY, transformPerspective: 1000 } : undefined}
      ref={ref}
      onPointerMove={tilt ? e => {
        const r = ref.current.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        mx.set(x); my.set(y); ref.current.style.setProperty('--gx', `${(x + 0.5) * 100}%`); ref.current.style.setProperty('--gy', `${(y + 0.5) * 100}%`);
      } : undefined}
      onPointerLeave={tilt ? () => { mx.set(0); my.set(0) } : undefined}>
      <div className="pcard-frame">
        <Link to={`/product/${p.slug}`} className="pcard-link" data-cursor="VIEW" aria-label={`${p.name}, ${inr(p.price)}${out ? ', sold out' : ''}`}>
          <motion.div className="pcard-layer" style={tilt ? { x: lx, y: ly, scale: 1.12 } : undefined}>
            <div className="pcard-img a"><ProductMedia p={p} view={0} /></div>
            <div className="pcard-img b"><ProductMedia p={p} view={1} /></div>
          </motion.div>
          <span className="pcard-glare" aria-hidden="true" />
          <span className="pcard-from">{inr(p.price)}</span>
          {index != null && <span className="pcard-no" aria-hidden="true">No. {String(index + 1).padStart(2, '0')}</span>}
          {out && <span className="pcard-badge">SOLD OUT</span>}
        </Link>
        <button className={`icon-btn pcard-wish ${liked ? 'on' : ''}`} onClick={() => toggleWish(p.slug, p.name)} aria-pressed={liked} aria-label={liked ? `Remove ${p.name} from wishlist` : `Save ${p.name} to wishlist`}>
          <HeartIcon on={liked} />
        </button>
        <div className="pcard-actions">
          <button className="pcard-quick" onClick={() => setQuick(p)} aria-label={`Quick view ${p.name}`}>QUICK VIEW</button>
          {!out && <button className="pcard-add" onClick={add} disabled={adding} aria-label={p.single_variant ? `Add ${p.name} to bag` : `Choose a size for ${p.name}`}>{adding ? '…' : p.single_variant ? 'ADD TO BAG' : 'CHOOSE SIZE'}</button>}
        </div>
      </div>
      <div className="pcard-meta">
        <div>
          <h3 className="serif">{p.name}</h3>
          <p className="muted">{p.category}</p>
          {p.sizes?.length > 0 && <p className="pcard-sizes" aria-label={`Available sizes: ${p.sizes.join(', ')}`}>{[...p.sizes].sort((a, b) => ['XS','S','M','L','XL','XXL'].indexOf(a) - ['XS','S','M','L','XL','XXL'].indexOf(b)).join(' · ')}</p>}
          {!out && p.stock <= 3 && <p className="pcard-low">Only {p.stock} left</p>}
        </div>
        <div className="pcard-price">
          <span>{inr(p.price)}</span>
          {p.colors?.length > 1 && <span className="dots" aria-label={`${p.colors.length} colours`}>{p.colors.slice(0, 4).map(c => <i key={c} title={c} />)}</span>}
        </div>
      </div>
    </motion.article>
  );
}

export function CardSkeletons({ n = 6 }) {
  return Array.from({ length: n }, (_, i) => <div className="pcard skeleton" key={i} aria-hidden="true"><div className="pcard-frame" /><div className="sk-line" /><div className="sk-line short" /></div>);
}
