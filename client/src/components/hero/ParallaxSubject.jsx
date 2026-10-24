import { lazy, Suspense, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { media } from '../../config/content';
import { hasWebGL, useQuality, useReduced } from '../../lib/hooks';
import { useApp } from '../../context/App';

const HeroCanvas = lazy(() => import('../../three/canvases').then(m => ({ default: m.HeroCanvas })));

// The hero "stage" has a fixed aspect ratio and everything inside is positioned in percentages, so the
// composition is identical at every screen size: it simply scales. With WebGL the model is a real 3D mesh
// (depth-displaced cut-out) with a silk ribbon behind her pallu; without WebGL the same cut-out is shown flat.
export default function ParallaxSubject({ show }) {
  const reduced = useReduced(), quality = useQuality();
  const webgl = useMemo(hasWebGL, []);
  const { site } = useApp();
  const [ratio, setRatio] = useState(null);
  const b = site.branding || {};
  const custom = !!b.heroCutout;                       // a model uploaded in Admin → Storefront
  const cutout = b.heroCutout || media.heroCutout;
  const depth = custom ? b.heroDepth : media.heroDepth;
  const alt = b.heroAlt || media.heroAlt;
  if (site.status === 'loading') return <div className="hl-stage" aria-hidden="true" />; // avoid flashing the default before the real model
  return (
    <motion.div className="hl-stage" data-subject initial={{ opacity: 0, y: 40 }} animate={show ? { opacity: 1, y: 0 } : undefined} transition={{ duration: 1.3, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}>
      <i className="ps-aura" aria-hidden="true" />
      {webgl ? (
        <div role="img" aria-label={alt} className="ps-3d">
          <Suspense fallback={null}><HeroCanvas quality={quality} reduced={reduced} cutout={cutout} depth={depth} /></Suspense>
        </div>
      ) : (
        <div className="ps-model" style={ratio ? { aspectRatio: ratio } : undefined}>
          <picture>
            {!custom && <source srcSet={media.heroCutoutWebp} type="image/webp" />}
            <img className="ps-cut" src={cutout} onLoad={e => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} fetchpriority="high" decoding="async" alt={alt} />
          </picture>
        </div>
      )}
      <i className="ps-floor" aria-hidden="true" />
      <i className="ps-fg a" aria-hidden="true" /><i className="ps-fg b" aria-hidden="true" /><i className="ps-fg c" aria-hidden="true" />
    </motion.div>
  );
}
