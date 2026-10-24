import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import { useApp } from '../context/App';
import { Icon } from '../components/AdminShell';
import Modal from '../components/Modal';
import { Chips } from '../components/PeriodFilter';

const toPaise = s => { const n = Math.round(parseFloat(String(s || '').replace(/,/g, '')) * 100); return Number.isFinite(n) && n > 0 ? n : 0 };
const rupees = p => (p / 100).toFixed(2).replace(/\.00$/, '');
const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const LOW = 3;
const Err = ({ children }) => children ? <p className="dpos-err" role="alert">{children}</p> : null;
const ADJ = [['restock', 'Restock', '+ Add', '#1c7a4b', 'plus'], ['return', 'Return', '+ Add', '#1c7a4b', 'swap'], ['loss', 'Loss / Dmg', '− Deduct', '#b3261e', 'trash'], ['reconcile', 'Reconcile', 'Exact Set', '#c27a00', 'eye']];

// Stock adjustment: Restock / Return add, Loss / Damage deducts, Reconcile sets the exact count. The server applies it atomically and logs it.
function StockModal({ product, variantId, onClose, onDone }) {
  const [vid, setVid] = useState(variantId ?? product.variants[0]?.id);
  const [type, setType] = useState('restock'); const [qty, setQty] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  const v = product.variants.find(x => x.id === vid);
  const n = Math.max(0, parseInt(qty, 10) || 0);
  const next = !v ? 0 : type === 'reconcile' ? n : type === 'loss' ? v.stock - n : v.stock + n;
  const bad = !v || (type !== 'reconcile' && n < 1) || next < 0;
  const submit = async () => {
    setBusy(true); setErr();
    try { const out = await api('/admin/pos/stock', { method: 'POST', body: { variantId: vid, type, qty: n, ...(note.trim() ? { note: note.trim() } : {}) } }); onDone(vid, out.stock); onClose() }
    catch (e) { setErr(e.issues?.[0]?.message || e.message) } finally { setBusy(false) }
  };
  return (
    <Modal title="Adjust Inventory Stock" sub="Restock, return, deduct loss, or reconcile count" onClose={onClose}
      footer={<><button className="dpos-btn ghost" onClick={onClose}>Cancel</button><button className="dpos-btn" disabled={bad || busy} onClick={submit}>{busy ? 'Saving…' : `Update (${type === 'reconcile' ? n : (type === 'loss' ? '−' : '+') + n})`}</button></>}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div className="dpos-box" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div><span className="muted small" style={{ letterSpacing: '.12em', fontWeight: 800 }}>TARGET ITEM</span><div style={{ fontWeight: 800, fontSize: 17 }}>{product.name}</div>
            {product.variants.length > 1 && <select aria-label="Variant" value={vid} onChange={e => setVid(+e.target.value)} style={{ marginTop: 6 }}>{product.variants.map(x => <option key={x.id} value={x.id}>{x.size}{x.color !== 'Default' ? ` · ${x.color}` : ''} · {x.sku} ({x.stock})</option>)}</select>}</div>
          <div style={{ textAlign: 'right' }}><span className="muted small" style={{ letterSpacing: '.12em', fontWeight: 800 }}>CURRENT STOCK</span><div style={{ fontWeight: 800, fontSize: 30 }}>{v?.stock ?? 0} <span className="muted small">units</span></div></div>
        </div>
        <div><p className="muted small" style={{ letterSpacing: '.1em', fontWeight: 800, margin: '0 0 8px' }}>SELECT ADJUSTMENT TYPE *</p>
          <div className="dpos-types" role="radiogroup" aria-label="Adjustment type">{ADJ.map(([k, l, s, c, ic]) => <button key={k} type="button" role="radio" aria-checked={type === k} className={type === k ? 'on' : ''} onClick={() => setType(k)}><Icon n={ic} size={20} />{l}<small style={{ color: c }}>{s}</small></button>)}</div></div>
        <div className="dpos-box"><p className="muted small" style={{ letterSpacing: '.1em', fontWeight: 800, margin: '0 0 8px' }}>{type === 'reconcile' ? 'COUNTED QUANTITY' : type === 'loss' ? 'QUANTITY TO DEDUCT' : 'QUANTITY TO ADD'} *</p>
          <div className="dpos-stepper"><button type="button" aria-label="Decrease" onClick={() => setQty(String(Math.max(0, n - 1)))}>−</button><input inputMode="numeric" aria-label="Quantity" value={qty} onChange={e => setQty(e.target.value.replace(/\D/g, ''))} placeholder="0" /><button type="button" aria-label="Increase" onClick={() => setQty(String(n + 1))}>+</button></div>
          <div className="dpos-quick"><span>QUICK:</span>{[1, 5, 10, 25, 50, 100].map(q => <button key={q} type="button" onClick={() => setQty(String(n + q))}>+{q}</button>)}</div></div>
        <div className="dpos-box" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>Current: <b>{v?.stock ?? 0}</b> → New stock: <b style={{ color: next < 0 ? '#b3261e' : undefined }}>{next} units</b></span><b>{next - (v?.stock ?? 0)}</b></div>
        <label className="f">Adjustment note (optional)<input value={note} maxLength={100} onChange={e => setNote(e.target.value)} placeholder="e.g. Received new stock shipment" /></label>
        <Err>{err}</Err>
      </div>
    </Modal>
  );
}

