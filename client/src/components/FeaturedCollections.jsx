import { Link } from 'react-router-dom';
import { useApp } from '../context/App';
import { Magnetic, Reveal } from './Motion';
import ProductCard, { CardSkeletons } from './ProductCard3D';

// Real featured products from the database in an asymmetric editorial grid.
export default function FeaturedCollections() {
  const { catalog } = useApp();
  const loading = catalog.status === 'loading';
  const picks = catalog.featured.slice(0, 5);
  return (
    <section className="ivory-sec edit" data-edit aria-labelledby="edit-h">
      <Reveal className="sec-head"><p className="eyebrow">THE CURATED EDIT</p><h2 id="edit-h" className="serif">CURATED FOR YOUR WORLD.</h2></Reveal>
      <div className="edit-grid">
        {loading && <CardSkeletons n={4} />}
        {picks.map((p, i) => <Reveal key={p.id} delay={(i % 3) * 0.1} className={`edit-item e${i}`}><ProductCard p={p} tall={i % 2 === 0} /></Reveal>)}
      </div>
      {catalog.status === 'error' && <p className="muted center">The edit could not be loaded right now.</p>}
      {catalog.status === 'ready' && !picks.length && <p className="muted center">The edit is being prepared. Please return soon.</p>}
      <Reveal className="center"><Magnetic><Link className="btn dark pill" to="/shop" data-cursor="SHOP">SHOP ALL PIECES</Link></Magnetic></Reveal>
    </section>
  );
}
