import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../lib/api';
import { useApp } from '../context/App';
import { Magnetic, Reveal } from './Motion';
import ProductCard, { CardSkeletons } from './ProductCard3D';

// Lookbook tabs: each is a real query against the catalogue; tabs that return nothing are hidden.
const TABS = [
  ['featured', 'Featured', 'featured=1', '/shop'],
  ['trending', 'Trending sarees', 'collection=trending-sarees', '/collections/trending-sarees'],
  ['bridal', 'Bridal silk', 'collection=bridal-silk-sarees', '/collections/bridal-silk-sarees'],
  ['lehengas', 'Lehengas', 'category=lehengas', '/shop?category=lehengas'],
  ['couple', 'Couple combos', 'category=couple-combos', '/shop?category=couple-combos'],
];

// An editorial lookbook of real products: one lead look beside four supporting pieces, switchable by tab.
export default function FeaturedCollections() {
  const { catalog } = useApp();
  const [data, setData] = useState({});       // tab key -> { items, total }
  const [tab, setTab] = useState('featured');

  useEffect(() => {
    let dead = false;
    Promise.all(TABS.map(([key, , q]) => api(`/products?${q}&limit=5`).then(d => [key, { items: d.items, total: d.total }]).catch(() => [key, { items: [], total: 0 }])))
      .then(r => { if (!dead) setData(Object.fromEntries(r)) });
    return () => { dead = true };
  }, []);

  const tabs = TABS.filter(([key]) => !data[key] || data[key].total > 0);
  const current = tabs.find(([key]) => key === tab) || tabs[0];
  const entry = current && data[current[0]];
  const items = entry?.items ?? (current?.[0] === 'featured' ? catalog.featured.slice(0, 5) : []);
  const loading = !entry && catalog.status === 'loading';

  return (
    <section className="lb-sec" data-edit aria-labelledby="edit-h">
      <div className="lb-panel">
        <Reveal className="lb-head">
          <div>
            <p className="eyebrow orn"><i aria-hidden="true" />THE CURATED EDIT<i aria-hidden="true" /></p>
            <h2 id="edit-h">CURATED FOR<br />YOUR WORLD.</h2>
          </div>
          <div className="lb-side">
            <div className="lb-tabs" role="tablist" aria-label="Collections">
              {tabs.map(([key, label]) => (
                <button key={key} role="tab" aria-selected={current?.[0] === key} className={current?.[0] === key ? 'on' : ''} onClick={() => setTab(key)}>{label}</button>
              ))}
            </div>
            {current && <Link className="lb-all" to={current[3]} data-cursor="VIEW">VIEW ALL <span aria-hidden="true">→</span></Link>}
          </div>
        </Reveal>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={current?.[0] ?? 'none'} className="lb-grid" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
            {loading && <CardSkeletons n={5} />}
            {items.map((p, i) => <div key={p.id} className={`lb-item lb-${i}`}><ProductCard p={p} index={i} tall={i === 0} /></div>)}
          </motion.div>
        </AnimatePresence>

        {catalog.status === 'error' && <p className="muted center">The edit could not be loaded right now.</p>}
        {catalog.status === 'ready' && !items.length && entry && <p className="muted center">This edit is being prepared. Please return soon.</p>}

        <div className="lb-foot">
          <Magnetic><Link className="btn solid pill" to="/shop" data-cursor="SHOP">SHOP ALL PIECES</Link></Magnetic>
          <ul className="lb-cats" aria-label="Browse by category">
            {catalog.categories.slice(0, 6).map(c => <li key={c.slug}><Link to={`/shop?category=${c.slug}`}>{c.name}</Link></li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}
