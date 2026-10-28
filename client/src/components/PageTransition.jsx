import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useReduced } from '../lib/hooks';
import { scrollTop } from './SmoothScroll';

const ease = [0.76, 0, 0.24, 1];

// Fabric-like sweep: rises to cover, then lifts away to reveal the next page in the same space.
function Curtain() {
  return (
    <motion.div className="curtain" aria-hidden="true"
      initial={{ clipPath: 'inset(100% 0 0 0)' }}
      animate={{ clipPath: ['inset(100% 0 0 0)', 'inset(0% 0 0 0)', 'inset(0 0 100% 0)'] }}
      transition={{ duration: 0.95, times: [0, 0.38, 1], ease }}>
      <span className="curtain-edge" />
    </motion.div>
  );
}

function Page({ children }) {
  useEffect(() => { scrollTop() }, []);
  return children;
}

export default function PageTransition({ children }) {
  const { pathname } = useLocation();
  const reduced = useReduced();
  const first = useRef(true);
  useEffect(() => { first.current = false }, []);

  // Admin pages switch instantly: no curtain sweep, no fade.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return <main key={pathname} id="main" tabIndex={-1} className="page"><Page>{children}</Page></main>;

  return (
    <>
      {!reduced && !first.current && <Curtain key={pathname} />}
      <AnimatePresence mode="wait" initial={false}>
        <motion.main key={pathname} id="main" tabIndex={-1} className="page"
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.975 }}
          animate={{ opacity: 1, scale: 1, transition: { duration: 0.6, delay: reduced ? 0 : 0.12, ease: [0.22, 1, 0.36, 1] } }}
          exit={reduced ? { opacity: 0, transition: { duration: 0.12 } } : { opacity: 0, scale: 1.035, transition: { duration: 0.32, ease: [0.5, 0, 0.75, 0] } }}>
          <Page>{children}</Page>
        </motion.main>
      </AnimatePresence>
    </>
  );
}
