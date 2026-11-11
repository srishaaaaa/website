import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, uploadImage } from '../lib/api';
import { inr } from '../lib/format';
import { useApp } from '../context/App';
import { Icon } from '../components/AdminShell';
import Modal from '../components/Modal';
import { Chips } from '../components/PeriodFilter';
import { ColourModal, colourGroups } from '../components/ColourOptions';
import ProductPhotos from '../components/ProductPhotos';
import StockMovements, { downloadCsv } from '../components/StockMovements';

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

// Everything about one product in one window: details, website text, collections, sizes & colours, and photos.
function VariantRow({ productId, v, basePrice, productCost, canCost, onChanged, setErr, onlyOne }) {
  const [r, setR] = useState({ size: v.size, color: v.color, sku: v.sku, price: v.priceOverride != null ? rupees(v.priceOverride) : '', cost: v.costOverride != null ? rupees(v.costOverride) : '' });
  const dirty = r.size !== v.size || r.color !== v.color || r.sku !== v.sku || (r.price ? toPaise(r.price) : null) !== (v.priceOverride ?? null) || (r.cost ? toPaise(r.cost) : null) !== (v.costOverride ?? null);
  const call = async (body, method = 'PATCH') => {
    setErr();
    try { await api(`/admin/pos/products/${productId}/variants/${v.id}`, { method, ...(body ? { body } : {}) }); onChanged() }
    catch (x) { setErr(x.issues?.[0]?.message || x.message) }
  };
  return (
    <tr className={v.active ? '' : 'muted'}>
      <td><input aria-label="Size" value={r.size} maxLength={40} onChange={e => setR({ ...r, size: e.target.value })} /></td>
      <td><input aria-label="Colour" value={r.color} maxLength={40} onChange={e => setR({ ...r, color: e.target.value })} /></td>
      <td><input aria-label="SKU" value={r.sku} maxLength={80} onChange={e => setR({ ...r, sku: e.target.value.toUpperCase() })} /></td>
      <td><input aria-label="Own price in rupees" inputMode="decimal" value={r.price} placeholder={rupees(basePrice)} onChange={e => setR({ ...r, price: e.target.value })} /></td>
      {canCost && <td><input aria-label="Own cost price in rupees" inputMode="decimal" value={r.cost} placeholder={productCost ? rupees(productCost) : 'product cost'} onChange={e => setR({ ...r, cost: e.target.value })} /></td>}
      <td className="r"><b>{v.stock}</b></td>
      <td className="r pe-acts">
        {dirty && <button type="button" className="dpos-btn sm" onClick={() => call({ size: r.size.trim(), color: r.color.trim() || 'Default', sku: r.sku.trim(), price: r.price ? toPaise(r.price) : null, cost: r.cost ? toPaise(r.cost) : null })}>Save</button>}
        <button type="button" className="dpos-btn ghost sm" title={v.active ? 'Hide this size from the website and billing' : 'Show this size again'} onClick={() => call({ active: !v.active })}>{v.active ? 'Hide' : 'Show'}</button>
        <button type="button" className="dpos-btn ghost sm" disabled={onlyOne} aria-label={`Delete ${v.size} ${v.color}`} onClick={() => confirm(`Delete size ${v.size} (${v.color})? Past bills keep their own copy.`) && call(null, 'DELETE')}>✕</button>
      </td>
    </tr>
  );
}

