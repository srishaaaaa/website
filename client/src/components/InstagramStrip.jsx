import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/App';
import { useReduced } from '../lib/hooks';
import { Reveal } from './Motion';
import BlankFrame from './BlankFrame';

const IgIcon = ({ size = 18 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" /></svg>;
const Speaker = ({ off }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />{off ? <path d="m16 9.5 5 5m0-5-5 5" /> : <path d="M16 9a4.5 4.5 0 0 1 0 6m2.5-9a8 8 0 0 1 0 12" />}</svg>;

// A vertical reel: muted autoplay while on screen, paused otherwise; the viewer can unmute (never autoplays with sound).
// With reduced motion it does not autoplay and shows the native controls. If the file cannot load, it links to Instagram.
function Reel({ post, label, fallbackUrl }) {
  const v = useRef(); const reduced = useReduced();
  const [muted, setMuted] = useState(true); const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = v.current; if (!el || reduced || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) el.play().catch(() => {}); else el.pause() }, { threshold: 0.55 });
    io.observe(el); return () => io.disconnect();
  }, [reduced]);
  if (failed) {
    if (post.image) return <img src={post.image} alt={label} loading="lazy" />;
    const url = post.href || fallbackUrl;
    return <div className="reel-fail"><p>This video could not be loaded.</p>{url && <a className="btn solid pill" href={url} target="_blank" rel="noopener noreferrer">WATCH ON INSTAGRAM ↗</a>}</div>;
  }
  return (
    <>
      <video ref={v} src={post.video} poster={post.image || undefined} muted={muted} loop playsInline preload="metadata" controls={reduced} aria-label={label} onError={() => setFailed(true)} />
      {!reduced && <button className="reel-mute" onClick={() => { const next = !muted; setMuted(next); if (v.current) { v.current.muted = next; v.current.play().catch(() => {}) } }} aria-pressed={!muted} aria-label={muted ? 'Turn sound on' : 'Mute'}><Speaker off={muted} /></button>}
    </>
  );
}

// "Inside DHANYA BOUTIQUE": three reel slots. Videos are added in Admin → Storefront images. Until then the three
// spaces stay in place as blank frames, so the section never disappears from the page.
export default function InstagramStrip() {
  const { site } = useApp();
  const ig = site.social?.instagram;
  const posts = (ig?.posts || []).filter(p => p.video || p.image);
  const slots = Math.max(3, Math.min(6, posts.length));
  return (
    <section className="insta ivory-sec" id="reels" aria-labelledby="ig-h">
      <Reveal className="insta-head">
        <p className="insta-handle"><IgIcon /> <span>{ig?.handle ? `@${ig.handle}` : 'INSTAGRAM'}</span></p>
        <h2 id="ig-h">INSIDE DHANYA BOUTIQUE</h2>
        <p className="insta-sub">Discover our boutique, explore our collections, and experience the beauty of sarees.</p>
        {ig?.url && <a className="btn solid pill" href={ig.url} target="_blank" rel="noopener noreferrer" data-cursor="FOLLOW"><IgIcon size={16} /> FOLLOW ON INSTAGRAM <span aria-hidden="true">↗</span></a>}
      </Reveal>
      <ul className="insta-grid">
        {Array.from({ length: slots }, (_, i) => {
          const t = posts[i];
          return (
            <Reveal as="li" key={(t?.video || t?.image || 'empty') + i} delay={(i % 3) * 0.1}>
              <div className={`insta-tile ${t ? '' : 'insta-empty'}`}>
                {t?.video ? <Reel post={t} label={t.alt || 'Boutique video'} fallbackUrl={ig?.url} />
                  : t?.image ? <img src={t.image} alt={t.alt || 'Boutique photo'} loading="lazy" />
                    : <BlankFrame label={`Reel ${i + 1}`} kind="video" />}
                {t?.href && <a className="insta-open" href={t.href} target="_blank" rel="noopener noreferrer" aria-label="Open this post on Instagram">↗</a>}
              </div>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}
