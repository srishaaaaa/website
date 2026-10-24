import { Link } from 'react-router-dom';
import { useApp } from '../context/App';
import { brand } from '../config/content';
import { Reveal } from './Motion';
import { ProductMedia } from './ProductCard3D';

const Star = () => <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 2.2 6.3L21 9l-5 4.2L17.6 20 12 16.4 6.4 20 8 13.2 3 9l6.8-.7z" fill="#d7897a" /></svg>;

// About us: photo (with a corner link icon) on the left; story text and three real category highlights on the right.
// Everything shown is real data (products and categories from the database).
export default function AboutBand() {
  const { catalog } = useApp();
  const lead = catalog.featured[0];
  const top = [...catalog.categories].filter(c => c.product_count > 0).sort((a, b) => b.product_count - a.product_count).slice(0, 3);
  return (
    <section className="ab4" aria-labelledby="ab4-h">
      <div className="ab4-in">
        <Reveal className="ab4-left">
          <h2 id="ab4-h" className="ab4-h">ABOUT US</h2>
          <div className="ab4-photo">
            <ProductMedia p={lead || { slug: 'about', name: 'DHANYA' }} view={0} />
            <Link to="/about" className="ab4-corner" aria-label="Read our story" data-cursor="OPEN"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" /></svg></Link>
          </div>
        </Reveal>

        <Reveal className="ab4-right" delay={0.1}>
          <h2 className="ab4-h ab4-h-c">OUR COLLECTIONS</h2>
          <p>{brand.story[0]}</p>
          <p>{brand.story[1]}</p>
          {top.length > 0 && (
            <ul className="ab4-cols">
              {top.map(c => (
                <li key={c.slug}>
                  <Star />
                  <Link to={`/shop?category=${c.slug}`} className="ab4-cat" data-cursor="VIEW"><strong>{c.name}</strong><span>{c.product_count} {c.product_count === 1 ? 'piece' : 'pieces'}</span></Link>
                </li>
              ))}
            </ul>
          )}
        </Reveal>
      </div>
    </section>
  );
}