function EditModal({ product: start, categories, onClose, onDone, onPhotos }) {
  const [product, setProduct] = useState(start);
  const [f, setF] = useState({ name: start.name, price: rupees(start.price), cost: start.costPrice ? rupees(start.costPrice) : '', tax: start.taxRate, cat: start.categorySlug || '', status: start.status,
    description: start.description || '', material: start.material || '', featured: !!start.featured, best: !!start.bestSeller, low: start.lowAlert ?? 3, collections: start.collections || [] });
  const [cols, setCols] = useState([]);
  const [nv, setNv] = useState({ size: '', color: '', sku: '', stock: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(); const [tab, setTab] = useState('details');
  useEffect(() => { api('/admin/taxonomy').then(d => setCols(d.collections || [])).catch(() => {}) }, []);
  const reload = () => api(`/admin/pos/products/${start.id}`).then(setProduct).then(() => onPhotos?.()).catch(e => setErr(e.message));
  const submit = async e => {
    e.preventDefault(); setBusy(true); setErr();
    try {
      await api(`/admin/pos/products/${product.id}`, { method: 'PATCH', body: { name: f.name.trim(), price: toPaise(f.price), costPrice: toPaise(f.cost), taxRate: +f.tax, categorySlug: f.cat || null, status: f.status,
        description: f.description.trim(), material: f.material.trim(), featured: f.featured, bestSeller: f.best, lowAlert: Math.max(0, Math.round(+f.low) || 0), collections: f.collections } });
      onDone(); onClose();
    } catch (x) { setErr(x.issues?.[0]?.message || x.message) } finally { setBusy(false) }
  };
  const addVariant = async e => {
    e.preventDefault(); setErr();
    try {
      await api(`/admin/pos/products/${product.id}/variants`, { method: 'POST', body: { size: nv.size.trim(), color: nv.color.trim() || 'Default', sku: (nv.sku.trim() || `${product.slug}-${slugify(nv.size)}-${slugify(nv.color) || 'default'}`).toUpperCase(), stock: parseInt(nv.stock, 10) || 0 } });
      setNv({ size: '', color: '', sku: '', stock: '' }); reload();
    } catch (x) { setErr(x.issues?.[0]?.message || x.message) }
  };
  const toggleCol = slug => setF(x => ({ ...x, collections: x.collections.includes(slug) ? x.collections.filter(c => c !== slug) : [...x.collections, slug] }));
  const editing = tab === 'details' || tab === 'website';
  const tabs = [['details', 'Details'], ['website', 'Website & categories'], ['sizes', `Sizes & colours (${product.variants?.length || 0})`], ['photos', 'Photos']];
  return (
    <Modal title="Edit product" sub={product.name} wide onClose={onClose}>
      <div className="pe-tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      <Err>{err}</Err>
      <form id="pe-form" onSubmit={submit} style={{ display: editing ? 'grid' : 'none', gap: 14 }}>
        <div style={{ display: tab === 'details' ? 'grid' : 'none', gap: 14 }}>
          <label className="f">Name<input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} maxLength={160} /></label>
          <div className="dpos-grid">
            <label className="f">Selling price ₹<input required inputMode="decimal" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></label>
            <label className="f">Cost price ₹ <span className="muted small">(what you paid)</span><input inputMode="decimal" value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} placeholder="0" /></label>
            <label className="f">GST %<select value={f.tax} onChange={e => setF({ ...f, tax: e.target.value })}>{[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}</select></label>
            <label className="f">Category<select value={f.cat} onChange={e => setF({ ...f, cat: e.target.value })}><option value="">— None —</option>{categories.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></label>
            <label className="f">Status<select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="active">Active (on sale)</option><option value="draft">Draft (hidden)</option><option value="archived">Archived</option></select></label>
            <label className="f">Fabric / material<input value={f.material} maxLength={80} onChange={e => setF({ ...f, material: e.target.value })} placeholder="e.g. Kanjivaram silk" /></label>
          </div>
        </div>
        <div style={{ display: tab === 'website' ? 'grid' : 'none', gap: 14 }}>
          <label className="f">Description <span className="muted small">(shown on the product page)</span><textarea rows={6} maxLength={4000} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="Fabric, work, drape, care…" /></label>
          <label className="pe-check"><input type="checkbox" checked={f.best} onChange={e => setF({ ...f, best: e.target.checked })} /> Show in “Best Sellers” <span className="muted small">(the home page keeps the 10 newest)</span></label>
          <label className="f">Low-stock alert at <span className="muted small">(compared with the total across all sizes)</span><input type="number" min="0" value={f.low} onChange={e => setF({ ...f, low: e.target.value })} style={{ maxWidth: 120 }} /></label>
          <label className="pe-check"><input type="checkbox" checked={f.featured} onChange={e => setF({ ...f, featured: e.target.checked })} /> Show in “Trending collections” <span className="muted small">(shown in Trending when no trending pieces are picked)</span></label>
          <div className="f"><span>Categories</span>
            <div className="pe-cols">{!cols.length ? <span className="muted small">No categories yet.</span> : cols.map(c => (
              <label key={c.slug} className={`pe-col ${f.collections.includes(c.slug) ? 'on' : ''}`}><input type="checkbox" checked={f.collections.includes(c.slug)} onChange={() => toggleCol(c.slug)} />{c.name}{c.status !== 'published' && <em className="muted small"> (hidden)</em>}</label>))}</div>
          </div>
        </div>
      </form>
      {tab === 'sizes' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <p className="muted small" style={{ margin: 0 }}>Edit a row and press Save. Leave “Own price” empty to use the product price. Stock is changed with the Stock button in the list.</p>
          <div className="acc-scroll"><table className="dpos-table pe-vars">
            <thead><tr><th>Size</th><th>Colour</th><th>SKU</th><th>Own price ₹</th>{start.costPrice !== undefined && <th>Cost price ₹</th>}<th className="r">Stock</th><th /></tr></thead>
            <tbody>{(product.variants || []).map(v => <VariantRow key={`${v.id}-${v.size}-${v.color}-${v.sku}-${v.priceOverride}-${v.active}`} productId={product.id} v={v} basePrice={product.price} productCost={product.costPrice} canCost={start.costPrice !== undefined} onChanged={reload} setErr={setErr} onlyOne={product.variants.length <= 1} />)}</tbody>
          </table></div>
          <form onSubmit={addVariant} className="pe-add">
            <input aria-label="New size" required placeholder="Size" value={nv.size} onChange={e => setNv({ ...nv, size: e.target.value })} />
            <input aria-label="New colour" placeholder="Colour" value={nv.color} onChange={e => setNv({ ...nv, color: e.target.value })} />
            <input aria-label="New SKU" placeholder="SKU (auto)" value={nv.sku} onChange={e => setNv({ ...nv, sku: e.target.value })} />
            <input aria-label="Opening stock" inputMode="numeric" placeholder="Stock" value={nv.stock} onChange={e => setNv({ ...nv, stock: e.target.value.replace(/\D/g, '') })} />
            <button className="dpos-btn sm">+ Add size</button>
          </form>
        </div>)}
      {tab === 'photos' && <ProductPhotos product={product} onChanged={onPhotos} />}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" className="dpos-btn ghost" onClick={onClose}>{editing ? 'Cancel' : 'Close'}</button>
        {editing && <button form="pe-form" className="dpos-btn" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>}
      </div>
    </Modal>
  );
}

const blankVar = () => ({ size: 'Free Size', color: 'Default', sku: '', stock: '', cost: '' });
function AddModal({ categories, onClose, onDone }) {
  const [f, setF] = useState({ name: '', price: '', cost: '', tax: 5, cat: '', status: 'active' }); const [vars, setVars] = useState([blankVar()]); const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  const setV = (i, p) => setVars(v => v.map((x, n) => n === i ? { ...x, ...p } : x));
  const submit = async e => {
    e.preventDefault(); setErr(); setBusy(true);
    const base = slugify(f.name) || 'product';
    const payload = slug => ({ slug, name: f.name.trim(), description: '', category: f.cat || undefined, price: toPaise(f.price), ...(toPaise(f.cost) ? { cost_price: toPaise(f.cost) } : {}), gst_rate: +f.tax, status: f.status, featured: false,
      variants: vars.map(v => ({ size: v.size.trim() || 'Free Size', color: v.color.trim() || 'Default', sku: (v.sku.trim() || `${slug}-${slugify(v.size) || 'free'}-${slugify(v.color) || 'default'}`).toUpperCase(), stock: Math.max(0, parseInt(v.stock, 10) || 0), ...(toPaise(v.cost) ? { cost: toPaise(v.cost) } : {}) })) });
    try {
      let made;
      try { made = await api('/admin/products', { method: 'POST', body: payload(base) }) }
      catch (x) { if (x.status !== 409) throw x; made = await api('/admin/products', { method: 'POST', body: payload(`${base}-${Math.random().toString(36).slice(2, 6)}`) }) }
      onClose(); onDone(made?.id, f.name.trim());
    } catch (x) { setErr(x.issues?.[0] ? `${x.issues[0].path}: ${x.issues[0].message}` : x.message) } finally { setBusy(false) }
  };
  return (
    <Modal title="Add product" sub="New products appear in billing and, when Active, on the website" wide onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <label className="f">Product name<input required autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} maxLength={160} placeholder="e.g. Kanjivaram Silk Saree · Maroon" /></label>
        <div className="dpos-grid">
          <label className="f">Selling price ₹<input required inputMode="decimal" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></label>
          <label className="f">Cost price ₹ <span className="muted small">(what you paid)</span><input inputMode="decimal" value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} placeholder="0" /></label>
          <label className="f">GST %<select value={f.tax} onChange={e => setF({ ...f, tax: e.target.value })}>{[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}</select></label>
          <label className="f">Category<select value={f.cat} onChange={e => setF({ ...f, cat: e.target.value })}><option value="">— None —</option>{categories.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></label>
          <label className="f">Status<select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="active">Active (on sale)</option><option value="draft">Draft (hidden)</option></select></label>
        </div>
        <div className="dpos-box"><b>Sizes &amp; stock</b>
          {vars.map((v, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr)) auto', gap: 8, marginTop: 10 }}>
              <input aria-label="Size" placeholder="Size" value={v.size} onChange={e => setV(i, { size: e.target.value })} /><input aria-label="Colour" placeholder="Colour" value={v.color} onChange={e => setV(i, { color: e.target.value })} />
              <input aria-label="SKU" placeholder="SKU (auto)" value={v.sku} onChange={e => setV(i, { sku: e.target.value })} /><input aria-label="Opening stock" inputMode="numeric" placeholder="Stock" value={v.stock} onChange={e => setV(i, { stock: e.target.value.replace(/\D/g, '') })} /><input aria-label="Cost price for this size in rupees" inputMode="decimal" placeholder="Cost ₹ (product)" value={v.cost} onChange={e => setV(i, { cost: e.target.value })} />
              <button type="button" className="dpos-btn ghost sm" aria-label="Remove size" disabled={vars.length === 1} onClick={() => setVars(vs => vs.filter((_, n) => n !== i))}>✕</button></div>))}
          <button type="button" className="dpos-btn ghost sm" style={{ marginTop: 10 }} onClick={() => setVars(v => [...v, blankVar()])}>+ Add size / colour</button></div>
        <Err>{err}</Err>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" className="dpos-btn ghost" onClick={onClose}>Cancel</button><button className="dpos-btn" disabled={busy}>{busy ? 'Saving…' : 'Add product'}</button></div>
      </form>
    </Modal>
  );
}

