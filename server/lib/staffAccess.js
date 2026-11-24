import { one } from '../db/index.js';
import { HttpError, wrap } from './http.js';

// Which admin pages each kind of staff member sees. The owner always sees everything. The owner chooses the rest in POS Settings → Staff access.
// A page can only be switched on for a role whose server permissions can serve it (CAN below), so a ticked page always works.
export const PAGES = [
  ['/admin/orders', 'Online orders'],
  ['/admin/billing', 'Billing'], ['/admin/billing/analytics', 'POS Analytics'], ['/admin/billing/advance', 'Advance Orders'], ['/admin/billing/orders', 'Order History'], ['/admin/billing/measurements', 'Measurements'],
  ['/admin/billing/inventory', 'Inventory'], ['/admin/billing/customers', 'Customers'], ['/admin/billing/coupons', 'Coupons'], ['/admin/billing/birthdays', 'Date of Birth'], ['/admin/billing/expenses', 'Expenses'],
  ['/admin/stitching/designs', 'Stitching Designs'],
  ['/admin/reviews', 'Reviews'], ['/admin/categories', 'Categories'], ['/admin/trending', 'Trending'], ['/admin/storefront', 'Storefront images'], ['/admin/reels', 'Reels & Gallery'],
  ['/admin/enquiries', 'Enquiries'], ['/admin/users', 'Users'], ['/admin/delivery', 'Delivery'], ['/admin/sample', 'Sample data'], ['/admin/billing/settings', 'Settings'],
];
const ALL = PAGES.map(p => p[0]);
// What each role's server permissions can serve.
// Pages whose server routes follow this list (so a ticked page always works for that role).
const STAFFABLE = ['/admin/orders', '/admin/reviews', '/admin/categories', '/admin/trending', '/admin/storefront', '/admin/reels', '/admin/enquiries', '/admin/delivery', '/admin/stitching/designs', '/admin/billing', '/admin/billing/analytics', '/admin/billing/advance', '/admin/billing/orders', '/admin/billing/inventory', '/admin/billing/customers', '/admin/billing/coupons',
  '/admin/billing/birthdays', '/admin/billing/expenses', '/admin/billing/measurements'];
export const CAN = { admin: ALL, cashier: STAFFABLE, inventory: ['/admin/billing/inventory', '/admin/billing/analytics', '/admin/billing/coupons', '/admin/billing/birthdays', '/admin/billing/expenses'] };
export const DEFAULTS = {
  admin: ALL,
  cashier: ['/admin/billing', '/admin/billing/advance', '/admin/billing/orders', '/admin/billing/customers', '/admin/billing/measurements'],
  inventory: ['/admin/billing/inventory'],
};

export async function loadAccess(db) {
  const saved = (await one(db, "SELECT value FROM pos_settings WHERE key = 'staff_access'"))?.value || {};
  const out = {};
  for (const role of Object.keys(CAN)) out[role] = (Array.isArray(saved[role]) ? saved[role] : DEFAULTS[role]).filter(p => CAN[role].includes(p));
  out.admin = ALL; // owner and admin are the same: admins always see every page
  return out;
}
// A route that an admin can hand to Staff: owner / admin always pass; any other staff member needs the page ticked in Settings → Staff permissions.
export const pageGuard = (db, auth, page) => [...auth.role('owner', 'admin', 'cashier', 'inventory'), wrap(async (req, _res, next) => {
  if (['owner', 'admin'].includes(req.user.role)) return next();
  if ((await loadAccess(db))[req.user.role]?.includes(page)) return next();
  throw new HttpError(403, 'Not allowed for your role');
})];
export const pagesFor = (access, role) => role === 'owner' || role === 'admin' ? ALL : (access[role] || []);
