import { lazy, Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useApp } from '../context/App';
import { hasWebGL, useInView, useQuality, useReduced } from '../lib/hooks';
import { Magnetic, Reveal } from '../components/Motion';
import ProductCard, { CardSkeletons, ProductMedia } from '../components/ProductCard';
import { brand, media } from '../config/content';
import { Instagram, Reviews, Studio } from '../components/HomeSections';

gsap.registerPlugin(ScrollTrigger);
const HeroCanvas = lazy(() => import('../three/canvases').then(m => ({ default: m.HeroCanvas })));
const FabricCanvas = lazy(() => import('../three/canvases').then(m => ({ default: m.FabricCanvas })));

const line = (d = 0) => ({ initial: { opacity: 0, y: 60, rotateX: -30 }, transition: { duration: 1.2, delay: d, ease: [0.22, 1, 0.36, 1] } });

function Hero({ webgl, quality, reduced }) {
  const { entered } = useApp();
  const show = entered ? { opacity: 1, y: 0, rotateX: 0 } : {};
  return (
    <section className="hero" data-hero>
      <div className="hero-scene" aria-hidden="true">
        {webgl && <Suspense fallback={null}><HeroCanvas quality={quality} reduced={reduced} /></Suspense>}
        <div className="hero-fallback" /><div className="hero-vignette" />
      </div>
      <div className="hero-copy" data-hero-copy>
        <motion.p className="eyebrow gold" {...line(0.1)} animate={show}>THE COLLECTION</motion.p>
        <h1 className="hero-h" aria-label="Dressed in a different light.">
          <motion.span {...line(0.25)} animate={show}>DRESSED IN A</motion.span>
          <motion.span {...line(0.4)} animate={show}>DIFFERENT LIGHT.</motion.span>
        </h1>
        <motion.p className="hero-sub" {...line(0.6)} animate={show}>{brand.promise}</motion.p>
        <motion.div className="hero-cta" {...line(0.8)} animate={show}>
          <Magnetic><Link className="btn solid" to="/shop" data-cursor="EXPLORE">EXPLORE THE COLLECTION</Link></Magnetic>
          <Magnetic><Link className="btn" to="/about" data-cursor="DISCOVER">DISCOVER DHANYA</Link></Magnetic>
        </motion.div>
      </div>
      <div className="scroll-cue" aria-hidden="true"><span /></div>
    </section>
  );
}

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

function CuratedEdit({ items, loading }) {
  const picks = items.filter(p => p.featured).slice(0, 5);
  const list = picks.length ? picks : items.slice(0, 5);
  return (
    <section className="ivory-sec edit" data-theme="ivory" aria-labelledby="edit-h">
      <Reveal className="sec-head"><p className="eyebrow">THE CURATED EDIT</p><h2 id="edit-h" className="serif">Selected for the way light moves.</h2></Reveal>
      <div className="edit-grid">
        {loading && <CardSkeletons n={4} />}
        {list.map((p, i) => <Reveal key={p.id} delay={(i % 3) * 0.08} className={`edit-item e${i}`}><ProductCard p={p} tall={i % 2 === 0} /></Reveal>)}
      </div>
      {!loading && !list.length && <p className="muted center">The edit is being prepared. Please return soon.</p>}
      <Reveal className="center"><Link className="btn dark" to="/shop" data-cursor="SHOP">SHOP ALL PIECES</Link></Reveal>
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
      <Link to="/about" className="btn" data-cursor="DISCOVER">OUR WORLD</Link>
    </section>
  );
}

function Details() {
  if (!media.details.length) return null; // appears only when genuine close-up photography is configured
  return (
    <section className="ivory-sec details" data-theme="ivory" aria-labelledby="det-h">
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

  // GSAP owns pinned + scrubbed sequences. Reveals elsewhere belong to Motion — no element has two controllers.
  useLayoutEffect(() => {
    const mm = gsap.matchMedia(root.current);
    mm.add({ motion: '(prefers-reduced-motion: no-preference)', wide: '(min-width: 900px)' }, ctx => {
      const { motion: ok, wide } = ctx.conditions;
      if (!ok) return;
      gsap.to('[data-hero-copy]', { yPercent: -18, opacity: 0.1, ease: 'none', scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: true } });

      const track = root.current.querySelector('[data-track]');
      if (track && wide) {
        track.classList.add('pinned');
        const dist = () => Math.max(0, track.scrollWidth - innerWidth + 0);
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
      <Hero webgl={webgl} quality={quality} reduced={reduced} />
      <CollectionPortal cols={cols} />
      <CuratedEdit items={catalog.featured} loading={catalog.status === 'loading'} />
      <LivingFabric webgl={webgl} quality={quality} reduced={reduced} />
      <Story />
      <Details />
      <Reviews />
      <Instagram />
      <Studio />
      <FinalPortal />
    </div>
  );
}
