import { motion } from 'framer-motion';
import { useReduced } from '../../lib/hooks';

// Oversized headline: every line rises out of its own mask, staggered. `show` gates the entrance (after the intro).
export default function EditorialTypography({ lines, show, label, className = '', delay = 0.15 }) {
  const reduced = useReduced();
  return (
    <h1 className={`et ${className}`} aria-label={label ?? lines.join(' ')}>
      {lines.map((l, i) => (
        <span className="et-mask" key={l} aria-hidden="true">
          <motion.span className="et-line" initial={reduced ? false : { y: '112%', rotate: 2 }} animate={show || reduced ? { y: '0%', rotate: 0 } : undefined}
            transition={{ duration: 1.1, delay: delay + i * 0.14, ease: [0.22, 1, 0.36, 1] }}>{l}</motion.span>
        </span>
      ))}
    </h1>
  );
}