function EditModal({ product, categories, onClose, onDone }) {
  const [f, setF] = useState({ name: product.name, price: rupees(product.price), tax: product.taxRate, cat: product.categorySlug || '', status: product.status });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  const submit = async e => {
    e.preventDefault(); setBusy(true); setErr();
    try { await api(`/admin/pos/products/${product.id}`, { method: 'PATCH', body: { name: f.name.trim(), price: toPaise(f.price), taxRate: +f.tax, categorySlug: f.cat || null, status: f.status } }); onDone(); onClose() }
    catch (x) { setErr(x.issues?.[0]?.message || x.message) } finally { setBusy(false) }
  };
  return (
    <Modal title="Edit product" sub={product.name} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <label className="f">Name<input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} maxLength={160} /></label>
        <div className="dpos-grid">
          <label className="f">Selling price ₹<input required inputMode="decimal" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></label>
          <label className="f">GST %<select value={f.tax} onChange={e => setF({ ...f, tax: e.target.value })}>{[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}</select></label>
          <label className="f">Category<select value={f.cat} onChange={e => setF({ ...f, cat: e.target.value })}><option value="">— None —</option>{categories.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></label>
          <label className="f">Status<select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="active">Active (on sale)</option><option value="draft">Draft (hidden)</option><option value="archived">Archived</option></select></label>
        </div>
        <p className="sub">Photos are managed in Products &amp; images. Stock is adjusted with the Stock button.</p>
        <Err>{err}</Err>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" className="dpos-btn ghost" onClick={onClose}>Cancel</button><button className="dpos-btn" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
      </form>
    </Modal>
  );
}

const blankVar = () => ({ size: 'Free Size', color: 'Default', sku: '', stock: '' });
function AddModal({ categories, onClose, onDone }) {
  const [f, setF] = useState({ name: '', price: '', tax: 5, cat: '', status: 'active' }); const [vars, setVars] = useState([blankVar()]); const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  const setV = (i, p) => setVars(v => v.map((x, n) => n === i ? { ...x, ...p } : x));
  const submit = async e => {
    e.preventDefault(); setErr(); setBusy(true);
    const base = slugify(f.name) || 'product';
    const payload = slug => ({ slug, name: f.name.trim(), description: '', category: f.cat || undefined, price: toPaise(f.price), gst_rate: +f.tax, status: f.status, featured: false,
      variants: vars.map(v => ({ size: v.size.trim() || 'Free Size', color: v.color.trim() || 'Default', sku: (v.sku.trim() || `${slug}-${slugify(v.size) || 'free'}-${slugify(v.color) || 'default'}`).toUpperCase(), stock: Math.max(0, parseInt(v.stock, 10) || 0) })) });
    try {
      try { await api('/admin/products', { method: 'POST', body: payload(base) }) }
      catch (x) { if (x.status !== 409) throw x; await api('/admin/products', { method: 'POST', body: payload(`${base}-${Math.random().toString(36).slice(2, 6)}`) }) }
      onDone(); onClose();
    } catch (x) { setErr(x.issues?.[0] ? `${x.issues[0].path}: ${x.issues[0].message}` : x.message) } finally { setBusy(false) }
  };
  return (
    <Modal title="Add product" sub="New products appear in billing and, when Active, on the website" wide onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <label className="f">Product name<input required autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} maxLength={160} placeholder="e.g. Kanjivaram Silk Saree · Maroon" /></label>
        <div className="dpos-grid">
          <label className="f">Selling price ₹<input required inputMode="decimal" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></label>
          <label className="f">GST %<select value={f.tax} onChange={e => setF({ ...f, tax: e.target.value })}>{[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}</select></label>
          <label className="f">Category<select value={f.cat} onChange={e => setF({ ...f, cat: e.target.value })}><option value="">— None —</option>{categories.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></label>
          <label className="f">Status<select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="active">Active (on sale)</option><option value="draft">Draft (hidden)</option></select></label>
        </div>
        <div className="dpos-box"><b>Sizes &amp; stock</b>
          {vars.map((v, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr)) auto', gap: 8, marginTop: 10 }}>
              <input aria-label="Size" placeholder="Size" value={v.size} onChange={e => setV(i, { size: e.target.value })} /><input aria-label="Colour" placeholder="Colour" value={v.color} onChange={e => setV(i, { color: e.target.value })} />
              <input aria-label="SKU" placeholder="SKU (auto)" value={v.sku} onChange={e => setV(i, { sku: e.target.value })} /><input aria-label="Opening stock" inputMode="numeric" placeholder="Stock" value={v.stock} onChange={e => setV(i, { stock: e.target.value.replace(/\D/g, '') })} />
              <button type="button" className="dpos-btn ghost sm" aria-label="Remove size" disabled={vars.length === 1} onClick={() => setVars(vs => vs.filter((_, n) => n !== i))}>✕</button></div>))}
          <button type="button" className="dpos-btn ghost sm" style={{ marginTop: 10 }} onClick={() => setVars(v => [...v, blankVar()])}>+ Add size / colour</button></div>
        <Err>{err}</Err>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" className="dpos-btn ghost" onClick={onClose}>Cancel</button><button className="dpos-btn" disabled={busy}>{busy ? 'Saving…' : 'Add product'}</button></div>
      </form>
    </Modal>
  );
}

