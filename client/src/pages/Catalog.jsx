import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useModal } from '../lib/hooks';
import { toQuery, useFilters } from '../lib/filters';
import { api } from '../lib/api';
import { SIZE_ORDER, inr } from '../lib/format';
import ProductCard, { CardSkeletons } from '../components/ProductCard3D';

const PAGE = 12;
const SORTS = [['featured', 'Featured'], ['newest', 'Newest'], ['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low']];
const rank = s => { const i = SIZE_ORDER.indexOf(s); return i < 0 ? 99 : i };
const toggle = (list, v) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
const NO_FACETS = { categories: [], materials: [], sizes: [], colors: [], maxPrice: 0 };

function FilterDrawer({ open, onClose, fx, f, set, clear, count, total }) {
  const ref = useRef();
  useModal(open, onClose, ref);
  const group = (title, items, k) => items.length > 0 && (
    <fieldset><legend className="eyebrow">{title}</legend><div className="chips">{items.map(({ value, label }) => (
      <button key={value} type="button" className={`chip ${f[k].includes(value) ? 'on' : ''}`} aria-pressed={f[k].includes(value)} onClick={() => set({ [k]: toggle(f[k], value) })}>{label}</button>))}</div></fieldset>
  );
  const plain = a => a.map(v => ({ value: v, label: v }));
  return (
    <AnimatePresence>
      {open && (
        <div className="overlay-root">
          <motion.div className="scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.aside ref={ref} className="drawer left glass refine" role="dialog" aria-modal="true" aria-label="Filters" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
            <header className="drawer-head"><h2 className="serif">Refine</h2><button className="icon-btn" onClick={onClose} aria-label="Close filters">✕</button></header>
            <div className="drawer-body filters">
              {group('Category', fx.categories.map(c => ({ value: c.slug, label: c.name })), 'category')}
              {group('Fabric', plain(fx.materials || []), 'material')}
              {group('Size', plain([...fx.sizes].sort((a, b) => rank(a) - rank(b))), 'size')}
              {group('Colour', plain(fx.colors), 'color')}
              <fieldset><legend className="eyebrow">Price (₹)</legend>
                <div className="price-row">
                  <input type="number" min="0" inputMode="numeric" placeholder="Min" aria-label="Minimum price in rupees" value={f.min ?? ''} onChange={e => set({ min: e.target.value })} />
                  <span aria-hidden="true">–</span>
                  <input type="number" min="0" inputMode="numeric" placeholder={fx.maxPrice ? `Max ${Math.round(fx.maxPrice / 100)}` : 'Max'} aria-label="Maximum price in rupees" value={f.max ?? ''} onChange={e => set({ max: e.target.value })} />
                </div></fieldset>
              <fieldset><legend className="eyebrow">Availability</legend>
                <label className="check"><input type="checkbox" checked={f.stock} onChange={e => set({ stock: e.target.checked })} /> In stock only</label></fieldset>
            </div>
            <footer className="drawer-foot">
              <button className="btn solid wide" onClick={onClose}>SHOW {total} {total === 1 ? 'PIECE' : 'PIECES'}</button>
              {count > 0 && <button className="link-u center" onClick={clear}>Clear all filters</button>}
            </footer>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

// Shared by /shop, /collections/:slug and /search. `base` = { collection?, q? }; filtering, sorting and
// pagination are done by the server (GET /api/products).
export default function Catalog({ base = {}, title, eyebrow, intro, banner, emptyNote }) {
  const { f, set, clear, count } = useFilters();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ items: [], total: 0, page: 1, pages: 1, facets: NO_FACETS, status: 'loading' });
  const [more, setMore] = useState(false);
  const key = JSON.stringify([base, f]);
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
  const catName = slug => fx.categories.find(c => c.slug === slug)?.name || slug;
  const chips = [
    ...f.category.map(v => ({ v: catName(v), remove: () => set({ category: f.category.filter(x => x !== v) }) })),
    ...f.material.map(v => ({ v, remove: () => set({ material: f.material.filter(x => x !== v) }) })),
    ...f.size.map(v => ({ v: `Size ${v}`, remove: () => set({ size: f.size.filter(x => x !== v) }) })),
    ...f.color.map(v => ({ v, remove: () => set({ color: f.color.filter(x => x !== v) }) })),
  ];
  if (f.min != null) chips.push({ v: `From ${inr(f.min * 100)}`, remove: () => set({ min: '' }) });
  if (f.max != null) chips.push({ v: `Up to ${inr(f.max * 100)}`, remove: () => set({ max: '' }) });
  if (f.stock) chips.push({ v: 'In stock', remove: () => set({ stock: false }) });

  return (
    <div className="catalog">
      <header className="cat-hero">
        <div className="cat-hero-in">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="serif">{title}</h1>
          {intro && <p className="cat-intro">{intro}</p>}
        </div>
      </header>

      <div className="toolbar" role="region" aria-label="Filter and sort">
        <button className="btn" onClick={() => setOpen(true)} aria-haspopup="dialog">FILTER{count ? ` (${count})` : ''}</button>
        <p className="muted small" aria-live="polite">{loading && !items.length ? 'Loading…' : `${total} ${total === 1 ? 'piece' : 'pieces'}`}</p>
        <div className="toolbar-r">
          <label className="sel"><span className="sr">Sort by</span>
            <select value={f.sort} onChange={e => set({ sort: e.target.value })} aria-label="Sort by">{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <div className="views" role="group" aria-label="Grid density">
            {[2, 3].map(n => <button key={n} className={f.view === n ? 'on' : ''} onClick={() => set({ view: n })} aria-pressed={f.view === n} aria-label={n === 2 ? 'Large grid' : 'Compact grid'}>{Array.from({ length: n }, (_, i) => <i key={i} />)}</button>)}
          </div>
        </div>
      </div>

      {chips.length > 0 && <div className="active-chips">{chips.map(c => <button key={c.v} className="chip on" onClick={c.remove} aria-label={`Remove filter ${c.v}`}>{c.v} ✕</button>)}<button className="link-u small" onClick={clear}>Clear all</button></div>}

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
      <FilterDrawer open={open} onClose={() => setOpen(false)} fx={fx} f={f} set={set} clear={clear} count={count} total={total} />
    </div>
  );
}
