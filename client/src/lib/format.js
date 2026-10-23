export const inr = p => '₹' + (p / 100).toLocaleString('en-IN');
export const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
// Mirrors the server checkout rule (server/index.js). The server stays authoritative.
export const FREE_SHIPPING_AT = 500000;
export const SHIPPING_FLAT = 9900;
export const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const rank = s => { const i = SIZE_ORDER.indexOf(s); return i < 0 ? 99 : i };
export const sortSizes = a => [...a].sort((x, y) => rank(x) - rank(y) || x.localeCompare(y));
