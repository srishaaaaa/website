import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, uploadImage } from '../lib/api';
import { useApp } from '../context/App';
import AdminShell from '../components/AdminShell';
import { Drop, FocusImage } from '../components/ProductPhotos';
import { Chips, PeriodFilter, inPeriod, usePeriod } from '../components/PeriodFilter';
import StaffOnly from '../components/StaffOnly';

// Guards admin screens: signed in AND staff. (The API enforces the role too; this only avoids a dead page.)
function useStaff() {
  const { user, authReady } = useApp();
  if (!authReady) return 'loading';
  if (!user) return 'login';
  return ['owner', 'admin'].includes(user.role) ? 'ok' : 'denied';
}
function Gate({ state, children }) {
  if (state === 'loading') return <div className="page-pad"><p className="muted">Loading…</p></div>;
  if (state === 'login') return <Navigate to="/login" replace />;
  if (state === 'denied') return <StaffOnly />;
  return children;
}

// One single-image slot (hero model / story photo): preview, upload, reset.
function Slot({ title, hint, value, fallback, onUpload, onReset, alt, onAlt, accept, busy, pos, onPos }) {
  const pt = pos ? pos.split('% ').map(v => parseInt(v, 10)) : null;
  return (
    <section className="adm-card">
      <h2 className="serif adm-h2">{title}</h2>
      <p className="muted small">{hint}</p>
      <div className="adm-prev">{(value || fallback) ? (onPos ? <FocusImage src={value || fallback} alt="" x={pt?.[0]} y={pt?.[1]} box={4 / 3} onPick={(x, y) => onPos(`${x}% ${y}%`)} /> : <img src={value || fallback} alt="" />) : <span className="muted small">Blank — nothing added yet</span>}</div>
      {onPos && (value || fallback) && <p className="muted small">Click the photo on the part that must stay visible (usually her face).{pos && <> <button className="link-u small" onClick={() => onPos(null)}>Reset focus</button></>}</p>}
      <Drop onFiles={fs => fs[0] && onUpload(fs[0])} multiple={false} accept={accept} busy={busy} label={value ? 'Custom image in use' : 'Using the built-in image'} />
      <label className="field"><span>Describe the image (for screen readers)</span><input value={alt} onChange={e => onAlt(e.target.value)} /></label>
      {value && <button className="link-u small" onClick={onReset}>Reset to the built-in image</button>}
    </section>
  );
}

