import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import Modal from './Modal';

const toPaise = s => { const n = Math.round(parseFloat(String(s || '').replace(/,/g, '')) * 100); return Number.isFinite(n) && n > 0 ? n : 0 };
const rupees = p => (p / 100).toFixed(2).replace(/\.00$/, '');
const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const Err = ({ children }) => children ? <p className="dpos-err" role="alert">{children}</p> : null;

// One colour option = a row of sizes with opening stock, optionally with its own price.
export const colourGroups = p => { const m = new Map(); for (const v of p.variants) { const g = m.get(v.color) || { name: v.color, stock: 0, price: v.price, sizes: [] }; g.stock += v.stock; g.sizes.push(v.size); m.set(v.color, g) } return [...m.values()] };

export function ColourModal({ product, onClose, onDone }) {
  const sizes0 = [...new Set(product.variants.map(v => v.size))];
  const [color, setColor] = useState(''); const [price, setPrice] = useState(''); const [rows, setRows] = useState((sizes0.length ? sizes0 : ['Free Size']).map(size => ({ size, stock: '' })));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  const submit = async e => {
    e.preventDefault(); setBusy(true); setErr();
    try { await api(`/admin/pos/products/${product.id}/colours`, { method: 'POST', body: { color: color.trim(), price: price.trim() ? toPaise(price) : null, sizes: rows.filter(r => r.size.trim()).map(r => ({ size: r.size.trim(), stock: parseInt(r.stock, 10) || 0 })) } }); onDone(); onClose() }
    catch (x) { setErr(x.issues?.[0]?.message || x.message) } finally { setBusy(false) }
  };
  return (
    <Modal title="Add colour option" sub={product.name} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <div className="dpos-grid">
          <label className="f">Colour name<input required autoFocus value={color} maxLength={40} onChange={e => setColor(e.target.value)} placeholder="e.g. Wine Purple" /></label>
          <label className="f">Price for this colour ₹ (optional)<input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder={rupees(product.price)} /></label>
        </div>
        <div className="dpos-box"><b>Sizes &amp; stock for this colour</b>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginTop: 10 }}>
              <input aria-label="Size" placeholder="Size" value={r.size} onChange={e => setRows(x => x.map((y, n) => n === i ? { ...y, size: e.target.value } : y))} />
              <input aria-label="Opening stock" inputMode="numeric" placeholder="Stock" value={r.stock} onChange={e => setRows(x => x.map((y, n) => n === i ? { ...y, stock: e.target.value.replace(/\D/g, '') } : y))} />
              <button type="button" className="dpos-btn ghost sm" aria-label="Remove size" disabled={rows.length === 1} onClick={() => setRows(x => x.filter((_, n) => n !== i))}>✕</button></div>))}
          <button type="button" className="dpos-btn ghost sm" style={{ marginTop: 10 }} onClick={() => setRows(x => [...x, { size: '', stock: '' }])}>+ Add size</button></div>
        <p className="sub">After adding the colour, set each photo’s “Shows for” colour under its photos, so shoppers see that colour’s photos when they pick it.</p>
        <Err>{err}</Err>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" className="dpos-btn ghost" onClick={onClose}>Cancel</button><button className="dpos-btn" disabled={busy}>{busy ? 'Adding…' : 'Add colour'}</button></div>
      </form>
    </Modal>
  );
}

// A single new size for an existing colour (or a brand-new size/colour pair).
export function SizeModal({ product, onClose, onDone }) {
  const colours = colourGroups(product).map(c => c.name);
  const [color, setColor] = useState(colours[0] || 'Default'); const [size, setSize] = useState(''); const [stock, setStock] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState();
  const submit = async e => {
    e.preventDefault(); setBusy(true); setErr();
    try { await api(`/admin/pos/products/${product.id}/variants`, { method: 'POST', body: { size: size.trim(), color, sku: `${product.slug}-${slugify(color) || 'default'}-${slugify(size)}`.toUpperCase(), stock: parseInt(stock, 10) || 0 } }); onDone(); onClose() }
    catch (x) { setErr(x.issues?.[0]?.message || x.message) } finally { setBusy(false) }
  };
  return (
    <Modal title="Add size" sub={product.name} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <div className="dpos-grid">
          <label className="f">Colour<select value={color} onChange={e => setColor(e.target.value)}>{colours.map(c => <option key={c}>{c}</option>)}</select></label>
          <label className="f">Size<input required autoFocus value={size} maxLength={40} onChange={e => setSize(e.target.value)} placeholder="e.g. XL, Free Size, 5.5 m" /></label>
          <label className="f">Opening stock<input inputMode="numeric" value={stock} onChange={e => setStock(e.target.value.replace(/\D/g, ''))} placeholder="0" /></label>
        </div>
        <Err>{err}</Err>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" className="dpos-btn ghost" onClick={onClose}>Cancel</button><button className="dpos-btn" disabled={busy}>{busy ? 'Adding…' : 'Add size'}</button></div>
      </form>
    </Modal>
  );
}

// "Colours & sizes" card for the Products & images page: see the options, add a colour, add a size, remove a colour.
export default function ColourPanel({ productId, onChanged }) {
  const [p, setP] = useState(null); const [modal, setModal] = useState(null); const [err, setErr] = useState();
  const load = useCallback(() => api(`/admin/pos/products/${productId}`).then(x => { setP(x); setErr() }).catch(e => setErr(e.message)), [productId]);
  useEffect(() => { setP(null); load() }, [load]);
  const changed = () => { load(); onChanged?.() };
  const remove = async name => {
    if (!confirm(`Remove the colour “${name}” and all its sizes from ${p.name}? Past bills keep their own copy.`)) return;
    try { await api(`/admin/pos/products/${p.id}/colours?color=${encodeURIComponent(name)}`, { method: 'DELETE' }); changed() } catch (e) { setErr(e.message) }
  };
  if (!p) return err ? <Err>{err}</Err> : null;
  const groups = colourGroups(p);
  return (
    <section className="dpos-card" style={{ marginBottom: 14 }} aria-label="Colours and sizes">
      <div className="dpos-head" style={{ marginBottom: 10 }}>
        <h2 style={{ marginBottom: 0 }}>Colours &amp; sizes</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="dpos-btn sm" onClick={() => setModal('colour')}>+ Add colour</button><button type="button" className="dpos-btn ghost sm" onClick={() => setModal('size')}>+ Add size</button></div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{groups.map(c => (
        <span key={c.name} className="dpos-pill" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', padding: '8px 12px', fontSize: 11 }}>
          {c.name} · {c.sizes.join(', ')} · {c.stock} in stock{c.price !== p.price ? ` · ${inr(c.price)}` : ''}
          {groups.length > 1 && <button type="button" aria-label={`Remove colour ${c.name}`} style={{ color: '#b3261e', fontWeight: 800 }} onClick={() => remove(c.name)}>✕</button>}</span>))}</div>
      <Err>{err}</Err>
      {modal === 'colour' && <ColourModal product={p} onClose={() => setModal(null)} onDone={changed} />}
      {modal === 'size' && <SizeModal product={p} onClose={() => setModal(null)} onDone={changed} />}
    </section>
  );
}