function ProductsStock({ manager, stocker }) {
  const { toast } = useApp();
  const [q, setQ] = useState(''); const [stock, setStock] = useState('all'); const [list, setList] = useState(null); const [cats, setCats] = useState([]);
  const [view, setView] = useState('grid'); const [alerts, setAlerts] = useState(false); const [sortBy, setSortBy] = useState('name'); const [catF, setCatF] = useState('all');
  const [open, setOpen] = useState(null); const [modal, setModal] = useState(null); const [err, setErr] = useState(); const [nv, setNv] = useState({ size: '', color: '', sku: '', stock: '' });
  const load = useCallback(() => api('/admin/pos/products?q=' + encodeURIComponent(q)).then(r => { setList(r); setErr() }).catch(e => setErr(e.message)), [q]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t) }, [load]);
  useEffect(() => { api('/admin/pos/categories').then(setCats).catch(() => {}) }, []);
  const lowOf = p => p.lowAlert ?? LOW;
  const shown = useMemo(() => (list || []).filter(p => (stock === 'all' || (stock === 'out' ? p.stock < 1 : stock === 'low' ? p.stock >= 1 && p.stock <= lowOf(p) : stock === 'best' ? p.bestSeller : p.stock > lowOf(p))) && (catF === 'all' || p.categorySlug === catF))
    .sort((a, b) => sortBy === 'stock-asc' ? a.stock - b.stock : sortBy === 'stock-desc' ? b.stock - a.stock : sortBy === 'price-asc' ? a.price - b.price : sortBy === 'price-desc' ? b.price - a.price : a.name.localeCompare(b.name)), [list, stock, catF, sortBy]);
  const needs = useMemo(() => (list || []).filter(p => p.stock < 1 || p.stock <= lowOf(p) || p.variants.some(v => v.active && v.stock < 1)), [list]);
  useEffect(() => {
    if (!list || !needs.length) return;
    setAlerts(true);
  }, [list]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => ({ out: (list || []).filter(p => p.stock < 1).length, low: (list || []).filter(p => p.stock >= 1 && p.stock <= lowOf(p)).length, size: (list || []).filter(p => p.stock >= 1 && p.stock > lowOf(p) && p.variants.some(v => v.active && v.stock < 1)).length }), [list]);
  const del = async p => { if (!confirm(`Delete "${p.name}" permanently, with its sizes and photos? Past bills keep their own copy.`)) return; try { await api('/admin/products/' + p.id, { method: 'DELETE' }); toast('Product deleted.'); if (open === p.id) setOpen(null); load() } catch (e) { setErr(e.message) } };
  const addVariant = async (p, e) => {
    e.preventDefault(); setErr();
    try { await api(`/admin/pos/products/${p.id}/variants`, { method: 'POST', body: { size: nv.size.trim(), color: nv.color.trim() || 'Default', sku: (nv.sku.trim() || `${p.slug}-${slugify(nv.size)}-${slugify(nv.color) || 'default'}`).toUpperCase(), stock: parseInt(nv.stock, 10) || 0 } }); setNv({ size: '', color: '', sku: '', stock: '' }); load() }
    catch (x) { setErr(x.issues?.[0]?.message || x.message) }
  };
  const removeColour = async (p, name) => { if (!confirm(`Remove the colour “${name}” and all its sizes from ${p.name}? Past bills keep their own copy.`)) return; try { await api(`/admin/pos/products/${p.id}/colours?color=${encodeURIComponent(name)}`, { method: 'DELETE' }); toast('Colour removed.'); load() } catch (e) { setErr(e.message) } };
  const stockDone = (vid, n) => { setList(l => l.map(p => ({ ...p, variants: p.variants.map(v => v.id === vid ? { ...v, stock: n } : v), stock: p.variants.some(v => v.id === vid) ? p.variants.reduce((s, v) => s + (v.id === vid ? n : v.stock), 0) : p.stock }))); toast(`Stock updated: ${n} left`) };
  const tag = s => s < 1 ? <span className="dpos-pill bad">Out</span> : s <= LOW ? <span className="dpos-pill bad">Low</span> : null;

  return (
    <>
      <div className="inv-top">
      <p className="inv-count">{list ? `${list.length} products` : '…'} · same catalog customers see</p>
        <div className="inv-top-r">
<button className="dpos-btn ghost" onClick={() => setAlerts(true)} style={{ color: '#8a5a00', borderColor: '#e0b44c' }}>⚠ Alerts{needs.length > 0 && <b className="dpos-count" style={{ background: '#b3261e' }}>{needs.length}</b>}</button>
{manager && <button className="dpos-btn" onClick={() => setModal({ t: 'add' })}><Icon n="plus" size={16} />Add product</button>}
        </div>
      </div>
      {(counts.out + counts.low + counts.size) > 0 && <p className="inv-warn">⚠ {counts.out > 0 && `${counts.out} out of stock`}{counts.out > 0 && counts.low > 0 && ' · '}{counts.low > 0 && `${counts.low} running low`}{(counts.out + counts.low) > 0 && counts.size > 0 && ' · '}{counts.size > 0 && `${counts.size} with a size sold out`} — restock soon.</p>}
      <div className="dpos-bar-tools inv-filters">
        <div className="inv-chips" role="radiogroup" aria-label="Stock">{[['all', 'All'], ['best', `Best Sellers (${(list || []).filter(p => p.bestSeller).length})`], ['low', 'Low Stock'], ['out', 'Out of Stock']].map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={stock === k} className={`${stock === k ? 'on' : ''} ${k === 'best' && stock !== k ? 'hl' : ''}`} onClick={() => setStock(k)}>{l}</button>)}</div>
        <select aria-label="Category" value={catF} onChange={e => setCatF(e.target.value)}><option value="all">All categories</option>{cats.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select>
        <select aria-label="Sort" value={sortBy} onChange={e => setSortBy(e.target.value)}><option value="name">Name A–Z</option><option value="stock-asc">Stock low → high</option><option value="stock-desc">Stock high → low</option><option value="price-asc">Price low → high</option><option value="price-desc">Price high → low</option></select>
        <div className="inv-vt" role="group" aria-label="View">{[['grid', 'Grid'], ['list', 'List']].map(([k, l]) => <button key={k} type="button" className={view === k ? 'on' : ''} aria-pressed={view === k} onClick={() => setView(k)}>{l}</button>)}</div>
        <label className="inv-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></svg><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search products…" aria-label="Search products" /></label>
      </div>
      <Err>{err}</Err>
      {view === 'grid' && (!list ? <p className="dpos-empty">Loading…</p> : !shown.length ? <p className="dpos-empty">No products found.</p> : (
        <div className="inv-grid">{shown.map(p => { const st = p.stock < 1 ? 'out' : p.stock <= lowOf(p) ? 'low' : 'in'; return (
          <article key={p.id} className={`inv-card ${st}`}>
            <div className="inv-ph">{p.image ? <img src={p.image} alt="" loading="lazy" /> : <span>No photo</span>}
              <em className={`inv-badge ${st}`}>{st === 'out' ? 'OUT OF STOCK' : st === 'low' ? 'LOW STOCK' : 'IN STOCK'}</em>
              <span className="inv-ph-act">{manager && <button type="button" aria-label={`Edit ${p.name}`} onClick={() => setModal({ t: 'edit', p })}><Icon n="edit" size={14} /></button>}{manager && <button type="button" aria-label={`Delete ${p.name}`} onClick={() => del(p)}><Icon n="trash" size={14} /></button>}</span></div>
            <div className="inv-info"><div className="inv-nm"><b>{p.name}</b></div><small>{p.category || 'Uncategorised'}{p.bestSeller ? ' · Best seller' : ''}</small>
              <div className="inv-cs"><span><em>Cost</em><b>{manager && p.costPrice ? inr(p.costPrice) : '—'}</b></span><span><em>Selling</em><b>{inr(p.price)}</b></span></div>
              <button type="button" className="inv-units" disabled={!stocker} onClick={() => setModal({ t: 'stock', p })}><b>{p.stock}</b> Total Units</button>
              <small className={`inv-note ${st}`}>{st === 'out' ? 'Sold out' : st === 'low' ? `Low · reorder at ${lowOf(p)}` : 'In stock'}</small></div>
          </article>) })}</div>))}
      {view === 'list' && <section className="dpos-card" style={{ padding: '8px 16px' }}>
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
                <div>
                  <div className="dpos-head" style={{ marginBottom: 8 }}><b className="muted small" style={{ letterSpacing: '.1em', textTransform: 'uppercase' }}>Colour options</b>{manager && <button className="dpos-btn sm" onClick={() => setModal({ t: 'colour', p })}>+ Add colour</button>}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{colourGroups(p).map(c => (
                    <span key={c.name} className="dpos-pill" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', padding: '7px 12px', fontSize: 11 }}>{c.name} · {c.stock} in stock{c.price !== p.price ? ` · ${inr(c.price)}` : ''}
                      {manager && colourGroups(p).length > 1 && <button type="button" aria-label={`Remove colour ${c.name}`} style={{ color: '#b3261e', fontWeight: 800 }} onClick={() => removeColour(p, c.name)}>✕</button>}</span>))}</div>
                </div>
                <div className="dpos-tw"><table><thead><tr><th>Size</th><th>Colour</th><th>SKU</th><th className="r">Stock</th><th /></tr></thead>
                  <tbody>{p.variants.map(v => <tr key={v.id}><td>{v.size}</td><td>{v.color}</td><td className="muted small">{v.sku}</td><td className="r"><b>{v.stock}</b> {tag(v.stock)}</td><td className="r">{stocker && <button className="dpos-btn ghost sm" onClick={() => setModal({ t: 'stock', p, vid: v.id })}>Stock</button>}</td></tr>)}</tbody></table></div>
                {manager && <form onSubmit={e => addVariant(p, e)} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr)) auto', gap: 8 }}>
                  <input required aria-label="New size" placeholder="New size" value={nv.size} onChange={e => setNv({ ...nv, size: e.target.value })} /><input aria-label="Colour" placeholder="Colour" value={nv.color} onChange={e => setNv({ ...nv, color: e.target.value })} />
                  <input aria-label="SKU" placeholder="SKU (auto)" value={nv.sku} onChange={e => setNv({ ...nv, sku: e.target.value })} /><input aria-label="Opening stock" inputMode="numeric" placeholder="Stock" value={nv.stock} onChange={e => setNv({ ...nv, stock: e.target.value.replace(/\D/g, '') })} />
                  <button className="dpos-btn sm">+ Add size</button></form>}
              </div>)}
          </div>))}
      </section>}
      {alerts && <AlertsModal list={list || []} canStock={stocker} onClose={() => setAlerts(false)} onDone={load} onEdit={manager ? p => { setAlerts(false); setModal({ t: 'edit', p }) } : null} />}
      {modal?.t === 'stock' && <StockModal product={list.find(x => x.id === modal.p.id) || modal.p} variantId={modal.vid} onClose={() => setModal(null)} onDone={stockDone} />}
      {modal?.t === 'edit' && <ProductEditor product={modal.p} categories={cats} onClose={() => setModal(null)} onDone={load} onPhotos={load} />}
      {modal?.t === 'colour' && <ColourModal product={modal.p} onClose={() => setModal(null)} onDone={() => { toast('Colour added.'); load() }} />}
      {modal?.t === 'add' && <ProductEditor categories={cats} onClose={() => setModal(null)} onDone={load} />}
    </>
  );
}

