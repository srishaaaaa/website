import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { inr } from '../lib/format';

// "Catalog" window on the billing screen: pick one or more pieces (name / SKU / size / colour search, or scan a barcode and press Enter),
// then OK adds them all to the bill in one go. Quantities are capped at the stock left.
export default function CatalogPicker({ onClose, onPick }) {
  const [q, setQ] = useState(''); const [cat, setCat] = useState('all'); const [list, setList] = useState(null); const [err, setErr] = useState();
  const [sel, setSel] = useState({}); // variantId -> { v, qty }
  useEffect(() => {
    const t = setTimeout(() => api('/admin/pos/catalog?limit=300&q=' + encodeURIComponent(q)).then(r => { setList(r); setErr() }).catch(e => setErr(e.message)), 180);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose]);
  const cats = useMemo(() => [...new Set((list || []).map(v => v.category).filter(Boolean))].sort(), [list]);
  const shown = (list || []).filter(v => cat === 'all' || v.category === cat);
  const set = (v, qty) => setSel(s => { const n = { ...s }; if (qty < 1) delete n[v.variantId]; else n[v.variantId] = { v, qty: Math.min(qty, v.stock) }; return n });
  const picked = Object.values(sel), count = picked.reduce((a, x) => a + x.qty, 0), total = picked.reduce((a, x) => a + x.qty * x.v.price, 0);
  const onEnter = e => {
    if (e.key !== 'Enter' || !list) return;
    const exact = list.find(v => v.sku.toLowerCase() === q.trim().toLowerCase());
    if (exact && exact.stock > 0) { set(exact, (sel[exact.variantId]?.qty || 0) + 1); setQ('') }
  };
  return (
    <div className="dpos-modal" role="dialog" aria-modal="true" aria-label="Catalog" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="dpos-sheet wide cpk">
        <div className="dpos-mhead"><div><b style={{ fontSize: 17 }}>Add products to the bill</b><small>Pick one or more, then press OK</small></div><button type="button" aria-label="Close" onClick={onClose}>✕</button></div>
        <input className="cpk-search" autoFocus type="search" value={q} onChange={e => setQ(e.target.value)} onKeyDown={onEnter} placeholder="Search name, SKU, size or colour, or scan a barcode and press Enter" aria-label="Search the catalog" />
        <div className="cpk-chips" role="group" aria-label="Category">
          {['all', ...cats].map(c => <button key={c} type="button" className={cat === c ? 'on' : ''} aria-pressed={cat === c} onClick={() => setCat(c)}>{c === 'all' ? 'All' : c}</button>)}
        </div>
        {err && <p className="dpos-err" role="alert">{err}</p>}
        <div className="cpk-grid">
          {list === null ? <p className="muted">Loading…</p> : !shown.length ? <p className="muted">No products match.</p> : shown.map(v => {
            const n = sel[v.variantId]?.qty || 0, out = v.stock < 1;
            return (
              <div key={v.variantId} className={`cpk-row ${out ? 'out' : ''} ${n ? 'on' : ''}`}>
                {v.image ? <img src={v.image} alt="" loading="lazy" /> : <img alt="" />}
                <span className="cpk-info"><b>{v.name}</b><em>{inr(v.price)}{v.size && v.size !== 'Default' ? ` · ${v.size}` : ''}{v.color && v.color !== 'Default' ? ` · ${v.color}` : ''} · {out ? 'Out of stock' : `${v.stock} in stock`}</em></span>
                {n === 0
                  ? <button type="button" className="cpk-add" disabled={out} onClick={() => set(v, 1)}>+ Add</button>
                  : <span className="cpk-step"><button type="button" aria-label="Fewer" onClick={() => set(v, n - 1)}>−</button><b>{n}</b><button type="button" aria-label="More" disabled={n >= v.stock} onClick={() => set(v, n + 1)}>+</button></span>}
              </div>);
          })}
        </div>
        <div className="cpk-foot"><span>{count} {count === 1 ? 'item' : 'items'} · {inr(total)}</span>
          <div><button type="button" className="dpos-btn ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="dpos-btn" disabled={!count} onClick={() => onPick(picked.map(x => ({ v: x.v, qty: x.qty })))}>OK</button></div></div>
      </div>
    </div>
  );
}
