import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useApp } from '../context/App';
import { api, uploadMedia } from '../lib/api';
import AdminShell, { Icon } from '../components/AdminShell';
import Modal from '../components/Modal';
import StaffOnly from '../components/StaffOnly';

// Categories ("Taxonomy") and Instagram Reels panels, in the shared admin layout. Authorization is enforced by the API.
function useGate() {
  const { user, authReady } = useApp();
  if (!authReady) return <div className="page-pad"><p className="muted">Loading…</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!['owner', 'admin'].includes(user.role)) return <StaffOnly />;
  return null;
}
const Err = ({ children }) => children ? <p className="dpos-err" role="alert">{children}</p> : null;
const Switch = ({ on, onChange, label }) => <button type="button" role="switch" aria-checked={on} aria-label={label} className={`dpos-switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;

function AddModal({ kind, onClose, onDone }) {
  const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  const submit = async e => {
    e.preventDefault(); setBusy(true); setErr();
    try { await api(kind === 'category' ? '/admin/categories' : '/admin/collections', { method: 'POST', body: { name: name.trim() } }); onDone(); onClose() }
    catch (x) { setErr(x.issues?.[0]?.message || x.message) } finally { setBusy(false) }
  };
  return (
    <Modal title={kind === 'category' ? 'Add category' : 'Add collection'} sub={kind === 'category' ? 'A product category such as Sarees or Blouses' : 'A department / collection shown on the storefront (starts hidden)'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <label className="f">Name<input autoFocus required value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder={kind === 'category' ? 'e.g. Dupattas' : 'e.g. Festive 2026'} /></label>
        <Err>{err}</Err>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" className="dpos-btn ghost" onClick={onClose}>Cancel</button><button className="dpos-btn" disabled={busy || !name.trim()}>{busy ? 'Adding…' : 'Add'}</button></div>
      </form>
    </Modal>
  );
}

// Edit a collection or category: its name, description and which pieces are in it (collections also keep an order).
function PiecesModal({ kind, item, onClose, onDone }) {
  const base = kind === 'collection' ? `/admin/collections/${item.id}` : `/admin/categories/${item.id}`;
  const [name, setName] = useState(item.name); const [desc, setDesc] = useState(item.description || '');
  const [list, setList] = useState(null); const [q, setQ] = useState(''); const [found, setFound] = useState([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  useEffect(() => { api(`${base}/products`).then(setList).catch(e => setErr(e.message)) }, [base]);
  useEffect(() => { const t = q.trim(); if (!t) { setFound([]); return } const id = setTimeout(() => api(`/admin/products?q=${encodeURIComponent(t)}`).then(d => setFound((Array.isArray(d) ? d : d.items || []).slice(0, 10))).catch(() => api(`/products?q=${encodeURIComponent(t)}&limit=10`).then(d => setFound(d.items)).catch(() => {})), 250); return () => clearTimeout(id) }, [q]);
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; const n = [...list]; [n[i], n[j]] = [n[j], n[i]]; setList(n) };
  const save = async () => {
    setBusy(true); setErr();
    try {
      await api(base, { method: 'PATCH', body: { name: name.trim(), description: desc.trim() } });
      await api(`${base}/products`, { method: 'PUT', body: { slugs: list.map(p => p.slug) } });
      onDone(); onClose();
    } catch (x) { setErr(x.issues?.[0]?.message || x.message) } finally { setBusy(false) }
  };
  const img = p => p.image || p.images?.[0]?.url || p.images?.[0];
  return (
    <Modal wide title={`Edit ${item.name}`} sub={kind === 'collection' ? 'Choose the pieces in this collection and their order' : 'Choose the pieces in this category. A piece has one category: adding it here moves it out of its old one.'} onClose={onClose}
      footer={<><button type="button" className="dpos-btn ghost" onClick={onClose}>Cancel</button><button className="dpos-btn" onClick={save} disabled={busy || !list || !name.trim()}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <label className="f">Name<input value={name} maxLength={80} onChange={e => setName(e.target.value)} /></label>
        <label className="f">Description<input value={desc} maxLength={300} onChange={e => setDesc(e.target.value)} placeholder="Shown under the title on the website" /></label>
        <Err>{err}</Err>
        <b>Pieces ({list ? list.length : '…'})</b>
        {!list ? <p className="dpos-empty">Loading…</p> : !list.length ? <p className="dpos-empty">No pieces yet. Search below to add some.</p> : (
          <ol className="adm-picks" style={{ maxHeight: 320, overflow: 'auto' }}>
            {list.map((p, i) => (
              <li key={p.slug} className="adm-pick">
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>{img(p) && <img src={img(p)} alt="" width="36" height="44" style={{ objectFit: 'cover', borderRadius: 6 }} />}<b>{p.name}</b>{p.status && p.status !== 'active' && <small className="muted">({p.status})</small>}</span>
                <span className="adm-pick-act">
                  {kind === 'collection' && <><button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button><button type="button" aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button></>}
                  <button type="button" className="danger" onClick={() => setList(list.filter((_, j) => j !== i))}>Remove</button>
                </span>
              </li>))}
          </ol>)}
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search a product to add…" aria-label="Search products to add" />
        <ul className="adm-picks">
          {list && found.filter(p => !list.some(x => x.slug === p.slug)).map(p => (
            <li key={p.slug} className="adm-pick"><b>{p.name}</b><span className="adm-pick-act"><button type="button" onClick={() => { setList([...list, { slug: p.slug, name: p.name, status: p.status, image: img(p) }]); setQ('') }}>Add</button></span></li>))}
        </ul>
      </div>
    </Modal>
  );
}

export function AdminCategories() {
  const gate = useGate(); const { toast, loadCatalog, loadSite } = useApp();
  const [d, setD] = useState(null); const [q, setQ] = useState(''); const [err, setErr] = useState(); const [modal, setModal] = useState(null); const [edit, setEdit] = useState(null);
  const load = () => api('/admin/taxonomy').then(x => { setD(x); setErr() }).catch(e => setErr(e.message));
  useEffect(() => { if (!gate) load() }, [gate]); // eslint-disable-line react-hooks/exhaustive-deps
  const match = n => !q.trim() || n.toLowerCase().includes(q.trim().toLowerCase());
  const cats = useMemo(() => (d?.categories || []).filter(c => match(c.name)), [d, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const cols = useMemo(() => (d?.collections || []).filter(c => match(c.name)), [d, q]); // eslint-disable-line react-hooks/exhaustive-deps
  if (gate) return gate;
  const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); await load(); loadCatalog?.(); loadSite?.() } catch (e) { setErr(e.message) } };
  return (
    <AdminShell title="Taxonomy" sub="Manage departments and categories" actions={<button className="dpos-btn" onClick={() => setModal('category')}><Icon n="plus" size={16} />Add category</button>}>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search departments or categories…" aria-label="Search" />
      <Err>{err}</Err>
      <div className="dpos-tx">
        <div>
          <h2><Icon n="layers" size={20} />Departments <button className="dpos-btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => setModal('collection')}>+ Add collection</button></h2>
          {!d ? <p className="dpos-empty">Loading…</p> : !cols.length ? <p className="dpos-empty">No departments found.</p> : cols.map(c => (
            <div className="dpos-txc" key={c.id}>
              <div><b>{c.name}</b><small>{c.products} products · {c.status === 'published' ? 'Live on the site' : 'Hidden'}</small></div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button className="dpos-btn ghost sm" onClick={() => setEdit({ kind: 'collection', item: c })}>Edit pieces</button>
                <Switch on={c.status === 'published'} label={`Show ${c.name} on the storefront`} onChange={on => act(() => api(`/admin/collections/${c.id}`, { method: 'PATCH', body: { status: on ? 'published' : 'draft' } }))} />
                <button className="dpos-trash" aria-label={`Delete ${c.name}`} onClick={() => confirm(`Delete the collection “${c.name}”? Its products are not deleted.`) && act(() => api(`/admin/collections/${c.id}`, { method: 'DELETE' }), 'Collection deleted.')}><Icon n="trash" size={18} /></button>
              </div>
            </div>))}
        </div>
        <div>
          <h2><Icon n="tag" size={20} />Categories</h2>
          {!d ? <p className="dpos-empty">Loading…</p> : !cats.length ? <p className="dpos-empty">No categories found.</p> : cats.map(c => (
            <div className="dpos-txc" key={c.id}>
              <div><b>{c.name}</b><small>Product category · {c.products} products</small></div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button className="dpos-btn ghost sm" onClick={() => setEdit({ kind: 'category', item: c })}>Edit pieces</button>
                <Switch on={c.active} label={`${c.name} active`} onChange={on => act(() => api(`/admin/categories/${c.id}`, { method: 'PATCH', body: { active: on } }))} />
                <button className="dpos-trash" aria-label={`Delete ${c.name}`} onClick={() => confirm(`Delete the category “${c.name}”? ${c.products ? `${c.products} product(s) will become uncategorised (they are not deleted).` : ''}`) && act(() => api(`/admin/categories/${c.id}`, { method: 'DELETE' }), 'Category deleted.')}><Icon n="trash" size={18} /></button>
              </div>
            </div>))}
        </div>
      </div>
      {edit && <PiecesModal kind={edit.kind} item={edit.item} onClose={() => setEdit(null)} onDone={() => { toast('Saved.'); load(); loadCatalog?.() }} />}
      {modal && <AddModal kind={modal} onClose={() => setModal(null)} onDone={() => { toast(modal === 'category' ? 'Category added.' : 'Collection added.'); load(); loadCatalog?.() }} />}
    </AdminShell>
  );
}

// Three reel slots = the first three Instagram posts, which the homepage "Inside the boutique" section plays.
const REEL_MAX = 6, PHOTO_MAX = 6;

// Reels & Photo Gallery: up to 6 videos (shown first on the home page) and up to 6 photos (shown after them), each in its own slots.
export function AdminReels() {
  const gate = useGate(); const { toast, loadSite } = useApp();
  const [s, setS] = useState(null); const [busy, setBusy] = useState(null); const [err, setErr] = useState(); const input = useRef(); const target = useRef({ kind: 'video', i: 0 });
  useEffect(() => { if (!gate) api('/store').then(setS).catch(e => setErr(e.message)) }, [gate]);
  if (gate) return gate;
  const posts = s?.social?.instagram?.posts || [];
  const lists = { video: posts.filter(p => p.video), photo: posts.filter(p => !p.video && p.image) };
  const save = async next => {
    const ig = s.social.instagram;
    const out = await api('/admin/settings/social', { method: 'PUT', body: { ...s.social, instagram: { ...ig, posts: [...next.video, ...next.photo] } } });
    setS(x => ({ ...x, social: out })); loadSite?.();
  };
  const upload = async (kind, i, file) => {
    const isVideo = file.type.startsWith('video/');
    if (kind === 'video' && !isVideo) return setErr('Reels are videos (MP4 or WebM). Add photos in the Photo gallery below.');
    if (kind === 'photo' && isVideo) return setErr('The gallery is for photos (JPEG, PNG or WebP). Add videos in the Reels section above.');
    setBusy(kind + i); setErr();
    try {
      const up = await uploadMedia(file);
      const item = kind === 'video' ? { video: up.url, alt: lists.video[i]?.alt || 'Boutique video' } : { image: up.url, alt: lists.photo[i]?.alt || 'Boutique photo' };
      const cur = lists[kind]; const next = i < cur.length ? cur.map((p, n) => n === i ? item : p) : [...cur, item];
      await save({ ...lists, [kind]: next }); toast(i < cur.length ? 'Replaced.' : 'Added.');
    } catch (e) { setErr(e.message) } finally { setBusy(null) }
  };
  const remove = async (kind, i) => { if (!confirm('Remove this from the home page?')) return; setBusy(kind + i); setErr(); try { await save({ ...lists, [kind]: lists[kind].filter((_, n) => n !== i) }); toast('Removed.') } catch (e) { setErr(e.message) } finally { setBusy(null) } };
  const pick = (kind, i) => { target.current = { kind, i }; input.current.accept = kind === 'video' ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp'; input.current.click() };
  const grid = (kind, max, noun) => {
    const cur = lists[kind];
    return (
      <div className="dpos-reels six">
        {Array.from({ length: max }, (_, i) => {
          const p = cur[i]; const live = !!p; const canAdd = i <= cur.length; const key = kind + i;
          return (
            <section className="dpos-reel" key={key}>
              <header><span>{noun.toUpperCase()} {i + 1}</span>{live && <span className="dpos-live">LIVE</span>}</header>
              <div className="media">{!s ? 'Loading…' : p?.video ? <video src={p.video} muted loop playsInline controls preload="metadata" /> : p?.image ? <img src={p.image} alt={p.alt || `${noun} ${i + 1}`} /> : <span>{canAdd ? `Empty — add a ${noun.toLowerCase()}` : `Fill ${noun.toLowerCase()} ${cur.length + 1} first`}</span>}</div>
              <footer>
                <button className="dpos-btn ghost sm" disabled={busy !== null || !canAdd || !s} onClick={() => pick(kind, i)}>{busy === key ? 'Uploading…' : live ? '↻ Replace' : '+ Upload'}</button>
                {live && <a className="dpos-btn ghost sm" href={p.video || p.image} target="_blank" rel="noopener noreferrer" aria-label="Preview"><Icon n="eye" size={14} /></a>}
                {live && <button className="dpos-trash" aria-label={`Remove ${noun.toLowerCase()}`} disabled={busy !== null} onClick={() => remove(kind, i)}><Icon n="trash" size={18} /></button>}
              </footer>
            </section>);
        })}
      </div>
    );
  };
  return (
    <AdminShell title="Reels & Photo Gallery" sub="Add up to 6 reels (videos) and up to 6 photos. On the home page the reels come first, then the photo gallery.">
      <Err>{err}</Err>
      <input ref={input} type="file" hidden onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) upload(target.current.kind, target.current.i, f) }} />
      <h2 className="serif adm-h2">Reels <span className="muted small">({lists.video.length} of {REEL_MAX} · MP4 or WebM, max 4 MB each; compress to 720p first)</span></h2>
      {grid('video', REEL_MAX, 'Reel')}
      <h2 className="serif adm-h2" style={{ marginTop: 28 }}>Photo gallery <span className="muted small">({lists.photo.length} of {PHOTO_MAX} · JPEG, PNG or WebP)</span></h2>
      {grid('photo', PHOTO_MAX, 'Photo')}
      <p className="sub">Only what you upload appears on the home page. Old files are cleaned from storage a few minutes after they are replaced.</p>
    </AdminShell>
  );
}
