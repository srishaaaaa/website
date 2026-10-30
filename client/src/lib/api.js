// All requests are same-origin (Vite proxy in dev). The session and guest-cart cookies are httpOnly,
// so no credential ever lives in JavaScript-accessible storage. The custom header is the CSRF guard.
// Public catalogue reads are cached at the CDN for ~30s. Staff (who are editing that very content), and anyone for two minutes after they
// changed something, must never be shown the cached copy, so those reads carry a unique ?_= which the server never caches.
const CACHED_READ = /^\/(store|categories|collections(\/[a-z0-9-]+)?|products(\/[a-z0-9-]+)?|reviews)(\?|$)/;
const wantsFresh = () => typeof window !== 'undefined' && (window.__fresh || Date.now() < (window.__freshUntil || 0));

export async function api(path, opts = {}) {
  let r;
  const reading = !opts.method || opts.method === 'GET';
  if (reading && CACHED_READ.test(path) && wantsFresh()) { path += (path.includes('?') ? '&' : '?') + '_=' + Date.now(); if (typeof window !== 'undefined' && window.__pre) delete window.__pre[path] }
  // The page shell already started the homepage reads (see index.html); take that response once instead of asking again.
  const pre = !opts.method && !opts.body && typeof window !== 'undefined' && window.__pre?.[path];
  if (pre) { delete window.__pre[path]; r = await pre; if (r && !r.ok) r = null }
  try { if (!r) r = await fetch('/api' + path, {
    ...opts,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'dhanya' },
    body: opts.body && JSON.stringify(opts.body),
  }) } catch { throw Object.assign(new Error('Cannot reach the server. Check your connection and try again.'), { status: 0 }) }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || (r.status >= 500 ? `The server had a problem (error ${r.status}). Check /api/health on this site.` : r.status === 404 ? 'The server API was not found (404). The site may not be deployed with its API.' : `Request failed (${r.status})`)), { status: r.status, code: d.code, issues: d.issues });
  if (!reading && typeof window !== 'undefined') window.__freshUntil = Date.now() + 120000;
  return d;
}

// GET with automatic retries for network failures and 5xx: a serverless database that was idle can take a few seconds to wake.
export async function apiRetry(path, tries = 4) {
  for (let i = 1; ; i++) {
    try { return await api(path) } catch (e) {
      if (i >= tries || !(e.status === 0 || e.status >= 500)) throw e;
      await new Promise(r => setTimeout(r, 800 * i));
    }
  }
}

const LIMIT = 3.9 * 1024 * 1024; // the API accepts up to 4 MB per image

// Shrinks large photos in the browser before upload (keeps PNG/WebP transparency), then returns a Blob.
async function shrink(file, max = 2000) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Please choose a JPEG, PNG or WebP image.');
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size <= LIMIT) return file;
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const toBlob = (type, q) => new Promise(r => c.toBlob(r, type, q));
  let blob = await toBlob(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88);
  if (blob.size > LIMIT) blob = await toBlob('image/webp', 0.88); // alpha-safe and much smaller
  if (blob.size > LIMIT) throw new Error('That image is too large even after shrinking. Try a smaller one.');
  return blob;
}

// Admin: uploads one image and returns { id, url, bytes }.
export async function uploadImage(file) {
  const blob = await shrink(file);
  const r = await fetch('/api/admin/media?name=' + encodeURIComponent(file.name || 'image'), {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': blob.type, 'X-Requested-With': 'dhanya' }, body: blob,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Upload failed');
  return d;
}

// Admin: uploads an image OR a short video (MP4/WebM up to 4 MB) and returns { id, url, bytes, video }.
export async function uploadMedia(file) {
  if (!/^video\/(mp4|webm)$/.test(file.type)) return { ...(await uploadImage(file)), video: false };
  if (file.size > 3.9 * 1024 * 1024) throw new Error('Videos must be under 4 MB here. Trim or compress the clip, or paste a video link instead.');
  const r = await fetch('/api/admin/media?name=' + encodeURIComponent(file.name || 'video'), {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type, 'X-Requested-With': 'dhanya' }, body: file,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Upload failed');
  return { ...d, video: true };
}
