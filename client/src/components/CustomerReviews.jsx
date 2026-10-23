import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../context/App';
import { api } from '../lib/api';
import { useModal } from '../lib/hooks';
import { Reveal } from './Motion';
import { ProductMedia } from './ProductCard3D';

export const Stars = ({ n, size = 14 }) => (
  <span className="stars" role="img" aria-label={`${n} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map(i => <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4-5.7-3.1-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill={i <= n ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3" /></svg>)}
  </span>
);

// Submission is gated by the API: only customers with a paid order for the piece (and no prior review) may post.
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
    catch (x) { setErr(x.message) } finally { setBusy(false) }
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
                <label className="field"><span>Your review</span><textarea rows="4" minLength="10" maxLength="600" required value={f.body} onChange={e => setF({ ...f, body: e.target.value })} /></label>
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

// Approved, verified-purchase reviews only, paged from the database.
export default function CustomerReviews() {
  const { setReviewOpen } = useApp();
  const [data, setData] = useState(null);
  const [more, setMore] = useState(false);
  const load = useCallback(async page => {
    try {
      const d = await api(`/reviews?page=${page}&limit=6`);
      setData(prev => (page === 1 || !prev ? d : { ...d, items: [...prev.items, ...d.items] }));
    } catch { setData(prev => prev ?? { count: 0, average: 0, items: [], hasMore: false, page: 1 }) }
  }, []);
  useEffect(() => { load(1) }, [load]);
  if (!data) return null;
  const viewMore = async () => { setMore(true); await load(data.page + 1); setMore(false) };
  return (
    <section className="reviews ivory-sec" aria-labelledby="rev-h">
      <Reveal className="rev-head">
        <p className="eyebrow">OUR COMMUNITY</p>
        <h2 id="rev-h" className="serif">LOVED BEYOND<br />THE FIRST LOOK.</h2>
        <div className="rev-bar">
          {data.count > 0 && <span className="rev-pill"><Stars n={Math.round(data.average)} /><strong>{data.average.toFixed(1)} / 5</strong><span className="muted">from {data.count} verified {data.count === 1 ? 'review' : 'reviews'}</span></span>}
          <button className="btn solid pill" onClick={() => setReviewOpen(true)} data-cursor="WRITE">WRITE A REVIEW</button>
        </div>
      </Reveal>
      {data.count === 0 && <p className="muted center rev-empty">No reviews yet. Purchased a piece? Be the first to share your thoughts.</p>}
      {data.items.length > 0 && (
        <ul className="rev-grid">
          {data.items.map((r, i) => (
            <Reveal as="li" key={r.id} delay={(i % 3) * 0.08} className="rev-card">
              <div className="rev-top"><Stars n={r.rating} size={15} /><span className="rev-verified"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>Verified purchase</span></div>
              <blockquote className="serif">“{r.body}”</blockquote>
              <div className="rev-foot">
                <Link to={`/product/${r.product_slug}`} className="rev-thumb" aria-label={`View ${r.product_name}`}><ProductMedia p={{ slug: r.product_slug, name: r.product_name, image: r.product_image }} view={1} /></Link>
                <p><strong>{r.author}</strong><Link to={`/product/${r.product_slug}`} className="muted small">{r.product_name}</Link></p>
              </div>
            </Reveal>
          ))}
        </ul>
      )}
      {data.hasMore && <div className="center"><button className="btn dark pill" onClick={viewMore} disabled={more}>{more ? 'LOADING…' : 'VIEW MORE REVIEWS'}</button></div>}
      <ReviewModal />
    </section>
  );
}
