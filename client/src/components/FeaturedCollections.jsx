import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api, apiRetry } from '../lib/api';
import { inr } from '../lib/format';
import { waLink } from '../lib/contact';
import { useApp } from '../context/App';
import { Reveal } from './Motion';
import { ProductMedia } from './ProductCard3D';

// Each tab is a real query against the catalogue; tabs with no results are hidden automatically.
const TABS = [
  ['all', 'ALL SAREES', 'category=sarees'],
  ['silk', 'SILK', 'category=sarees&q=silk'],
  ['cotton', 'COTTON', 'category=sarees&q=cotton'],
  ['designer', 'DESIGNER', 'category=sarees&q=designer'],
  ['festive', 'FESTIVE', 'collection=festive-edit'],
  ['bridal', 'BRIDAL', 'collection=bridal-silk-sarees'],
];
const LIMIT = 5;

function Item({ p, i }) {
  const { addToBag, setQuick, toast, wish, toggleWish, site } = useApp();
  const [busy, setBusy] = useState(false);
  const out = p.stock < 1, liked = wish.includes(p.slug);
  const enquire = waLink(site.store?.phone, `Hello DHANYA BOUTIQUE, I would like to enquire about "${p.name}" (${inr(p.price)}).`);
  // One purchasable variant adds straight to the bag; otherwise the size picker (quick view) opens first.
  const add = async () => {
    if (!p.single_variant) return setQuick(p);
    setBusy(true);
    if (await addToBag({ variantId: p.single_variant })) toast(`${p.name} added to your bag.`);
    setBusy(false);
  };
  return (
    <li className={`cu-item cu-${i}`}>
      <div className="cu-photo">
        <Link to={`/product/${p.slug}`} data-cursor="VIEW" aria-label={`${p.name}, ${inr(p.price)}`}><ProductMedia p={p} /></Link>
        <button className={`cu-heart ${liked ? 'on' : ''}`} onClick={() => toggleWish(p.slug, p.name)} aria-pressed={liked} aria-label={liked ? `Remove ${p.name} from wishlist` : `Save ${p.name} to wishlist`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.3A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3Z" /></svg>
        </button>
        {out && <span className="cu-out">SOLD OUT</span>}
      </div>
      <div className="cu-meta">
        <Link to={`/product/${p.slug}`} className="cu-name">{p.name}</Link>
        {p.material && <span className="cu-mat">{p.material}</span>}
        <div className="cu-row">
          {!out
            ? <button className="cu-pill" onClick={add} disabled={busy} aria-label={p.single_variant ? `Add ${p.name} to bag for ${inr(p.price)}` : `Choose a size for ${p.name}, ${inr(p.price)}`}><b aria-hidden="true">+</b> {inr(p.price)}</button>
            : <span className="cu-pill off">{inr(p.price)}</span>}
          {enquire && <a className="cu-enq" href={enquire} target="_blank" rel="noopener noreferrer" aria-label={`Enquire about ${p.name} on WhatsApp`}>ENQUIRE</a>}
        </div>
      </div>
    </li>
  );
}

export default function FeaturedCollections() {
  const { catalog, loadCatalog } = useApp();
  const [data, setData] = useState({});
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [live, setLive] = useState(null); // { items, total } while a search is active

  useEffect(() => {
    let dead = false;
    Promise.all(TABS.map(([key, , qs]) => apiRetry(`/products?${qs}&limit=${LIMIT}`).then(d => [key, { items: d.items, total: d.total }]).catch(() => [key, { items: [], total: 0 }])))
      .then(r => { if (!dead) setData(Object.fromEntries(r)) });
    return () => { dead = true };
  }, []);

  // Typed search runs against the live catalogue (name, fabric, description), within sarees.
  useEffect(() => {
    const term = q.trim(); if (!term) { setLive(null); return }
    let dead = false;
    const t = setTimeout(() => api(`/products?category=sarees&q=${encodeURIComponent(term)}&limit=${LIMIT}`).then(d => !dead && setLive({ items: d.items, total: d.total })).catch(() => !dead && setLive({ items: [], total: 0 })), 250);
    return () => { dead = true; clearTimeout(t) };
  }, [q]);

  const tabs = TABS.filter(([key]) => !data[key] || data[key].total > 0);
  const current = tabs.find(([key]) => key === tab) || tabs[0];
  const entry = live ?? (current && data[current[0]]);
  const items = entry?.items ?? (current?.[0] === 'all' ? catalog.featured.slice(0, LIMIT) : []);
  const qs = current?.[2] || 'category=sarees';
  const viewAll = live ? `/search?q=${encodeURIComponent(q.trim())}` : qs.includes('q=') ? `/search?q=${qs.split('q=')[1]}` : qs.startsWith('collection=') ? `/collections/${qs.split('=')[1]}` : `/shop?${qs}`;

  return (
    <section className="cu" id="collection" aria-labelledby="edit-h">
      <div className="cu-in">
        <Reveal className="cu-head">
          <div>
            <p className="cu-label"><i aria-hidden="true" />COLLECTION</p>
            <h2 id="edit-h">CURATED FOR YOU</h2>
            <p className="cu-sub">Explore sarees for every expression of tradition and style.</p>
          </div>
          <label className="cu-search"><span className="sr">Search sarees</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search sarees, fabrics…" aria-label="Search sarees" /></label>
        </Reveal>

        <div className="cu-tabs" role="tablist" aria-label="Saree categories">
          {tabs.map(([key, label]) => <button key={key} role="tab" aria-selected={!live && current?.[0] === key} className={!live && current?.[0] === key ? 'on' : ''} onClick={() => { setQ(''); setTab(key) }}>{label}</button>)}
          <Link className="cu-all" to={viewAll} data-cursor="VIEW">VIEW ALL →</Link>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.ul key={live ? 'search' : current?.[0] ?? 'none'} className="cu-grid" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
            {items.map((p, i) => <Item key={p.id} p={p} i={i} />)}
          </motion.ul>
        </AnimatePresence>
        {live && !items.length && <p className="cu-empty">No sarees match “{q.trim()}”. Try a fabric such as silk or cotton.</p>}
        {catalog.status === 'error' && <p className="cu-empty">The collection could not be loaded right now. <button className="btn pill" onClick={loadCatalog}>TRY AGAIN</button></p>}
        {!live && catalog.status === 'ready' && entry && !items.length && <p className="cu-empty">This collection is being prepared. Please return soon.</p>}
      </div>
    </section>
  );
}
