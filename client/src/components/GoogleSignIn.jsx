import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

const SRC = 'https://accounts.google.com/gsi/client';
let loading;
const loadGoogle = () => loading ||= new Promise((ok, fail) => {
  if (window.google?.accounts?.id) return ok(window.google);
  const s = document.createElement('script');
  s.src = SRC; s.async = true; s.onload = () => ok(window.google); s.onerror = () => { loading = null; fail(new Error('Google could not be loaded')) };
  document.head.appendChild(s);
});

// "Continue with Google". Hidden until the server has a GOOGLE_CLIENT_ID. `onDone(user)` runs after the server confirms the sign-in.
export default function GoogleSignIn({ onDone, onError }) {
  const box = useRef();
  const [id, setId] = useState();
  const cb = useRef({ onDone, onError }); cb.current = { onDone, onError };

  useEffect(() => { api('/auth/google/config').then(d => setId(d.clientId || null)).catch(() => setId(null)) }, []);

  useEffect(() => {
    if (!id) return;
    let off = false;
    loadGoogle().then(g => {
      if (off || !box.current) return;
      g.accounts.id.initialize({
        client_id: id,
        callback: async r => {
          try { const d = await api('/auth/google', { method: 'POST', body: { credential: r.credential } }); cb.current.onDone(d.user) }
          catch (x) { cb.current.onError?.(x.message || 'Google sign-in failed') }
        },
      });
      g.accounts.id.renderButton(box.current, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'center', width: Math.min(360, box.current.clientWidth || 320) });
    }).catch(() => cb.current.onError?.('Google could not be loaded. Please check your connection.'));
    return () => { off = true };
  }, [id]);

  if (!id) return null;
  return (
    <div className="g-signin">
      <p className="muted small center g-or"><span>or</span></p>
      <div ref={box} className="g-btn" />
    </div>
  );
}
