import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useApp } from './context/App';
import FloatingNavbar from './components/FloatingNavbar';
import LuxuryFooter from './components/LuxuryFooter';
import Intro from './components/Intro';
import Toasts from './components/Toasts';
import CartDrawer from './components/CartDrawer';
import SearchOverlay from './components/SearchOverlay';
import QuickView from './components/QuickView';
import PageTransition from './components/PageTransition';
import Home from './pages/Home';
import SmoothScroll from './components/SmoothScroll';
import { Shop, Collections, CollectionPage, Search } from './pages/Browse';
import Product from './pages/Product';
import { Wishlist, CartPage, Checkout, Auth } from './pages/Shopping';
import { Account } from './pages/Account';
import { About, Journal, NotFound, Policy } from './pages/Static';

// Dhanya POS is admin-only and code-split: public visitors never download it.
// Each lazy element is created once at module level (never inside render).
const lazyEl = (load, name) => { const C = lazy(() => load().then(m => ({ default: name ? m[name] : m.default }))); return <Suspense fallback={<div className="page-pad"><p className="muted">Loading…</p></div>}><C /></Suspense> };
const store = () => import('./pages/AdminStore'), media = () => import('./pages/AdminMedia'), more = () => import('./pages/AdminMore');
const A = {
  stitch: lazyEl(() => import('./pages/AdminStitching')), stitchNew: lazyEl(() => import('./pages/AdminStitching').then(m => ({ default: () => <m.default view="new" /> }))), stitchDetail: lazyEl(() => import('./pages/AdminStitching').then(m => ({ default: () => <m.default view="detail" /> }))), stitchPrint: lazyEl(() => import('./pages/stitching/Print')),
  pos: lazyEl(() => import('./pages/AdminPos')), invoice: lazyEl(() => import('./pages/InvoicePage')),
  orders: lazyEl(store, 'AdminOrders'), reviews: lazyEl(store, 'AdminReviews'), users: lazyEl(store, 'AdminUsers'), settings: lazyEl(store, 'AdminSettings'),
  categories: lazyEl(more, 'AdminCategories'), reels: lazyEl(more, 'AdminReels'),
  storefront: lazyEl(media, 'AdminStorefront'), trending: lazyEl(media, 'AdminTrending'), sitetext: lazyEl(media, 'AdminSiteText'), enquiries: lazyEl(media, 'AdminEnquiries'), sample: lazyEl(media, 'AdminSample'),
};

export default function App() {
  const { entered, enter, setBagOpen, setSearchOpen, setMenuOpen, setQuick } = useApp();
  const location = useLocation();
  const bare = location.pathname.startsWith('/invoice/') || location.pathname.startsWith('/admin/stitching/print/'); // invoice / job card pages are clean documents: no site header, footer, intro or overlays

  const admin = location.pathname === '/admin' || location.pathname.startsWith('/admin/'); // the admin panel has its own sidebar: no website menu, footer or intro
  const site = !bare && !admin;

  // Overlays never outlive a navigation.
  useEffect(() => { setBagOpen(false); setSearchOpen(false); setMenuOpen(false); setQuick(null) }, [location.pathname]); // eslint-disable-line

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <AnimatePresence>{!entered && site && <Intro key="intro" onDone={enter} />}</AnimatePresence>
      {site && <FloatingNavbar />}
      {site && <SmoothScroll />}
      <PageTransition>
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/collections/:slug" element={<CollectionPage />} />
          <Route path="/product/:slug" element={<Product />} />
          <Route path="/search" element={<Search />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/login" element={<Auth mode="login" />} />
          <Route path="/register" element={<Auth mode="register" />} />
          <Route path="/account" element={<Account />} />
          <Route path="/admin" element={<Navigate to="/admin/billing" replace />} />
          <Route path="/admin/orders" element={A.orders} />
          <Route path="/admin/reviews" element={A.reviews} />
          <Route path="/admin/users" element={A.users} />
          <Route path="/admin/categories" element={A.categories} />
          <Route path="/admin/reels" element={A.reels} />
          <Route path="/admin/settings" element={A.settings} />
          <Route path="/admin/products" element={<Navigate to="/admin/billing/inventory" replace />} />
          <Route path="/admin/storefront" element={A.storefront} />
          <Route path="/admin/trending" element={A.trending} />
          <Route path="/admin/site-text" element={A.sitetext} />
          <Route path="/admin/enquiries" element={A.enquiries} />
          <Route path="/admin/sample" element={A.sample} />
          <Route path="/invoice/:token" element={A.invoice} />
          <Route path="/admin/stitching" element={A.stitch} />
          <Route path="/admin/stitching/print/:id" element={A.stitchPrint} />
          <Route path="/admin/stitching/orders/new" element={A.stitchNew} />
          <Route path="/admin/stitching/orders/:id" element={A.stitchDetail} />
          <Route path="/admin/stitching/:tab" element={A.stitch} />
          <Route path="/admin/billing" element={A.pos} />
          <Route path="/admin/billing/:tab" element={A.pos} />
          <Route path="/about" element={<About />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/privacy" element={<Policy slug="privacy" title="Privacy policy" />} />
          <Route path="/terms" element={<Policy slug="terms" title="Terms and conditions" />} />
          <Route path="/shipping-returns" element={<Policy slug="shipping-returns" title="Shipping and returns" />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </PageTransition>
      {site && <><LuxuryFooter />
      <CartDrawer /><SearchOverlay /><QuickView /></>}
      {!bare && <Toasts />}
    </>
  );
}
