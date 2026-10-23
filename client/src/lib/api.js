// All requests are same-origin (Vite proxy in dev). The session and guest-cart cookies are httpOnly,
// so no credential ever lives in JavaScript-accessible storage. The custom header is the CSRF guard.
export async function api(path, opts = {}) {
  const r = await fetch('/api' + path, {
    ...opts,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'dhanya' },
    body: opts.body && JSON.stringify(opts.body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'Request failed'), { status: r.status, code: d.code });
  return d;
}
