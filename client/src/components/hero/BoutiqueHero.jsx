import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../../context/App';
import { useReduced } from '../../lib/hooks';
import { usePointerVars } from '../../lib/usePointerVars';
import { inr } from '../../lib/format';
import { campaign } from '../../config/content';
import { Magnetic } from '../Motion';
import { ProductMedia } from '../ProductCard3D';
import BlankFrame from '../BlankFrame';
import EditorialTypography from './EditorialTypography';

const rise = d => ({ initial: { opacity: 0, y: 24 }, transition: { duration: 0.9, delay: d, ease: [0.22, 1, 0.36, 1] } });
const CHIPS = [['ALL', '/shop?category=sarees'], ['SILK', '/search?q=silk'], ['COTTON', '/search?q=cotton'], ['FESTIVE', '/collections/festive-edit'], ['BRIDAL', '/collections/bridal-silk-sarees']];

// Editorial hero: a large ivory panel with an oversized serif headline, a model photograph that overlaps the panel,
// a textile inset, and a "For you" discovery panel layered behind. Photographs are managed in
// Admin → Storefront images; until they are added the frames stay blank. Discovery items are real products.
export default function BoutiqueHero() {
  const { entered, catalog, site } = useApp();
  const reduced = useReduced();
  const ref = useRef();
  usePointerVars(ref, !reduced);
  const show = entered; // entrance waits for the intro to finish
  const b = site.branding || {};
  const picks = catalog.featured.slice(0, 6);
  const anim = d => ({ ...rise(d), animate: show ? { opacity: 1, y: 0 } : undefined });

  return (
    <section ref={ref} className="bh" data-hero aria-label="DHANYA BOUTIQUE">
      <div className="bh-wrap">
        <aside className="bh-discover" aria-labelledby="bh-for">
          <h2 id="bh-for" className="bh-for">FOR YOU</h2>
          <ul className="bh-chips">{CHIPS.map(([l, to]) => <li key={l}><Link to={to}>{l}</Link></li>)}</ul>
          <ul className="bh-tiles">
            {picks.length === 0 && [0, 1, 2, 3, 4, 5].map(i => <li key={i} className="bh-tile"><div className="bh-tile-img"><BlankFrame label="Product" /></div></li>)}
            {picks.map(p => (
              <li key={p.id} className="bh-tile">
                <Link to={`/product/${p.slug}`} data-cursor="VIEW" aria-label={`${p.name}, ${inr(p.price)}`}>
                  <span className="bh-tile-img"><ProductMedia p={p} /></span>
                  <strong>{p.name}</strong><em>{inr(p.price)}</em>
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <div className="bh-panel">
          <motion.p className="bh-pill" {...anim(0.1)}><i aria-hidden="true" />{campaign.label}</motion.p>
          <div className="bh-headline">
            <EditorialTypography lines={['TRADITION,', 'REDEFINED.']} show={show} className="bh-h" label="Tradition, redefined." />
            <i className="bh-spark s1" aria-hidden="true" /><i className="bh-spark s2" aria-hidden="true" />
          </div>
          <div className="bh-row">
          <div className="bh-col">
          <motion.p className="bh-desc" {...anim(0.7)}>Discover timeless Indian sarees, celebrating colour, craftsmanship and contemporary elegance.</motion.p>
          <motion.ul className="bh-facts" {...anim(0.8)}><li>ALL KINDS OF SAREES</li><li>WHOLESALE &amp; RETAIL</li></motion.ul>
          <motion.div className="bh-cta" {...anim(0.9)}>
            <Magnetic strength={0.2}><Link className="bh-btn" to="/shop?category=sarees" data-cursor="EXPLORE"><span>EXPLORE COLLECTION</span><b aria-hidden="true"><i>→</i></b></Link></Magnetic>
            <Link className="bh-link" to="/#enquiry" data-cursor="ENQUIRE">WHOLESALE ENQUIRY</Link>
          </motion.div>
          </div>

          <motion.figure className="bh-inset" {...anim(1)}>
            <div className="bh-inset-img">{b.textileImage ? <img src={b.textileImage} alt={b.textileAlt || 'Close-up of saree fabric and zari work'} loading="lazy" /> : <BlankFrame label="Textile close-up" />}</div>
            <figcaption>CRAFTED ELEGANCE</figcaption>
          </motion.figure>
          </div>
          <div className="bh-tint" aria-hidden="true" />
        </div>

        <motion.figure className="bh-model" initial={{ opacity: 0, y: 40 }} animate={show ? { opacity: 1, y: 0 } : undefined} transition={{ duration: 1.1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}>
          {b.heroModel ? <img src={b.heroModel} alt={b.heroAlt || 'A model draped in a saree'} fetchpriority="high" decoding="async" /> : <BlankFrame label="Model photo" className="tall" hint="A full-length photo with a transparent background works best." />}
        </motion.figure>
      </div>
    </section>
  );
}
