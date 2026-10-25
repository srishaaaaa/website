import { lazy, Suspense } from 'react';
import { Navigate, NavLink, useParams } from 'react-router-dom';
import { useApp } from '../context/App';
import AdminShell from '../components/AdminShell';
import '../stitching.css';

// Stitching Studio: admin side only, code-split. Owners/admins manage everything; cashiers run orders, measurements, payments and appointments
// (the API enforces this too). Sections load on demand.
const sec = load => { const C = lazy(load); return <Suspense fallback={<p className="dpos-empty">Loading…</p>}><C /></Suspense> };
const named = (load, name, props) => { const C = lazy(() => load().then(m => ({ default: m[name] }))); return <Suspense fallback={<p className="dpos-empty">Loading…</p>}><C {...props} /></Suspense> };
const S = {
  dashboard: sec(() => import('./stitching/Dashboard')), orders: sec(() => import('./stitching/Orders')), new: sec(() => import('./stitching/OrderForm')), detail: sec(() => import('./stitching/OrderDetail')),
  measurements: sec(() => import('./stitching/Book')), appointments: sec(() => import('./stitching/Schedule')), reports: sec(() => import('./stitching/Reports')),
  designs: [named(() => import('./stitching/Setup'), 'Designs', { manager: false }), named(() => import('./stitching/Setup'), 'Designs', { manager: true })],
  tailors: [named(() => import('./stitching/Setup'), 'Tailors', { manager: false }), named(() => import('./stitching/Setup'), 'Tailors', { manager: true })],
  garments: named(() => import('./stitching/Setup'), 'GarmentTypes', {}),
};
const TABS = [['', 'Dashboard'], ['orders', 'Orders'], ['measurements', 'Measurements'], ['appointments', 'Appointments'], ['designs', 'Designs'], ['tailors', 'Tailors'], ['reports', 'Reports', true], ['garments', 'Garment types', true]];
const TITLE = { '': 'Stitching Studio', orders: 'Stitching orders', new: 'New stitching order', detail: 'Stitching order', measurements: 'Measurement book', appointments: 'Trials & appointments', designs: 'Design library', tailors: 'Tailors & workload', reports: 'Stitching reports', garments: 'Garment types' };

export default function AdminStitching({ view }) {
  const { user, authReady } = useApp(); const { tab } = useParams();
  if (!authReady) return <div className="page-pad"><p className="muted">Loading…</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!['owner', 'admin', 'cashier'].includes(user.role)) return <div className="empty page-pad"><p className="serif big">Staff access only.</p></div>;
  const manager = ['owner', 'admin'].includes(user.role);
  const key = view ?? tab ?? '';
  const known = key === '' || key === 'new' || key === 'detail' || TABS.some(t => t[0] === key);
  if (!known) return <Navigate to="/admin/stitching" replace />;
  if (['reports', 'garments'].includes(key) && !manager) return <div className="empty page-pad"><p className="serif big">Owners and admins only.</p></div>;
  const body = key === '' ? S.dashboard : ['designs', 'tailors'].includes(key) ? S[key][manager ? 1 : 0] : S[key === 'detail' ? 'detail' : key];
  return (
    <AdminShell title={TITLE[key]} sub={key === '' ? 'Orders, measurements, trials, alterations and payments for made-to-measure work.' : undefined}>
      <div className="stc-stack">
        <nav className="stc-tabs" aria-label="Stitching Studio sections">
          {TABS.filter(t => !t[2] || manager).map(([to, label]) => <NavLink key={to} to={`/admin/stitching${to ? '/' + to : ''}`} end className={({ isActive }) => isActive || (to === 'orders' && ['new', 'detail'].includes(key)) ? 'on' : ''}>{label}</NavLink>)}
        </nav>
        {body}
      </div>
    </AdminShell>);
}
