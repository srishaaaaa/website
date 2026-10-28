import { useEffect } from 'react';
import Lenis from 'lenis';

// Smooth, eased scrolling for the website (mouse wheel and trackpad). Phones keep their own native scrolling,
// and nothing changes for people who ask for reduced motion. Pop-ups (bag, search, menus, dialogs) scroll on their own,
// and the page stops scrolling underneath them while one is open.
let lenis = null;

// Scroll to an element, smoothly when smooth scrolling is on.
export function scrollToEl(el, { offset = 0 } = {}) {
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset, duration: 1.1 });
  else el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}
// Jump to the top straight away (used when a new page opens).
export function scrollTop() { if (lenis) lenis.scrollTo(0, { immediate: true, force: true }); else window.scrollTo(0, 0) }

const OWN_SCROLL = '[role="dialog"], .overlay-root, .mega, .search, .mobile-menu, .cart-drawer, .drawer, [data-lenis-prevent]';

export default function SmoothScroll() {
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return; // touch screens: native scrolling
    lenis = new Lenis({ duration: 1.05, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true, prevent: node => !!node.closest?.(OWN_SCROLL) });
    let raf = requestAnimationFrame(function loop(t) { lenis?.raf(t); raf = requestAnimationFrame(loop) });
    // A pop-up locks the page (body overflow hidden): pause smooth scrolling until it closes.
    const sync = () => { if (!lenis) return; document.body.style.overflow === 'hidden' ? lenis.stop() : lenis.start() };
    const mo = new MutationObserver(sync); mo.observe(document.body, { attributes: true, attributeFilter: ['style'] });
    document.documentElement.classList.add('smooth');
    return () => { cancelAnimationFrame(raf); mo.disconnect(); lenis?.destroy(); lenis = null; document.documentElement.classList.remove('smooth') };
  }, []);
  return null;
}
