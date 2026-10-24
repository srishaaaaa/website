import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink } from 'react-router-dom';
import { api, uploadImage, uploadMedia } from '../lib/api';
import { useApp } from '../context/App';

export function AdminTabs() {
  return (
    <nav className="adm-tabs" aria-label="Admin sections">
      <NavLink to="/admin" end>Orders &amp; settings</NavLink>
      <NavLink to="/admin/products">Products &amp; images</NavLink>
      <NavLink to="/admin/storefront">Storefront images</NavLink>
      <NavLink to="/admin/enquiries">Enquiries</NavLink>
      <NavLink to="/admin/sample">Sample data</NavLink>
    </nav>
  );
}

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
  if (state === 'denied') return <div className="empty page-pad"><p className="serif big">Staff access only.</p><Link className="btn dark" to="/">RETURN HOME</Link></div>;
  return children;
}

// A small drop zone + file picker. Calls onFiles(File[]).
function Drop({ onFiles, multiple = true, accept = 'image/jpeg,image/png,image/webp', label = 'Drop photos here or click to choose', busy }) {
  const [over, setOver] = useState(false); const input = useRef();
  return (
    <div className={`adm-drop ${over ? 'over' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onFiles([...e.dataTransfer.files]) }}>
      <button type="button" className="btn dark pill" onClick={() => input.current.click()} disabled={busy}>{busy ? 'UPLOADING…' : 'CHOOSE PHOTOS'}</button>
      <span className="muted small">{label}</span>
      <input ref={input} type="file" hidden multiple={multiple} accept={accept} onChange={e => { onFiles([...e.target.files]); e.target.value = '' }} />
    </div>
  );
}

export function AdminProducts() {
  const state = useStaff();
  const { toast, loadCatalog } = useApp();
  const [q, setQ] = useState(''); const [list, setList] = useState(null);
  const [sel, setSel] = useState(null); const [imgs, setImgs] = useState([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState();

  const load = useCallback(() => api('/admin/products?q=' + encodeURIComponent(q)).then(setList).catch(e => setErr(e.message)), [q]);
  useEffect(() => { if (state !== 'ok') return; const t = setTimeout(load, 200); return () => clearTimeout(t) }, [state, load]);
  useEffect(() => { if (sel) api(`/admin/products/${sel.id}/images`).then(setImgs).catch(e => setErr(e.message)); else setImgs([]) }, [sel]);

  const changed = rows => { setImgs(rows); load(); loadCatalog() };
  const add = async files => {
    if (!sel || !files.length) return; setBusy(true); setErr();
    try {
      let rows = imgs;
      for (const f of files) { const up = await uploadImage(f); rows = await api(`/admin/products/${sel.id}/images`, { method: 'POST', body: { url: up.url, alt: sel.name } }) }
      changed(rows); toast(`${files.length} photo${files.length > 1 ? 's' : ''} added to ${sel.name}.`);
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  };
  const move = async (i, d) => {
    const ids = imgs.map(x => x.id), j = i + d; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { changed(await api(`/admin/products/${sel.id}/images/order`, { method: 'PUT', body: { ids } })) } catch (e) { setErr(e.message) }
  };
  const delProduct = async () => {
    if (!confirm(`Delete "${sel.name}" permanently? Its photos, sizes and stock are removed. Past orders keep their own record.`)) return;
    try { await api(`/admin/products/${sel.id}`, { method: 'DELETE' }); toast(`${sel.name} deleted.`); setSel(null); load(); loadCatalog() } catch (e) { setErr(e.message) }
  };
  const del = async im => { if (!confirm('Remove this photo?')) return; try { changed(await api(`/admin/images/${im.id}`, { method: 'DELETE' })) } catch (e) { setErr(e.message) } };
  const saveAlt = async (im, alt) => { if (alt === im.alt) return; try { setImgs(await api(`/admin/images/${im.id}`, { method: 'PATCH', body: { alt } })) } catch (e) { setErr(e.message) } };

  return (
    <Gate state={state}>
      <div className="account adm">
        <p className="eyebrow">ADMIN</p><h1 className="serif">Products &amp; images</h1>
        <AdminTabs />
        <p className="muted adm-help">Recommended: 3 photos per piece (full view, detail, back or styled), portrait 3:4, at least 1200×1600. The <b>first</b> photo is the card image and the <b>second</b> appears when a card is hovered. Big photos are shrunk automatically before upload.</p>
        {err && <p role="alert" className="err">{err}</p>}
        <div className="adm-split">
          <aside className="adm-list">
            <input type="search" placeholder="Search products…" aria-label="Search products" value={q} onChange={e => setQ(e.target.value)} />
            {!list && <p className="muted">Loading…</p>}
            <ul>{list?.map(p => (
              <li key={p.id}><button className={sel?.id === p.id ? 'on' : ''} onClick={() => setSel(p)}>
                <span className="adm-th">{p.image ? <img src={p.image} alt="" /> : <i>No photo</i>}</span>
                <span className="adm-nm"><b>{p.name}</b><em>{p.category || 'Uncategorised'}</em></span>
                <span className={`adm-badge ${p.image_count ? '' : 'warn'}`}>{p.image_count}</span>{p.is_sample && <span className="adm-sample">sample</span>}
              </button></li>))}</ul>
          </aside>
          <section className="adm-panel">
            {!sel ? <p className="muted">Choose a product on the left to manage its photos. Pieces with no photos are listed first.</p> : (
              <>
                <div className="adm-ph"><h2 className="serif adm-h2">{sel.name}</h2><button className="adm-del" onClick={delProduct}>Delete product</button></div>
                <Drop onFiles={add} busy={busy} />
                <ul className="adm-gal">
                  {imgs.map((im, i) => (
                    <li key={im.id}>
                      <div className="adm-img"><img src={im.url} alt={im.alt || sel.name} /><span className="adm-pos">{i + 1}</span></div>
                      <input aria-label={`Alt text for photo ${i + 1}`} defaultValue={im.alt} onBlur={e => saveAlt(im, e.target.value.trim())} placeholder="Describe the photo" />
                      <div className="adm-act">
                        <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier">←</button>
                        <button onClick={() => move(i, 1)} disabled={i === imgs.length - 1} aria-label="Move later">→</button>
                        <button onClick={() => del(im)} className="danger">Remove</button>
                      </div>
                    </li>))}
                </ul>
                {!imgs.length && <p className="muted">No photos yet.</p>}
              </>
            )}
          </section>
        </div>
      </div>
    </Gate>
  );
}

// One single-image slot (hero model / story photo): preview, upload, reset.
function Slot({ title, hint, value, fallback, onUpload, onReset, alt, onAlt, accept, busy }) {
  return (
    <section className="adm-card">
      <h2 className="serif adm-h2">{title}</h2>
      <p className="muted small">{hint}</p>
      <div className="adm-prev">{(value || fallback) ? <img src={value || fallback} alt="" /> : <span className="muted small">Blank — nothing added yet</span>}</div>
      <Drop onFiles={fs => fs[0] && onUpload(fs[0])} multiple={false} accept={accept} busy={busy} label={value ? 'Custom image in use' : 'Using the built-in image'} />
      <label className="field"><span>Describe the image (for screen readers)</span><input value={alt} onChange={e => onAlt(e.target.value)} /></label>
      {value && <button className="link-u small" onClick={onReset}>Reset to the built-in image</button>}
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
  const clearCover = (kind, id) => run(`${kind}${id}`, async () => { await api(`/admin/${kind}/${id}/image`, { method: 'PUT', body: { url: null } }); (kind === 'categories' ? setCats : setCols)(l => l.map(x => x.id === id ? { ...x, image: null } : x)) }, 'Cover removed.');
  const savePosts = next => run('ig', async () => {
    const s = await api('/store'); const ig = s.social.instagram;
    await api('/admin/settings/social', { method: 'PUT', body: { ...s.social, instagram: { ...ig, posts: next } } }); setPosts(next);
  }, 'Instagram photos saved.');

  return (
    <Gate state={state}>
      <div className="account adm">
        <p className="eyebrow">ADMIN</p><h1 className="serif">Storefront images</h1>
        <AdminTabs />
        {err && <p role="alert" className="err">{err}</p>}
        {b && (
          <div className="adm-slots">
            <Slot title="Logo" accept="image/png,image/webp,image/jpeg" busy={busy === 'logo'} value={b.logo} fallback="" alt={b.logoAlt} onAlt={v => setB({ ...b, logoAlt: v })}
              hint="Your boutique logo, shown in the site header and menu. A square or round image works best (PNG with a transparent background is ideal). Until you add one, the DHANYA text wordmark is shown. You can replace it whenever you like."
              onUpload={f => run('logo', async () => { const up = await uploadImage(f); const next = { ...b, logo: up.url }; await saveBranding(next); setB(next) }, 'Logo updated.')}
              onReset={() => run('logo', async () => { const next = { ...b, logo: null, logoAlt: '' }; await saveBranding(next); setB(next) }, 'Logo removed. The text wordmark is back.')} />
            <Slot title="Hero model photo" accept="image/png,image/webp,image/jpeg" busy={busy === 'hero'} value={b.heroModel} fallback="" alt={b.heroAlt} onAlt={v => setB({ ...b, heroAlt: v })}
              hint="The full-length model in the hero. A tall photo with a TRANSPARENT background (PNG or WebP) overlaps the ivory panel best. Until you add one the frame stays blank."
              onUpload={f => run('hero', async () => { const up = await uploadImage(f); const next = { ...b, heroModel: up.url }; await saveBranding(next); setB(next) }, 'Hero model updated.')}
              onReset={() => run('hero', async () => { const next = { ...b, heroModel: null, heroAlt: '' }; await saveBranding(next); setB(next) }, 'Hero model removed.')} />
            <Slot title="Textile close-up" accept="image/jpeg,image/png,image/webp" busy={busy === 'textile'} value={b.textileImage} fallback="" alt={b.textileAlt} onAlt={v => setB({ ...b, textileAlt: v })}
              hint="A square close-up of silk, zari or pleats shown beside the headline as CRAFTED ELEGANCE."
              onUpload={f => run('textile', async () => { const up = await uploadImage(f); const next = { ...b, textileImage: up.url }; await saveBranding(next); setB(next) }, 'Textile photo updated.')}
              onReset={() => run('textile', async () => { const next = { ...b, textileImage: null, textileAlt: '' }; await saveBranding(next); setB(next) }, 'Textile photo removed.')} />
            <Slot title="Editorial photo" accept="image/jpeg,image/png,image/webp" busy={busy === 'editorial'} value={b.editorialImage} fallback="" alt={b.editorialAlt} onAlt={v => setB({ ...b, editorialAlt: v })}
              hint="A tall fashion photograph beside TRADITION, WOVEN INTO EVERY THREAD."
              onUpload={f => run('editorial', async () => { const up = await uploadImage(f); const next = { ...b, editorialImage: up.url }; await saveBranding(next); setB(next) }, 'Editorial photo updated.')}
              onReset={() => run('editorial', async () => { const next = { ...b, editorialImage: null, editorialAlt: '' }; await saveBranding(next); setB(next) }, 'Editorial photo removed.')} />
            <Slot title="Our Story photo" accept="image/jpeg,image/png,image/webp" busy={busy === 'story'} value={b.storyImage} fallback="/images/story.jpg" alt={b.storyAlt} onAlt={v => setB({ ...b, storyAlt: v })}
              hint="A wide photograph works best (the wine-coloured text panel covers the right half)."
              onUpload={f => run('story', async () => { const up = await uploadImage(f); const next = { ...b, storyImage: up.url }; await saveBranding(next); setB(next) }, 'Story photo updated.')}
              onReset={() => run('story', async () => { const next = { ...b, storyImage: null, storyAlt: '' }; await saveBranding(next); setB(next) }, 'Story photo reset.')} />
            <button className="btn dark" onClick={() => run('alt', () => saveBranding(b), 'Descriptions saved.')} disabled={busy === 'alt'}>SAVE DESCRIPTIONS</button>
          </div>
        )}

        {[['Category covers', 'categories', cats], ['Collection covers', 'collections', cols]].map(([title, kind, rows]) => (
          <section key={kind} className="adm-block">
            <h2 className="serif adm-h2">{title}</h2>
            <ul className="adm-covers">{rows.map(c => (
              <li key={c.id}>
                <div className="adm-cover">{c.image ? <img src={c.image} alt="" /> : <i>Generated placeholder</i>}</div>
                <b>{c.name}</b>
                <div className="adm-act">
                  <label className="btn dark pill adm-file">{busy === `${kind}${c.id}` ? '…' : c.image ? 'REPLACE' : 'UPLOAD'}<input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={e => { const f = e.target.files[0]; e.target.value = ''; f && setCover(kind, c.id)(f) }} /></label>
                  {c.image && <button className="danger" onClick={() => clearCover(kind, c.id)}>Remove</button>}
                </div>
              </li>))}</ul>
          </section>
        ))}

        <section className="adm-block">
          <h2 className="serif adm-h2">Reels &amp; photos (homepage strip)</h2>
          <p className="muted small">Up to 6 vertical clips (MP4 or WebM, under 4 MB each, 9:16 works best) or photos, shown in the “View more on Instagram” strip. Clips autoplay silently while on screen and visitors can unmute. For bigger videos, paste a direct https link to an .mp4 below. The strip appears once you add something or set an Instagram URL in Orders &amp; settings.</p>
          <Drop accept="video/mp4,video/webm,image/jpeg,image/png,image/webp" onFiles={async fs => { if (!fs.length) return; setBusy('ig-up'); setErr(); try { const next = [...posts]; for (const f of fs.slice(0, 6 - posts.length)) { const up = await uploadMedia(f); next.push(up.video ? { video: up.url, alt: 'Boutique video' } : { image: up.url, alt: 'Instagram post' }) } await savePosts(next) } catch (e) { setErr(e.message) } finally { setBusy('') } }} busy={busy === 'ig-up'} label={`${posts.length} of 6 added`} />
          <form className="adm-url" onSubmit={e => { e.preventDefault(); const u = e.currentTarget.elements.url.value.trim(); if (!/^https:\/\/\S+$/.test(u)) return setErr('Enter a full https:// link to the video file.'); if (posts.length >= 6) return setErr('You can add up to 6.'); e.currentTarget.reset(); savePosts([...posts, { video: u, alt: 'Boutique video' }]) }}>
            <input name="url" type="url" placeholder="…or paste a link to an .mp4 video (https://…)" aria-label="Video link" /><button className="btn dark pill">ADD LINK</button>
          </form>
          <ul className="adm-covers">{posts.map((p, i) => (
            <li key={(p.video || p.image) + i}>
              <div className="adm-cover">{p.video ? <video src={p.video} muted playsInline preload="metadata" /> : <img src={p.image} alt="" />}</div>
              <div className="adm-act"><span className="muted small">{p.video ? 'Video' : 'Photo'}</span><button className="danger" onClick={() => savePosts(posts.filter((_, j) => j !== i))}>Remove</button></div>
            </li>))}</ul>
        </section>
      </div>
    </Gate>
  );
}

export function AdminEnquiries() {
  const state = useStaff();
  const [rows, setRows] = useState(null); const [err, setErr] = useState();
  useEffect(() => { if (state === 'ok') api('/admin/enquiries').then(setRows).catch(e => setErr(e.message)) }, [state]);
  const remove = async e => { if (!confirm(`Delete the enquiry from ${e.name}?`)) return; try { await api('/admin/enquiries/' + e.id, { method: 'DELETE' }); setRows(r => r.filter(x => x.id !== e.id)) } catch (x) { setErr(x.message) } };
  const setStatus = async (id, status) => { try { await api('/admin/enquiries/' + id, { method: 'PATCH', body: { status } }); setRows(r => r.map(x => x.id === id ? { ...x, status } : x)) } catch (e) { setErr(e.message) } };
  return (
    <Gate state={state}>
      <div className="account adm">
        <p className="eyebrow">ADMIN</p><h1 className="serif">Enquiries</h1>
        <AdminTabs />
        <p className="muted adm-help">Retail and wholesale enquiries sent from the website. Call or WhatsApp the customer, then mark the enquiry as contacted or closed.</p>
        {err && <p role="alert" className="err">{err}</p>}
        {!rows && !err && <p className="muted">Loading…</p>}
        {rows?.length === 0 && <p className="muted">No enquiries yet.</p>}
        <ul className="adm-enq">{rows?.map(e => (
          <li key={e.id} className={e.status}>
            <div className="adm-enq-top"><b>{e.name}</b><span className={`adm-badge ${e.status === 'new' ? 'warn' : ''}`}>{e.kind}</span>{e.is_sample && <span className="adm-sample">sample</span>}<em>{new Date(e.created_at).toLocaleString('en-IN')}</em></div>
            {e.business && <p><b>Business:</b> {e.business}</p>}
            <p><b>Phone:</b> <a className="link-u" href={'tel:' + e.phone.replace(/[^+\d]/g, '')}>{e.phone}</a>{e.email && <> · <a className="link-u" href={'mailto:' + e.email}>{e.email}</a></>}</p>
            {e.interest && <p><b>Interested in:</b> {e.interest}</p>}{e.quantity && <p><b>Quantity:</b> {e.quantity}</p>}{e.message && <p>{e.message}</p>}
            <select value={e.status} aria-label={`Status for enquiry from ${e.name}`} onChange={ev => setStatus(e.id, ev.target.value)}>{['new', 'contacted', 'closed'].map(v => <option key={v}>{v}</option>)}</select>
            <button className="adm-del" onClick={() => remove(e)}>Delete</button>
          </li>))}</ul>
      </div>
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
      <div className="account adm">
        <p className="eyebrow">ADMIN</p><h1 className="serif">Sample data</h1>
        <AdminTabs />
        <p className="muted adm-help">The demo catalogue, reviews and enquiries are here so the site looks complete while you set it up. Delete them one at a time from <Link className="link-u" to="/admin/products">Products &amp; images</Link>, <Link className="link-u" to="/admin">Review moderation</Link> and <Link className="link-u" to="/admin/enquiries">Enquiries</Link>, or remove everything at once below. Only items marked <span className="adm-sample">sample</span> are ever removed here.</p>
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
    </Gate>
  );
}