// Which products are "Trending now" (up to 4, in order) and which collections appear in "Choose your world" (up to 8, in order).
function HomePicks({ onSaved, toast }) {
  const { site, catalog } = useApp();
  const hp = site.homepage || { trending: [], collections: [] };
  const [trend, setTrend] = useState((hp.trending || []).slice(0, 4)); const [colSel, setColSel] = useState(hp.collections); const [catSel, setCatSel] = useState(hp.categories || []);
  const [names, setNames] = useState({}); const [q, setQ] = useState(''); const [found, setFound] = useState([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  useEffect(() => { setTrend((hp.trending || []).slice(0, 4)); setColSel(hp.collections); setCatSel(hp.categories || []) }, [site.homepage]); // eslint-disable-line
  useEffect(() => { if (!trend.length) return; api(`/products?slugs=${encodeURIComponent(trend.join(','))}&limit=48`).then(d => setNames(n => ({ ...n, ...Object.fromEntries(d.items.map(p => [p.slug, p.name])) }))).catch(() => {}) }, [trend.join(',')]); // eslint-disable-line
  useEffect(() => { const t = q.trim(); if (!t) { setFound([]); return } const id = setTimeout(() => api(`/products?q=${encodeURIComponent(t)}&limit=8`).then(d => setFound(d.items)).catch(() => {}), 250); return () => clearTimeout(id) }, [q]);
  const move = (list, set, i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; const n = [...list]; [n[i], n[j]] = [n[j], n[i]]; set(n) };
  const save = async () => { setBusy(true); setErr(); try { await api('/admin/settings/homepage', { method: 'PUT', body: { trending: trend, collections: colSel, categories: catSel } }); toast('Homepage picks saved.'); onSaved() } catch (e) { setErr(e.message) } finally { setBusy(false) } };
  const catName = s => catalog.categories.find(c => c.slug === s)?.name || s;
  const colName = s => catalog.collections.find(c => c.slug === s)?.name || s;
  const row = (label, i, list, set) => (
    <li key={label + i} className="adm-pick"><b>{label}</b>
      <span className="adm-pick-act"><button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(list, set, i, -1)}>↑</button><button type="button" aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(list, set, i, 1)}>↓</button><button type="button" className="danger" onClick={() => set(list.filter((_, j) => j !== i))}>Remove</button></span></li>
  );
  return (
    <section className="adm-block">
      <h2 className="serif adm-h2">Homepage picks</h2>
      {err && <p role="alert" className="err">{err}</p>}
      <h3 className="adm-h3">Trending collections ({trend.length} of 4)</h3>
      <p className="muted small">The pieces shown in “Trending collections” on the homepage, in this order. Leave empty to show your featured products.</p>
      <ol className="adm-picks">{trend.map((s, i) => row(names[s] || s, i, trend, setTrend))}</ol>
      {trend.length < 4 && <>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search a product to add…" aria-label="Search products to add" />
        <ul className="adm-picks">{found.filter(p => !trend.includes(p.slug)).map(p => <li key={p.id} className="adm-pick"><b>{p.name}</b><span className="adm-pick-act"><button type="button" onClick={() => { setNames(n => ({ ...n, [p.slug]: p.name })); setTrend([...trend, p.slug]); setQ('') }}>Add</button></span></li>)}</ul>
      </>}
      <h3 className="adm-h3">Choose your world ({colSel.length} of 8)</h3>
      <p className="muted small">The collections listed on the homepage, in this order. Leave empty to list every published collection.</p>
      <ol className="adm-picks">{colSel.map((s, i) => row(colName(s), i, colSel, setColSel))}</ol>
      <ul className="adm-picks">{catalog.collections.filter(c => !colSel.includes(c.slug)).map(c => <li key={c.slug} className="adm-pick"><b>{c.name}</b><span className="adm-pick-act"><button type="button" disabled={colSel.length >= 8} onClick={() => setColSel([...colSel, c.slug])}>Add</button></span></li>)}</ul>
      <h3 className="adm-h3">Categories ({catSel.length} of 12)</h3>
      <p className="muted small">The categories in the “Categories” menu and the “Featured categories” section, in this order. Leave empty to list every category.</p>
      <ol className="adm-picks">{catSel.map((s, i) => row(catName(s), i, catSel, setCatSel))}</ol>
      <ul className="adm-picks">{catalog.categories.filter(c => !catSel.includes(c.slug)).map(c => <li key={c.slug} className="adm-pick"><b>{c.name}</b><span className="adm-pick-act"><button type="button" disabled={catSel.length >= 12} onClick={() => setCatSel([...catSel, c.slug])}>Add</button></span></li>)}</ul>
      <button className="btn dark" onClick={save} disabled={busy}>{busy ? 'SAVING…' : 'SAVE HOMEPAGE PICKS'}</button>
    </section>
  );
}

