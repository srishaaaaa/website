import { useMemo } from 'react';
import { useApp } from '../context/App';
import { Reveal } from './Motion';
import { Emblem } from './Wordmark';

function openState(store) {
  const h = store?.hours; if (!h) return null;
  let now;
  try { now = new Date(new Date().toLocaleString('en-US', { timeZone: store.timeZone })) } catch { now = new Date() }
  const mins = now.getHours() * 60 + now.getMinutes();
  const t = s => { const [a, b] = s.split(':').map(Number); return a * 60 + b };
  const fmt = s => { const [a, b] = s.split(':').map(Number); return `${a % 12 || 12}${b ? ':' + String(b).padStart(2, '0') : ''}${a < 12 ? 'AM' : 'PM'}` };
  const today = h.days.includes(now.getDay());
  if (today && mins >= t(h.open) && mins < t(h.close)) return { open: true, text: `Open now · closes ${fmt(h.close)}` };
  return { open: false, text: today && mins < t(h.open) ? `Closed · opens ${fmt(h.open)}` : 'Closed today' };
}

// Boutique location, hours and contact from the admin-managed store settings. If no address has been
// configured, a tasteful placeholder is shown instead of a made-up pin.
export default function StoreLocationMap() {
  const { site } = useApp();
  const { store, map } = site;
  const state = useMemo(() => openState(store), [store]);
  if (site.status === 'loading') return null;
  const configured = !!(store?.address?.length && map);
  const tel = store?.phone && `tel:${store.phone.replace(/[^+\d]/g, '')}`;
  return (
    <section className="studio ivory-sec" aria-labelledby="st-h">
      <div className="studio-card">
        <Reveal className="studio-info">
          <p className="eyebrow">VISIT US</p>
          <h2 id="st-h" className="serif">FIND YOUR WAY<br />TO DHANYA.</h2>
          {configured ? (
            <>
              <address><span className="pin" aria-hidden="true">⌖</span><span><strong>{store.address[0]}</strong>{store.address.length > 1 && <><br />{store.address.slice(1).join(', ')}</>}</span></address>
              {store.hours && <p className="hours"><span className="pin" aria-hidden="true">◷</span><span><strong>{store.hours.label}</strong>{state && <><br /><b className={state.open ? 'is-open' : ''}>{state.text}</b></>}</span></p>}
              <div className="studio-cta">
                <a className="btn solid pill" href={map.directionsUrl} target="_blank" rel="noopener noreferrer" data-cursor="GO">GET DIRECTIONS →</a>
                {tel ? <a className="btn pill" href={tel}>CALL THE BOUTIQUE</a> : store.email ? <a className="btn pill" href={`mailto:${store.email}`}>EMAIL US</a> : null}
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
          {configured && <a className="map-open" href={map.directionsUrl} target="_blank" rel="noopener noreferrer">OPEN IN MAPS ↗</a>}
          {configured && (
            <div className="map-card"><span className="pin-badge" aria-hidden="true">⌖</span>
              <div><strong>{store.name}</strong><span className="muted small">{store.address[store.address.length - 1]}</span></div>
              {state && <span className={`status ${state.open ? 'open' : ''}`}>{state.open ? 'OPEN' : 'CLOSED'}</span>}</div>
          )}
        </div>
      </div>
    </section>
  );
}
