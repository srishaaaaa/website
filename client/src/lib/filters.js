import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const list = v => (v ? v.split(',').filter(Boolean) : []);
const num = v => (v === null || v === '' || isNaN(+v) ? null : +v);

// Filter + sort state lives in the URL so views are shareable and back-button friendly.
// Filtering itself happens on the server (GET /api/products).
export function useFilters() {
  const [sp, setSp] = useSearchParams();
  const f = useMemo(() => ({
    category: list(sp.get('category')), material: list(sp.get('material')), size: list(sp.get('size')), color: list(sp.get('color')),
    min: num(sp.get('min')), max: num(sp.get('max')), stock: sp.get('stock') === '1',
    sort: sp.get('sort') || 'featured', view: sp.get('view') === '3' ? 3 : 2,
  }), [sp]);

  const set = patch => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      const empty = v == null || v === '' || v === false || (Array.isArray(v) && !v.length) || (k === 'sort' && v === 'featured') || (k === 'view' && v === 2);
      if (empty) n.delete(k); else n.set(k, Array.isArray(v) ? v.join(',') : v === true ? '1' : String(v));
    }
    setSp(n, { replace: true });
  };
  const clear = () => { const n = new URLSearchParams(); if (sp.get('q')) n.set('q', sp.get('q')); setSp(n, { replace: true }) };
  const count = f.category.length + f.material.length + f.size.length + f.color.length + (f.min != null ? 1 : 0) + (f.max != null ? 1 : 0) + (f.stock ? 1 : 0);
  return { f, set, clear, count };
}

// Maps UI filter state to the API query string.
export function toQuery(f, base = {}, page = 1, limit = 12) {
  const p = new URLSearchParams();
  if (base.collection) p.set('collection', base.collection);
  if (base.q) p.set('q', base.q);
  if (f.category.length) p.set('category', f.category.join(','));
  if (f.material.length) p.set('material', f.material.join(','));
  if (f.size.length) p.set('size', f.size.join(','));
  if (f.color.length) p.set('color', f.color.join(','));
  if (f.min != null) p.set('min', Math.round(f.min * 100));
  if (f.max != null) p.set('max', Math.round(f.max * 100));
  if (f.stock) p.set('stock', '1');
  p.set('sort', f.sort); p.set('page', page); p.set('limit', limit);
  return p;
}
