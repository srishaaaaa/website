import { Link, NavLink } from 'react-router-dom';
import { useApp } from '../context/App';
import '../pos.css';

// The admin layout (sidebar + "Dashboard" top bar + cards) shared by every admin page. Admin only: it is imported solely by
// code-split admin pages, so public visitors never download this or pos.css.

const ICONS = {
  billing: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></>,
  chart: <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />,
  orders: <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.5 12h11L21 7H6" /></>,
  box: <><path d="M21 8 12 3 3 8v8l9 5 9-5Z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  tag: <><path d="M3 12V4h8l10 10-8 8Z" /><circle cx="7.5" cy="8.5" r="1.2" /></>,
  cake: <><path d="M4 21h16v-7H4zM4 17c2 2 4-2 8 0s6 0 8 0M12 14V9M12 6V5" /></>,
  truck: <><path d="M2 6h12v10H2zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></>,
  doc: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h7" /></>,
  trend: <path d="M3 17l6-6 4 4 8-9M15 6h6v6" />,
  shop: <><path d="M4 9l1-5h14l1 5M4 9v11h16V9M4 9h16" /><path d="M9 20v-6h6v6" /></>,
  star: <path d="m12 3 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4-5.7-3.1-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" />,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m4 18 5-5 4 4 3-3 4 4" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 5.3a3 3 0 0 1 0 5.4M18 14.5c2 .7 3 2.6 3 5.5" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></>,
  flask: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3" /></>,
};
export const Icon = ({ n, size = 18 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[n]}</svg>;

// [path, label, icon, managerOnly]
export const NAV = [
  { group: 'Retail billing', items: [
    ['/admin/billing', 'Billing', 'billing'], ['/admin/billing/analytics', 'POS Analytics', 'chart', true], ['/admin/billing/orders', 'Orders', 'orders'],
    ['/admin/billing/inventory', 'Inventory', 'box', true], ['/admin/billing/coupons', 'Coupons', 'tag', true], ['/admin/billing/birthdays', 'Date of Birth', 'cake', true],
    ['/admin/billing/settings', 'Delivery & GST', 'truck', true]] },
  { group: 'Wholesale', items: [['/admin/billing/ws-billing', 'WS Billing', 'doc'], ['/admin/billing/ws-inventory', 'WS Inventory', 'shop'], ['/admin/billing/ws-analytics', 'WS Analytics', 'trend', true]] },
  { group: 'Online store', items: [
    ['/admin', 'Online orders', 'orders', true], ['/admin/reviews', 'Reviews', 'star', true], ['/admin/products', 'Products & images', 'box', true], ['/admin/storefront', 'Storefront images', 'image', true],
    ['/admin/enquiries', 'Enquiries', 'mail', true], ['/admin/users', 'Users', 'users', true], ['/admin/settings', 'Store settings', 'gear', true], ['/admin/sample', 'Sample data', 'flask', true]] },
];

export default function AdminShell({ title, sub, actions, children }) {
  const { user } = useApp();
  const manager = !!user && ['owner', 'admin'].includes(user.role);
  const initial = (user?.name || user?.email || 'A').trim()[0].toUpperCase();
  return (
    <div className="dpos">
      <nav className="dpos-side" aria-label="Admin sections">
        <div className="dpos-brand"><div><b>Dhanya</b><br /><i>{manager ? 'ADMIN' : 'CASHIER'}</i></div></div>
        {NAV.map(g => {
          const items = g.items.filter(i => !i[3] || manager);
          return items.length ? (
            <div key={g.group} style={{ display: 'contents' }}>
              <p className="dpos-grp">{g.group.toUpperCase()}</p>
              {items.map(([to, label, icon]) => <NavLink key={to} to={to} end className={({ isActive }) => `dpos-nav ${isActive ? 'on' : ''}`}><Icon n={icon} />{label}</NavLink>)}
            </div>) : null;
        })}
      </nav>
      <main className="dpos-main" id="main">
        <div className="dpos-top"><span className="dpos-top-t">Dashboard</span><Link to="/" className="dpos-view">← View Store</Link><span className="dpos-av" aria-label={user?.email}>{initial}</span></div>
        <div className="dpos-head"><div><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>{actions}</div>
        {children}
      </main>
    </div>
  );
}
