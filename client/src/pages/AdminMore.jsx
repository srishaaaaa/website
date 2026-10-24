import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useApp } from '../context/App';
import { api, uploadMedia } from '../lib/api';
import AdminShell, { Icon } from '../components/AdminShell';
import Modal from '../components/Modal';

// Categories ("Taxonomy") and Instagram Reels panels, in the shared admin layout. Authorization is enforced by the API.
function useGate() {
  const { user, authReady } = useApp();
  if (!authReady) return <div className="page-pad"><p className="muted">Loading…</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!['owner', 'admin'].includes(user.role)) return <div className="empty page-pad"><p className="serif big">Staff access only.</p><Link className="btn dark" to="/">RETURN HOME</Link></div>;
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

export function AdminCategories() {
  const gate = useGate(); const { toast, loadCatalog, loadSite } = useApp();
  const [d, setD] = useState(null); const [q, setQ] = useState(''); const [err, setErr] = useState(); const [modal, setModal] = useState(null);
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
                <Switch on={c.active} label={`${c.name} active`} onChange={on => act(() => api(`/admin/categories/${c.id}`, { method: 'PATCH', body: { active: on } }))} />
                <button className="dpos-trash" aria-label={`Delete ${c.name}`} onClick={() => confirm(`Delete the category “${c.name}”? ${c.products ? `${c.products} product(s) will become uncategorised (they are not deleted).` : ''}`) && act(() => api(`/admin/categories/${c.id}`, { method: 'DELETE' }), 'Category deleted.')}><Icon n="trash" size={18} /></button>
              </div>
            </div>))}
        </div>
      </div>
      {modal && <AddModal kind={modal} onClose={() => setModal(null)} onDone={() => { toast(modal === 'category' ? 'Category added.' : 'Collection added.'); load(); loadCatalog?.() }} />}
    </AdminShell>
  );
}

// Three reel slots = the first three Instagram posts, which the homepage "Inside the boutique" section plays.
export function AdminReels() {
  const gate = useGate(); const { toast, loadSite } = useApp();
  const [s, setS] = useState(null); const [busy, setBusy] = useState(null); const [err, setErr] = useState(); const input = useRef(); const target = useRef(0);
  useEffect(() => { if (!gate) api('/store').then(setS).catch(e => setErr(e.message)) }, [gate]);
  if (gate) return gate;
  const posts = s?.social?.instagram?.posts || [];
  const save = async next => {
    const ig = s.social.instagram;
    const out = await api('/admin/settings/social', { method: 'PUT', body: { ...s.social, instagram: { ...ig, posts: next } } });
    setS(x => ({ ...x, social: out })); loadSite?.();
  };
  const upload = async (i, file) => {
    setBusy(i); setErr();
    try {
      const up = await uploadMedia(file);
      const post = up.video ? { video: up.url, alt: posts[i]?.alt || '' } : { image: up.url, alt: posts[i]?.alt || '' };
      await save(i < posts.length ? posts.map((p, n) => n === i ? { ...p, image: undefined, video: undefined, ...post } : p) : [...posts, post]);
      toast(i < posts.length ? 'Reel replaced.' : 'Reel added.');
    } catch (e) { setErr(e.message) } finally { setBusy(null) }
  };
  const remove = async i => { if (!confirm('Remove this reel from the home page?')) return; setBusy(i); setErr(); try { await save(posts.filter((_, n) => n !== i)); toast('Reel removed.') } catch (e) { setErr(e.message) } finally { setBusy(null) } };
  return (
    <AdminShell title="Instagram Reels" sub="Three slots feed the reels on the home page. Replacing a reel deletes the old video from storage. Max 4 MB each (compress to 720p first).">
      <Err>{err}</Err>
      <input ref={input} type="file" hidden accept="video/mp4,video/webm,image/jpeg,image/png,image/webp" onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) upload(target.current, f) }} />
      <div className="dpos-reels">
        {[0, 1, 2].map(i => {
          const p = posts[i]; const live = !!(p?.video || p?.image); const canAdd = i <= posts.length;
          return (
            <section className="dpos-reel" key={i}>
              <header><span>SLOT {i + 1}</span>{live && <span className="dpos-live">LIVE</span>}</header>
              <div className="media">{!s ? 'Loading…' : p?.video ? <video src={p.video} muted loop playsInline controls preload="metadata" /> : p?.image ? <img src={p.image} alt={p.alt || `Reel ${i + 1}`} /> : <span>{canAdd ? 'Empty — upload a short reel' : `Fill slot ${posts.length + 1} first`}</span>}</div>
              <footer>
                <button className="dpos-btn ghost sm" disabled={busy !== null || !canAdd || !s} onClick={() => { target.current = i; input.current.click() }}>{busy === i ? 'Uploading…' : live ? '↻ Replace' : '+ Upload'}</button>
                {live && <a className="dpos-btn ghost sm" href={p.video || p.image} target="_blank" rel="noopener noreferrer" aria-label="Preview"><Icon n="eye" size={14} /></a>}
                {live && <button className="dpos-trash" aria-label="Remove reel" disabled={busy !== null} onClick={() => remove(i)}><Icon n="trash" size={18} /></button>}
              </footer>
            </section>);
        })}
      </div>
      <p className="sub">Only uploaded reels appear on the home page. Until you add your own, the empty frames stay in place. Old videos are cleaned from storage a few minutes after they are replaced.</p>
    </AdminShell>
  );
}
