import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useApp } from '../context/App';
import { Magnetic, Reveal } from '../components/Motion';
import ImmersiveHero from '../components/hero/ImmersiveHero';
import FeaturedCollections from '../components/FeaturedCollections';
import CollectionsFlow from '../components/CollectionsFlow';
import CategoryCircles from '../components/CategoryCircles';
import AboutBand from '../components/AboutBand';
import CustomerReviews from '../components/CustomerReviews';
import InstagramStrip from '../components/InstagramStrip';
import StoreLocationMap from '../components/StoreLocationMap';
import ServiceHighlights from '../components/ServiceHighlights';
import { brand, media } from '../config/content';
import { LogoTile } from '../components/Wordmark';

gsap.registerPlugin(ScrollTrigger);

// Our Story: a photograph continuing beneath a deep-wine panel with serif copy (heritage-boutique feel).
function Story() {
  const { site } = useApp();
  const b = site.branding || {};
  return (
    <section className="story3" aria-labelledby="story-h">
      <Reveal className="story3-card">
        <img className="story3-img" src={b.storyImage || media.storyImage} alt={b.storyAlt || media.storyAlt} loading="lazy" width="736" height="920" />
        <svg className="story3-arch" viewBox="0 0 400 520" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden="true">
          <path d="M40 520V230c0-26 14-40 32-46 8-20 22-30 42-28 10-20 28-28 46-24 8-16 22-22 40-22s32 6 40 22c18-4 36 4 46 24 20-2 34 8 42 28 18 6 32 20 32 46v290" />
          <path d="M72 520V240c0-20 10-30 26-36 6-16 18-22 34-20 8-16 22-22 38-18 6-12 18-18 30-18s24 6 30 18c16-4 30 2 38 18 16-2 28 4 34 20 16 6 26 16 26 36v280" opacity=".55" />
        </svg>
        <div className="story3-panel">
          <span className="story3-logo"><LogoTile size={34} /><b>DHANYA</b></span>
          <h2 id="story-h" className="story3-h">Our Story</h2>
          {brand.story.map((p, i) => <p key={i} className="story3-p">{p}</p>)}
          <Magnetic><Link to="/about" className="story3-link" data-cursor="DISCOVER">Discover more <span aria-hidden="true">→</span></Link></Magnetic>
        </div>
      </Reveal>
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

export default function Home() {
  const { catalog } = useApp();
  const root = useRef();

  // GSAP owns the scroll-driven composition (hero depth, mask reveal, pinned gallery). Motion owns entrances
  // and hover states. No element is animated by both.
  useLayoutEffect(() => {
    const mm = gsap.matchMedia(root.current);
    mm.add({ motion: '(prefers-reduced-motion: no-preference)' }, ctx => {
      const { motion: ok } = ctx.conditions;
      if (!ok) return;
      const hero = { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: true };
      gsap.to('[data-word-bg]', { yPercent: -12, ease: 'none', scrollTrigger: hero });                                          // lettering drifts slowly behind
      gsap.fromTo('[data-gridwrap]', { rotateX: 0, opacity: 1 }, { rotateX: 52, opacity: 0.3, ease: 'none', scrollTrigger: hero }); // grid gains perspective
      gsap.to('[data-hero-copy]', { yPercent: -12, opacity: 0.1, ease: 'none', scrollTrigger: hero });                          // copy leaves; the model stays the anchor
      // The featured collection is revealed through a soft editorial mask.
      gsap.fromTo('[data-edit]', { clipPath: 'inset(8% 5% 0% 5% round 56px 56px 0px 0px)' }, { clipPath: 'inset(0% 0% 0% 0% round 0px 0px 0px 0px)', ease: 'none', scrollTrigger: { trigger: '[data-edit]', start: 'top 96%', end: 'top 38%', scrub: true } });

    });
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
    return () => mm.revert();
  }, [catalog.status]);

  return (
    <div ref={root} className="home">
      <ImmersiveHero />
      <CategoryCircles />
      <AboutBand />
      <FeaturedCollections />
      <CollectionsFlow />
      <Story />
      <Details />
      <ServiceHighlights />
      <CustomerReviews />
      <InstagramStrip />
      <StoreLocationMap />
    </div>
  );
}
