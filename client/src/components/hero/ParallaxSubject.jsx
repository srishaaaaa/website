import { motion } from 'framer-motion';
import { media } from '../../config/content';
import { useApp } from '../../context/App';

// The centre photograph of the hero: shown exactly as photographed (no effects). Replace it in
// Admin → Storefront images → Centre photo.
export default function ParallaxSubject({ show }) {
  const { site } = useApp();
  const b = site.branding || {};
  if (site.status === 'loading') return <div className="hl-stage" aria-hidden="true" />;
  return (
    <motion.div className="hl-stage" data-subject initial={{ opacity: 0 }} animate={show ? { opacity: 1 } : undefined} transition={{ duration: 1, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}>
      <img className="tri-photo" src={b.heroCutout || media.heroCenter} alt={b.heroAlt || media.heroAlt} fetchpriority="high" decoding="async" />
    </motion.div>
  );
}
