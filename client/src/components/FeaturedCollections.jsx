import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { apiRetry } from '../lib/api';
import { inr } from '../lib/format';
import { waLink } from '../lib/contact';
import { useApp } from '../context/App';
import { Reveal } from './Motion';
import { useSiteText } from '../lib/siteText';
import { ProductMedia } from './ProductCard3D';

const LIMIT = 4;

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
        <Link to={`/product/${p.slug}`} data-cursor="VIEW" aria-label={`${p.name}, ${inr(p.price)}`}><ProductMedia p={p} priority={i < 3} /></Link>
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

// Trending collections: only the products the admin picked (Admin → Storefront images → Homepage picks → Trending collections), in that order.
// Until something is picked, the products flagged as featured are shown.
export default function FeaturedCollections() {
  const { catalog, loadCatalog, site } = useApp();
  const t = useSiteText();
  const picks = site.homepage?.trending;
  const key = (picks || []).join(',');
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    if (!key) { setPicked(null); return }
    let dead = false;
    apiRetry(`/products?slugs=${encodeURIComponent(key)}&limit=48`).then(d => {
      if (dead) return;
      const by = Object.fromEntries(d.items.map(p => [p.slug, p]));
      setPicked(key.split(',').map(s => by[s]).filter(Boolean));
    }).catch(() => !dead && setPicked(null));
    return () => { dead = true };
  }, [key]);

  const waiting = site.status === 'loading' || (key && picked === null);
  const items = waiting ? [] : (key ? picked : catalog.featured).slice(0, LIMIT);

  return (
    <section className="cu" id="collection" aria-labelledby="edit-h">
      <div className="cu-in">
        <Reveal className="cu-head">
          <div>
            <p className="cu-label"><i aria-hidden="true" />{t.trendingEyebrow}</p>
            <h2 id="edit-h">{t.trendingTitle}</h2>
            <p className="cu-sub">{t.trendingSub}</p>
          </div>
          <Link className="cu-all" to="/shop?category=sarees" data-cursor="VIEW">VIEW ALL →</Link>
        </Reveal>

        {items.length > 0 && (
          <motion.ul key={key || 'featured'} className="cu-grid" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
            {items.map((p, i) => <Item key={p.id} p={p} i={i} />)}
          </motion.ul>
        )}
        {catalog.status === 'error' && <p className="cu-empty">The collection could not be loaded right now. <button className="btn pill" onClick={loadCatalog}>TRY AGAIN</button></p>}
        {!waiting && catalog.status === 'ready' && !items.length && <p className="cu-empty">New arrivals are being prepared. Please return soon.</p>}
      </div>
    </section>
  );
}
