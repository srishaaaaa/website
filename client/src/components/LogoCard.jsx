import { useEffect, useRef, useState } from 'react';
import { api, uploadImage } from '../lib/api';
import { useApp } from '../context/App';
import { DEFAULT_LOGO } from './Wordmark';

// Upload / remove the boutique logo. It is the same logo as Storefront images → Logo: shown in the website header and printed on invoices.
export default function LogoCard() {
  const { toast, loadSite } = useApp();
  const [b, setB] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(); const input = useRef();
  useEffect(() => { api('/store').then(s => setB(s.branding)).catch(e => setErr(e.message)) }, []);
  const save = async logo => {
    setBusy(true); setErr();
    try { const out = await api('/admin/settings/branding', { method: 'PUT', body: { ...b, logo } }); setB(out); loadSite(); toast(logo ? 'Logo updated.' : 'Logo removed.') }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  };
  const pick = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    setBusy(true); setErr();
    try { const up = await uploadImage(f); await save(up.url) } catch (x) { setErr(x.message); setBusy(false) }
  };
  return (
    <section className="dpos-card"><h2>Logo</h2>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="dpos-logo-prev"><img src={b?.logo || DEFAULT_LOGO} alt="Current logo" /></div>
        <div style={{ display: 'grid', gap: 8 }}>
          <p className="sub" style={{ maxWidth: 440 }}>Your Dhanyas Boutique logo is already set. It shows in the website header and at the top of every invoice. Upload a different image to replace it. A square image works best (JPEG, PNG or WebP).</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="dpos-btn" disabled={busy || !b} onClick={() => input.current.click()}>{busy ? 'Saving…' : b?.logo ? 'Replace logo' : 'Upload logo'}</button>
            {b?.logo && <button type="button" className="dpos-btn danger" disabled={busy} onClick={() => confirm('Remove the custom logo? The built-in Dhanyas Boutique logo will be used again.') && save(null)}>Remove</button>}
          </div>
          <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={pick} />
          {err && <p className="dpos-err" role="alert">{err}</p>}
        </div>
      </div>
    </section>
  );
}
