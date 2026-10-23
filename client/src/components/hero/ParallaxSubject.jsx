import { motion } from 'framer-motion';
import { media } from '../../config/content';

// The seated woman, cut out from her original photograph (soft-feathered edges) and standing in front of the
// oversized lettering. Depth is created around her, never by distorting her: a soft aura plane behind, a contact
// shadow on the "floor", an ambient drop shadow, and a few foreground sparkles. Movement is driven by --px/--py
// (see usePointerVars) and stays small.
export default function ParallaxSubject({ show }) {
  return (
    <motion.div className="ps" data-subject initial={{ opacity: 0, y: 40 }} animate={show ? { opacity: 1, y: 0 } : undefined} transition={{ duration: 1.3, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}>
      <div className="ps-stage">
        <i className="ps-aura" aria-hidden="true" />
        <i className="ps-floor" aria-hidden="true" />
        <picture>
          <source srcSet={media.heroCutoutWebp} type="image/webp" />
          <img className="ps-cut" src={media.heroCutout} width="662" height="581" fetchpriority="high" decoding="async"
            alt="A woman seated on a carved wooden chair in a sage-gold saree with a lace border" />
        </picture>
        <i className="ps-fg a" aria-hidden="true" /><i className="ps-fg b" aria-hidden="true" /><i className="ps-fg c" aria-hidden="true" />
      </div>
    </motion.div>
  );
}
