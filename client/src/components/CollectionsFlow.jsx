import { Link } from 'react-router-dom';
import { useApp } from '../context/App';
import { Reveal } from './Motion';

// "Choose your world": the collections as a clean numbered list (no photographs). The admin chooses which collections appear
// and in what order (Admin → Storefront images → Homepage picks); until then every published collection is listed.
export default function CollectionsFlow() {
  const { catalog, site } = useApp();
  const chosen = site.homepage?.collections || [];
  const cols = (chosen.length ? chosen.map(s => catalog.collections.find(c => c.slug === s)).filter(Boolean) : catalog.collections).slice(0, 8);
  if (!cols.length) return null;
  return (
    <section className="cw" aria-labelledby="cf-h">
      <Reveal className="cw-head">
        <p className="eyebrow">COLLECTIONS</p>
        <h2 id="cf-h">CHOOSE YOUR WORLD.</h2>
      </Reveal>
      <ol className="cw-list">
        {cols.map((c, i) => (
          <Reveal as="li" key={c.slug} delay={(i % 2) * 0.06}>
            <Link to={`/collections/${c.slug}`} className="cw-row" data-cursor="EXPLORE" aria-label={`${c.name}, ${c.product_count} pieces`}>
              <span className="cw-n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <span className="cw-t">
                <strong>{c.name}</strong>
                {c.description && <em>{c.description}</em>}
              </span>
              <span className="cw-c">{c.product_count} {c.product_count === 1 ? 'piece' : 'pieces'}</span>
              <span className="cw-go" aria-hidden="true">→</span>
            </Link>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