// Inventory: "Products & Stock" and "Stock Movements" tabs.
// Add / Edit Product in one window: Basic Details + Media Gallery on the left, Organization & Pricing + Inventory Alerts on the right,
// Product Variants underneath, then Suggested Products ("Complete the look") and the Cancel / Save buttons.
function SuggestPicker({ selfId, picked, setPicked }) {
  const [all, setAll] = useState([]); const [q, setQ] = useState('');
  useEffect(() => { api('/admin/pos/products?q=').then(setAll).catch(() => {}) }, []);
  const avail = all.filter(p => p.id !== selfId && !picked.some(x => x.id === p.id) && (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())));
  const row = (p, add) => (
    <li key={p.id}>{p.image ? <img src={p.image} alt="" loading="lazy" /> : <i />}<span><b>{p.name}</b><em>{p.category || 'Uncategorised'}</em></span>
      <button type="button" aria-label={`${add ? 'Add' : 'Remove'} ${p.name}`} disabled={add && picked.length >= 4} onClick={() => setPicked(add ? [...picked, p] : picked.filter(x => x.id !== p.id))}>{add ? '+' : '✕'}</button></li>);
  return (
    <section className="pe2-sug">
      <h3>Suggested Products ({picked.length}/4)</h3><p className="pe2-hint">Shown under “Complete the look” on this product’s page</p>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search products to suggest…" aria-label="Search products to suggest" />
      <div className="pe2-two">
        <div><h4>AVAILABLE</h4><ul>{avail.slice(0, 60).map(p => row(p, true))}</ul></div>
        <div><h4>SELECTED</h4>{picked.length ? <ul>{picked.map(p => row(p, false))}</ul> : <p className="pe2-empty">No suggestions selected yet.</p>}</div>
      </div>
    </section>
  );
}

