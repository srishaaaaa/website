import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../context/App';
import { api, apiRetry } from '../lib/api';
import { useModal } from '../lib/hooks';
import { Reveal } from './Motion';
import { ProductMedia } from './ProductCard3D';

const EMPTY = { count: 0, average: 0, items: [], hasMore: false, page: 1, onlySamples: false };

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

// Published reviews from the database, as a swipeable carousel. Sample reviews (if switched on) are labelled as such.
export default function CustomerReviews() {
  const { setReviewOpen } = useApp();
  const [data, setData] = useState(null);
  const [more, setMore] = useState(false);
  const track = useRef();
  const load = useCallback(async page => {
    try {
      const d = await apiRetry(`/reviews?page=${page}&limit=6`);
      setData(prev => (page === 1 || !prev ? d : { ...d, items: [...prev.items, ...d.items] }));
    } catch { setData(prev => prev ?? EMPTY) }
  }, []);
  useEffect(() => { const t = 'requestIdleCallback' in window ? requestIdleCallback(() => load(1), { timeout: 3000 }) : setTimeout(() => load(1), 1500); return () => { 'cancelIdleCallback' in window ? cancelIdleCallback(t) : clearTimeout(t) } }, [load]);

  // Slow, continuous drift to the left (~35px/s). It never pauses on hover or swipe; tapping (or pressing Enter on) a review stops it,
  // and tapping a review again sets it moving. At the end it eases back to the start and carries on.
  const ready = !!data?.items.length;
  useEffect(() => {
    const el = track.current;
    if (!ready || !el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const SPEED = 35;
    let raf, last = 0, pos = el.scrollLeft, hold = 0, stopped = false, visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; pos = el.scrollLeft }); io.observe(el); // no work while off screen
    const toggle = e => { if (e.type === 'keydown' && !(e.key === 'Enter' || e.key === ' ')) return; if (e.type === 'click' && !e.target.closest('.rv-card')) return; if (e.type === 'keydown') e.preventDefault(); stopped = !stopped; pos = el.scrollLeft };
    const tick = t => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(t - last, 64) / 1000; last = t;
      if (stopped || document.hidden || !visible) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      if (Math.abs(el.scrollLeft - pos) > 3) { pos = el.scrollLeft; hold = t + 700 } // moved by the arrows or a swipe: let that settle, then carry on from there
      if (hold > t) return;
      if (pos >= max - 1) { hold = t + 1500; pos = 0; el.scrollTo({ left: 0, behavior: 'smooth' }); setTimeout(() => { pos = el.scrollLeft }, 1200); return }
      pos += SPEED * dt; el.scrollLeft = pos;
    };
    el.style.scrollSnapType = 'none'; // snapping would fight the drift
    el.addEventListener('click', toggle); el.addEventListener('keydown', toggle);
    raf = requestAnimationFrame(t => { last = t; tick(t) });
    return () => { cancelAnimationFrame(raf); io.disconnect(); el.style.scrollSnapType = ''; el.removeEventListener('click', toggle); el.removeEventListener('keydown', toggle) };
  }, [ready]);
  if (!data) return null;
  const slide = d => track.current?.scrollBy({ left: d * Math.min(360, innerWidth * 0.8), behavior: 'smooth' });
  const viewMore = async () => { setMore(true); await load(data.page + 1); setMore(false); setTimeout(() => slide(1), 150) };
  return (
    <section className="reviews light-sec" aria-labelledby="rev-h">
      <Reveal className="rev-head">
        <p className="eyebrow">OUR COMMUNITY</p>
        <h2 id="rev-h">LOVED BEYOND THE FIRST LOOK.</h2>
        <div className="rev-bar">
          {data.count > 0 && <span className="rev-pill"><Stars n={Math.round(data.average)} /><strong>{data.average.toFixed(1)} / 5</strong><span className="muted">FROM {data.count} {data.onlySamples ? 'SAMPLE' : 'VERIFIED'} {data.count === 1 ? 'REVIEW' : 'REVIEWS'}</span></span>}
          <button className="btn solid pill" onClick={() => setReviewOpen(true)} data-cursor="WRITE">WRITE A REVIEW</button>
        </div>
      </Reveal>
      {data.count === 0 && <p className="muted center rev-empty">No reviews yet. Purchased a piece? Be the first to share your thoughts.</p>}
      {data.items.length > 0 && (
        <>
          <ul className="rv-track" ref={track} tabIndex={0} aria-label="Customer reviews">
            {data.items.map(r => (
              <li key={r.id} className="rv-card">
                <div className="rv-bg" aria-hidden="true"><ProductMedia p={{ slug: r.product_slug || String(r.product_name), name: r.product_name, image: r.product_image }} view={String(r.id).length % 4} /></div>
                <div className="rv-top"><span className="rv-stars"><Stars n={r.rating} size={13} /></span><Link className="rv-tag" to={r.product_slug ? `/product/${r.product_slug}` : '/shop'}>{r.product_name}</Link></div>
                <div className="rv-body">
                  <blockquote className="quote">“{r.body}”</blockquote>
                  <p className="rv-by"><strong>{r.author}</strong><span>{r.demo ? 'Sample review' : 'Verified purchase'}</span></p>
                </div>
              </li>
            ))}
          </ul>
          <div className="rv-nav">
            <button className="icon-btn lg" onClick={() => slide(-1)} aria-label="Previous reviews">‹</button>
            {data.hasMore && <button className="btn dark pill" onClick={viewMore} disabled={more}>{more ? 'LOADING…' : 'VIEW MORE REVIEWS'}</button>}
            <button className="icon-btn lg" onClick={() => slide(1)} aria-label="Next reviews">›</button>
          </div>
        </>
      )}
      <ReviewModal />
    </section>
  );
}
