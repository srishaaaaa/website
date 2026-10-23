import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../context/App';
import { useModal } from '../lib/hooks';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import { ProductMedia } from './ProductCard';

const HKEY = 'dhanya.searches';
const readHist = () => { try { return JSON.parse(localStorage.getItem(HKEY) || '[]') } catch { return [] } };
const EMPTY = { products: [], categories: [], collections: [] };

export default function SearchOverlay() {
  const { searchOpen, setSearchOpen, catalog } = useApp();
  const nav = useNavigate();
  const ref = useRef();
  const close = () => setSearchOpen(false);
  useModal(searchOpen, close, ref);
  const [q, setQ] = useState('');
  const [hist, setHist] = useState(readHist);
  const [cursor, setCursor] = useState(-1);
  const [res, setRes] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (searchOpen) { setQ(''); setCursor(-1); setRes(EMPTY); setHist(readHist()) } }, [searchOpen]);

  // Live suggestions from the server, debounced; stale responses are ignored.
  const term = q.trim();
  useEffect(() => {
    if (!term) { setRes(EMPTY); setBusy(false); return }
    let dead = false; setBusy(true);
    const t = setTimeout(() => {
      api('/search/suggest?q=' + encodeURIComponent(term)).then(d => !dead && setRes(d)).catch(() => !dead && setRes(EMPTY)).finally(() => !dead && setBusy(false));
    }, 180);
    return () => { dead = true; clearTimeout(t) };
  }, [term]);

  const { products: prods, categories: cats, collections: cols } = res;
  const options = [
    ...prods.map(p => ({ key: 'p' + p.id, to: `/product/${p.slug}` })),
    ...cats.map(c => ({ key: 'c' + c.slug, to: `/shop?category=${c.slug}` })),
    ...cols.map(c => ({ key: 'o' + c.slug, to: `/collections/${c.slug}` })),
    ...(term ? [{ key: 'all', to: `/search?q=${encodeURIComponent(term)}` }] : []),
  ];
  const remember = text => { if (!text) return; const h = [text, ...readHist().filter(x => x !== text)].slice(0, 6); try { localStorage.setItem(HKEY, JSON.stringify(h)) } catch { /* ignore */ } };
  const go = (to, text) => { remember(text ?? term); close(); nav(to) };
  const onKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(options.length - 1, c + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(-1, c - 1)) }
    else if (e.key === 'Enter' && term) { e.preventDefault(); go(options[cursor]?.to || `/search?q=${encodeURIComponent(term)}`) }
  };
  const clearHist = () => { try { localStorage.removeItem(HKEY) } catch { /* ignore */ } setHist([]) };
  const active = k => options[cursor]?.key === k;
  const none = term && !busy && !prods.length && !cats.length && !cols.length;
  const catRow = (key, label, kind, to) => (
    <button key={key} id={'so-' + key} role="option" aria-selected={active(key)} className={`s-item cat ${active(key) ? 'on' : ''}`} onClick={() => go(to)}>
      <span className="s-text"><span className="eyebrow">{kind}</span><span className="serif">{label}</span></span><span aria-hidden="true">→</span>
    </button>
  );

  return (
    <AnimatePresence>
      {searchOpen && (
        <div className="overlay-root top">
          <motion.div className="scrim" onClick={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div ref={ref} className="search glass" role="dialog" aria-modal="true" aria-label="Search"
            initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
            <div className="search-bar">
              <input data-autofocus type="search" role="combobox" aria-expanded={!!term} aria-controls="search-list" aria-activedescendant={cursor >= 0 ? 'so-' + options[cursor].key : undefined}
                aria-label="Search DHANYA" placeholder="Search sarees, kurtas, dresses…" value={q} onChange={e => { setQ(e.target.value); setCursor(-1) }} onKeyDown={onKey} autoComplete="off" />
              <button className="icon-btn" onClick={close} aria-label="Close search">✕</button>
            </div>
            <div className="search-body" id="search-list" role="listbox" aria-label="Suggestions" aria-busy={busy}>
              {!term && (
                <>
                  {hist.length > 0 ? (
                    <section><div className="row between"><h3 className="eyebrow">Recent searches</h3><button className="link-u small" onClick={clearHist}>Clear</button></div>
                      <div className="chips">{hist.map(h => <button key={h} className="chip" onClick={() => setQ(h)}>{h}</button>)}</div></section>
                  ) : <p className="muted">Start typing to search the collection.</p>}
                  {catalog.collections.length > 0 && <section><h3 className="eyebrow">Browse</h3><div className="chips">{catalog.collections.slice(0, 6).map(c => <button key={c.slug} className="chip" onClick={() => go(`/collections/${c.slug}`, '')}>{c.name}</button>)}</div></section>}
                </>
              )}
              {term && busy && !prods.length && <p className="muted small">Searching…</p>}
              {none && <div className="empty small"><p className="serif big">Nothing found for “{term}”.</p><p className="muted">Check the spelling, or browse everything.</p></div>}
              {prods.map(p => (
                <button key={p.id} id={'so-p' + p.id} role="option" aria-selected={active('p' + p.id)} className={`s-item ${active('p' + p.id) ? 'on' : ''}`} onClick={() => go(`/product/${p.slug}`)}>
                  <span className="s-thumb"><ProductMedia p={p} /></span>
                  <span className="s-text"><span className="serif">{p.name}</span><span className="muted small">{p.category}</span></span>
                  <span>{inr(p.price)}</span>
                </button>
              ))}
              {cats.map(c => catRow('c' + c.slug, c.name, 'Category', `/shop?category=${c.slug}`))}
              {cols.map(c => catRow('o' + c.slug, c.name, 'Collection', `/collections/${c.slug}`))}
              {term && (
                <button id="so-all" role="option" aria-selected={active('all')} className={`s-item cat ${active('all') ? 'on' : ''}`} onClick={() => go(`/search?q=${encodeURIComponent(term)}`)}>
                  <span className="s-text"><span className="serif">See all results for “{term}”</span></span><span aria-hidden="true">↵</span>
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
