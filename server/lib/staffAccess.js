import { one } from '../db/index.js';

// Which admin pages each kind of staff member sees. The owner always sees everything. The owner chooses the rest in POS Settings → Staff access.
// A page can only be switched on for a role whose server permissions can serve it (CAN below), so a ticked page always works.
export const PAGES = [
  ['/admin/orders', 'Online orders'], ['/admin/reviews', 'Reviews'], ['/admin/categories', 'Categories'], ['/admin/trending', 'Trending'], ['/admin/site-text', 'Site text'],
  ['/admin/storefront', 'Storefront images'], ['/admin/reels', 'Reels & Gallery'], ['/admin/enquiries', 'Enquiries'], ['/admin/users', 'Users'], ['/admin/sample', 'Sample data'],
  ['/admin/billing', 'Billing'], ['/admin/billing/analytics', 'POS Analytics'], ['/admin/billing/advance', 'Advance Orders'], ['/admin/billing/orders', 'Order History'],
  ['/admin/billing/inventory', 'Inventory'], ['/admin/billing/customers', 'Customers'], ['/admin/billing/coupons', 'Coupons'], ['/admin/billing/birthdays', 'Date of Birth'],
  ['/admin/billing/expenses', 'Expenses'], ['/admin/stitching', 'Stitching Dashboard'], ['/admin/stitching/orders', 'Stitching Orders'], ['/admin/billing/measurements', 'Measurements'],
  ['/admin/stitching/reports', 'Stitching Reports'], ['/admin/billing/settings', 'POS Settings'], ['/admin/settings', 'Store Settings'],
];
const ALL = PAGES.map(p => p[0]);
// What each role's server permissions can serve.
// Pages whose server routes follow this list (so a ticked page always works for that role).
const STAFFABLE = ['/admin/billing', '/admin/billing/analytics', '/admin/billing/advance', '/admin/billing/orders', '/admin/billing/inventory', '/admin/billing/customers', '/admin/billing/coupons',
  '/admin/billing/birthdays', '/admin/billing/expenses', '/admin/stitching', '/admin/stitching/orders', '/admin/billing/measurements'];
export const CAN = { admin: ALL, cashier: STAFFABLE, inventory: ['/admin/billing/inventory', '/admin/billing/analytics', '/admin/billing/coupons', '/admin/billing/birthdays', '/admin/billing/expenses'] };
export const DEFAULTS = {
  admin: ALL,
  cashier: ['/admin/billing', '/admin/billing/advance', '/admin/billing/orders', '/admin/billing/customers', '/admin/stitching', '/admin/stitching/orders', '/admin/billing/measurements'],
  inventory: ['/admin/billing/inventory'],
};

export async function loadAccess(db) {
  const saved = (await one(db, "SELECT value FROM pos_settings WHERE key = 'staff_access'"))?.value || {};
  const out = {};
  for (const role of Object.keys(CAN)) out[role] = (Array.isArray(saved[role]) ? saved[role] : DEFAULTS[role]).filter(p => CAN[role].includes(p));
  out.admin = ALL; // owner and admin are the same: admins always see every page
  return out;
}
export const pagesFor = (access, role) => role === 'owner' || role === 'admin' ? ALL : (access[role] || []);
