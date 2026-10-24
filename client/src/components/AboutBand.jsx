import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../context/App';
import { brand } from '../config/content';
import { Reveal } from './Motion';
import { ProductMedia } from './ProductCard3D';
import { Stars } from './CustomerReviews';

// Three-column "About us": a real product on the left, the brand intro with the newest pieces in the middle,
// and review rating + shop links on the right. Everything shown is real data (products, ratings, categories).
export default function AboutBand() {
  const { catalog } = useApp();
  const [rv, setRv] = useState(null);
  useEffect(() => { api('/reviews?limit=1').then(setRv).catch(() => {}) }, []);
  const lead = catalog.featured[0];
  const pieces = catalog.featured.slice(0, 7);
  return (
    <section className="ab3" aria-labelledby="ab3-h">
      <div className="ab3-grid">
        <Reveal className="ab3-media">
          <h2 className="ab3-h2 eyebrow-h">ABOUT US</h2>
          <Link to={lead ? `/product/${lead.slug}` : '/shop'} className="ab3-photo" data-cursor="VIEW" aria-label={lead ? `View ${lead.name}` : 'Shop'}>
            {lead ? <ProductMedia p={lead} view={1} /> : <ProductMedia p={{ slug: 'about', name: 'DHANYA' }} view={1} />}
          </Link>
        </Reveal>

        <Reveal className="ab3-copy" delay={0.08}>
          <h2 id="ab3-h" className="ab3-h2">ABOUT US</h2>
          <p>{brand.story[0]}</p>
          <p>{brand.story[1]}</p>
          {pieces.length > 0 && (
            <div className="ab3-new">
              <p className="ab3-cap">NEWLY FEATURED PIECES</p>
              <ul>{pieces.map(p => (
                <li key={p.id}><Link to={`/product/${p.slug}`} className="ab3-dot" aria-label={p.name} title={p.name}><ProductMedia p={p} /></Link></li>))}</ul>
            </div>
          )}
        </Reveal>

        <Reveal className="ab3-side" delay={0.16}>
          <h2 className="ab3-h2">COLLECTIONS</h2>
          {rv?.count > 0 && <p className="ab3-rate"><Stars n={Math.round(rv.average)} size={18} /><span>{rv.average.toFixed(1)} / 5 from {rv.count} {rv.onlySamples ? 'sample' : 'verified'} {rv.count === 1 ? 'review' : 'reviews'}</span></p>}
          <p className="ab3-lead">{brand.promise}</p>
          {catalog.categories.length > 0 && <p className="ab3-cats">{catalog.categories.filter(c => c.product_count > 0).slice(0, 5).map(c => c.name).join(' · ')}</p>}
          <Link to="/shop" className="ab3-btn" data-cursor="SHOP">SHOP THE RANGE</Link>
          <Link to="/collections" className="ab3-link" data-cursor="EXPLORE">View all collections <span aria-hidden="true">→</span></Link>
        </Reveal>
      </div>
    </section>
  );
}
