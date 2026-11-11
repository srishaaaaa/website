import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../context/App';

// Admin → Trending: two boards side by side.
//   Trending collections: up to 4 pieces, in order, shown on the homepage (saved with "Save trending").
//   Best Sellers: up to 10 pieces flagged "Best seller" (changes apply at once).
// Each board has its own search, category chips and product list with "+ Add".
const TREND_MAX = 4, BEST_MAX = 10;

function Thumb({ p }) { return p.image ? <img src={p.image} alt="" /> : <span className="tb-ph" aria-hidden="true" /> }

function Picker({ title, hint, products, cats, taken, full, onAdd }) {
  const [q, setQ] = useState(''); const [cat, setCat] = useState('all');
  const shown = useMemo(() => products.filter(p => !taken.has(p.slug) && (cat === 'all' || p.categorySlug === cat) && (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 60), [products, taken, cat, q]);
  return (
    <div className="tb-pick">
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={hint} aria-label={hint} />
      <div className="tb-cats" role="group" aria-label="Category">
        {[['all', 'All'], ...cats].map(([k, l]) => <button key={k} type="button" className={cat === k ? 'on' : ''} aria-pressed={cat === k} onClick={() => setCat(k)}>{l}</button>)}
      </div>
      <ul className="tb-list">
        {shown.map(p => (
          <li key={p.id} className="tb-row"><Thumb p={p} /><span><b>{p.name}</b><small>{p.category || 'Uncategorised'}</small></span>
            <button type="button" className="tb-btn" disabled={full} onClick={() => onAdd(p)}>+ Add</button></li>))}
        {!shown.length && <li className="tb-none">No products to add.</li>}
      </ul>
    </div>
  );
}

export default function TrendingBoard() {
  const { site, catalog, loadSite, loadCatalog, toast } = useApp();
  const hp = site.homepage || { trending: [], collections: [], categories: [] };
  const [products, setProducts] = useState(null); const [err, setErr] = useState(); const [busy, setBusy] = useState(false);
  const [trend, setTrend] = useState(() => (hp.trending?.length ? hp.trending : (catalog.featured || []).map(p => p.slug)).slice(0, TREND_MAX));
  useEffect(() => { api('/admin/pos/products').then(r => setProducts(r.items || r)).catch(e => setErr(e.message)) }, []);
  useEffect(() => { if (hp.trending?.length) setTrend(hp.trending.slice(0, TREND_MAX)) }, [site.homepage]); // eslint-disable-line
  const bySlug = useMemo(() => new Map((products || []).map(p => [p.slug, p])), [products]);
  const cats = useMemo(() => { const m = new Map(); (products || []).forEach(p => p.categorySlug && m.set(p.categorySlug, p.category)); return [...m.entries()] }, [products]);
  const best = (products || []).filter(p => p.bestSeller);
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= trend.length) return; const n = [...trend];[n[i], n[j]] = [n[j], n[i]]; setTrend(n) };
  const save = async () => {
    setBusy(true); setErr();
    try { await api('/admin/settings/homepage', { method: 'PUT', body: { trending: trend, collections: hp.collections || [], categories: hp.categories || [] } }); toast('Trending collections saved.'); loadSite(); loadCatalog() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  };
  const flag = async (p, value) => {
    try { await api(`/admin/pos/products/${p.id}/best-seller`, { method: 'PATCH', body: { value } }); toast(value ? 'Added to Best Sellers.' : 'Removed from Best Sellers.'); const r = await api('/admin/pos/products'); setProducts(r.items || r) } catch (e) { setErr(e.message) }
  };
  const rowOf = (slug) => bySlug.get(slug) || { slug, name: slug, image: null, id: slug };
  return (
    <>
      {err && <p role="alert" className="dpos-err" style={{ gridColumn: '1 / -1' }}>{err}</p>}
      <section className="adm-block tb">
        <h3 className="tb-h">Trending collections ({trend.length} of {TREND_MAX})</h3>
        <p className="sub">The pieces shown in “Trending collections” on the homepage, in this order.</p>
        <ul className="tb-list sel">
          {trend.map((slug, i) => { const p = rowOf(slug); return (
            <li key={slug} className="tb-row"><Thumb p={p} /><b>{p.name}</b>
              <span className="tb-act"><button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button><button type="button" aria-label="Move down" disabled={i === trend.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button type="button" className="tb-btn" onClick={() => setTrend(trend.filter(s => s !== slug))}>Remove</button></span></li>) })}
          {!trend.length && <li className="tb-none">Nothing picked yet, so the homepage shows your featured pieces.</li>}
        </ul>
        <button type="button" className="dpos-btn outline" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save trending'}</button>
        {!products ? <p className="muted">Loading products…</p> : <Picker products={products} cats={cats} taken={new Set(trend)} full={trend.length >= TREND_MAX} hint="Search a product to add to Trending…" onAdd={p => setTrend([...trend, p.slug])} />}
      </section>
      <section className="adm-block tb">
        <h3 className="tb-h">Best Sellers ({best.length} of {BEST_MAX})</h3>
        <p className="sub">Products marked Best Seller, shown in “Best Sellers” on the homepage (the {BEST_MAX} newest are kept).</p>
        <ul className="tb-list sel">
          {best.map(p => <li key={p.id} className="tb-row"><Thumb p={p} /><b>{p.name}</b><span className="tb-act"><button type="button" className="tb-btn" onClick={() => flag(p, false)}>Remove</button></span></li>)}
          {products && !best.length && <li className="tb-none">None marked yet, so the homepage shows the newest pieces.</li>}
        </ul>
        {products && <Picker products={products} cats={cats} taken={new Set(best.map(p => p.slug))} full={false} hint="Search a product to add to Best Sellers…" onAdd={p => flag(p, true)} />}
      </section>
    </>
  );
}
