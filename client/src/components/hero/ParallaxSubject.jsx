import { useState } from 'react';
import { motion } from 'framer-motion';
import { media } from '../../config/content';

// The model, cut out from her photograph (soft-feathered edges) and standing in front of the oversized lettering.
// Depth is created around her, never by distorting her: a soft aura plane behind, a contact shadow on the "floor",
// an ambient drop shadow, and a few foreground sparkles. Movement is driven by --px/--py (see usePointerVars).
// The layout adapts to the photograph: a tall standing figure is sized by height, a wide seated one by width.
export default function ParallaxSubject({ show }) {
  const [ratio, setRatio] = useState(null);
  const onLoad = e => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight);
  const tall = ratio != null && ratio < 0.9;
  return (
    <motion.div className={`ps ${tall ? 'tall' : ''}`} data-subject style={ratio ? { aspectRatio: ratio } : undefined}
      initial={{ opacity: 0, y: 40 }} animate={show ? { opacity: 1, y: 0 } : undefined} transition={{ duration: 1.3, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}>
      <div className="ps-stage">
        <i className="ps-aura" aria-hidden="true" />
        <i className="ps-floor" aria-hidden="true" />
        <picture>
          <source srcSet={media.heroCutoutWebp} type="image/webp" />
          <img className="ps-cut" src={media.heroCutout} onLoad={onLoad} fetchpriority="high" decoding="async" alt={media.heroAlt} />
        </picture>
        <i className="ps-fg a" aria-hidden="true" /><i className="ps-fg b" aria-hidden="true" /><i className="ps-fg c" aria-hidden="true" />
      </div>
    </motion.div>
  );
}
