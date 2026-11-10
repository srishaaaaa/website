import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRetry } from '../lib/api';
import { Reveal } from './Motion';
import { Item } from './FeaturedCollections';

// Best Sellers shelf: the first four pieces the admin flagged as best sellers (Admin → Inventory → Edit product). Hidden until there are some.
export default function BestSellers() {
  const [items, setItems] = useState([]);
  useEffect(() => { let dead = false; apiRetry('/products?flag=best&limit=4').then(d => !dead && setItems(d.items)).catch(() => {}); return () => { dead = true } }, []);
  if (!items.length) return null;
  return (
    <section className="cu" id="best-sellers" aria-labelledby="best-h">
      <div className="cu-in">
        <Reveal className="cu-head">
          <div><p className="cu-label"><i aria-hidden="true" />BEST SELLERS</p><h2 id="best-h">Most loved pieces.</h2><p className="cu-sub">The pieces our customers come back for.</p></div>
          <Link className="cu-all" to="/shop?flag=best" data-cursor="VIEW">VIEW ALL →</Link>
        </Reveal>
        <ul className="cu-grid">{items.map((p, i) => <Item key={p.id} p={p} i={i} />)}</ul>
      </div>
    </section>
  );
}
