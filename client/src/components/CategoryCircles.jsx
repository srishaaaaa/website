import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/App';
import { Reveal } from './Motion';
import { ProductMedia } from './ProductCard3D';

const SORTS = { pieces: ['Most pieces', (a, b) => b.product_count - a.product_count], az: ['A to Z', (a, b) => a.name.localeCompare(b.name)] };

// Featured categories as tall photo cards with a label plate. Built from the real categories: the photo is the
// category cover from Admin → Storefront images, else the lead product's photo, else a generated placeholder.
export default function CategoryCircles() {
  const { catalog, site } = useApp();
  const chosen = site.homepage?.categories || [];
  const [sort, setSort] = useState('pieces');
  const [all, setAll] = useState(false);
  const live = catalog.categories.filter(c => c.product_count > 0);
  const cats = chosen.length ? chosen.map(s => live.find(c => c.slug === s)).filter(Boolean) : live.sort(SORTS[sort][1]);
  if (!cats.length) return null;
  const shown = all ? cats : cats.slice(0, 4);
  return (
    <section className="cc" aria-labelledby="cc-h">
      <div className="cc-bar">
        <Reveal><h2 id="cc-h" className="cc-title">FEATURED CATEGORIES</h2></Reveal>
        {!chosen.length && <label className="cc-sort"><span className="sr">Sort categories</span>
          <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort categories">{Object.entries(SORTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></label>}
      </div>
      <ul className="cc-grid">
        {shown.map((c, i) => (
          <Reveal as="li" key={c.slug} delay={(i % 4) * 0.07}>
            <Link to={`/shop?category=${c.slug}`} className="cc-card" data-cursor="VIEW" aria-label={`${c.name}, ${c.product_count} pieces`}>
              <span className="cc-photo"><ProductMedia p={{ slug: c.slug, name: c.name, image: c.image_url || c.cover_image, image_pos: c.image_pos }} view={i % 4} /></span>
              <span className="cc-go" aria-hidden="true">↗</span>
              <span className="cc-plate"><strong>{c.name}</strong><em>{c.product_count} {c.product_count === 1 ? 'piece' : 'pieces'}</em></span>
            </Link>
          </Reveal>
        ))}
      </ul>
      {cats.length > 4 && <div className="cc-more"><button className="btn dark pill" onClick={() => setAll(v => !v)}>{all ? 'SHOW FEWER' : `VIEW ALL ${cats.length} CATEGORIES`}</button></div>}
    </section>
  );
}
