import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../../context/App';
import { useReduced } from '../../lib/hooks';
import { usePointerVars } from '../../lib/usePointerVars';
import { inr } from '../../lib/format';
import { media } from '../../config/content';
import { Magnetic } from '../Motion';
import EditorialTypography from './EditorialTypography';
import ParallaxSubject from './ParallaxSubject';

const list = a => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const rise = d => ({ initial: { opacity: 0, y: 28 }, transition: { duration: 0.9, delay: d, ease: [0.22, 1, 0.36, 1] } });
const I = ({ children }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;

// Three-photograph editorial hero: a tall photo on each side and the 3D model in the centre panel,
// with the headline, supporting line and calls to action beneath.
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
  const ship = site.shipping, mins = site.checkout?.reservationMinutes;
  // Trust row: only statements that are true of this store; figures come from the database.
  const trust = [
    [<I key="t"><path d="M3 6h11v10H3z" /><path d="M14 9h4l3 3v4h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></I>, ship?.freeOver ? 'FREE SHIPPING' : 'SHIPPING', ship?.freeOver ? `On orders over ${inr(ship.freeOver)}` : 'Across India'],
    [<I key="s"><path d="M12 3 5 6v5c0 4.4 2.8 8.2 7 10 4.2-1.8 7-5.6 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></I>, 'SECURE PAYMENT', 'Verified by Razorpay'],
    [<I key="c"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></I>, 'HELD AT CHECKOUT', mins ? `Reserved for ${mins} minutes` : 'Reserved while you pay'],
  ];
  const [left, right] = media.heroSides;

  return (
    <section ref={ref} className="hl" data-hero aria-label="Introduction">
      <div className="hl-panel tri">
        <div className="hl-bg" aria-hidden="true">
          <div className="hl-gridwrap" data-gridwrap><div className="hl-grid" /></div>
        </div>

        <div className="tri-grid">
          <motion.figure className="tri-side" {...anim(0.2)}>
            <img src={left.src} alt={left.alt} fetchpriority="high" decoding="async" />
          </motion.figure>

          <div className="tri-main">
            <ParallaxSubject show={show} />
          </div>

          <motion.figure className="tri-side" {...anim(0.3)}>
            <img src={right.src} alt={right.alt} loading="eager" decoding="async" />
          </motion.figure>
        </div>

        <div className="tri-copy" data-hero-copy>
          <EditorialTypography lines={['ELEGANCE BEYOND', 'ORDINARY.']} show={show} className="hl-h" label="Elegance beyond ordinary." />
          <div className="tri-copy-r">
            <motion.p className="hl-line" {...anim(0.75)}>Timeless pieces. Extraordinary presence.</motion.p>
            <motion.p className="hl-sub" {...anim(0.85)}>{support}</motion.p>
            <motion.div className="hl-cta" {...anim(0.95)}>
              <Magnetic strength={0.22}>
                <Link className="hl-btn" to="/shop" data-cursor="EXPLORE"><span>EXPLORE COLLECTION</span><b aria-hidden="true"><i>→</i></b></Link>
              </Magnetic>
              <Link className="hl-link" to="/about" data-cursor="DISCOVER">DISCOVER DHANYA</Link>
            </motion.div>
          </div>
        </div>

        <motion.ul className="hl-trust tri-trust" {...anim(1.1)}>
          {trust.map(([icon, t, s]) => <li key={t}>{icon}<span><b>{t}</b><em>{s}</em></span></li>)}
        </motion.ul>
      </div>
    </section>
  );
}
