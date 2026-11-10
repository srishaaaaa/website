import { Component } from 'react';

// A failed lazy page after a release reloads once on its own (guarded for a minute so it can never loop).
export function reloadOnce() {
  try {
    const last = +sessionStorage.getItem('dhanya.reloaded') || 0;
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem('dhanya.reloaded', String(Date.now()));
  } catch { return false }
  location.reload(); return true;
}
const stale = m => /Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed/i.test(String(m || ''));

// A white card instead of a blank screen when something crashes: the error, and a Reload button.
export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) { if (stale(error?.message)) reloadOnce() }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const old = stale(error.message);
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#FFF9F0', padding: 16 }}>
        <div style={{ maxWidth: 560, width: '100%', background: '#fff', borderRadius: 18, padding: 28, boxShadow: '0 20px 50px rgba(51,5,51,.15)', color: '#211714', fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ margin: '0 0 10px', fontSize: 22 }}>{old ? 'This page is out of date' : 'Something went wrong'}</h1>
          {!old && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#f6f1ec', padding: 12, borderRadius: 10, maxHeight: 200, overflow: 'auto' }}>{String(error.stack || error.message).slice(0, 800)}</pre>}
          <button onClick={() => location.reload()} style={{ marginTop: 14, padding: '12px 24px', borderRadius: 999, background: '#330533', color: '#fff', fontWeight: 700 }}>Reload</button>
        </div>
      </div>
    );
  }
}
