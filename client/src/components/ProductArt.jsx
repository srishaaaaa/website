import { useId, useMemo } from 'react';
import { palette, rng } from '../lib/art';

// Generative silk plate. Stands in for photography until real product images are uploaded.
// `view` (0..3) produces different crops so galleries and hover-swaps have genuine variety.
export default function ProductArt({ seed, view = 0, className = '' }) {
  const id = useId().replace(/:/g, '');
  const { bg, folds, hi } = useMemo(() => {
    const [a, b, c] = palette(seed); const r = rng(`${seed}:${view}`);
    const folds = Array.from({ length: 11 }, (_, i) => {
      const y = 20 + i * 36 + r() * 20, amp = 30 + r() * 60;
      return { d: `M-20 ${y} C 70 ${y - amp}, 160 ${y + amp}, 320 ${y + (r() - 0.5) * 60}`, o: 0.07 + r() * 0.22, w: 0.8 + r() * 2.6, light: r() > 0.45 };
    });
    return { bg: [a, b, c], folds, hi: { x: 20 + r() * 60, y: 15 + r() * 40 } };
  }, [seed, view]);
  const zoom = [1, 1.5, 2.1, 1.25][view % 4];
  const tx = [0, -40, -110, -15][view % 4], ty = [0, -30, -90, -50][view % 4];
  return (
    <svg className={`art ${className}`} viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={bg[0]} /><stop offset=".58" stopColor={bg[1]} /><stop offset="1" stopColor={bg[2]} /></linearGradient>
        <radialGradient id={`h${id}`} cx={`${hi.x}%`} cy={`${hi.y}%`} r="62%"><stop offset="0" stopColor="#F5F0E8" stopOpacity=".14" /><stop offset="1" stopColor="#F5F0E8" stopOpacity="0" /></radialGradient>
        <pattern id={`w${id}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="4" height="1" fill="#000" opacity=".05" /></pattern>
      </defs>
      <g transform={`translate(${tx} ${ty}) scale(${zoom})`}>
        <rect x="-60" y="-60" width="420" height="520" fill={`url(#g${id})`} />
        {folds.map((f, i) => <path key={i} d={f.d} fill="none" stroke={f.light ? '#F5F0E8' : '#09090D'} strokeOpacity={f.o} strokeWidth={f.w} />)}
        <rect x="-60" y="-60" width="420" height="520" fill={`url(#h${id})`} />
      </g>
      <rect width="300" height="400" fill={`url(#w${id})`} />
    </svg>
  );
}
