import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../context/App';
import { useModal, useReduced } from '../lib/hooks';
import Wordmark from './Wordmark';
import ProductArt from './ProductArt';
import { ProductMedia } from './ProductCard3D';
import { inr } from '../lib/format';

const Icon = ({ d, children }) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">{children || <path d={d} />}</svg>;
const SearchI = () => <Icon><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></Icon>;
const UserI = () => <Icon><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c.9-3.6 3.9-5.2 7.5-5.2s6.6 1.6 7.5 5.2" /></Icon>;
const HeartI = () => <Icon d="M12 20.5s-7.5-4.6-7.5-10.3A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3Z" />;
const BagI = () => <Icon><path d="M5.5 8.5h13l-1 11.5h-11z" /><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" /></Icon>;

// A small "Categories" dropdown: a plain list, no photographs. The admin chooses which categories appear and in what order
// (Admin → Storefront images → Homepage picks); until then every category is listed.
function MegaMenu({ onNavigate }) {
  const { catalog, site } = useApp();
  const chosen = site.homepage?.categories || [];
  const cats = chosen.length ? chosen.map(s => catalog.categories.find(c => c.slug === s)).filter(Boolean) : catalog.categories;
  const rows = [{ name: 'All pieces', to: '/shop' }, { name: 'New arrivals', to: '/shop?sort=newest' }, ...cats.map(c => ({ name: c.name, to: `/shop?category=${c.slug}` }))];
  return (
    <motion.div className="mega mega-sm" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
      <div className="mega-in">
        <div className="mega-col">
          <p className="mega-label">Categories</p>
          <ul className="mega-cats" aria-label="Shop categories">
            {rows.map((c, i) => (
              <motion.li key={c.name} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.03 + i * 0.025, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
                <Link to={c.to} onClick={onNavigate}><span className="t">{c.name}</span><span className="ar" aria-hidden="true">→</span></Link>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
  );
}

function MobileMenu() {
  const { menuOpen, setMenuOpen, catalog, setSearchOpen, wish, user } = useApp();
  const ref = useRef(); const close = () => setMenuOpen(false);
  useModal(menuOpen, close, ref);
  const links = [['Home', '/'], ['Collection', '/collections'], ['Categories', '/shop'], ['Shop Story', '/#story'], ['Contact', '/#contact']];
  return (
    <AnimatePresence>
      {menuOpen && (
        <motion.div ref={ref} className="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu" initial={{ clipPath: 'inset(0 0 100% 0)' }} animate={{ clipPath: 'inset(0 0 0% 0)' }} exit={{ clipPath: 'inset(0 0 100% 0)' }} transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}>
          <div className="mm-top"><Wordmark onClick={close} /><button className="icon-btn" onClick={close} aria-label="Close menu">✕</button></div>
          <nav aria-label="Mobile">
            {links.map(([n, to], i) => (
              <motion.div key={to} initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.07, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
                <Link to={to} className="mm-link serif" onClick={close}>{n}</Link>
              </motion.div>
            ))}
          </nav>
          {catalog.categories.length > 0 && (
            <div className="mm-cats">{catalog.categories.map(c => <Link key={c.slug} to={`/shop?category=${c.slug}`} onClick={close} className="chip">{c.name}</Link>)}</div>
          )}
          <div className="mm-foot">
            <button className="btn" onClick={() => { close(); setSearchOpen(true) }}>SEARCH</button>
            <Link className="btn" to="/wishlist" onClick={close}>WISHLIST ({wish.length})</Link>
            <Link className="btn" to={user ? '/account' : '/login'} onClick={close}>{user ? 'ACCOUNT' : 'SIGN IN'}</Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const LINKS = [
  { label: 'HOME', to: '/', on: (p, h) => p === '/' && !h },
  { label: 'COLLECTION', to: '/collections', on: p => p.startsWith('/collections') },
  { label: 'CATEGORIES', to: '/shop', mega: true, on: p => p === '/shop' || p.startsWith('/product') },
  { label: 'SHOP STORY', to: '/#story', on: (p, h) => p === '/' && h === '#story' },
  { label: 'CONTACT', to: '/#contact', on: (p, h) => p === '/' && (h === '#contact' || h === '#enquiry') },
];

export default function FloatingNavbar() {
  const { entered, bagCount, wish, setBagOpen, setSearchOpen, setMenuOpen, user } = useApp();
  const { pathname, hash } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mega, setMega] = useState(false);
  const closeT = useRef();

  useEffect(() => { const f = () => setScrolled(scrollY > 60); f(); addEventListener('scroll', f, { passive: true }); return () => removeEventListener('scroll', f) }, []);
  useEffect(() => setMega(false), [pathname, hash]);
  useEffect(() => { const k = e => e.key === 'Escape' && setMega(false); addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, []);
  const open = () => { clearTimeout(closeT.current); setMega(true) };
  const later = () => { clearTimeout(closeT.current); closeT.current = setTimeout(() => setMega(false), 140) };

  return (
    <>
      <motion.header className={`site-header ${scrolled ? 'compact' : ''}`} initial={{ opacity: 0, y: -24 }} animate={entered ? { opacity: 1, y: 0 } : { opacity: 0, y: -24 }} transition={{ duration: 0.9, delay: entered ? 0.2 : 0, ease: [0.22, 1, 0.36, 1] }}
        onMouseLeave={later} onMouseEnter={() => mega && open()}>
        <div className="hdr">
          <button className="icon-btn burger" onClick={() => setMenuOpen(true)} aria-label="Open menu"><svg width="22" height="22" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.4" fill="none" aria-hidden="true"><path d="M3 8h18M3 16h18" /></svg></button>
          <Wordmark className="hdr-logo" />
          <nav className="primary" aria-label="Primary">
            {LINKS.map(({ label, to, mega: hasMega, on: isOn }) => {
              const on = isOn(pathname, hash);
              const link = (
                <Link key={to} to={to} className={on ? 'active' : ''} aria-current={on ? 'page' : undefined} onMouseEnter={hasMega ? open : later} {...(hasMega ? { 'aria-haspopup': 'true', 'aria-expanded': mega } : {})}>
                  {on && <motion.i className="nav-pill" layoutId="nav-pill" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                  <span>{label}</span>
                </Link>
              );
              return hasMega ? <div key={to} className="has-mega" onFocus={open} onBlur={e => !e.currentTarget.contains(e.relatedTarget) && later()}>{link}</div> : link;
            })}
          </nav>
          <div className="hdr-tools">
            <div className="tools-pill">
              <button className="tool" onClick={() => setSearchOpen(true)} aria-label="Search" data-cursor="SEARCH"><SearchI /><span>SEARCH</span></button>
              <i className="sep hide-sm" aria-hidden="true" />
              <Link className="tool hide-sm" to={user ? '/account' : '/login'} aria-label={user ? 'Account' : 'Sign in'}><UserI /><span>PROFILE</span></Link>
              <Link className="tool hide-sm" to="/wishlist" aria-label={`Wishlist, ${wish.length} saved`}><HeartI /><span>WISHLIST</span>{wish.length > 0 && <b className="count">{wish.length}</b>}</Link>
              <button className="cart-pill" onClick={() => setBagOpen(true)} aria-label={`Shopping bag, ${bagCount} items`} data-cursor="BAG"><BagI /><span>BAG</span>
                {bagCount > 0 && <motion.b key={bagCount} className="cart-n" initial={{ scale: 1.7 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }}>{bagCount}</motion.b>}
              </button>
            </div>
          </div>
        </div>
        <AnimatePresence>{mega && <div onMouseEnter={open} onMouseLeave={later}><MegaMenu onNavigate={() => setMega(false)} /></div>}</AnimatePresence>
      </motion.header>
      <MobileMenu />
    </>
  );
}