export default function PosInventory({ manager, stocker }) {
  const { toast } = useApp();
  const [q, setQ] = useState(''); const [stock, setStock] = useState('all'); const [list, setList] = useState(null); const [cats, setCats] = useState([]);
  const [open, setOpen] = useState(null); const [modal, setModal] = useState(null); const [err, setErr] = useState(); const [nv, setNv] = useState({ size: '', color: '', sku: '', stock: '' });
  const load = useCallback(() => api('/admin/pos/products?q=' + encodeURIComponent(q)).then(r => { setList(r); setErr() }).catch(e => setErr(e.message)), [q]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t) }, [load]);
  useEffect(() => { api('/admin/pos/categories').then(setCats).catch(() => {}) }, []);
  const shown = useMemo(() => (list || []).filter(p => stock === 'all' || (stock === 'out' ? p.stock < 1 : stock === 'low' ? p.stock >= 1 && p.stock <= LOW : p.stock > LOW)), [list, stock]);
  const del = async p => { if (!confirm(`Delete "${p.name}" permanently, with its sizes and photos? Past bills keep their own copy.`)) return; try { await api('/admin/products/' + p.id, { method: 'DELETE' }); toast('Product deleted.'); if (open === p.id) setOpen(null); load() } catch (e) { setErr(e.message) } };
  const addVariant = async (p, e) => {
    e.preventDefault(); setErr();
    try { await api(`/admin/pos/products/${p.id}/variants`, { method: 'POST', body: { size: nv.size.trim(), color: nv.color.trim() || 'Default', sku: (nv.sku.trim() || `${p.slug}-${slugify(nv.size)}-${slugify(nv.color) || 'default'}`).toUpperCase(), stock: parseInt(nv.stock, 10) || 0 } }); setNv({ size: '', color: '', sku: '', stock: '' }); load() }
    catch (x) { setErr(x.issues?.[0]?.message || x.message) }
  };
  const stockDone = (vid, n) => { setList(l => l.map(p => ({ ...p, variants: p.variants.map(v => v.id === vid ? { ...v, stock: n } : v), stock: p.variants.some(v => v.id === vid) ? p.variants.reduce((s, v) => s + (v.id === vid ? n : v.stock), 0) : p.stock }))); toast(`Stock updated: ${n} left`) };
  const tag = s => s < 1 ? <span className="dpos-pill bad">Out</span> : s <= LOW ? <span className="dpos-pill bad">Low</span> : null;

  return (
    <>
      <div className="dpos-bar-tools">
        <input type="search" style={{ maxWidth: 360 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Search products, SKU or category…" aria-label="Search products" />
        <Chips label="Stock" value={stock} onChange={setStock} options={[['all', 'All'], ['in', 'In stock'], ['low', 'Low'], ['out', 'Out']]} />
        {manager && <button className="dpos-btn" onClick={() => setModal({ t: 'add' })}><Icon n="plus" size={16} />Add product</button>}
      </div>
      <Err>{err}</Err>
      <section className="dpos-card" style={{ padding: '8px 16px' }}>
        <div className="dpos-ph"><span /><span>Product</span><span>Type</span><span style={{ textAlign: 'right' }}>Stock</span><span style={{ textAlign: 'right' }}>Price</span><span style={{ textAlign: 'right' }}>Actions</span></div>
        {!list ? <p className="dpos-empty">Loading…</p> : !shown.length ? <p className="dpos-empty">No products found.</p> : shown.map(p => (
          <div className="dpos-prod" key={p.id}>
            <div className="dpos-prow">
              <button className={`chev ${open === p.id ? 'open' : ''}`} aria-expanded={open === p.id} aria-label={open === p.id ? 'Hide details' : 'Show details'} onClick={() => setOpen(open === p.id ? null : p.id)}><Icon n="chevron" size={16} /></button>
              <div className="nm"><b>{p.name}</b><small>{open === p.id ? '▲ Hide details' : '▼ Open in detail'}{p.variants.length > 1 ? ` · ${p.variants.length} sizes` : ''}{p.status !== 'active' ? ` · ${p.status}` : ''}{p.isSample ? ' · sample' : ''}</small></div>
              <span><span className="dpos-pill">Product</span></span>
              <b style={{ textAlign: 'right' }}>{p.stock} {tag(p.stock)}</b>
              <b style={{ textAlign: 'right' }}>{inr(p.price)}</b>
              <div className="dpos-acts">
                <button className={`dpos-btn sm ${open === p.id ? '' : 'ghost'}`} onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? 'Close' : 'Details'}</button>
                {manager && <button className="dpos-btn ghost sm" onClick={() => setModal({ t: 'edit', p })}><Icon n="edit" size={14} />Edit</button>}
                {stocker && <button className="dpos-btn ghost sm" onClick={() => setModal({ t: 'stock', p })}>Stock</button>}
                {manager && <button className="dpos-btn danger sm" onClick={() => del(p)}><Icon n="trash" size={14} />Delete</button>}
              </div>
            </div>
            {open === p.id && (
              <div className="dpos-detail">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <b style={{ letterSpacing: '.06em', textTransform: 'uppercase' }}>● Product detail — {p.name}</b>
                  <div className="dpos-acts">{manager && <button className="dpos-btn sm" onClick={() => setModal({ t: 'edit', p })}>Edit</button>}{stocker && <button className="dpos-btn ghost sm" onClick={() => setModal({ t: 'stock', p })}>Adjust Stock</button>}<button className="dpos-btn ghost sm" onClick={() => setOpen(null)}>Close</button></div></div>
                <div className="dpos-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                  {[['Selling price', inr(p.price)], ['Category', p.category || '—'], ['GST', `${p.taxRate}%`], ['Status', p.status]].map(([l, v]) => <div key={l}><span className="muted small" style={{ letterSpacing: '.1em', fontWeight: 800, textTransform: 'uppercase' }}>{l}</span><div style={{ fontWeight: 800 }}>{v}</div></div>)}
                </div>
                <div className="dpos-tw"><table><thead><tr><th>Size</th><th>Colour</th><th>SKU</th><th className="r">Stock</th><th /></tr></thead>
                  <tbody>{p.variants.map(v => <tr key={v.id}><td>{v.size}</td><td>{v.color}</td><td className="muted small">{v.sku}</td><td className="r"><b>{v.stock}</b> {tag(v.stock)}</td><td className="r">{stocker && <button className="dpos-btn ghost sm" onClick={() => setModal({ t: 'stock', p, vid: v.id })}>Stock</button>}</td></tr>)}</tbody></table></div>
                {manager && <form onSubmit={e => addVariant(p, e)} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr)) auto', gap: 8 }}>
                  <input required aria-label="New size" placeholder="New size" value={nv.size} onChange={e => setNv({ ...nv, size: e.target.value })} /><input aria-label="Colour" placeholder="Colour" value={nv.color} onChange={e => setNv({ ...nv, color: e.target.value })} />
                  <input aria-label="SKU" placeholder="SKU (auto)" value={nv.sku} onChange={e => setNv({ ...nv, sku: e.target.value })} /><input aria-label="Opening stock" inputMode="numeric" placeholder="Stock" value={nv.stock} onChange={e => setNv({ ...nv, stock: e.target.value.replace(/\D/g, '') })} />
                  <button className="dpos-btn sm">+ Add size</button></form>}
              </div>)}
          </div>))}
      </section>
      {modal?.t === 'stock' && <StockModal product={list.find(x => x.id === modal.p.id) || modal.p} variantId={modal.vid} onClose={() => setModal(null)} onDone={stockDone} />}
      {modal?.t === 'edit' && <EditModal product={modal.p} categories={cats} onClose={() => setModal(null)} onDone={() => { toast('Product saved.'); load() }} />}
      {modal?.t === 'add' && <AddModal categories={cats} onClose={() => setModal(null)} onDone={() => { toast('Product added.'); load() }} />}
    </>
  );
}
