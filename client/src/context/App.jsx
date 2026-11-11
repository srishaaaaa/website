import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, apiRetry } from '../lib/api';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage unavailable */ } };
const EMPTY_CART = { items: [], count: 0, subtotal: 0, shipping: { amount: 0, freeOver: null }, hasIssues: false };

export function AppProvider({ children }) {
  // --- entry preference: full cinematic intro only on a first visit -------------
  const [entered, setEntered] = useState(() => {
    try {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
      if (/^\/(admin|invoice|coupon)(\/|$)/.test(location.pathname)) return true; // staff screens and shared documents never open with the splash
      return false; // the splash plays on every load / reload of the customer site
    } catch { return true }
  });
  const enter = useCallback(() => { try { localStorage.setItem('dhanya.entered', String(Date.now())) } catch { /* ignore */ } setEntered(true) }, []);
  const replayIntro = useCallback(() => setEntered(false), []);

  // --- toasts -------------------------------------------------------------------
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);
  const toast = useCallback((message, type = 'info') => {
    const id = ++toastId.current;
    setToasts(t => [...t.slice(-2), { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3800);
  }, []);
  const dismissToast = id => setToasts(t => t.filter(x => x.id !== id));

  // --- storefront data from the API ---------------------------------------------
  const [catalog, setCatalog] = useState({ categories: [], collections: [], featured: [], status: 'loading' });
  const loadCatalog = useCallback(() => {
    setCatalog(c => ({ ...c, status: 'loading' }));
    Promise.all([apiRetry('/categories'), apiRetry('/collections'), apiRetry('/products?featured=1&limit=12')])
      .then(([categories, collections, f]) => setCatalog({ categories, collections, featured: f.items, status: 'ready' }))
      .catch(() => setCatalog(c => ({ ...c, status: 'error' })));
  }, []);
  const onAdmin = typeof location !== 'undefined' && location.pathname.startsWith('/admin'); // the admin never needs the storefront data until staff sign-in is confirmed (below), so it is not fetched twice
  useEffect(() => { if (!onAdmin) loadCatalog() }, [loadCatalog]); // eslint-disable-line

  // --- admin-managed store content: boutique location + hours, social links ---
  const [site, setSite] = useState({ store: null, social: null, map: null, status: 'loading' });
  const loadSite = useCallback(() => {
    apiRetry('/store').then(d => setSite({ ...d, status: 'ready' })).catch(() => setSite(s => ({ ...s, status: 'error' })));
  }, []);
  useEffect(() => { if (!onAdmin) loadSite() }, [loadSite]); // eslint-disable-line

  // --- auth (httpOnly cookie session; the browser only ever sees the public profile) ---
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => { api('/auth/me').then(d => setUser(d.user)).catch(() => {}).finally(() => setAuthReady(true)) }, []);
  const staff = !!user && user.role !== 'customer';
  const adminLoaded = useRef(false);
  useEffect(() => { window.__fresh = staff; if (staff && !onAdmin) { loadSite(); loadCatalog() } else if (authReady && onAdmin && !adminLoaded.current) { adminLoaded.current = true; loadSite(); loadCatalog() } }, [staff, authReady]); // eslint-disable-line react-hooks/exhaustive-deps
  const signIn = useCallback(u => setUser(u), []);
  const signOut = useCallback(async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); setUser(null) }, []);

  // --- bag: persisted on the server (guest cookie or customer account) -----------
  const [cartState, setCart] = useState(EMPTY_CART);
  const [bagOpen, setBagOpen] = useState(false);
  const loadCart = useCallback(pin => api('/cart' + (typeof pin === 'string' && /^\d{6}$/.test(pin) ? `?pin=${pin}` : '')).then(setCart).catch(() => {}), []);
  useEffect(() => {
    if (!authReady) return;
    let timer;
    const run = () => (async () => {
      // One-time import of a Phase 2 browser-only bag, if present.
      const legacy = read('dhanya.cart', []);
      if (Array.isArray(legacy) && legacy.length) {
        for (const i of legacy) if (i?.variantId) await api('/cart/items', { method: 'POST', body: { variantId: i.variantId, quantity: i.qty || 1 } }).catch(() => {});
        try { localStorage.removeItem('dhanya.cart') } catch { /* ignore */ }
      }
      loadCart();
    })();
    if (onAdmin) timer = setTimeout(run, 4000); else run(); // the bag is not needed on the admin; load it after the admin page is up
    return () => clearTimeout(timer);
  }, [authReady, user?.id, loadCart]);

  const mutate = useCallback(async (fn, { open = false } = {}) => {
    try { const c = await fn(); setCart(c); if (open) setBagOpen(true); return true }
    catch (e) { toast(e.message, 'warn'); loadCart(); return false }
  }, [toast, loadCart]);
  const addToBag = useCallback(({ variantId }, { open = true } = {}) =>
    mutate(() => api('/cart/items', { method: 'POST', body: { variantId, quantity: 1 } }), { open }), [mutate]);
  const setQty = useCallback((variantId, quantity) =>
    mutate(() => api(`/cart/items/${variantId}`, { method: 'PATCH', body: { quantity } })), [mutate]);
  const removeItem = useCallback(variantId => mutate(() => api(`/cart/items/${variantId}`, { method: 'DELETE' })), [mutate]);
  const clearCart = useCallback(() => mutate(() => api('/cart', { method: 'DELETE' })), [mutate]);

  // --- wishlist: server-backed when signed in, device-local for guests -----------
  const [wish, setWish] = useState(() => read('dhanya.wish', []));
  useEffect(() => {
    if (!authReady) return;
    if (!user) { setWish(read('dhanya.wish', [])); return }
    const local = read('dhanya.wish', []);
    api('/wishlist/merge', { method: 'POST', body: { slugs: local } }).then(d => { setWish(d.slugs); try { localStorage.removeItem('dhanya.wish') } catch { /* ignore */ } }).catch(() => {});
  }, [authReady, user?.id]); // eslint-disable-line
  const toggleWish = useCallback(async (slug, name) => {
    const has = wish.includes(slug);
    const next = has ? wish.filter(s => s !== slug) : [...wish, slug];
    setWish(next); // optimistic: a heart toggle is safe to show immediately
    toast(has ? `Removed ${name} from your wishlist.` : `Saved ${name} to your wishlist.`);
    if (!user) { write('dhanya.wish', next); return }
    try { await api(has ? `/wishlist/${slug}` : '/wishlist', has ? { method: 'DELETE' } : { method: 'POST', body: { slug } }) }
    catch { setWish(wish); toast('Your wishlist could not be updated.', 'warn') }
  }, [wish, user, toast]);

  // --- overlays -----------------------------------------------------------------
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quick, setQuick] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const value = useMemo(() => ({
    entered, enter, replayIntro, catalog, loadCatalog, site, loadSite, toasts, toast, dismissToast,
    cart: cartState.items, cartInfo: cartState, bagOpen, setBagOpen, bagCount: cartState.count, bagSubtotal: cartState.subtotal,
    addToBag, setQty, removeItem, clearCart, loadCart,
    wish, toggleWish, user, authReady, signIn, signOut,
    searchOpen, setSearchOpen, menuOpen, setMenuOpen, quick, setQuick, reviewOpen, setReviewOpen,
  }), [entered, catalog, site, toasts, cartState, bagOpen, wish, user, authReady, searchOpen, menuOpen, quick, reviewOpen]); // eslint-disable-line
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
