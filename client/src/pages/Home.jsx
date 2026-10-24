import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/App';
import { Magnetic, Reveal } from '../components/Motion';
import BoutiqueHero from '../components/hero/BoutiqueHero';
import Ticker from '../components/Ticker';
import FeaturedCollections from '../components/FeaturedCollections';
import EditorialSection from '../components/EditorialSection';
import CollectionsFlow from '../components/CollectionsFlow';
import CategoryCircles from '../components/CategoryCircles';
import CustomerReviews from '../components/CustomerReviews';
import EnquirySection from '../components/EnquirySection';
import InstagramStrip from '../components/InstagramStrip';
import StoreLocationMap from '../components/StoreLocationMap';
import ServiceHighlights from '../components/ServiceHighlights';
import { brand, media } from '../config/content';

// Shop Story: the boutique's story beside a photograph, on a deep-red panel. The wording lives in config/content.js.
function Story() {
  const { site } = useApp();
  const b = site.branding || {};
  return (
    <section className="story3" id="story" aria-labelledby="story-h">
      <Reveal className="story3-card">
        <img className="story3-img" src={b.storyImage || media.storyImage} alt={b.storyAlt || media.storyAlt} loading="lazy" width="736" height="920" />
        <svg className="story3-arch" viewBox="0 0 400 520" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden="true">
          <path d="M40 520V230c0-26 14-40 32-46 8-20 22-30 42-28 10-20 28-28 46-24 8-16 22-22 40-22s32 6 40 22c18-4 36 4 46 24 20-2 34 8 42 28 18 6 32 20 32 46v290" />
          <path d="M72 520V240c0-20 10-30 26-36 6-16 18-22 34-20 8-16 22-22 38-18 6-12 18-18 30-18s24 6 30 18c16-4 30 2 38 18 16-2 28 4 34 20 16 6 26 16 26 36v280" opacity=".55" />
        </svg>
        <div className="story3-panel">
          <span className="story3-logo"><b>DHANYA BOUTIQUE</b></span>
          <h2 id="story-h" className="story3-h">Shop Story</h2>
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

// Order: hero → ticker → curated catalogue → editorial → collections → reviews → enquiries/contact →
// categories → Instagram reels → shop story → live map → footer.
export default function Home() {
  const { hash } = useLocation();

  // "Shop Story" and "Contact" in the menu are in-page links: scroll to them once the page has transitioned in.
  useEffect(() => {
    if (!hash) return;
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 650);
    return () => clearTimeout(t);
  }, [hash]);

  return (
    <div className="home">
      <BoutiqueHero />
      <Ticker />
      <FeaturedCollections />
      <EditorialSection />
      <CollectionsFlow />
      <Details />
      <ServiceHighlights />
      <CustomerReviews />
      <EnquirySection />
      <CategoryCircles />
      <InstagramStrip />
      <Story />
      <StoreLocationMap />
    </div>
  );
}
