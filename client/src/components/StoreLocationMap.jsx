import { useMemo } from 'react';
import { useApp } from '../context/App';
import { Reveal } from './Motion';
import { Emblem } from './Wordmark';

const Ico = ({ children }) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;

function openState(store) {
  const h = store?.hours; if (!h) return null;
  let now;
  try { now = new Date(new Date().toLocaleString('en-US', { timeZone: store.timeZone })) } catch { now = new Date() }
  const mins = now.getHours() * 60 + now.getMinutes();
  const t = s => { const [a, b] = s.split(':').map(Number); return a * 60 + b };
  const fmt = s => { const [a, b] = s.split(':').map(Number); return `${a % 12 || 12}${b ? ':' + String(b).padStart(2, '0') : ''}${a < 12 ? 'AM' : 'PM'}` };
  const today = h.days.includes(now.getDay());
  if (today && mins >= t(h.open) && mins < t(h.close)) return { open: true, text: `Open now · until ${fmt(h.close)}` };
  return { open: false, text: today && mins < t(h.open) ? `Closed · opens ${fmt(h.open)}` : 'Closed today' };
}

// Boutique location, hours and contact from the admin-managed store settings. If nothing has been configured,
// a tasteful placeholder is shown instead of a made-up pin.
export default function StoreLocationMap() {
  const { site, loadSite } = useApp();
  const { store, map } = site;
  const state = useMemo(() => openState(store), [store]);
  if (site.status === 'loading') return null;
  if (site.status === 'error') return (
    <section className="studio ivory-sec" aria-labelledby="st-h"><div className="studio-card"><div className="studio-info">
      <p className="eyebrow">VISIT US</p><h2 id="st-h" className="serif">OUR<br />STUDIO</h2>
      <p role="alert" className="muted">The boutique location could not be loaded right now.</p>
      <button className="btn solid pill" onClick={loadSite}>TRY AGAIN</button></div><div className="studio-map"><div className="map-placeholder" aria-hidden="true"><Emblem size={120} /></div></div></div></section>
  );
  const configured = !!map;
  const lines = store?.address?.length ? store.address : null;
  const tel = store?.phone && `tel:${store.phone.replace(/[^+\d]/g, '')}`;
  return (
    <section className="studio ivory-sec" aria-labelledby="st-h">
      <div className="studio-card">
        <Reveal className="studio-info">
          <p className="eyebrow">VISIT US</p>
          <h2 id="st-h" className="serif">OUR<br />STUDIO</h2>
          <p className="studio-lead">Experience {store?.name || 'DHANYA'} in person. Explore the collections, meet our stylists and discover exclusive pieces.</p>
          {configured ? (
            <>
              {lines && <p className="studio-row"><Ico><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.4" /></Ico><span><strong>{lines[0]}</strong>{lines.length > 1 && <span>{lines.slice(1).join(', ')}</span>}</span></p>}
              {store.hours && <p className="studio-row"><Ico><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Ico><span><strong>{store.hours.label}</strong>{state && <span className={state.open ? 'is-open' : ''}>{state.text}</span>}</span></p>}
              <div className="studio-cta">
                <a className="btn solid pill" href={map.directionsUrl} target="_blank" rel="noopener noreferrer" data-cursor="GO">GET DIRECTIONS →</a>
                {tel ? <a className="btn pill" href={tel}><Ico><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></Ico> CALL STORE</a>
                  : store.email ? <a className="btn pill" href={`mailto:${store.email}`}>EMAIL US</a> : null}
              </div>
            </>
          ) : (
            <>
              <p className="muted">Our boutique location and opening hours will be shared here soon.</p>
              {store?.email && <a className="btn pill" href={`mailto:${store.email}`}>CONTACT US</a>}
            </>
          )}
        </Reveal>
        <div className="studio-map">
          {configured
            ? <iframe title={`Map showing ${store.name}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen src={map.embedUrl} />
            : <div className="map-placeholder" role="img" aria-label="Boutique location to be announced"><Emblem size={120} /><span className="eyebrow">Location to be announced</span></div>}
          {configured && <a className="map-open" href={map.placeUrl || map.directionsUrl} target="_blank" rel="noopener noreferrer">OPEN IN MAPS ↗</a>}
          {configured && (
            <div className="map-card">
              <div className="map-card-top">
                <span className="pin-badge" aria-hidden="true"><Ico><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.4" /></Ico></span>
                <div><strong>{store.name}{lines ? ' Boutique' : ''}</strong><span className="muted small">{lines ? lines[lines.length - 1].split(',').slice(-3, -1).join(',').trim() || lines[lines.length - 1] : 'Tap for directions'}</span></div>
                {state && <span className={`status ${state.open ? 'open' : ''}`}><i aria-hidden="true" />{state.open ? 'OPEN' : 'CLOSED'}</span>}
              </div>
              <div className="map-card-bot"><span className="small">{state?.text || (lines ? lines[0] : '')}</span><a href={map.directionsUrl} target="_blank" rel="noopener noreferrer">DIRECTIONS →</a></div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
