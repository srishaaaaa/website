import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useApp } from '../context/App';
import { useReduced } from '../lib/hooks';
import { Reveal } from './Motion';
import { useSiteText } from '../lib/siteText';
import BlankFrame from './BlankFrame';
import { parseVideo } from '../lib/media';

const IgIcon = ({ size = 18 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" /></svg>;
const Speaker = ({ off }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />{off ? <path d="m16 9.5 5 5m0-5-5 5" /> : <path d="M16 9a4.5 4.5 0 0 1 0 6m2.5-9a8 8 0 0 1 0 12" />}</svg>;

// A vertical reel: muted autoplay while on screen, paused otherwise; the viewer can unmute (never autoplays with sound).
// With reduced motion it does not autoplay and shows the native controls. If the file cannot load, it links to Instagram.
function Reel({ post, label, fallbackUrl }) {
  const v = useRef(); const reduced = useReduced();
  if (parseVideo(post.video).kind !== 'file') return <div className="reel-embed">{post.image ? <img src={post.image} alt={label} loading="lazy" /> : <span className="reel-embed-bg" />}<span className="reel-play" aria-hidden="true">▶</span></div>;
  const [muted, setMuted] = useState(true); const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = v.current; if (!el || reduced || typeof IntersectionObserver === 'undefined') return;
    // Only plays while mostly on screen, and stays paused while the full-screen viewer is open (two videos decoding at once is what made it stutter).
    let inView = false, locked = !!window.__dhanyaViewer;
    const sync = () => { if (inView && !locked) el.play().catch(() => {}); else el.pause() };
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; sync() }, { threshold: 0.7 });
    const lock = e => { locked = !!e.detail; sync() };
    io.observe(el); addEventListener('dhanya:viewer', lock);
    return () => { io.disconnect(); removeEventListener('dhanya:viewer', lock) };
  }, [reduced]);
  if (failed) {
    if (post.image) return <img src={post.image} alt={label} loading="lazy" />;
    const url = post.href || fallbackUrl;
    return <div className="reel-fail"><p>This video could not be loaded.</p>{url && <a className="btn solid pill" href={url} target="_blank" rel="noopener noreferrer">WATCH ON INSTAGRAM ↗</a>}</div>;
  }
  return (
    <>
      <video ref={v} src={post.video} poster={post.image || undefined} muted={muted} loop playsInline preload="auto" controls={reduced} aria-label={label} onError={() => setFailed(true)} />
      {!reduced && <button className="reel-mute" onClick={e => { e.stopPropagation(); const next = !muted; setMuted(next); if (v.current) { v.current.muted = next; v.current.play().catch(() => {}) } }} aria-pressed={!muted} aria-label={muted ? 'Turn sound on' : 'Mute'}><Speaker off={muted} /></button>}
    </>
  );
}


const Back = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" /></svg>;

// Full-screen viewer for a photo or reel. The back arrow (or Esc) returns to the gallery.
// Reels start playing straight away: first with sound, and muted if the browser blocks that.
function Viewer({ items, start, onClose }) {
  const [i, setI] = useState(start); const box = useRef(); const vid = useRef();
  const cur = items[i];
  const close = useCallback(() => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); onClose() }, [onClose]);
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    window.__dhanyaViewer = true; dispatchEvent(new CustomEvent('dhanya:viewer', { detail: true }));
    box.current?.requestFullscreen?.().catch(() => {});
    const key = e => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') setI(n => Math.min(items.length - 1, n + 1)); else if (e.key === 'ArrowLeft') setI(n => Math.max(0, n - 1)) };
    addEventListener('keydown', key);
    return () => { document.body.style.overflow = prev; window.__dhanyaViewer = false; dispatchEvent(new CustomEvent('dhanya:viewer', { detail: false })); removeEventListener('keydown', key) };
  }, [close, items.length]);
  useEffect(() => {
    const el = vid.current; if (!el) return;
    el.muted = false; el.play().catch(() => { el.muted = true; el.play().catch(() => {}) });
  }, [i]);
  if (!cur) return null;
  const pv = cur.video ? parseVideo(cur.video) : null;
  return createPortal(
    <div className="viewer" ref={box} role="dialog" aria-modal="true" aria-label={cur.video ? 'Reel' : 'Photo'}>
      <button className="viewer-back" onClick={close} aria-label="Back to gallery"><Back /><span>BACK</span></button>
      {items.length > 1 && <span className="viewer-count">{i + 1} / {items.length}</span>}
      <div className="viewer-stage" key={i}>
        {!pv ? <img src={cur.image} alt={cur.alt || 'Boutique photo'} />
          : pv.kind === 'file' ? <video ref={vid} src={pv.src} poster={cur.image || undefined} autoPlay loop playsInline controls />
          : <iframe src={pv.embed} title={cur.alt || 'Reel'} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen />}
      </div>
      {i > 0 && <button className="viewer-nav prev" onClick={() => setI(i - 1)} aria-label="Previous">‹</button>}
      {i < items.length - 1 && <button className="viewer-nav next" onClick={() => setI(i + 1)} aria-label="Next">›</button>}
    </div>, document.body);
}

