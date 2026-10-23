// Deterministic generative art used while a product has no photography.
export const PALETTES = [
  ['#211426', '#B77F8C', '#C6A46A'],
  ['#09090D', '#C6A46A', '#F5F0E8'],
  ['#2b1a33', '#8b5a6b', '#d9c3a0'],
  ['#14121a', '#6d5a86', '#C6A46A'],
  ['#3a2230', '#B77F8C', '#F5F0E8'],
];

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0;
}

export function rng(seed) {
  let a = typeof seed === 'string' ? hash(seed) : seed >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const palette = seed => PALETTES[hash(String(seed)) % PALETTES.length];
