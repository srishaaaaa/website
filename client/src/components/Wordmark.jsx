import { Link } from 'react-router-dom';

// Emblem: four hairline petals rotated around a point — a quiet nod to woven textile geometry.
export function Emblem({ size = 28, className = '', glow = false }) {
  return (
    <svg className={`emblem ${glow ? 'glow' : ''} ${className}`} width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
      {[0, 45, 90, 135].map(r => <ellipse key={r} cx="32" cy="32" rx="9" ry="26" transform={`rotate(${r} 32 32)`} />)}
      <circle cx="32" cy="32" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function Wordmark({ to = '/', className = '', emblem = true, onClick }) {
  return (
    <Link to={to} onClick={onClick} className={`wordmark ${className}`} aria-label="DHANYA — home" data-cursor="HOME">
      {emblem && <Emblem size={26} />}
      <span>DHANYA</span>
    </Link>
  );
}
