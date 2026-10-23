import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useApp } from './context/App';
import Nav from './components/Nav';
import Footer from './components/Footer';
import Intro from './components/Intro';
import Cursor from './components/Cursor';
import Toasts from './components/Toasts';
import CartDrawer from './components/CartDrawer';
import SearchOverlay from './components/SearchOverlay';
import QuickView from './components/QuickView';
import PageTransition from './components/PageTransition';
import Home from './pages/Home';
import { Shop, Collections, CollectionPage, Search } from './pages/Browse';
import Product from './pages/Product';
import { Wishlist, CartPage, Checkout, Auth } from './pages/Shopping';
import { Account, Admin } from './pages/Account';
import { About, Journal, NotFound } from './pages/Static';

export default function App() {
  const { entered, enter, setBagOpen, setSearchOpen, setMenuOpen, setQuick } = useApp();
  const location = useLocation();

  // Overlays never outlive a navigation.
  useEffect(() => { setBagOpen(false); setSearchOpen(false); setMenuOpen(false); setQuick(null) }, [location.pathname]); // eslint-disable-line

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <AnimatePresence>{!entered && <Intro key="intro" onDone={enter} />}</AnimatePresence>
      <Nav />
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
          <Route path="/admin" element={<Admin />} />
          <Route path="/about" element={<About />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </PageTransition>
      <Footer />
      <CartDrawer /><SearchOverlay /><QuickView /><Toasts /><Cursor />
    </>
  );
}
