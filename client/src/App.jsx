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
// The one loading screen of the website (same as the one shown while the site starts). Admin pages get no full-screen loader.
function PageLoader() {
  if (location.pathname.startsWith('/admin')) return <div className="page-pad" />;
  return (
    <div className="boot" role="status" aria-label="Loading DHANYA">
      <svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="#C6A46A" strokeWidth="1.5"><ellipse cx="32" cy="32" rx="9" ry="26" /><ellipse cx="32" cy="32" rx="9" ry="26" transform="rotate(45 32 32)" /><ellipse cx="32" cy="32" rx="9" ry="26" transform="rotate(90 32 32)" /><ellipse cx="32" cy="32" rx="9" ry="26" transform="rotate(135 32 32)" /></g></svg>
      <b>DHANYA</b><small>BOUTIQUE</small><i />
    </div>
  );
}
const lazyEl = (load, name) => { const C = lazy(() => load().then(m => ({ default: name ? m[name] : m.default }))); return <Suspense fallback={<PageLoader />}><C /></Suspense> };
const store = () => import('./pages/AdminStore'), media = () => import('./pages/AdminMedia'), more = () => import('./pages/AdminMore');
const A = {
  stitchDash: lazyEl(() => import('./pages/StitchPages').then(m => ({ default: m.StitchDashboard }))), stitchOrders: lazyEl(() => import('./pages/StitchPages').then(m => ({ default: m.StitchOrders }))), stitchReports: lazyEl(() => import('./pages/StitchPages').then(m => ({ default: m.StitchReports }))),
  stitch: lazyEl(() => import('./pages/AdminStitching')), stitchNew: lazyEl(() => import('./pages/AdminStitching').then(m => ({ default: () => <m.default view="new" /> }))), stitchDetail: lazyEl(() => import('./pages/AdminStitching').then(m => ({ default: () => <m.default view="detail" /> }))), stitchPrint: lazyEl(() => import('./pages/stitching/Print')),
  pos: lazyEl(() => import('./pages/AdminPos')), invoice: lazyEl(() => import('./pages/InvoicePage')), coupon: lazyEl(() => import('./pages/CouponCard')),
  orders: lazyEl(store, 'AdminOrders'), reviews: lazyEl(store, 'AdminReviews'), users: lazyEl(store, 'AdminUsers'), settings: lazyEl(store, 'AdminSettings'),
  categories: lazyEl(more, 'AdminCategories'), reels: lazyEl(more, 'AdminReels'),
  storefront: lazyEl(media, 'AdminStorefront'), trending: lazyEl(media, 'AdminTrending'), sitetext: lazyEl(media, 'AdminSiteText'), enquiries: lazyEl(media, 'AdminEnquiries'), sample: lazyEl(media, 'AdminSample'),
};

// /admin opens Online orders (the first page of the sidebar) for the owner and admins, and Billing for cashiers and stock staff.
function AdminHome() {
  const { user, authReady } = useApp();
  if (!authReady) return null;
  return <Navigate to={user && ['owner', 'admin'].includes(user.role) ? '/admin/orders' : '/admin/billing'} replace />;
}

export default function App() {
  const { entered, enter, setBagOpen, setSearchOpen, setMenuOpen, setQuick } = useApp();
  const location = useLocation();
  const bare = location.pathname.startsWith('/invoice/') || location.pathname.startsWith('/coupon/') || location.pathname.startsWith('/admin/stitching/print/'); // invoice / job card pages are clean documents: no site header, footer, intro or overlays

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
          <Route path="/admin" element={<AdminHome />} />
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
          <Route path="/coupon/:code" element={A.coupon} />
          <Route path="/admin/stitching" element={A.stitchDash} />
          <Route path="/admin/stitching/orders" element={A.stitchOrders} />
          <Route path="/admin/stitching/reports" element={A.stitchReports} />
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
