import { lazy, Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useApp } from '../context/App';
import { hasWebGL, useInView, useQuality, useReduced } from '../lib/hooks';
import { Magnetic, Reveal } from '../components/Motion';
import { ProductMedia } from '../components/ProductCard3D';
import ImmersiveHero from '../components/hero/ImmersiveHero';
import FeaturedCollections from '../components/FeaturedCollections';
import CustomerReviews from '../components/CustomerReviews';
import InstagramStrip from '../components/InstagramStrip';
import StoreLocationMap from '../components/StoreLocationMap';
import { brand, media } from '../config/content';

gsap.registerPlugin(ScrollTrigger);
const FabricCanvas = lazy(() => import('../three/canvases').then(m => ({ default: m.FabricCanvas })));

function CollectionPortal({ cols }) {
  if (!cols.length) return null;
  return (
    <section className="portal" data-portal aria-labelledby="portal-h">
      <div className="portal-head"><p className="eyebrow gold">COLLECTIONS</p><h2 id="portal-h" className="serif">Choose your world.</h2></div>
      <div className="portal-track" data-track>
        {cols.map((c, i) => (
          <Link key={c.slug} to={`/collections/${c.slug}`} className="panel" data-panel data-cursor="EXPLORE">
            <div className="panel-img"><div data-parallax><ProductMedia p={{ slug: c.cover?.slug || c.slug, name: c.name, image: c.hero_image || c.cover?.image }} view={i % 4} /></div></div>
            <div className="panel-txt"><span className="eyebrow">{String(i + 1).padStart(2, '0')}</span><h3 className="serif">{c.name}</h3><p>{c.description || `${c.product_count} pieces`}</p></div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function LivingFabric({ webgl, quality, reduced }) {
  const ref = useRef();
  const near = useInView(ref, { rootMargin: '300px' });
  return (
    <section ref={ref} className="fabric" aria-label="The Living Fabric">
      {webgl && near && <Suspense fallback={null}><FabricCanvas quality={quality} reduced={reduced} /></Suspense>}
      <div className="fabric-copy"><p className="eyebrow gold">THE LIVING FABRIC</p><h2 className="fabric-h">CRAFTED TO<br />BE FELT.</h2><p className="muted hide-touch">Move your cursor across the silk.</p></div>
    </section>
  );
}

function Story() {
  const lines = ['A boutique with an Indian soul,', 'a digital world of its own.', brand.promise];
  return (
    <section className="story" data-story aria-labelledby="story-h">
      <p className="eyebrow gold">THE DHANYA STORY</p>
      <h2 id="story-h" className="sr">The DHANYA story</h2>
      <div className="story-lines">{lines.map((l, i) => <p key={i} data-line className="serif">{l}</p>)}</div>
      <div className="story-words" aria-label={brand.personality.join(', ')}>{brand.personality.map(w => <span key={w} data-word>{w}</span>)}</div>
      <Link to="/about" className="btn" data-cursor="DISCOVER">OUR STORY</Link>
    </section>
  );
}

function Details() {
  if (!media.details.length) return null; // appears only when genuine close-up photography is configured
  return (
    <section className="ivory-sec details" aria-labelledby="det-h">
      <Reveal className="sec-head"><p className="eyebrow">A WORLD OF DETAILS</p><h2 id="det-h" className="serif">Texture, thread, finish.</h2></Reveal>
      <div className="details-grid">{media.details.map((d, i) => <Reveal key={d.src} delay={i * 0.06}><img src={d.src} alt={d.alt} loading="lazy" /></Reveal>)}</div>
    </section>
  );
}

function FinalPortal() {
  return (
    <section className="final" data-final aria-labelledby="final-h">
      <div className="final-arch" aria-hidden="true"><i /><i /><i /></div>
      <h2 id="final-h" className="final-h">YOUR WORLD.<br />YOUR EXPRESSION.</h2>
      <Magnetic><Link className="btn solid" to="/shop" data-cursor="DISCOVER">DISCOVER YOUR NEXT LOOK</Link></Magnetic>
    </section>
  );
}

export default function Home() {
  const { catalog } = useApp();
  const reduced = useReduced(); const quality = useQuality();
  const webgl = useMemo(hasWebGL, []);
  const root = useRef();
  const cols = catalog.collections.slice(0, 6);

  // GSAP owns the scroll-driven composition (hero depth, mask reveal, pinned gallery). Motion owns entrances
  // and hover states. No element is animated by both.
  useLayoutEffect(() => {
    const mm = gsap.matchMedia(root.current);
    mm.add({ motion: '(prefers-reduced-motion: no-preference)', wide: '(min-width: 900px)' }, ctx => {
      const { motion: ok, wide } = ctx.conditions;
      if (!ok) return;
      const hero = { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: true };
      gsap.to('[data-word-bg]', { yPercent: -12, ease: 'none', scrollTrigger: hero });                                          // lettering drifts slowly behind
      gsap.fromTo('[data-gridwrap]', { rotateX: 0, opacity: 1 }, { rotateX: 52, opacity: 0.3, ease: 'none', scrollTrigger: hero }); // grid gains perspective
      gsap.to('[data-hero-copy]', { yPercent: -12, opacity: 0.1, ease: 'none', scrollTrigger: hero });                          // copy leaves; the photograph stays the anchor
      // The featured collection is revealed through a soft editorial mask.
      gsap.fromTo('[data-edit]', { clipPath: 'inset(8% 5% 0% 5% round 56px 56px 0px 0px)' }, { clipPath: 'inset(0% 0% 0% 0% round 0px 0px 0px 0px)', ease: 'none', scrollTrigger: { trigger: '[data-edit]', start: 'top 96%', end: 'top 38%', scrub: true } });

      const track = root.current.querySelector('[data-track]');
      if (track && wide) {
        track.classList.add('pinned');
        const dist = () => Math.max(0, track.scrollWidth - innerWidth);
        const tween = gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: '[data-portal]', pin: true, scrub: 0.6, start: 'top top', end: () => '+=' + dist(), invalidateOnRefresh: true, anticipatePin: 1 } });
        gsap.utils.toArray('[data-panel]').forEach(p => {
          gsap.fromTo(p, { scale: 0.86, opacity: 0.55 }, { scale: 1, opacity: 1, ease: 'none', scrollTrigger: { trigger: p, containerAnimation: tween, start: 'left 95%', end: 'left 45%', scrub: true } });
          gsap.fromTo(p.querySelector('[data-parallax]'), { xPercent: -8 }, { xPercent: 8, ease: 'none', scrollTrigger: { trigger: p, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } });
        });
        return () => track.classList.remove('pinned');
      }
    });
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo('[data-line]', { opacity: 0.1, y: 40 }, { opacity: 1, y: 0, stagger: 0.25, ease: 'none', scrollTrigger: { trigger: '[data-story]', start: 'top 70%', end: 'center 40%', scrub: true } });
      gsap.fromTo('[data-word]', { opacity: 0, y: 20 }, { opacity: 1, y: 0, stagger: 0.1, ease: 'none', scrollTrigger: { trigger: '.story-words', start: 'top 90%', end: 'top 55%', scrub: true } });
      gsap.fromTo('[data-story]', { backgroundColor: '#09090D' }, { backgroundColor: '#211426', ease: 'none', scrollTrigger: { trigger: '[data-story]', start: 'top bottom', end: 'center center', scrub: true } });
      gsap.fromTo('[data-final]', { backgroundColor: '#211426' }, { backgroundColor: '#0f0b14', ease: 'none', scrollTrigger: { trigger: '[data-final]', start: 'top bottom', end: 'top 30%', scrub: true } });
      gsap.fromTo('.final-arch i', { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, stagger: 0.12, ease: 'none', scrollTrigger: { trigger: '[data-final]', start: 'top 80%', end: 'center center', scrub: true } });
    });
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
    return () => mm.revert();
  }, [cols.length, catalog.status]);

  return (
    <div ref={root} className="home">
      <ImmersiveHero />
      <FeaturedCollections />
      <CollectionPortal cols={cols} />
      <LivingFabric webgl={webgl} quality={quality} reduced={reduced} />
      <Story />
      <Details />
      <CustomerReviews />
      <InstagramStrip />
      <StoreLocationMap />
      <FinalPortal />
    </div>
  );
}
