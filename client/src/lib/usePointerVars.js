import { useEffect } from 'react';
import { P } from './pointer';

// Publishes a smoothed pointer as CSS variables (--px, --py in -1..1) on `ref`, without React re-renders.
// Fine pointers follow the cursor; touch devices get a very slow ambient drift; reduced motion stays still.
// The loop only runs while the element is on screen.
export function usePointerVars(ref, enabled = true) {
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.setProperty('--px', '0'); el.style.setProperty('--py', '0');
    if (!enabled) return;
    const touch = !matchMedia('(hover: hover) and (pointer: fine)').matches;
    let x = 0, y = 0, raf, visible = true, lastScroll = 0;
    const onScroll = () => { lastScroll = performance.now() }; // no style work while the page is moving, so scrolling stays smooth
    addEventListener('scroll', onScroll, { passive: true });
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([e]) => { visible = e.isIntersecting }) : null;
    io?.observe(el);
    const tick = t => {
      if (visible && !document.hidden && t - lastScroll > 140) {
        const tx = touch ? Math.sin(t / 3400) * 0.5 : P.x, ty = touch ? Math.cos(t / 4300) * 0.3 : P.y;
        const nx = x + (tx - x) * 0.06, ny = y + (ty - y) * 0.06;
        if (Math.abs(nx - x) > 0.0004 || Math.abs(ny - y) > 0.0004) { x = nx; y = ny; el.style.setProperty('--px', x.toFixed(4)); el.style.setProperty('--py', y.toFixed(4)) }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); io?.disconnect(); removeEventListener('scroll', onScroll) };
  }, [ref, enabled]);
}
