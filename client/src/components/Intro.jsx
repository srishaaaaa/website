import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { hasWebGL, useModal, useQuality, useReduced } from '../lib/hooks';
import { Emblem } from './Wordmark';

const PortalCanvas = lazy(() => import('../three/canvases').then(m => ({ default: m.PortalCanvas })));

const ENTER_MS = 2300;

// Skippable cinematic entrance. Never blocks the page: the skip control is available from the first frame.
export default function Intro({ onDone }) {
  const reduced = useReduced();
  const quality = useQuality();
  const webgl = useMemo(hasWebGL, []);
  const [phase, setPhase] = useState('idle'); // idle | entering
  const [line2, setLine2] = useState(false);
  const ref = useRef();
  const timer = useRef();
  const finish = () => { clearTimeout(timer.current); onDone() };
  useModal(true, finish, ref); // Esc skips

  useEffect(() => { const t = setTimeout(() => setLine2(true), 1700); return () => clearTimeout(t) }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const enter = () => {
    if (phase === 'entering') return;
    setPhase('entering');
    timer.current = setTimeout(onDone, reduced ? 200 : ENTER_MS);
  };
  const glass = e => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`); e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`) };
  const entering = phase === 'entering';

  return (
    <motion.div ref={ref} className="intro" role="dialog" aria-modal="true" aria-label="Welcome to DHANYA"
      initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.08, filter: 'blur(6px)' }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}>
      <div className="intro-bg" aria-hidden="true">
        {webgl
          ? <Suspense fallback={null}><PortalCanvas entering={entering} quality={quality} reduced={reduced} /></Suspense>
          : null}
        <div className="intro-fallback" />
        <div className="intro-vignette" />
      </div>

      <button className="intro-skip" onClick={finish}>SKIP</button>

      <motion.div className="intro-center" animate={entering ? { opacity: 0, scale: 0.9, y: -20 } : { opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}>
          <Emblem size={96} glow className="intro-emblem" />
        </motion.div>
        <motion.p className="intro-k" initial={{ opacity: 0, y: 14, letterSpacing: '.7em' }} animate={{ opacity: 1, y: 0, letterSpacing: '.42em' }} transition={{ delay: 0.6, duration: 1.6, ease: [0.22, 1, 0.36, 1] }}>BEYOND THE ORDINARY.</motion.p>
        <motion.h1 className="intro-h" initial={{ opacity: 0, y: 24 }} animate={line2 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}>
          ENTER THE WORLD<br />OF DHANYA.
        </motion.h1>
        <motion.div initial={{ opacity: 0 }} animate={line2 ? { opacity: 1 } : {}} transition={{ delay: 0.5, duration: 1 }}>
          <button className="enter-btn" onClick={enter} onPointerMove={glass} data-autofocus data-cursor="ENTER"><span>ENTER</span></button>
        </motion.div>
      </motion.div>

      {entering && !reduced && (
        <div className="sweeps" aria-hidden="true">
          {[0, 1, 2].map(i => (
            <motion.div key={i} className="sweep" style={{ top: `${i * 34 - 2}%` }} initial={{ x: '-110%', skewX: -14 }} animate={{ x: '110%' }} transition={{ delay: 0.9 + i * 0.12, duration: 1.1, ease: [0.76, 0, 0.24, 1] }} />
          ))}
          <motion.div className="flash" initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 0.85, 0] }} transition={{ duration: ENTER_MS / 1000, times: [0, 0.6, 0.9, 1] }} />
        </div>
      )}
    </motion.div>
  );
}
