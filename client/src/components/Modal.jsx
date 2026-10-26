import { useEffect } from 'react';

// Admin dialog with the dark header used across the POS. Closes on Escape or a click on the backdrop.
export default function Modal({ title, sub, onClose, wide, className = '', children, footer }) {
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="dpos-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`dpos-sheet ${wide ? 'wide' : ''} ${className}`}>
        <div className="dpos-mhead"><div><b style={{ fontSize: 17 }}>{title}</b>{sub && <small>{sub}</small>}</div><button type="button" aria-label="Close" onClick={onClose}>✕</button></div>
        {children}
        {footer && <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>{footer}</div>}
      </div>
    </div>
  );
}
