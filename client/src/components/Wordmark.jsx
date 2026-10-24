import { Link } from 'react-router-dom';
import { useApp } from '../context/App';

// Emblem: four hairline petals rotated around a point — a quiet nod to woven textile geometry.
export function Emblem({ size = 28, className = '', glow = false }) {
  return (
    <svg className={`emblem ${glow ? 'glow' : ''} ${className}`} width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
      {[0, 45, 90, 135].map(r => <ellipse key={r} cx="32" cy="32" rx="9" ry="26" transform={`rotate(${r} 32 32)`} />)}
      <circle cx="32" cy="32" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LogoTile({ size = 38 }) {
  return <span className="logo-tile" style={{ width: size, height: size }}><Emblem size={Math.round(size * 0.62)} /></span>;
}

// DHANYA over BOUTIQUE: a high-contrast serif name with a small, widely spaced descriptor.
export default function Wordmark({ to = '/', className = '', onClick }) {
  const { site } = useApp();
  const logo = site.branding?.logo;
  if (logo) return (
    <Link to={to} onClick={onClick} className={`wordmark has-logo ${className}`} aria-label="Home" data-cursor="HOME">
      <img className="wm-logo" src={logo} alt={site.branding.logoAlt || site.store?.name || 'DHANYA BOUTIQUE'} />
    </Link>
  );
  return (
    <Link to={to} onClick={onClick} className={`wordmark ${className}`} aria-label="DHANYA BOUTIQUE — home" data-cursor="HOME">
      <span className="wm-a">DHANYA</span><span className="wm-b">BOUTIQUE</span>
    </Link>
  );
}
