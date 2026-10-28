import { Link } from 'react-router-dom';
import { useApp } from '../context/App';
import { Emblem } from './Wordmark';

// A deliberately blank, tasteful frame that holds the place of a photograph or video the boutique will add.
// Visitors see a soft empty frame; staff also see where to add it.
export default function BlankFrame({ label = 'Photo', hint, className = '', kind = 'photo', to = '/admin/storefront', where = 'Storefront images' }) {
  const { user } = useApp();
  const staff = ['owner', 'admin'].includes(user?.role);
  return (
    <div className={`blank ${className}`} role="img" aria-label={`${label} (${kind} coming soon)`}>
      <Emblem size={56} />
      {staff && <span className="blank-note">{label}<br /><Link to={to} className="link-u">Add in Admin → {where}</Link>{hint && <><br />{hint}</>}</span>}
    </div>
  );
}
