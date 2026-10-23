import { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useFinePointer, useReduced } from '../lib/hooks';

// Restrained glow that trails the native pointer (which is never hidden) and
// shows a context label over elements carrying data-cursor="VIEW" etc.
export default function Cursor() {
  const fine = useFinePointer(), reduced = useReduced();
  const x = useMotionValue(-100), y = useMotionValue(-100);
  const rx = useSpring(x, { stiffness: 140, damping: 20, mass: 0.6 }), ry = useSpring(y, { stiffness: 140, damping: 20, mass: 0.6 });
  const [label, setLabel] = useState('');
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!fine || reduced) return;
    const move = e => { x.set(e.clientX); y.set(e.clientY); setShown(true) };
    const over = e => setLabel(e.target.closest?.('[data-cursor]')?.dataset.cursor || '');
    const leave = () => setShown(false);
    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerover', over);
    document.documentElement.addEventListener('pointerleave', leave);
    return () => { window.removeEventListener('pointermove', move); document.removeEventListener('pointerover', over); document.documentElement.removeEventListener('pointerleave', leave) };
  }, [fine, reduced, x, y]);

  if (!fine || reduced) return null;
  return (
    <motion.div className={`cursor ${label ? 'has-label' : ''}`} style={{ x: rx, y: ry, opacity: shown ? 1 : 0 }} aria-hidden="true">
      <span className="cursor-ring">{label && <span className="cursor-label">{label}</span>}</span>
    </motion.div>
  );
}
