import { useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useFinePointer, useReduced } from '../lib/hooks';

// Staggerable scroll reveal (Motion owns reveals; GSAP owns pinned/scrubbed sequences).
export function Reveal({ children, delay = 0, y = 36, className = '', as = 'div', ...rest }) {
  const reduced = useReduced();
  const M = motion[as] || motion.div;
  return (
    <M className={className} initial={reduced ? false : { opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }} transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }} {...rest}>
      {children}
    </M>
  );
}

// Magnetic attraction toward the pointer for key CTAs (fine pointers only).
export function Magnetic({ children, strength = 0.28, className = '' }) {
  const fine = useFinePointer(), reduced = useReduced();
  const ref = useRef();
  const x = useMotionValue(0), y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 16 }), sy = useSpring(y, { stiffness: 220, damping: 16 });
  if (!fine || reduced) return <span className={`mag ${className}`}>{children}</span>;
  return (
    <motion.span ref={ref} className={`mag ${className}`} style={{ x: sx, y: sy }}
      onPointerMove={e => { const r = ref.current.getBoundingClientRect(); x.set((e.clientX - (r.left + r.width / 2)) * strength); y.set((e.clientY - (r.top + r.height / 2)) * strength) }}
      onPointerLeave={() => { x.set(0); y.set(0) }}>
      {children}
    </motion.span>
  );
}
