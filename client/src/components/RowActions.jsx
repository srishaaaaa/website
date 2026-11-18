// The round icon buttons used on every admin order row (same look as Order History): WhatsApp, invoice / receipt, quick details.
const Ico = ({ children }) => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
export const WaIcon = () => <Ico><path d="M20 12a8 8 0 0 1-11.9 7L4 20l1.1-4A8 8 0 1 1 20 12Z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.2-1.7-1-.8.6a3.5 3.5 0 0 1-1.6-1.6l.6-.8-1-1.7Z" /></Ico>;
export const DocIcon = () => <Ico><path d="M6 3h9l4 4v14H6z" /><path d="M9 13h7M9 17h7" /></Ico>;
export const EyeIcon = () => <Ico><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Ico>;

export const waUrl = (phone, text) => { const d = String(phone || '').replace(/\D/g, '').slice(-10); return `https://wa.me/${d.length === 10 ? '91' + d : ''}?text=${encodeURIComponent(text)}` };

// wa: { phone, text }  ·  doc: click handler or href  ·  eye: click handler
export default function RowActions({ wa, doc, eye, label = '' }) {
  const stop = e => e.stopPropagation();
  return (
    <div className="dpos-rowact" onClick={stop}>
      {wa && <a className="ra wa" title="Send on WhatsApp" aria-label={`Send ${label} on WhatsApp`} href={waUrl(wa.phone, wa.text)} target="_blank" rel="noopener noreferrer"><WaIcon /></a>}
      {doc && (typeof doc === 'string'
        ? <a className="ra doc" title="Open invoice" aria-label={`Open ${label} invoice`} href={doc} target="_blank" rel="noopener noreferrer"><DocIcon /></a>
        : <button type="button" className="ra doc" title="Preview" aria-label={`Preview ${label}`} onClick={doc}><DocIcon /></button>)}
      {eye && <button type="button" className="ra eye" title="Quick details" aria-label={`Details of ${label}`} onClick={eye}><EyeIcon /></button>}
    </div>
  );
}