export function AdminStorefront() {
  const state = useStaff();
  const { site, loadSite, loadCatalog, toast } = useApp();
  const [b, setB] = useState(null); const [cats, setCats] = useState([]); const [cols, setCols] = useState([]);
  const [posts, setPosts] = useState([]); const [busy, setBusy] = useState(''); const [err, setErr] = useState();

  useEffect(() => { if (state === 'ok' && site.branding) { setB({ logo: null, logoAlt: '', heroCutout: null, heroDepth: null, heroAlt: '', storyImage: null, storyAlt: '', heroModel: null, textileImage: null, editorialImage: null, textileAlt: '', editorialAlt: '', ...site.branding, logoAlt: site.branding.logoAlt || '', heroAlt: site.branding.heroAlt || '', storyAlt: site.branding.storyAlt || '', textileAlt: site.branding.textileAlt || '', editorialAlt: site.branding.editorialAlt || '' }); setPosts(site.social?.instagram?.posts || []) } }, [state, site.branding, site.social]);
  useEffect(() => { if (state !== 'ok') return; api('/admin/categories').then(setCats).catch(() => {}); api('/admin/collections').then(setCols).catch(() => {}) }, [state]);

  const refresh = () => { loadSite(); loadCatalog() };
  const run = async (key, fn, ok) => { setBusy(key); setErr(); try { await fn(); toast(ok); refresh() } catch (e) { setErr(e.message) } finally { setBusy('') } };
  const saveBranding = next => api('/admin/settings/branding', { method: 'PUT', body: { ...next, logoAlt: next.logoAlt || null, heroAlt: next.heroAlt || null, storyAlt: next.storyAlt || null, textileAlt: next.textileAlt || null, editorialAlt: next.editorialAlt || null } });
  const setCover = (kind, id) => async file => run(`${kind}${id}`, async () => { const up = await uploadImage(file); await api(`/admin/${kind}/${id}/image`, { method: 'PUT', body: { url: up.url } }); (kind === 'categories' ? setCats : setCols)(l => l.map(x => x.id === id ? { ...x, image: up.url } : x)) }, 'Cover updated.');
  const saveCoverFocus = (kind, id, pos) => run(`${kind}${id}`, async () => { await api(`/admin/${kind}/${id}/focus`, { method: 'PUT', body: { pos } }); (kind === 'categories' ? setCats : setCols)(l => l.map(x => x.id === id ? { ...x, pos } : x)) }, pos ? 'Position saved.' : 'Position reset.');
  const clearCover = (kind, id) => run(`${kind}${id}`, async () => { await api(`/admin/${kind}/${id}/image`, { method: 'PUT', body: { url: null } }); (kind === 'categories' ? setCats : setCols)(l => l.map(x => x.id === id ? { ...x, image: null } : x)) }, 'Cover removed.');
  const savePosts = next => run('ig', async () => {
    const s = await api('/store'); const ig = s.social.instagram;
    await api('/admin/settings/social', { method: 'PUT', body: { ...s.social, instagram: { ...ig, posts: next } } }); setPosts(next);
  }, 'Instagram photos saved.');

  return (
    <Gate state={state}>
      <AdminShell title="Storefront images">
      <div className="adm">
        {err && <p role="alert" className="err">{err}</p>}
        {b && (
          <div className="adm-slots">
            <Slot title="Logo" accept="image/png,image/webp,image/jpeg" busy={busy === 'logo'} value={b.logo} fallback="" alt={b.logoAlt} onAlt={v => setB({ ...b, logoAlt: v })}
              hint="Your boutique logo, shown in the site header and menu. A square or round image works best (PNG with a transparent background is ideal). Until you add one, the DHANYA text wordmark is shown. You can replace it whenever you like."
              onUpload={f => run('logo', async () => { const up = await uploadImage(f); const next = { ...b, logo: up.url }; await saveBranding(next); setB(next) }, 'Logo updated.')}
              onReset={() => run('logo', async () => { const next = { ...b, logo: null, logoAlt: '' }; await saveBranding(next); setB(next) }, 'Logo removed. The text wordmark is back.')} />
            <Slot title="Hero model photo" accept="image/png,image/webp,image/jpeg" busy={busy === 'hero'} value={b.heroModel} fallback="" pos={b.heroModelPos} onPos={v => run('hero', async () => { const next = { ...b, heroModelPos: v }; await saveBranding(next); setB(next) }, 'Focus saved.')} alt={b.heroAlt} onAlt={v => setB({ ...b, heroAlt: v })}
              hint="The photograph that fills the right half of the hero on tablets and desktops (and the arch on phones). A tall, high-quality photo works best; set the focus point so the face stays in view. Until you add one the frame stays blank."
              onUpload={f => run('hero', async () => { const up = await uploadImage(f); const next = { ...b, heroModel: up.url }; await saveBranding(next); setB(next) }, 'Hero model updated.')}
              onReset={() => run('hero', async () => { const next = { ...b, heroModel: null, heroAlt: '' }; await saveBranding(next); setB(next) }, 'Hero model removed.')} />
            <Slot title="Textile close-up" accept="image/jpeg,image/png,image/webp" busy={busy === 'textile'} value={b.textileImage} fallback="" pos={b.textilePos} onPos={v => run('textile', async () => { const next = { ...b, textilePos: v }; await saveBranding(next); setB(next) }, 'Position saved.')} alt={b.textileAlt} onAlt={v => setB({ ...b, textileAlt: v })}
              hint="A square close-up of silk, zari or pleats shown beside the headline as CRAFTED ELEGANCE."
              onUpload={f => run('textile', async () => { const up = await uploadImage(f); const next = { ...b, textileImage: up.url }; await saveBranding(next); setB(next) }, 'Textile photo updated.')}
              onReset={() => run('textile', async () => { const next = { ...b, textileImage: null, textileAlt: '' }; await saveBranding(next); setB(next) }, 'Textile photo removed.')} />
            <Slot title="Editorial photo" accept="image/jpeg,image/png,image/webp" busy={busy === 'editorial'} value={b.editorialImage} fallback="" pos={b.editorialPos} onPos={v => run('editorial', async () => { const next = { ...b, editorialPos: v }; await saveBranding(next); setB(next) }, 'Position saved.')} alt={b.editorialAlt} onAlt={v => setB({ ...b, editorialAlt: v })}
              hint="A tall fashion photograph beside TRADITION, WOVEN INTO EVERY THREAD."
              onUpload={f => run('editorial', async () => { const up = await uploadImage(f); const next = { ...b, editorialImage: up.url }; await saveBranding(next); setB(next) }, 'Editorial photo updated.')}
              onReset={() => run('editorial', async () => { const next = { ...b, editorialImage: null, editorialAlt: '' }; await saveBranding(next); setB(next) }, 'Editorial photo removed.')} />
            <Slot title="Our Story photo" accept="image/jpeg,image/png,image/webp" busy={busy === 'story'} value={b.storyImage} fallback="/images/story.jpg" pos={b.storyPos} onPos={v => run('story', async () => { const next = { ...b, storyPos: v }; await saveBranding(next); setB(next) }, 'Position saved.')} alt={b.storyAlt} onAlt={v => setB({ ...b, storyAlt: v })}
              hint="A wide photograph works best (the wine-coloured text panel covers the right half)."
              onUpload={f => run('story', async () => { const up = await uploadImage(f); const next = { ...b, storyImage: up.url }; await saveBranding(next); setB(next) }, 'Story photo updated.')}
              onReset={() => run('story', async () => { const next = { ...b, storyImage: null, storyAlt: '' }; await saveBranding(next); setB(next) }, 'Story photo reset.')} />
            <button className="btn dark" onClick={() => run('alt', () => saveBranding(b), 'Descriptions saved.')} disabled={busy === 'alt'}>SAVE DESCRIPTIONS</button>
          </div>
        )}

        {[['Category covers', 'categories', cats], ['Collection covers', 'collections', cols]].map(([title, kind, rows]) => (
          <section key={kind} className="adm-block">
            <h2 className="serif adm-h2">{title}</h2>
            <p className="muted small">Click a photo on the part that must stay visible (a face, the zari border). The website frames the photo around that point.</p>
            <ul className="adm-covers">{rows.map(c => (
              <li key={c.id}>
                <div className="adm-cover">{(c.image || c.fallback) ? <FocusImage src={c.image || c.fallback} alt="" x={c.pos ? parseInt(c.pos, 10) : null} y={c.pos ? parseInt(c.pos.split('% ')[1], 10) : null} onPick={(x, y) => saveCoverFocus(kind, c.id, `${x}% ${y}%`)} /> : <i>Generated placeholder</i>}</div>
                <b>{c.name}</b>
                {!c.image && c.fallback && <span className="muted small">Showing a product photo</span>}
                {c.pos && <button className="link-u small" onClick={() => saveCoverFocus(kind, c.id, null)}>Reset position</button>}
                <div className="adm-act">
                  <label className="btn dark pill adm-file">{busy === `${kind}${c.id}` ? '…' : c.image ? 'REPLACE' : 'UPLOAD'}<input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={e => { const f = e.target.files[0]; e.target.value = ''; f && setCover(kind, c.id)(f) }} /></label>
                  {c.image && <button className="danger" onClick={() => clearCover(kind, c.id)}>Remove</button>}
                </div>
              </li>))}</ul>
          </section>
        ))}

        <HomePicks onSaved={refresh} toast={toast} />

        <section className="adm-block"><h2 className="serif adm-h2">Reels &amp; photo gallery</h2>
          <p className="muted small">Up to 6 reels (videos) and 6 photos for “Inside DHANYA BOUTIQUE” now have their own page. <Link className="link-u" to="/admin/reels">Open Reels &amp; Gallery →</Link></p></section>
      </div>
      </AdminShell>
    </Gate>
  );
}

