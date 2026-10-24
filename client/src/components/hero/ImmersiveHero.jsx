import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../../context/App';
import { useReduced } from '../../lib/hooks';
import { usePointerVars } from '../../lib/usePointerVars';
import { inr } from '../../lib/format';
import { Magnetic } from '../Motion';
import { ProductMedia } from '../ProductCard3D';
import EditorialTypography from './EditorialTypography';
import ParallaxSubject from './ParallaxSubject';

const list = a => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const rise = d => ({ initial: { opacity: 0, y: 28 }, transition: { duration: 0.9, delay: d, ease: [0.22, 1, 0.36, 1] } });
const I = ({ children }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;

// Floating decorative depth cells: [class, depth multiplier]. Larger = closer = moves more.
const DECO = [['spark s1', 1.6], ['spark s3', 2.2], ['dot d1', 1.2], ['dot d3', 0.6]];

export default function ImmersiveHero() {
  const { entered, catalog, site } = useApp();
  const reduced = useReduced();
  const ref = useRef();
  usePointerVars(ref, !reduced);
  const show = entered; // entrance waits for the intro to finish
  const cats = catalog.categories.map(c => c.name.toLowerCase());
  // The supporting line names the boutique's real product categories (from the database).
  const support = cats.length ? `A luxury boutique for ${list(cats.slice(0, 4))}${cats.length > 4 ? ' and more' : ''}.` : 'A contemporary luxury boutique with an Indian soul.';
  const anim = d => ({ ...rise(d), animate: show ? { opacity: 1, y: 0 } : undefined });
  const trend = catalog.featured[0];
  const ship = site.shipping, mins = site.checkout?.reservationMinutes;
  // Trust row: only statements that are true of this store; figures come from the database.
  const trust = [
    [<I key="t"><path d="M3 6h11v10H3z" /><path d="M14 9h4l3 3v4h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></I>, ship?.freeOver ? 'FREE SHIPPING' : 'SHIPPING', ship?.freeOver ? `On orders over ${inr(ship.freeOver)}` : 'Across India'],
    [<I key="s"><path d="M12 3 5 6v5c0 4.4 2.8 8.2 7 10 4.2-1.8 7-5.6 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></I>, 'SECURE PAYMENT', 'Verified by Razorpay'],
    [<I key="c"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></I>, 'HELD AT CHECKOUT', mins ? `Reserved for ${mins} minutes` : 'Reserved while you pay'],
  ];

  return (
    <section ref={ref} className="hl" data-hero aria-label="Introduction">
      <div className="hl-panel">
        <div className="hl-bg" aria-hidden="true">
          <div className="hl-gridwrap" data-gridwrap><div className="hl-grid" /></div>
          <div className="hl-wordwrap" data-word-bg><span className="hl-word">DHANYA</span></div>
          <div className="hl-deco">{DECO.map(([c, d]) => <i key={c} className={`hl-d ${c}`} style={{ '--d': d }} />)}</div>
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

        <motion.ul className="hl-trust" {...anim(1.1)}>
          {trust.map(([icon, t, s]) => <li key={t}>{icon}<span><b>{t}</b><em>{s}</em></span></li>)}
        </motion.ul>

        <motion.aside className="hl-caption" {...anim(1.1)} aria-hidden="true"><span>AN EXPRESSION OF<br />TIMELESS BEAUTY.</span><i /></motion.aside>

        {trend && (
          <motion.div className="hl-trend" {...anim(1.25)}>
            <Link to={`/product/${trend.slug}`} className="hl-trend-img" aria-label={`View ${trend.name}`} data-cursor="VIEW"><ProductMedia p={trend} /></Link>
            <div>
              <p className="hl-trend-k">TRENDING NOW</p>
              <p className="hl-trend-n">{trend.name}</p>
              <p className="hl-trend-p">{inr(trend.price)}</p>
              <Link to={`/product/${trend.slug}`} className="hl-trend-l">SHOP NOW →</Link>
            </div>
          </motion.div>
        )}
        <div className="hl-scroll" aria-hidden="true"><span>SCROLL</span><i /></div>
      </div>
    </section>
  );
}
