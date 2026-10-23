import { motion } from 'framer-motion';
import { media } from '../../config/content';

// The seated woman, kept exactly as photographed. Depth comes from layered planes around the untouched photo
// (no artificial cut-out edges): a soft atmospheric glow plane, two gold keyline planes at different depths,
// the photograph itself with an ambient shadow, a restrained light sheen, and a few foreground details.
// Motion is driven by --px/--py (see usePointerVars) and stays small: no distortion of face, body or chair.
export default function ParallaxSubject({ show }) {
  return (
    <motion.div className="ps" data-subject initial={{ opacity: 0, y: 40 }} animate={show ? { opacity: 1, y: 0 } : undefined} transition={{ duration: 1.3, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}>
      <div className="ps-stage">
        <img className="ps-glow" src={media.heroImage} alt="" aria-hidden="true" />
        <span className="ps-frame f3" aria-hidden="true" />
        <span className="ps-frame f2" aria-hidden="true" />
        <div className="ps-shadow">
          <figure className="ps-photo">
            <img src={media.heroImage} width="736" height="981" fetchpriority="high" decoding="async"
              alt="A woman seated on a carved wooden chair against a rose-pink wall, draped in a sage-gold saree with a lace border" />
            <span className="ps-sheen" aria-hidden="true" />
          </figure>
        </div>
        <i className="ps-fg a" aria-hidden="true" /><i className="ps-fg b" aria-hidden="true" /><i className="ps-fg c" aria-hidden="true" />
      </div>
    </motion.div>
  );
}