function ProductEditor({ product: start, categories, onClose, onDone, onPhotos }) {
  const editing = !!start;
  const { toast } = useApp();
  const [product, setProduct] = useState(start);
  const [f, setF] = useState(() => ({ name: start?.name || '', description: start?.description || '', cat: start?.categorySlug || '', status: start?.status || 'active', price: start ? rupees(start.price) : '', cost: start?.costPrice ? rupees(start.costPrice) : '',
    tax: start?.taxRate ?? 5, material: start?.material || '', featured: !!start?.featured, best: !!start?.bestSeller, low: start?.lowAlert ?? 3, defStock: '0' }));
  const [vars, setVars] = useState([{ size: '', color: '', sku: '', price: '', cost: '', stock: '' }]); // new product only
  const [nv, setNv] = useState({ size: '', color: '', sku: '', stock: '' }); // extra size on an existing product
  const [picked, setPicked] = useState([]); const [files, setFiles] = useState([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  const fileIn = useRef();
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose]);
  const setV = (i, p) => setVars(v => v.map((x, n) => n === i ? { ...x, ...p } : x));
  useEffect(() => { if (editing) api(`/admin/pos/products/${start.id}/suggested`).then(setPicked).catch(() => {}) }, [editing, start?.id]);
  const reload = () => api(`/admin/pos/products/${start.id}`).then(setProduct).then(() => onPhotos?.()).catch(e => setErr(e.message));
  const addVariant = async e => {
    e.preventDefault(); setErr();
    try {
      await api(`/admin/pos/products/${product.id}/variants`, { method: 'POST', body: { size: nv.size.trim(), color: nv.color.trim() || 'Default', sku: (nv.sku.trim() || `${product.slug}-${slugify(nv.size)}-${slugify(nv.color) || 'default'}`).toUpperCase(), stock: parseInt(nv.stock, 10) || 0 } });
      setNv({ size: '', color: '', sku: '', stock: '' }); reload();
    } catch (x) { setErr(x.issues?.[0]?.message || x.message) }
  };
  const body = () => ({ name: f.name.trim(), price: toPaise(f.price), costPrice: toPaise(f.cost), taxRate: +f.tax, categorySlug: f.cat || null, status: f.status, description: f.description.trim(), material: f.material.trim(),
    featured: f.featured, bestSeller: f.best, lowAlert: Math.max(0, Math.round(+f.low) || 0) });
  const submit = async e => {
    e.preventDefault(); setErr(); setBusy(true);
    try {
      let id = start?.id;
      if (editing) await api(`/admin/pos/products/${id}`, { method: 'PATCH', body: body() });
      else {
        const base = slugify(f.name) || 'product';
        const rowsOk = vars.filter(v => v.size.trim() || v.stock || v.price || v.cost);
        const list = (rowsOk.length ? rowsOk : [{ size: '', color: '', sku: '', stock: '' }]);
        const payload = slug => ({ slug, name: f.name.trim(), description: f.description.trim(), category: f.cat || undefined, price: toPaise(f.price), ...(toPaise(f.cost) ? { cost_price: toPaise(f.cost) } : {}), gst_rate: +f.tax, status: f.status, featured: f.featured,
          variants: list.map(v => ({ size: v.size.trim() || 'Free Size', color: v.color.trim() || 'Default', sku: (v.sku.trim() || `${slug}-${slugify(v.size) || 'free'}-${slugify(v.color) || 'default'}`).toUpperCase(), stock: Math.max(0, parseInt(v.stock === '' ? f.defStock : v.stock, 10) || 0), ...(toPaise(v.cost) ? { cost: toPaise(v.cost) } : {}) })) });
        let made;
        try { made = await api('/admin/products', { method: 'POST', body: payload(base) }) }
        catch (x) { if (x.status !== 409) throw x; made = await api('/admin/products', { method: 'POST', body: payload(`${base}-${Math.random().toString(36).slice(2, 6)}`) }) }
        id = made.id;
        await api(`/admin/pos/products/${id}`, { method: 'PATCH', body: body() }); // best seller, low-stock level and material
        const fresh = (await api('/admin/pos/products?q=' + encodeURIComponent(f.name.trim()))).find(x => x.id === id);
        for (const v of list) { // a size's own selling price
          const sp = toPaise(v.price); const row = fresh?.variants.find(x => x.size === (v.size.trim() || 'Free Size') && x.color === (v.color.trim() || 'Default'));
          if (sp && row) await api(`/admin/pos/products/${id}/variants/${row.id}`, { method: 'PATCH', body: { price: sp } });
        }
        for (const file of files) { const up = await uploadImage(file.file); await api(`/admin/products/${id}/images`, { method: 'POST', body: { url: up.url, alt: f.name.trim() } }) }
      }
      await api(`/admin/pos/products/${id}/suggested`, { method: 'PUT', body: { ids: picked.map(p => p.id) } });
      toast(editing ? 'Product saved.' : 'Product added to the catalog.'); onDone(); onClose();
    } catch (x) { setErr(x.issues?.[0] ? `${x.issues[0].path}: ${x.issues[0].message}` : x.message) } finally { setBusy(false) }
  };
  const pickFiles = list => setFiles(fs => [...fs, ...[...list].filter(x => /^image\//.test(x.type)).map(file => ({ file, url: URL.createObjectURL(file) }))].slice(0, 8));
  return (
    <div className="dpos-modal" role="dialog" aria-modal="true" aria-label={editing ? 'Edit product' : 'Add product'} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <form className="dpos-sheet pe2" onSubmit={submit}>
        <div className="dpos-mhead"><div><b style={{ fontSize: 18 }}>{editing ? 'Edit Product' : 'Add Product'}</b><small>{editing ? product.name : 'New products appear in billing and, when Active, on the website'}</small></div><button type="button" aria-label="Close" onClick={onClose}>✕</button></div>
        <Err>{err}</Err>
        <div className="pe2-top">
          <div className="pe2-l">
            <h3>Basic Details</h3>
            <label className="pe2-f">PRODUCT NAME<input required autoFocus={!editing} value={f.name} maxLength={160} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Kanjivaram Silk Saree · Maroon" /></label>
            <label className="pe2-f">DESCRIPTION<textarea rows={5} maxLength={4000} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="Tell your customers about this product…" /></label>
            <div className="pe2-gh"><h3>Media Gallery</h3>{!editing && <button type="button" className="pe2-up" onClick={() => fileIn.current.click()}>Upload</button>}</div>
            {editing ? <ProductPhotos product={product} onChanged={() => { reload() }} /> : (
              <div className="pe2-ph">{files.map((x, i) => <span key={i} className="pe2-th"><img src={x.url} alt="" /><button type="button" aria-label="Remove photo" onClick={() => setFiles(fs => fs.filter((_, n) => n !== i))}>✕</button></span>)}
                <button type="button" className="pe2-plus" aria-label="Add photos" onClick={() => fileIn.current.click()}>+</button>
                <input ref={fileIn} type="file" hidden multiple accept="image/jpeg,image/png,image/webp" onChange={e => { pickFiles(e.target.files); e.target.value = '' }} /></div>)}
          </div>
          <div className="pe2-r">
            <h3>Organization &amp; Pricing</h3>
            <div className="pe2-g">
              <label className="pe2-f">CATEGORY<select value={f.cat} onChange={e => setF({ ...f, cat: e.target.value })}><option value="">Select category</option>{categories.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></label>
              <label className="pe2-f">STATUS<select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="active">Active (on sale)</option><option value="draft">Draft (hidden)</option>{editing && <option value="archived">Archived</option>}</select></label>
              <label className="pe2-f">SELLING PRICE (₹)<input required inputMode="decimal" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} placeholder="0" /></label>
              <label className="pe2-f">COST PRICE (₹)<input inputMode="decimal" value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} placeholder="What you paid" /></label>
              <label className="pe2-f">GST %<select value={f.tax} onChange={e => setF({ ...f, tax: e.target.value })}>{[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}</select></label>
              <label className="pe2-f">FABRIC / MATERIAL<input value={f.material} maxLength={80} onChange={e => setF({ ...f, material: e.target.value })} placeholder="e.g. Cotton" /></label>
            </div>
            <label className="pe2-c"><input type="checkbox" checked={f.featured} onChange={e => setF({ ...f, featured: e.target.checked })} /> Show in “Trending collections”</label>
            <label className="pe2-c"><input type="checkbox" checked={f.best} onChange={e => setF({ ...f, best: e.target.checked })} /> Show in “Best Sellers”</label>
            <p className="pe2-hint">HOME PAGE SHOWS THE FIRST 4 TICKED, NEWEST FIRST</p>
            <h3 style={{ marginTop: 18 }}>Inventory Alerts</h3>
            <div className="pe2-g">
              {!editing && <label className="pe2-f">DEFAULT STOCK<input type="number" min="0" value={f.defStock} onChange={e => setF({ ...f, defStock: e.target.value })} /></label>}
              <label className="pe2-f">LOW-STOCK ALERT AT<input type="number" min="0" value={f.low} onChange={e => setF({ ...f, low: e.target.value })} /></label>
            </div>
            <p className="pe2-hint">{!editing && 'DEFAULT STOCK FILLS ANY SIZE ROW LEFT EMPTY · '}ALERT IS COMPARED AGAINST THE TOTAL ACROSS ALL VARIANTS</p>
          </div>
        </div>
        <section className="pe2-var">
          <div className="pe2-vh"><div><h3>Product Variants</h3><p className="pe2-hint">MANAGE SIZES, COLOURS AND SPECIFIC INVENTORY</p></div>
            {!editing && <button type="button" className="dpos-btn" onClick={() => setVars(v => [...v, { size: '', color: '', sku: '', price: '', cost: '', stock: '' }])}>+ Add Row</button>}</div>
          {editing ? (
            <>
              <div className="acc-scroll"><table className="dpos-table pe-vars">
                <thead><tr><th>Size</th><th>Colour</th><th>SKU</th><th>Own price ₹</th>{start.costPrice !== undefined && <th>Cost price ₹</th>}<th className="r">Stock</th><th /></tr></thead>
                <tbody>{(product.variants || []).map(v => <VariantRow key={`${v.id}-${v.size}-${v.color}-${v.sku}-${v.priceOverride}-${v.costOverride}-${v.active}`} productId={product.id} v={v} basePrice={product.price} productCost={product.costPrice} canCost={start.costPrice !== undefined} onChanged={reload} setErr={setErr} onlyOne={product.variants.length <= 1} />)}</tbody>
              </table></div>
              <div className="pe-add">
                <input aria-label="New size" placeholder="Size" value={nv.size} onChange={e => setNv({ ...nv, size: e.target.value })} />
                <input aria-label="New colour" placeholder="Colour" value={nv.color} onChange={e => setNv({ ...nv, color: e.target.value })} />
                <input aria-label="New SKU" placeholder="SKU (auto)" value={nv.sku} onChange={e => setNv({ ...nv, sku: e.target.value })} />
                <input aria-label="Opening stock" inputMode="numeric" placeholder="Stock" value={nv.stock} onChange={e => setNv({ ...nv, stock: e.target.value.replace(/\D/g, '') })} />
                <button type="button" className="dpos-btn sm" disabled={!nv.size.trim()} onClick={addVariant}>+ Add size</button>
              </div>
            </>
          ) : (
            <div className="pe2-rows">
              <div className="pe2-rh"><span>SIZE</span><span>COLOUR</span><span>SELLING (₹)</span><span>COST (₹)</span><span>STOCK</span><span /></div>
              {vars.map((v, i) => (
                <div className="pe2-row" key={i}>
                  <input aria-label="Size" placeholder="e.g. M" value={v.size} onChange={e => setV(i, { size: e.target.value })} />
                  <input aria-label="Colour" placeholder="e.g. Blue" value={v.color} onChange={e => setV(i, { color: e.target.value })} />
                  <input aria-label="Selling price" inputMode="decimal" placeholder="Same" value={v.price} onChange={e => setV(i, { price: e.target.value })} />
                  <input aria-label="Cost price" inputMode="decimal" placeholder="Same" value={v.cost} onChange={e => setV(i, { cost: e.target.value })} />
                  <input aria-label="Stock" inputMode="numeric" placeholder="0" value={v.stock} onChange={e => setV(i, { stock: e.target.value.replace(/\D/g, '') })} />
                  <button type="button" aria-label="Remove row" disabled={vars.length === 1} onClick={() => setVars(vs => vs.filter((_, n) => n !== i))}><Icon n="trash" size={16} /></button>
                </div>))}
            </div>)}
        </section>
        <SuggestPicker selfId={start?.id} picked={picked} setPicked={setPicked} />
        <div className="pe2-foot"><button type="button" className="dpos-btn ghost" onClick={onClose}>Cancel</button><button className="dpos-btn lg" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save Changes' : 'Add to Catalog'}</button></div>
      </form>
    </div>
  );
}

// Stock Alert: products that need attention (out of stock, low, or with a sold-out size) with one-tap restock buttons.
function AlertsModal({ list, onClose, onDone, canStock, onEdit }) {
  const [err, setErr] = useState();
  const lowOf = p => p.lowAlert ?? LOW;
  const items = list.filter(p => p.stock < 1 || p.stock <= lowOf(p) || p.variants.some(v => v.active && v.stock < 1));
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose]);
  const add = async (v, qty) => { try { await api('/admin/pos/stock', { method: 'POST', body: { variantId: v.id, type: 'restock', qty } }); onDone() } catch (e) { setErr(e.message) } };
  return (
    <div className="dpos-modal" role="dialog" aria-modal="true" aria-label="Stock Alert" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="sa">
        <div className="sa-head"><span className="sa-ic"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3.5 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.4v.1" /></svg></span>
          <div><h2>Stock Alert</h2><p>{items.length ? `${items.length} product${items.length > 1 ? 's' : ''} need attention` : 'Everything is stocked'}</p></div></div>
        <Err>{err}</Err>
        <div className="inv-al">{items.map(p => (
          <div key={p.id} className={`inv-al-c ${p.stock < 1 ? 'out' : ''}`}>
            <div className="inv-al-h"><div><b>{p.name}</b><small>{p.category || 'Uncategorised'} · <strong>{p.stock} units in total</strong> · alert at {lowOf(p)} or fewer</small></div>{onEdit && <button type="button" className="sa-edit" onClick={() => onEdit(p)}>Edit</button>}</div>
            {p.variants.filter(v => v.active && v.stock <= 1).map(v => (
              <div key={v.id} className="inv-al-r"><span>{v.size}{v.color !== 'Default' ? ` / ${v.color}` : ''} · {v.stock < 1 ? 'sold out' : `${v.stock} left`}</span>
                {canStock && <span>{[1, 5, 10].map(n => <button key={n} type="button" onClick={() => add(v, n)}>+{n}</button>)}</span>}</div>))}
          </div>))}</div>
        <button type="button" className="sa-dismiss" onClick={onClose}>Dismiss</button>
      </div>
    </div>
  );
}

export default function PosInventory({ manager, stocker }) {
  const [tab, setTab] = useState('products');
  const snapshot = async () => {
    const list = await api('/admin/pos/products?q=');
    downloadCsv('stock-snapshot.csv', ['Product', 'Category', 'Size', 'Colour', 'SKU', 'Stock', 'Price (₹)'], list.flatMap(p => p.variants.map(v => [p.name, p.category || '', v.size, v.color, v.sku, v.stock, (p.price / 100).toFixed(2)])));
  };
  return (
    <>
      <div className="inv-tabs" role="tablist" aria-label="Inventory sections">
        <button role="tab" aria-selected={tab === 'products'} className={tab === 'products' ? 'on' : ''} onClick={() => setTab('products')}><Icon n="box" size={16} /> Products &amp; Stock</button>
        <button role="tab" aria-selected={tab === 'moves'} className={tab === 'moves' ? 'on' : ''} onClick={() => setTab('moves')}><Icon n="clock" size={16} /> Stock Movements</button>
      </div>
      {tab === 'products' ? <ProductsStock manager={manager} stocker={stocker} /> : <StockMovements onSnapshot={snapshot} />}
    </>
  );
}