export function AdminEnquiries() {
  const state = useStaff();
  const [rows, setRows] = useState(null); const [err, setErr] = useState(); const [per, setPer] = usePeriod('all'); const [st, setSt] = useState('all');
  useEffect(() => { if (state === 'ok') api('/admin/enquiries').then(setRows).catch(e => setErr(e.message)) }, [state]);
  const remove = async e => { if (!confirm(`Delete the enquiry from ${e.name}?`)) return; try { await api('/admin/enquiries/' + e.id, { method: 'DELETE' }); setRows(r => r.filter(x => x.id !== e.id)) } catch (x) { setErr(x.message) } };
  const setStatus = async (id, status) => { try { await api('/admin/enquiries/' + id, { method: 'PATCH', body: { status } }); setRows(r => r.map(x => x.id === id ? { ...x, status } : x)) } catch (e) { setErr(e.message) } };
  return (
    <Gate state={state}>
      <AdminShell title="Enquiries">
      <div className="adm">
        <p className="muted adm-help">Enquiries sent from the website. Call or WhatsApp the customer, then mark the enquiry as contacted or closed.</p>
        {err && <p role="alert" className="err">{err}</p>}
        {!rows && !err && <p className="muted">Loading…</p>}
        <div className="dpos-bar-tools"><Chips label="Status" value={st} onChange={setSt} options={[['all', 'All'], ['new', 'New'], ['contacted', 'Contacted'], ['closed', 'Closed']]} /><PeriodFilter value={per} onChange={setPer} /></div>
        {rows && !rows.some(e => inPeriod(e.created_at, per) && (st === 'all' || e.status === st)) && <p className="muted">No enquiries here.</p>}
        <ul className="adm-enq">{rows?.filter(e => inPeriod(e.created_at, per) && (st === 'all' || e.status === st)).map(e => (
          <li key={e.id} className={e.status}>
            <div className="adm-enq-top"><b>{e.name}</b><span className={`adm-badge ${e.status === 'new' ? 'warn' : ''}`}>{e.kind}</span>{e.is_sample && <span className="adm-sample">sample</span>}<em>{new Date(e.created_at).toLocaleString('en-IN')}</em></div>
            {e.business && <p><b>Business:</b> {e.business}</p>}
            <p><b>Phone:</b> <a className="link-u" href={'tel:' + e.phone.replace(/[^+\d]/g, '')}>{e.phone}</a>{e.email && <> · <a className="link-u" href={'mailto:' + e.email}>{e.email}</a></>}</p>
            {e.interest && <p><b>Interested in:</b> {e.interest}</p>}{e.quantity && <p><b>Quantity:</b> {e.quantity}</p>}{e.message && <p>{e.message}</p>}
            <select value={e.status} aria-label={`Status for enquiry from ${e.name}`} onChange={ev => setStatus(e.id, ev.target.value)}>{['new', 'contacted', 'closed'].map(v => <option key={v}>{v}</option>)}</select>
            <button className="adm-del" onClick={() => remove(e)}>Delete</button>
          </li>))}</ul>
      </div>
      </AdminShell>
    </Gate>
  );
}

