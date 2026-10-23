import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { brand, media } from '../config/content';
import { useApp } from '../context/App';
import { Reveal } from '../components/Motion';
import { Emblem } from '../components/Wordmark';
import { ProductMedia } from '../components/ProductCard3D';
import ServiceHighlights from '../components/ServiceHighlights';
import StoreLocationMap from '../components/StoreLocationMap';

export function About() {
  const { catalog } = useApp();
  const cats = catalog.categories, cols = catalog.collections;
  const total = cats.reduce((s, c) => s + c.product_count, 0);
  const steps = [
    ['01', 'Browse', 'Filter by category, size, colour, price and fabric. Collections group pieces for weddings, festivals and evenings.'],
    ['02', 'Choose your size', 'Every size shows live availability, so what you see is what can be yours.'],
    ['03', 'Pay securely', 'Checkout is calculated on our server and paid through Razorpay. An order is only confirmed once payment is verified.'],
    ['04', 'Track it', 'Sign in to see your orders, keep a wishlist and find your bag waiting on any device.'],
  ];
  return (
    <div className="about2">
      <header className="ab-hero">
        <div className="ab-hero-copy">
          <p className="eyebrow">OUR STORY</p>
          <h1>AN INDIAN SOUL.<br />A MODERN WARDROBE.</h1>
          <p className="ab-lead">{brand.positioning}</p>
          <p className="ab-sub">{brand.promise}</p>
          <div className="ab-cta"><Link className="btn solid pill" to="/shop" data-cursor="SHOP">EXPLORE COLLECTION</Link><Link className="hl-link" to="/collections" data-cursor="EXPLORE">VIEW COLLECTIONS</Link></div>
        </div>
        <div className="ab-photo">
          <img src={media.heroImageWide} alt="A woman seated in a sage-gold saree against a rose-pink wall" width="669" height="585" />
          {total > 0 && <span className="ab-chip c1"><b>{total}</b> pieces</span>}
          {cols.length > 0 && <span className="ab-chip c2"><b>{cols.length}</b> collections</span>}
        </div>
      </header>

      <section className="ab-stats" aria-label="DHANYA at a glance">
        {[[total || '—', 'Pieces in the collection'], [cats.length || '—', 'Categories, from sarees to couple combos'], [cols.length || '—', 'Curated collections'], ['India', 'Delivered across the country']].map(([n, l]) => (
          <Reveal key={l} className="ab-stat"><strong>{n}</strong><span>{l}</span></Reveal>
        ))}
      </section>

      {cats.length > 0 && (
        <section className="ab-make" aria-labelledby="ab-make-h">
          <Reveal className="sec-head"><p className="eyebrow">WHAT WE OFFER</p><h2 id="ab-make-h">EVERYTHING SHE WEARS, UNDER ONE ROOF.</h2></Reveal>
          <ul className="ab-cats">
            {cats.map((c, i) => (
              <Reveal as="li" key={c.slug} delay={(i % 5) * 0.05}>
                <Link to={`/shop?category=${c.slug}`} className="ab-cat" data-cursor="VIEW">
                  <span className="ab-cat-img"><ProductMedia p={{ slug: c.slug, name: c.name, image: c.image_url }} view={i % 4} /></span>
                  <span className="ab-cat-t"><strong>{c.name}</strong><span>{c.product_count} {c.product_count === 1 ? 'piece' : 'pieces'}</span></span>
                </Link>
              </Reveal>
            ))}
          </ul>
        </section>
      )}

      <section className="ab-steps" aria-labelledby="ab-steps-h">
        <Reveal className="sec-head"><p className="eyebrow">HOW IT WORKS</p><h2 id="ab-steps-h">FROM FIRST LOOK TO YOUR DOORSTEP.</h2></Reveal>
        <ol className="ab-steps-grid">
          {steps.map(([n, t, d], i) => <Reveal as="li" key={n} delay={i * 0.07} className="ab-step"><span>{n}</span><h3>{t}</h3><p>{d}</p></Reveal>)}
        </ol>
      </section>

      <section className="ab-traits" aria-labelledby="ab-traits-h">
        <Reveal className="sec-head"><p className="eyebrow">THE DHANYA FEELING</p><h2 id="ab-traits-h">SIX WORDS WE DESIGN BY.</h2></Reveal>
        <ul>{brand.personality.map((t, i) => <Reveal as="li" key={t} delay={i * 0.05}>{t}</Reveal>)}</ul>
      </section>

      <ServiceHighlights />
      <StoreLocationMap />
      <section className="ab-end"><Reveal><h2>FIND YOUR NEXT FAVOURITE.</h2><Link className="btn solid pill" to="/shop" data-cursor="SHOP">SHOP ALL PIECES</Link></Reveal></section>
    </div>
  );
}

export function Journal() {
  return (
    <div className="about">
      <header className="cat-hero"><div className="cat-hero-in"><p className="eyebrow">JOURNAL</p><h1 className="serif">Stories and styling.</h1></div></header>
      <div className="empty"><p className="serif big">No stories have been published yet.</p><p className="muted">Editorial articles will appear here once the boutique publishes them.</p><Link className="btn dark" to="/shop">EXPLORE THE COLLECTION</Link></div>
    </div>
  );
}

export function NotFound() {
  return <div className="empty page-pad"><p className="eyebrow">404</p><p className="serif big">This corner of the world does not exist.</p><Link className="btn dark" to="/">RETURN HOME</Link></div>;
}

// Policy text is written by the store in the admin; nothing legal is invented here.
export function Policy({ slug, title }) {
  const [state, setState] = useState({ s: 'loading' });
  useEffect(() => {
    let dead = false; setState({ s: 'loading' });
    api('/pages/' + slug).then(d => !dead && setState({ s: 'ready', ...d })).catch(e => !dead && setState({ s: e.status === 404 ? 'missing' : 'error' }));
    return () => { dead = true };
  }, [slug]);
  return (
    <div className="policy">
      <p className="eyebrow">POLICIES</p>
      <h1 className="serif">{state.title || title}</h1>
      {state.s === 'loading' && <p className="muted">Loading…</p>}
      {state.s === 'missing' && <p className="muted">This policy has not been published yet. Please check back soon, or contact the boutique.</p>}
      {state.s === 'error' && <p role="alert" className="err">This page could not be loaded.</p>}
      {state.s === 'ready' && state.body.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
    </div>
  );
}
