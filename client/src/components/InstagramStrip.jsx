import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/App';
import { useReduced } from '../lib/hooks';
import { Reveal } from './Motion';

const IgIcon = ({ size = 18 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" /></svg>;
const Speaker = ({ off }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />{off ? <path d="m16 9.5 5 5m0-5-5 5" /> : <path d="M16 9a4.5 4.5 0 0 1 0 6m2.5-9a8 8 0 0 1 0 12" />}</svg>;

// A vertical reel: muted autoplay while on screen, paused otherwise; the viewer can unmute.
// With reduced motion it does not autoplay and shows the native controls instead.
function Reel({ post, label }) {
  const v = useRef(); const reduced = useReduced();
  const [muted, setMuted] = useState(true); const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = v.current; if (!el || reduced || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) el.play().catch(() => {}); else el.pause() }, { threshold: 0.55 });
    io.observe(el); return () => io.disconnect();
  }, [reduced]);
  if (failed && post.image) return <img src={post.image} alt={label} loading="lazy" />;
  return (
    <>
      <video ref={v} src={post.video} poster={post.image || undefined} muted={muted} loop playsInline preload="metadata" controls={reduced} aria-label={label} onError={() => setFailed(true)} />
      {!reduced && <button className="reel-mute" onClick={() => { const next = !muted; setMuted(next); if (v.current) { v.current.muted = next; v.current.play().catch(() => {}) } }} aria-pressed={!muted} aria-label={muted ? 'Turn sound on' : 'Mute'}><Speaker off={muted} /></button>}
    </>
  );
}

// Shown once the store has posted an Instagram link or added reels/photos (Admin → Storefront images).
export default function InstagramStrip() {
  const { site, user } = useApp();
  const ig = site.social?.instagram;
  const posts = (ig?.posts || []).filter(p => p.video || p.image);
  const staff = ['owner', 'admin'].includes(user?.role);
  if (!ig?.url && !posts.length) {
    // Only staff see the empty strip, so they know where to add reels; visitors never see an empty box.
    if (!staff) return null;
    return (
      <section className="insta ivory-sec" aria-labelledby="ig-h">
        <div className="insta-head"><h2 id="ig-h" className="serif"><em>View more on Instagram</em></h2>
          <p className="muted small">Staff preview: visitors do not see this section until a reel or photo is added.</p>
          <Link className="btn solid pill" to="/admin/storefront">ADD REELS</Link></div>
        <ul className="insta-grid">{[0, 1, 2].map(i => <li key={i}><div className="insta-tile insta-empty"><span>Reel {i + 1}</span></div></li>)}</ul>
      </section>
    );
  }
  return (
    <section className="insta ivory-sec" aria-labelledby="ig-h">
      <Reveal className="insta-head">
        {ig.handle && <p className="insta-handle"><IgIcon /> <span>@{ig.handle}</span></p>}
        <h2 id="ig-h" className="serif"><em>View more on Instagram</em></h2>
        {ig.url && <a className="btn solid pill" href={ig.url} target="_blank" rel="noopener noreferrer" data-cursor="FOLLOW"><IgIcon size={16} /> FOLLOW ON INSTAGRAM <span aria-hidden="true">↗</span></a>}
      </Reveal>
      {posts.length > 0 && (
        <ul className="insta-grid">
          {posts.map((t, i) => (
            <Reveal as="li" key={(t.video || t.image) + i} delay={(i % 3) * 0.1}>
              <div className="insta-tile">
                {t.video ? <Reel post={t} label={t.alt || 'Boutique video'} /> : <img src={t.image} alt={t.alt || 'Instagram post'} loading="lazy" />}
                {t.href && <a className="insta-open" href={t.href} target="_blank" rel="noopener noreferrer" aria-label="Open this post on Instagram">↗</a>}
              </div>
            </Reveal>
          ))}
        </ul>
      )}
    </section>
  );
}
