// Shared normalised pointer (-1..1), tracked once on window so overlaid HTML never blocks it.
export const P = { x: 0, y: 0 };
if (typeof window !== 'undefined' && !window.__dhanyaPointer) {
  window.__dhanyaPointer = true;
  window.addEventListener('pointermove', e => { P.x = (e.clientX / innerWidth) * 2 - 1; P.y = -((e.clientY / innerHeight) * 2 - 1) }, { passive: true });
}