export function AdminSample() {
  const state = useStaff();
  const { toast, loadCatalog, loadSite } = useApp();
  const [c, setC] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  const load = () => api('/admin/sample-data').then(setC).catch(e => setErr(e.message));
  useEffect(() => { if (state === 'ok') load() }, [state]);
  const purge = async () => {
    if (!confirm('Permanently delete ALL sample products, sample reviews and sample enquiries?\n\nYour own products, reviews and enquiries are not touched. This cannot be undone.')) return;
    setBusy(true); setErr();
    try { const r = await api('/admin/sample-data', { method: 'DELETE' }); toast(`Removed ${r.removed.products} products, ${r.removed.reviews} reviews and ${r.removed.enquiries} enquiries.`); await load(); loadCatalog(); loadSite() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  };
  const total = c ? c.products + c.reviews + c.enquiries : 0;
  return (
    <Gate state={state}>
      <AdminShell title="Sample data">
      <div className="adm">
        <p className="muted adm-help">The demo catalogue, reviews and enquiries are here so the site looks complete while you set it up. Delete them one at a time from <Link className="link-u" to="/admin/billing/inventory">Products &amp; images</Link>, <Link className="link-u" to="/admin/reviews">Reviews</Link> and <Link className="link-u" to="/admin/enquiries">Enquiries</Link>, or remove everything at once below. Only items marked <span className="adm-sample">sample</span> are ever removed here.</p>
        {err && <p role="alert" className="err">{err}</p>}
        {!c && !err && <p className="muted">Loading…</p>}
        {c && (
          <div className="adm-card" style={{ maxWidth: 640 }}>
            <ul className="adm-counts">
              <li><strong>{c.products}</strong><span>sample products</span></li>
              <li><strong>{c.reviews}</strong><span>sample reviews</span></li>
              <li><strong>{c.enquiries}</strong><span>sample enquiries</span></li>
            </ul>
            <p className="muted small">{c.allProducts - c.products} of your own products are not affected.</p>
            <button className="adm-del big" onClick={purge} disabled={busy || total === 0}>{busy ? 'DELETING…' : total === 0 ? 'NO SAMPLE DATA LEFT' : 'DELETE ALL SAMPLE DATA'}</button>
          </div>
        )}
      </div>
      </AdminShell>
    </Gate>
  );
}
