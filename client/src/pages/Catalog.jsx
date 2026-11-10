import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { toQuery, useFilters } from '../lib/filters';
import { api } from '../lib/api';
import ProductCard, { CardSkeletons } from '../components/ProductCard3D';

const PAGE = 12;
const SORTS = [['featured', 'Featured'], ['newest', 'Newest'], ['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low']];
const NO_FACETS = { categories: [], materials: [], sizes: [], colors: [], maxPrice: 0 };

// Shared by /shop, /collections/:slug and /search. `base` = { collection?, q? }; filtering, sorting and
// pagination are done by the server (GET /api/products).
export default function Catalog({ base = {}, title, eyebrow, intro, emptyNote }) {
  const { f, set, clear, count } = useFilters();
  const [state, setState] = useState({ items: [], total: 0, page: 1, pages: 1, facets: NO_FACETS, status: 'loading' });
  const [more, setMore] = useState(false);
  const key = JSON.stringify([base, f]);
  if (f.flag === 'best') { title = 'Best Sellers'; eyebrow = 'SHOP'; intro = 'The pieces our customers come back for.' }
  const seq = useRef(0);

  const load = async (page, append) => {
    const mine = ++seq.current;
    if (append) setMore(true); else setState(s => ({ ...s, status: 'loading' }));
    try {
      const q = toQuery(f, base, page, PAGE); if (!append) q.set('facets', '1');
      const d = await api('/products?' + q);
      if (mine !== seq.current) return; // a newer request superseded this one
      setState(s => ({ items: append ? [...s.items, ...d.items] : d.items, total: d.total, page: d.page, pages: d.pages, facets: d.facets ?? s.facets, status: 'ready' }));
    } catch { if (mine === seq.current) setState(s => ({ ...s, status: 'error' })) }
    finally { if (mine === seq.current) setMore(false) }
  };
  useEffect(() => { const t = setTimeout(() => load(1, false), 120); return () => clearTimeout(t) }, [key]); // eslint-disable-line

  const { items, total, facets: fx, status } = state;
  const loading = status === 'loading';
  return (
    <div className="catalog">
      <header className="cat-hero">
        <div className="cat-hero-in">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="serif">{title}</h1>
          {intro && <p className="cat-intro">{intro}</p>}
        </div>
      </header>

      {!base.q && fx.categories.length > 0 && (
        <nav className="cat-tabs" aria-label="Categories">
          <button type="button" className={!f.category.length ? 'on' : ''} aria-pressed={!f.category.length} onClick={() => set({ category: [] })}>All</button>
          {fx.categories.map(c => <button key={c.slug} type="button" className={f.category[0] === c.slug ? 'on' : ''} aria-pressed={f.category[0] === c.slug} onClick={() => set({ category: [c.slug] })}>{c.name}</button>)}
        </nav>)}
      <div className="toolbar" role="region" aria-label="Sort and view">
        <p className="muted small" aria-live="polite">{loading && !items.length ? 'Loading…' : `${total} ${total === 1 ? 'piece' : 'pieces'}`}</p>
        <div className="toolbar-r">
          <label className="sel"><span className="sr">Sort by</span>
            <select value={f.sort} onChange={e => set({ sort: e.target.value })} aria-label="Sort by">{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <div className="views" role="group" aria-label="Grid density">
            {[2, 3].map(n => <button key={n} className={f.view === n ? 'on' : ''} onClick={() => set({ view: n })} aria-pressed={f.view === n} aria-label={n === 2 ? 'Large grid' : 'Compact grid'}>{Array.from({ length: n }, (_, i) => <i key={i} />)}</button>)}
          </div>
        </div>
      </div>

      <LayoutGroup>
        <motion.div layout className={`pgrid cols-${f.view}`}>
          {loading && !items.length && <CardSkeletons n={6} />}
          <AnimatePresence mode="popLayout">
            {items.map((p, i) => (
              <motion.div layout key={p.id} initial={{ opacity: 0, y: 24 }} animate={{ opacity: loading ? 0.5 : 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.5, delay: Math.min(i % PAGE, 8) * 0.03, ease: [0.22, 1, 0.36, 1] }}>
                <ProductCard p={p} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>

      {status === 'error' && <div className="empty"><p className="serif big">The collection could not be loaded.</p><button className="btn" onClick={() => load(1, false)}>TRY AGAIN</button></div>}
      {status === 'ready' && !items.length && (
        <div className="empty"><p className="serif big">{count ? 'No pieces match these filters.' : emptyNote || 'No pieces here yet.'}</p>
          {count > 0 ? <button className="btn" onClick={clear}>CLEAR FILTERS</button> : <Link className="btn" to="/shop">BROWSE ALL</Link>}</div>
      )}
      {state.page < state.pages && <div className="center"><button className="btn dark" disabled={more} onClick={() => load(state.page + 1, true)}>{more ? 'LOADING…' : `LOAD MORE (${total - items.length})`}</button></div>}
    </div>
  );
}
