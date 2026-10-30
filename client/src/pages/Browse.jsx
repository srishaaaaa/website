import { Link, useParams, useSearchParams } from 'react-router-dom';
import Catalog from './Catalog';
import { Reveal } from '../components/Motion';
import { useApp } from '../context/App';

const empty = (msg, to = '/collections', label = 'ALL COLLECTIONS') => <div className="empty page-pad"><p className="serif big">{msg}</p><Link className="btn" to={to}>{label}</Link></div>;

export function Shop() {
  return <Catalog title="The Collection" eyebrow="SHOP" intro="Every piece, in one place." banner="shop" emptyNote="The collection is being prepared." />;
}

export function Collections() {
  const { catalog } = useApp();
  const { collections, status } = catalog;
  return (
    <div className="catalog">
      <header className="cat-hero"><div className="cat-hero-in"><p className="eyebrow">COLLECTIONS</p><h1 className="serif">Choose your world.</h1></div></header>
      <div className="col-list">
        {status === 'loading' && <p className="muted">Loading collections…</p>}
        {collections.map((c, i) => (
          <Reveal key={c.slug} delay={Math.min(i, 6) * 0.04}>
            <Link to={`/collections/${c.slug}`} className="col-row" data-cursor="EXPLORE">
              <span className="col-n">{String(i + 1).padStart(2, '0')}</span>
              <span className="col-name serif">{c.name}</span>
              <span className="col-count">{c.product_count} {c.product_count === 1 ? 'piece' : 'pieces'}</span>
              <span className="col-arrow" aria-hidden="true">→</span>
            </Link>
          </Reveal>
        ))}
      </div>
      {status === 'ready' && !collections.length && <div className="empty"><p className="serif big">No collections yet.</p></div>}
      {status === 'error' && <div className="empty"><p className="serif big">Collections could not be loaded.</p></div>}
    </div>
  );
}

export function CollectionPage() {
  const { slug } = useParams();
  const { catalog } = useApp();
  if (catalog.status === 'loading') return <div className="page-pad"><p className="muted">Loading…</p></div>;
  const col = catalog.collections.find(c => c.slug === slug);
  if (!col) return empty('We could not find that collection.');
  return <Catalog base={{ collection: slug }} title={col.name} eyebrow="COLLECTION" intro={col.description} banner={col.cover?.slug || slug} />;
}

export function Search() {
  const [sp] = useSearchParams();
  const q = (sp.get('q') || '').trim();
  if (!q) return empty('What are you looking for?', '/shop', 'BROWSE THE COLLECTION');
  return <Catalog base={{ q }} title={`Results for “${q}”`} eyebrow="SEARCH" emptyNote={`Nothing matched “${q}”. Try a category such as a saree or kurta.`} />;
}
