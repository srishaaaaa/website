import { Link } from 'react-router-dom';
import { useApp } from '../context/App';
import { Reveal } from './Motion';
import { ProductMedia } from './ProductCard3D';

// Round category tiles built from the real categories (ordered by how many pieces each holds).
// Uses a category cover uploaded in Admin → Storefront images; otherwise a generated placeholder.
export default function CategoryCircles() {
  const { catalog } = useApp();
  const cats = [...catalog.categories].filter(c => c.product_count > 0).sort((a, b) => b.product_count - a.product_count).slice(0, 8);
  if (!cats.length) return null;
  return (
    <section className="cc" aria-labelledby="cc-h">
      <Reveal className="cc-head"><p className="eyebrow">BROWSE</p><h2 id="cc-h">SHOP BY CATEGORY</h2></Reveal>
      <ul className="cc-row">
        {cats.map((c, i) => (
          <Reveal as="li" key={c.slug} delay={i * 0.05}>
            <Link to={`/shop?category=${c.slug}`} className="cc-item" data-cursor="VIEW" aria-label={`${c.name}, ${c.product_count} pieces`}>
              <span className="cc-img"><ProductMedia p={{ slug: c.slug, name: c.name, image: c.image_url }} view={i % 4} /></span>
              <span className="cc-name">{c.name}</span>
              <span className="cc-n">{c.product_count} {c.product_count === 1 ? 'piece' : 'pieces'} <i aria-hidden="true">→</i></span>
            </Link>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
