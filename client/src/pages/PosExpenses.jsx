import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import { useApp } from '../context/App';
import { Icon } from '../components/AdminShell';
import { PeriodFilter, periodRange, todayStr, usePeriod } from '../components/PeriodFilter';

const toPaise = s => { const n = Math.round(parseFloat(String(s || '').replace(/,/g, '')) * 100); return Number.isFinite(n) && n > 0 ? n : 0 };
const MODES = [['cash', 'CASH'], ['upi', 'QR / GPAY'], ['card', 'CARD']];
const dmy = d => d ? String(d).split('-').reverse().join('-') : '';

// Expense Tracker: record what the shop spends. Expenses are taken off sales to give the real net profit on the analytics dashboard.
export default function PosExpenses() {
  const { toast } = useApp();
  const [per, setPer] = usePeriod('month'); const [rows, setRows] = useState(null); const [cats, setCats] = useState([]); const [err, setErr] = useState();
  const [f, setF] = useState({ title: '', amount: '', date: todayStr(), category: '', mode: 'cash', notes: '' });
  const [manage, setManage] = useState(false); const [newCat, setNewCat] = useState(''); const [fc, setFc] = useState('all'); const [q, setQ] = useState(''); const [busy, setBusy] = useState(false);
  const [from, to] = periodRange(per);
  const load = useCallback(() => api(`/admin/pos/expenses?from=${from}&to=${to}`).then(r => { setRows(r); setErr() }).catch(e => setErr(e.message)), [from, to]);
  const loadCats = useCallback(() => api('/admin/pos/expense-categories').then(c => { setCats(c); setF(x => ({ ...x, category: x.category && c.includes(x.category) ? x.category : (c[0] || 'General') })) }).catch(e => setErr(e.message)), []);
  useEffect(() => { load() }, [load]);
  useEffect(() => { loadCats() }, [loadCats]);

  const total = (rows || []).reduce((s, x) => s + x.amount, 0);
  const byCat = useMemo(() => { const m = new Map(); for (const x of rows || []) m.set(x.category, (m.get(x.category) || 0) + x.amount); return [...m].sort((a, b) => b[1] - a[1]) }, [rows]);
  const shown = (rows || []).filter(x => (fc === 'all' || x.category === fc) && (!q.trim() || `${x.title} ${x.category} ${x.notes || ''}`.toLowerCase().includes(q.trim().toLowerCase())));
  const logCats = [...new Set([...cats, ...(rows || []).map(x => x.category)])].sort();

  const add = async e => {
    e.preventDefault(); setErr(); setBusy(true);
    try { await api('/admin/pos/expenses', { method: 'POST', body: { title: f.title.trim(), category: f.category || 'General', amount: toPaise(f.amount), paymentMode: f.mode, date: f.date, notes: f.notes.trim() || null } }); setF({ ...f, title: '', amount: '', notes: '' }); toast('Expense added.'); load() }
    catch (x) { setErr(x.issues?.[0]?.message || (x.message === 'Validation failed' ? 'Enter what it was for and an amount above ₹0.' : x.message)) } finally { setBusy(false) }
  };
  const del = async x => { if (!confirm(`Delete expense “${x.title}”?`)) return; try { await api('/admin/pos/expenses/' + x.id, { method: 'DELETE' }); toast('Expense deleted.'); load() } catch (e) { setErr(e.message) } };
  const addCat = async e => { e.preventDefault(); setErr(); try { const c = await api('/admin/pos/expense-categories', { method: 'POST', body: { name: newCat.trim() } }); setCats(c); setNewCat(''); toast('Category added.') } catch (x) { setErr(x.message) } };
  const delCat = async name => { if (!confirm(`Remove the category “${name}”? Expenses already saved under it keep their name.`)) return; try { setCats(await api('/admin/pos/expense-categories?name=' + encodeURIComponent(name), { method: 'DELETE' })) } catch (x) { setErr(x.message) } };

  return (
    <div className="ex">
      <div className="ex-top"><span /><PeriodFilter value={per} onChange={setPer} /></div>
      {err && <p className="dpos-err" role="alert">{err}</p>}
      <div className="ex-kpis">
        <div className="ex-k big"><span>TOTAL EXPENSES</span><b>{inr(total)}</b><small>{per.p === 'all' ? 'ALL TIME' : String(per.p || 'PERIOD').toUpperCase()}</small></div>
        <div className="ex-k"><span>ENTRIES</span><b>{rows ? rows.length : '…'}</b><small>Expenses recorded</small></div>
        <div className="ex-k"><span>TOP CATEGORY</span><b>{byCat[0]?.[0] || 'None'}</b><small>{byCat[0] ? `${inr(byCat[0][1])} spent` : 'Highest spend'}</small></div>
      </div>
      <div className="ex-two">
        <form className="ex-card" onSubmit={add}><h3 className="ex-h">ADD EXPENSE</h3>
          <label className="ex-l">WHAT FOR?<input required maxLength={120} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="e.g. October shop rent" /></label>
          <div className="ex-g2"><label className="ex-l">AMOUNT (₹)<input required inputMode="decimal" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} placeholder="0.00" /></label>
            <label className="ex-l">DATE<input type="date" max={todayStr()} value={f.date} onChange={e => setF({ ...f, date: e.target.value || todayStr() })} /></label></div>
          <label className="ex-l">CATEGORY<select value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{cats.map(c => <option key={c}>{c}</option>)}</select></label>
          <button type="button" className="ex-link" onClick={() => setManage(true)}>Add or manage categories</button>
          <p className="ex-l" style={{ margin: '10px 0 6px' }}>PAID VIA</p>
          <div className="ex-modes" role="radiogroup" aria-label="Paid via">{MODES.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={f.mode === v} className={f.mode === v ? 'on' : ''} onClick={() => setF({ ...f, mode: v })}>{l}</button>)}</div>
          <label className="ex-l">NOTES (OPTIONAL)<input maxLength={300} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="Reference / supplier / bill no." /></label>
          <button className="ex-add" disabled={busy}>+ ADD EXPENSE</button></form>
        <section className="ex-card"><div className="ex-ch"><h3 className="ex-h">SPEND BY CATEGORY</h3><button type="button" className="ex-man" onClick={() => setManage(m => !m)}><Icon n="gear" size={15} /> {manage ? 'CLOSE' : 'MANAGE'}</button></div>
          {manage ? (
            <div className="ex-mgr">
              <form className="ex-add-cat" onSubmit={addCat}><b><Icon n="tag" size={16} /> Add Category</b><label className="ex-l">Category Name *<input required maxLength={60} value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="e.g. Utility Bills, Packaging" /></label><button className="ex-add" disabled={!newCat.trim()}>+ ADD CATEGORY</button></form>
              <div className="ex-cats"><div className="ex-cats-h">Expense Categories ({cats.length})</div>
                <ul>{cats.map(c => <li key={c}><b>{c}</b><span className="ex-on">Active</span><button type="button" aria-label={`Remove ${c}`} onClick={() => delCat(c)}><Icon n="trash" size={16} /></button></li>)}</ul></div>
            </div>
          ) : !byCat.length ? (
            <div className="ex-empty"><span className="ex-pig"><Icon n="wallet" size={26} /></span><b>No expenses in this period yet.</b><p>Add your first expense to see the breakdown.</p></div>
          ) : (
            <ul className="ex-bars">{byCat.map(([c, a]) => <li key={c}><span>{c}</span><i><u style={{ width: `${a / byCat[0][1] * 100}%` }} /></i><b>{inr(a)}</b></li>)}</ul>
          )}
        </section>
      </div>
      <section className="ex-card ex-log"><div className="ex-ch"><h3 className="ex-h">≡ EXPENSE LOG</h3>
        <div className="ex-fl"><select value={fc} onChange={e => setFc(e.target.value)} aria-label="Category filter"><option value="all">All categories</option>{logCats.map(c => <option key={c}>{c}</option>)}</select>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search expenses…" aria-label="Search expenses" /></div></div>
        {!rows ? <p className="dpos-empty">Loading…</p> : !shown.length ? <div className="ex-empty"><span className="ex-pig"><Icon n="wallet" size={26} /></span><b>No expenses found.</b><p>Try a different period or add a new expense.</p></div> : (
          <div className="dpos-tw"><table><thead><tr><th>Date</th><th>Expense</th><th>Category</th><th>Paid via</th><th className="r">Amount</th><th /></tr></thead>
            <tbody>{shown.map(x => <tr key={x.id}><td>{dmy(x.date)}</td><td><b>{x.title}</b>{x.notes && <div className="muted small">{x.notes}</div>}</td><td><span className="ex-chip">{x.category}</span></td><td>{{ cash: 'Cash', upi: 'QR / GPay', card: 'Card' }[x.paymentMode]}</td><td className="r ex-amt">{inr(x.amount)}</td><td className="r"><button type="button" className="dpos-btn danger sm" onClick={() => del(x)}>Delete</button></td></tr>)}</tbody></table></div>)}
      </section>
    </div>
  );
}
