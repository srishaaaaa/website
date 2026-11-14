import { useEffect, useState } from 'react';
import { api } from './api';

// The admin pages the signed-in staff member may open (chosen by the owner in POS Settings → Staff access). Cached for the session.
let cache = { uid: null, pages: null };
export function useStaffAccess(user) {
  const [pages, setPages] = useState(cache.uid === user?.id ? cache.pages : null);
  useEffect(() => {
    if (!user || user.role === 'customer') return;
    if (cache.uid === user.id && cache.pages) { setPages(cache.pages); return }
    let dead = false;
    api('/admin/pos/staff-access').then(d => { cache = { uid: user.id, pages: d.pages }; if (!dead) setPages(d.pages) }).catch(() => {});
    return () => { dead = true };
  }, [user?.id, user?.role]);
  return pages;
}
export const resetStaffAccess = () => { cache = { uid: null, pages: null } };
// The nav entry a path belongs to (the most specific one), e.g. /admin/stitching/orders/12 belongs to /admin/stitching/orders.
export const pageOf = (pathname, pages) => [...pages].sort((a, b) => b.length - a.length).find(p => pathname === p || pathname.startsWith(p + '/'));
// The order the sidebar lists the pages in (used to pick the first page a staff member lands on).
export const ADMIN_ORDER = ['/admin/orders', '/admin/reviews', '/admin/categories', '/admin/trending', '/admin/site-text', '/admin/storefront', '/admin/reels', '/admin/enquiries', '/admin/users', '/admin/sample',
  '/admin/billing', '/admin/billing/analytics', '/admin/billing/advance', '/admin/billing/orders', '/admin/billing/inventory', '/admin/billing/customers', '/admin/billing/coupons', '/admin/billing/birthdays', '/admin/billing/expenses',
  '/admin/stitching', '/admin/stitching/orders', '/admin/billing/measurements', '/admin/stitching/reports', '/admin/billing/settings', '/admin/settings'];
