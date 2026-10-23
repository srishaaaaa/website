import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../../context/App';
import { useReduced } from '../../lib/hooks';
import { usePointerVars } from '../../lib/usePointerVars';
import { Magnetic } from '../Motion';
import { Emblem } from '../Wordmark';
import EditorialTypography from './EditorialTypography';
import ParallaxSubject from './ParallaxSubject';

const list = a => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const rise = d => ({ initial: { opacity: 0, y: 28 }, transition: { duration: 0.9, delay: d, ease: [0.22, 1, 0.36, 1] } });

// Floating decorative depth cells: [class, depth multiplier]. Larger = closer = moves more.
const DECO = [['spark s1', 1.6], ['spark s2', 0.8], ['spark s3', 2.2], ['dot d1', 1.2], ['dot d2', 2.6], ['dot d3', 0.6], ['dot d4', 1.9]];

export default function ImmersiveHero() {
  const { entered, catalog } = useApp();
  const reduced = useReduced();
  const ref = useRef();
  usePointerVars(ref, !reduced);
  const show = entered; // entrance waits for the intro to finish
  const cats = catalog.categories.map(c => c.name.toLowerCase());
  // The supporting line names the boutique's real product categories (from the database).
  const support = cats.length ? `A luxury boutique for ${list(cats.slice(0, 4))}${cats.length > 4 ? ' and more' : ''}.` : 'A contemporary luxury boutique with an Indian soul.';
  const anim = d => ({ ...rise(d), animate: show ? { opacity: 1, y: 0 } : undefined });

  return (
    <section ref={ref} className="hl" data-hero aria-label="Introduction">
      <div className="hl-bg" aria-hidden="true">
        <div className="hl-gridwrap" data-gridwrap><div className="hl-grid" /></div>
        <div className="hl-wordwrap" data-word-bg><span className="hl-word">DHANYA</span></div>
        <div className="hl-deco">
          {DECO.map(([c, d]) => <i key={c} className={`hl-d ${c}`} style={{ '--d': d }} />)}
          <span className="hl-petal p1" style={{ '--d': 1.4 }}><Emblem size={96} /></span>
          <span className="hl-petal p2" style={{ '--d': 2.4 }}><Emblem size={54} /></span>
        </div>
      </div>

      <ParallaxSubject show={show} />

      <div className="hl-copy" data-hero-copy>
        <EditorialTypography lines={['ELEGANCE', 'BEYOND', 'ORDINARY.']} show={show} className="hl-h" />
        <motion.p className="hl-line" {...anim(0.75)}>Timeless pieces. Extraordinary presence.</motion.p>
        <motion.p className="hl-sub" {...anim(0.85)}>{support}</motion.p>
        <motion.div className="hl-cta" {...anim(0.95)}>
          <Magnetic strength={0.22}>
            <Link className="hl-btn" to="/shop" data-cursor="EXPLORE"><span>EXPLORE COLLECTION</span><b aria-hidden="true"><i>→</i></b></Link>
          </Magnetic>
          <Link className="hl-link" to="/about" data-cursor="DISCOVER">DISCOVER DHANYA</Link>
        </motion.div>
      </div>

      <motion.aside className="hl-caption" {...anim(1.1)} aria-hidden="true"><span>AN EXPRESSION OF<br />TIMELESS BEAUTY.</span><i /></motion.aside>
      <div className="hl-scroll" aria-hidden="true"><span>SCROLL</span><i /></div>
    </section>
  );
}
