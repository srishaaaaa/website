import { useEffect, useMemo, useRef, useState } from 'react';

export function useMedia(query) {
  const [m, setM] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches);
  useEffect(() => {
    const mm = matchMedia(query); const f = () => setM(mm.matches); f();
    mm.addEventListener('change', f); return () => mm.removeEventListener('change', f);
  }, [query]);
  return m;
}
export const useReduced = () => useMedia('(prefers-reduced-motion: reduce)');
export const useFinePointer = () => useMedia('(hover: hover) and (pointer: fine)');
export const useIsMobile = () => useMedia('(max-width: 767px)');

export function hasWebGL() {
  try { return !!document.createElement('canvas').getContext('webgl2') } catch { return false }
}

// Adaptive visual quality: smaller / weaker devices get cheaper scenes.
export function useQuality() {
  return useMemo(() => {
    const mobile = matchMedia('(max-width:767px)').matches;
    const weak = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
    const low = mobile || !!weak;
    return { low, mobile, dpr: low ? [1, 1.25] : [1, 1.75], seg: low ? [56, 36] : [128, 84], sparkles: low ? 36 : 110 };
  }, []);
}

export function useInView(ref, options) {
  const [v, setV] = useState(false);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === 'undefined') { setV(true); return }
    const io = new IntersectionObserver(([e]) => setV(e.isIntersecting), options);
    io.observe(ref.current);
    return () => io.disconnect();
  }, []); // eslint-disable-line
  return v;
}

export function usePageVisible() {
  const [v, setV] = useState(() => !document.hidden);
  useEffect(() => {
    const f = () => setV(!document.hidden);
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);
  return v;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Dialog behaviour: scroll lock, Esc to close, Tab trap, focus restore.
export function useModal(open, onClose, ref) {
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement; const root = ref.current;
    const prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const t = setTimeout(() => { (root?.querySelector('[data-autofocus]') || root?.querySelector(FOCUSABLE))?.focus() }, 60);
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); close.current(); return }
      if (e.key !== 'Tab' || !root) return;
      const els = [...root.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null || el === document.activeElement);
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; prev?.focus?.() };
  }, [open]); // eslint-disable-line
}
