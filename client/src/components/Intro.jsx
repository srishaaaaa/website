import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useModal, useReduced } from '../lib/hooks';
import { useRef } from 'react';

// Short splash on every load of the customer site: deep plum sky, drifting stars, the script wordmark.
// It runs by itself (about 2.6 s) and fades out; Skip / Esc end it at once.
const STARS = 26;

export default function Intro({ onDone }) {
  const reduced = useReduced();
  const ref = useRef();
  useModal(true, onDone, ref);
  useEffect(() => { const t = setTimeout(onDone, reduced ? 500 : 2600); return () => clearTimeout(t) }, []); // eslint-disable-line
  const stars = useMemo(() => Array.from({ length: STARS }, (_, i) => ({
    x: Math.random() * 100, y: Math.random() * 100, s: 2 + Math.random() * 3.5, d: Math.random() * 2.4, t: 2.2 + Math.random() * 2.4,
  })), []);

  return (
    <motion.div ref={ref} className="splash" role="dialog" aria-modal="true" aria-label="Dhanya Boutique"
      initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }}>
      <div className="splash-sky" aria-hidden="true">
        {stars.map((s, i) => <i key={i} style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, animationDelay: `${s.d}s`, animationDuration: `${s.t}s` }} />)}
      </div>
      <button className="splash-skip" onClick={onDone}>SKIP</button>
      <div className="splash-mid">
        <motion.span className="splash-sq" aria-hidden="true" initial={{ opacity: 0, rotate: -20, scale: .8 }} animate={{ opacity: 1, rotate: 8, scale: 1 }} transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}><b /><b /><b /></motion.span>
        <motion.h1 className="splash-mark" initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 1.3, delay: .15, ease: [0.22, 1, 0.36, 1] }}>Dhanya</motion.h1>
        <motion.div className="splash-rule" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: .9 }}><i /><em /><i /></motion.div>
        <motion.p className="splash-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 1.1 }}>BOUTIQUE &amp; TAILORS</motion.p>
      </div>
    </motion.div>
  );
}
