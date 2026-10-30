// Turns a pasted reel/video link into something the site can play: a direct file, a YouTube embed or an Instagram embed.
export function parseVideo(src = '') {
  const u = String(src).trim();
  let m = u.match(/(?:youtube\.com\/(?:shorts\/|watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/i);
  if (m) return { kind: 'youtube', id: m[1], embed: `https://www.youtube.com/embed/${m[1]}?autoplay=1&playsinline=1&rel=0&loop=1&playlist=${m[1]}` };
  m = u.match(/instagram\.com\/(?:[\w.]+\/)?(reel|reels|p|tv)\/([\w-]+)/i);
  if (m) return { kind: 'instagram', id: m[2], embed: `https://www.instagram.com/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/embed/` };
  return { kind: 'file', src: u };
}
export const isEmbed = src => parseVideo(src).kind !== 'file';
