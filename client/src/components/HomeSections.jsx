import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../context/App';
import { api } from '../lib/api';
import { useModal } from '../lib/hooks';
import { social, store } from '../config/content';
import { Reveal } from './Motion';
import ProductArt from './ProductArt';
import { ProductMedia } from './ProductCard';

const DEV = import.meta.env.DEV;
const Stars = ({ n, size = 14 }) => <span className="stars" role="img" aria-label={`${n} out of 5 stars`}>{[1, 2, 3, 4, 5].map(i => <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4-5.7-3.1-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill={i <= n ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3" /></svg>)}</span>;
const IgIcon = ({ size = 18 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" /></svg>;

/* ---------- Reviews: real, moderated, verified-purchase only ---------- */
function ReviewModal() {
  const { reviewOpen, setReviewOpen, user, toast } = useApp();
  const ref = useRef(); const close = () => setReviewOpen(false);
  useModal(reviewOpen, close, ref);
  const [eligible, setEligible] = useState(null);
  const [f, setF] = useState({ slug: '', rating: 5, body: '' });
  const [err, setErr] = useState(); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!reviewOpen || !user) return;
    setErr(); setEligible(null);
    api('/reviews/eligible').then(l => { setEligible(l); setF(x => ({ ...x, slug: l[0]?.slug || '' })) }).catch(() => setEligible([]));
  }, [reviewOpen, user]);
  const submit = async e => {
    e.preventDefault(); setErr(); setBusy(true);
    try { await api('/reviews', { method: 'POST', body: { slug: f.slug, rating: f.rating, body: f.body } }); toast('Thank you — your review will appear once it has been approved.'); setF({ slug: '', rating: 5, body: '' }); close() }
    catch (x) { setErr(x.issues?.[0]?.message || x.message) } finally { setBusy(false) }
  };
  return (
    <AnimatePresence>
      {reviewOpen && (
        <div className="overlay-root">
          <motion.div className="scrim" onClick={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div ref={ref} className="review-modal glass" role="dialog" aria-modal="true" aria-label="Write a review" initial={{ opacity: 0, y: 40, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
            <button className="icon-btn close" onClick={close} aria-label="Close">✕</button>
            <h2 className="serif">Write a review</h2>
            {!user && <><p className="muted">Please sign in with the account you ordered with.</p><Link className="btn solid" to="/login" onClick={close}>SIGN IN</Link></>}
            {user && eligible === null && <p className="muted">Checking your orders…</p>}
            {user && eligible?.length === 0 && <p className="muted">Reviews are open to customers who have purchased a piece and not yet reviewed it. Once your order is paid, it will appear here.</p>}
            {user && eligible?.length > 0 && (
              <form onSubmit={submit}>
                <label className="field"><span>Piece</span><select value={f.slug} onChange={e => setF({ ...f, slug: e.target.value })}>{eligible.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select></label>
                <fieldset className="rate"><legend className="eyebrow">Rating</legend>
                  <div role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map(n => <button type="button" key={n} role="radio" aria-checked={f.rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={f.rating >= n ? 'on' : ''} onClick={() => setF({ ...f, rating: n })}>★</button>)}</div></fieldset>
                <label className="field"><span>Your review</span><textarea rows="4" maxLength="600" required value={f.body} onChange={e => setF({ ...f, body: e.target.value })} /></label>
                {err && <p role="alert" className="err">{err}</p>}
                <button className="btn solid wide" disabled={busy}>{busy ? 'SENDING…' : 'SUBMIT REVIEW'}</button>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Reviews() {
  const { setReviewOpen } = useApp();
  const [data, setData] = useState(null);
  const track = useRef();
  useEffect(() => { api('/reviews').then(setData).catch(() => setData({ count: 0, average: 0, items: [] })) }, []);
  if (!data) return null;
  const scroll = d => track.current?.scrollBy({ left: d * 340, behavior: 'smooth' });
  return (
    <section className="reviews ivory-sec" aria-labelledby="rev-h">
      <Reveal className="rev-head">
        <p className="eyebrow">OUR COMMUNITY</p>
        <h2 id="rev-h" className="serif">{data.count ? 'Loved by our customers' : 'Customer reviews'}</h2>
        <div className="rev-bar">
          {data.count > 0 && <span className="rev-pill"><Stars n={Math.round(data.average)} /><strong>{data.average.toFixed(1)} / 5</strong><span className="muted">from {data.count} verified {data.count === 1 ? 'review' : 'reviews'}</span></span>}
          <button className="btn solid" onClick={() => setReviewOpen(true)} data-cursor="WRITE">WRITE A REVIEW</button>
        </div>
      </Reveal>
      {data.count === 0 && <p className="muted center rev-empty">No reviews yet. Purchased a piece? Be the first to share your thoughts.</p>}
      {data.items.length > 0 && (
        <>
          <ul className="rev-track" ref={track} tabIndex={0} aria-label="Customer reviews">
            {data.items.map(r => (
              <li key={r.id} className="rev-card">
                <div className="rev-bg" aria-hidden="true"><ProductMedia p={{ slug: r.product_slug, name: r.product_name, image: r.product_image }} view={1} /></div>
                <div className="rev-top"><span className="rev-stars"><Stars n={r.rating} size={13} /></span><Link className="rev-tag" to={`/product/${r.product_slug}`}>{r.product_name}</Link></div>
                <blockquote className="serif">“{r.body}”</blockquote>
                <p className="rev-by"><strong>{r.author}</strong><span>Verified purchase</span></p>
              </li>
            ))}
          </ul>
          <div className="rev-nav"><button className="icon-btn lg" onClick={() => scroll(-1)} aria-label="Previous reviews">‹</button><button className="icon-btn lg" onClick={() => scroll(1)} aria-label="Next reviews">›</button></div>
        </>
      )}
      <ReviewModal />
    </section>
  );
}

/* ---------- Instagram strip: only the posts you configure ---------- */
export function Instagram() {
  const { handle, url, posts } = social.instagram;
  const configured = !!url;
  if (!configured && !DEV) return null;
  const tiles = posts.length ? posts.slice(0, 3) : [0, 1, 2].map(i => ({ placeholder: `ig-${i}` }));
  return (
    <section className="insta ivory-sec" aria-labelledby="ig-h">
      <Reveal className="insta-head">
        <p className="insta-handle"><IgIcon /> <span>{handle ? `@${handle}` : '@your.handle'}</span></p>
        <h2 id="ig-h" className="serif"><em>View more on Instagram</em></h2>
        {configured
          ? <a className="btn solid pill" href={url} target="_blank" rel="noopener noreferrer" data-cursor="FOLLOW"><IgIcon size={16} /> FOLLOW ON INSTAGRAM <span aria-hidden="true">↗</span></a>
          : <p className="muted small dev-note">Dev preview — set <code>social.instagram</code> in config/content.js. Hidden in production until then.</p>}
      </Reveal>
      <ul className="insta-grid">
        {tiles.map((t, i) => (
          <Reveal as="li" key={t.image || t.placeholder} delay={i * 0.1}>
            {t.image
              ? <a className="insta-tile" href={t.href || url} target="_blank" rel="noopener noreferrer" data-cursor="VIEW"><img src={t.image} alt={t.alt || 'Instagram post'} loading="lazy" /></a>
              : <div className="insta-tile"><ProductArt seed={t.placeholder} view={i} /></div>}
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Visit us: real address + live open/closed status ---------- */
function openState() {
  const h = store.hours; if (!h) return null;
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: store.timeZone }));
  const mins = now.getHours() * 60 + now.getMinutes();
  const t = s => { const [a, b] = s.split(':').map(Number); return a * 60 + b };
  const fmt = s => { const [a] = s.split(':').map(Number); return `${a % 12 || 12}${a < 12 ? 'AM' : 'PM'}` };
  const today = h.days.includes(now.getDay());
  if (today && mins >= t(h.open) && mins < t(h.close)) return { open: true, text: `Open · closes ${fmt(h.close)}` };
  return { open: false, text: today && mins < t(h.open) ? `Closed · opens ${fmt(h.open)}` : 'Closed' };
}

export function Studio() {
  const addr = store.address;
  const configured = !!addr;
  const lines = addr || ['Your studio address', 'City, State PIN'];
  const query = encodeURIComponent(lines.join(', '));
  const state = useMemo(openState, []);
  if (!configured && !DEV) return null;
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${query}`;
  return (
    <section className="studio ivory-sec" aria-labelledby="st-h">
      <div className="studio-card">
        <Reveal className="studio-info">
          <p className="eyebrow">VISIT US</p>
          <h2 id="st-h" className="serif">Our studio</h2>
          <p className="muted">Experience {store.name.replace(/ Studio$/i, '')} in person.</p>
          <address><span className="pin" aria-hidden="true">⌖</span><span><strong>{lines[0]}</strong><br />{lines.slice(1).join(', ')}</span></address>
          {store.hours && <p className="hours"><span className="pin" aria-hidden="true">◷</span><span><strong>{store.hours.label}</strong>{state && <><br />{state.text}</>}</span></p>}
          <div className="studio-cta">
            <a className="btn solid" href={maps} target="_blank" rel="noopener noreferrer" data-cursor="GO">GET DIRECTIONS →</a>
            {store.phone && <a className="btn" href={`tel:${store.phone.replace(/[^+\d]/g, '')}`}>CALL STORE</a>}
          </div>
          {!configured && <p className="muted small dev-note">Dev preview — set <code>store</code> in config/content.js. Hidden in production until an address is set.</p>}
        </Reveal>
        <div className="studio-map">
          {configured
            ? <iframe title={`Map showing ${store.name}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={`https://www.google.com/maps?q=${query}&output=embed`} />
            : <div className="map-placeholder" aria-hidden="true"><ProductArt seed="map" view={3} /></div>}
          <a className="map-open" href={maps} target="_blank" rel="noopener noreferrer">OPEN IN MAPS ↗</a>
          <div className="map-card"><span className="pin-badge" aria-hidden="true">⌖</span>
            <div><strong>{store.name}</strong><span className="muted small">{lines[lines.length - 1]}</span></div>
            {state && <span className={`status ${state.open ? 'open' : ''}`}>{state.open ? 'OPEN' : 'CLOSED'}</span>}</div>
        </div>
      </div>
    </section>
  );
}