// "Inside DHANYA BOUTIQUE": a photo gallery (up to 6) and a row of videos (up to 6), shown separately. Both are managed in
// Admin → Storefront images. Until anything is added, blank frames keep the section in place.
export default function InstagramStrip() {
  const { site } = useApp();
  const t = useSiteText();
  const [view, setView] = useState(null); // { list, i }
  const ig = site.social?.instagram;
  const all = (ig?.posts || []).filter(p => p.video || p.image);
  const videos = all.filter(p => p.video).slice(0, 6);
  const photos = all.filter(p => !p.video).slice(0, 6);
  return (
    <section className="insta ivory-sec" id="reels" aria-labelledby="ig-h">
      <Reveal className="insta-head">
        <p className="insta-handle"><IgIcon /> <span>{ig?.handle ? `@${ig.handle}` : 'INSTAGRAM'}</span></p>
        <h2 id="ig-h">{t.instaTitle}</h2>
        <p className="insta-sub">{t.instaSub}</p>
        {ig?.url && <a className="btn solid pill" href={ig.url} target="_blank" rel="noopener noreferrer" data-cursor="FOLLOW"><IgIcon size={16} /> FOLLOW ON INSTAGRAM <span aria-hidden="true">↗</span></a>}
      </Reveal>
      {/* Two separate galleries: reels (tall videos) and photos (4:5 photo grid). Empty slots keep each in place until media is added. */}
      <div className="insta-block insta-reels">
        <div className="insta-bh"><h3>Reel Gallery</h3><span>{videos.length ? `${videos.length} ${videos.length === 1 ? 'REEL' : 'REELS'}` : 'COMING SOON'}</span></div>
        <ul className="insta-grid">
          {Array.from({ length: 6 }, (_, i) => {
            const t = videos[i];
            return (
              <Reveal as="li" key={(t?.video || 'empty') + i} delay={(i % 3) * 0.1}>
                <div className={`insta-tile ${t ? 'insta-click' : 'insta-empty'}`} onClick={t ? () => setView({ list: videos, i }) : undefined} role={t ? 'button' : undefined} tabIndex={t ? 0 : undefined} aria-label={t ? 'Play reel full screen' : undefined} onKeyDown={t ? e => { if (e.key === 'Enter') setView({ list: videos, i }) } : undefined}>
                  {t ? <Reel post={t} label={t.alt || 'Boutique video'} fallbackUrl={ig?.url} /> : <BlankFrame label={`Reel ${i + 1}`} kind="video" to="/admin/reels" where="Reels & Gallery" />}
                  {t?.href && <a className="insta-open" onClick={e => e.stopPropagation()} href={t.href} target="_blank" rel="noopener noreferrer" aria-label="Open this post on Instagram">↗</a>}
                </div>
              </Reveal>
            );
          })}
        </ul>
      </div>
      <div className="insta-block insta-photos">
        <div className="insta-bh"><h3>Photo Gallery</h3><span>{photos.length ? `${photos.length} ${photos.length === 1 ? 'PHOTO' : 'PHOTOS'}` : 'COMING SOON'}</span></div>
        <ul className="insta-grid">
          {Array.from({ length: 6 }, (_, i) => {
            const t = photos[i];
            return (
              <Reveal as="li" key={(t?.image || 'empty') + i} delay={(i % 3) * 0.1}>
                <div className={`insta-tile ${t ? 'insta-click' : 'insta-empty'}`} onClick={t ? () => setView({ list: photos, i }) : undefined} role={t ? 'button' : undefined} tabIndex={t ? 0 : undefined} aria-label={t ? 'View photo full screen' : undefined} onKeyDown={t ? e => { if (e.key === 'Enter') setView({ list: photos, i }) } : undefined}>
                  {t ? <img src={t.image} alt={t.alt || 'Boutique photo'} loading="lazy" /> : <BlankFrame label={`Photo ${i + 1}`} to="/admin/reels" where="Reels & Gallery" />}
                  {t?.href && <a className="insta-open" onClick={e => e.stopPropagation()} href={t.href} target="_blank" rel="noopener noreferrer" aria-label="Open this post on Instagram">↗</a>}
                </div>
              </Reveal>
            );
          })}
        </ul>
      </div>
      {view && <Viewer items={view.list} start={view.i} onClose={() => setView(null)} />}
    </section>
  );
}
