import { useState } from 'react';
import { api } from '../lib/api';
import { telLink, waLink } from '../lib/contact';
import { useApp } from '../context/App';
import { Reveal } from './Motion';

const Ico = ({ children }) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
const EMPTY = { name: '', business: '', phone: '', email: '', interest: '', quantity: '', message: '', website: '' };

// Retail and wholesale enquiries. Submissions are saved to the database for staff to follow up (Admin → Enquiries).
// The WhatsApp button is an alternative that opens a prefilled message; nothing is sent until the visitor sends it.
export default function EnquirySection() {
  const { site } = useApp();
  const { store, social, map } = site;
  const [kind, setKind] = useState('retail');
  const [f, setF] = useState(EMPTY);
  const [state, setState] = useState({ s: 'idle', msg: '' });
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const ws = kind === 'wholesale';
  const wa = waLink(store?.phone, `Hello DHANYA BOUTIQUE, ${ws ? 'I would like a wholesale enquiry' : 'I would like to enquire about sarees'}${f.interest ? ` (${f.interest})` : ''}${ws && f.quantity ? `, approx. ${f.quantity}` : ''}.${f.name ? ` — ${f.name}${ws && f.business ? `, ${f.business}` : ''}` : ''}`);
  const tel = telLink(store?.phone), ig = social?.instagram?.url;

  async function submit(e) {
    e.preventDefault(); setState({ s: 'busy', msg: '' });
    try {
      await api('/enquiries', { method: 'POST', body: { kind, ...f, business: ws ? f.business : '', quantity: ws ? f.quantity : '' } });
      setState({ s: 'ok', msg: `Thank you${f.name ? ', ' + f.name.split(' ')[0] : ''}. Your enquiry has been recorded and we will contact you on ${f.phone}.` }); setF(EMPTY);
    } catch (err) {
      setState({ s: 'error', msg: err.issues?.[0]?.message || (err.message === 'Validation failed' ? 'Please check the highlighted details.' : err.message) });
    }
  }

  return (
    <section className="eq" id="enquiry" aria-labelledby="eq-h">
      <div className="eq-in">
        <Reveal className="eq-info" id="contact">
          <p className="eq-label"><i aria-hidden="true" />GET IN TOUCH</p>
          <h2 id="eq-h">ENQUIRE WITH<br />DHANYA BOUTIQUE.</h2>
          <p className="eq-p">Looking for a particular saree, or buying in bulk for your own shop? Tell us what you need and we will get back to you.</p>
          <ul className="eq-links">
            {tel && <li><a href={tel}><Ico><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></Ico><span><b>Call</b>{store.owner ? `${store.owner} · ` : ''}{store.phone}</span></a></li>}
            {wa && <li><a href={wa} target="_blank" rel="noopener noreferrer"><Ico><path d="M3 21l1.6-4.6A8.5 8.5 0 1 1 8 19.6z" /><path d="M9 9.5c.4 2 2.5 4 4.7 4.8l1.3-1.3-1.8-1-.9.7a4 4 0 0 1-1.9-1.9l.7-.9-1-1.8z" /></Ico><span><b>WhatsApp</b>Chat with us</span></a></li>}
            {store?.email && <li><a href={`mailto:${store.email}`}><Ico><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Ico><span><b>Email</b>{store.email}</span></a></li>}
            {ig && <li><a href={ig} target="_blank" rel="noopener noreferrer"><Ico><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" /></Ico><span><b>Instagram</b>@{social.instagram.handle || 'follow us'}</span></a></li>}
            {map && <li><a href={map.directionsUrl} target="_blank" rel="noopener noreferrer"><Ico><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.4" /></Ico><span><b>Visit</b>{store?.address?.length ? store.address.join(', ') : 'Get directions'}</span></a></li>}
          </ul>
        </Reveal>

        <Reveal className="eq-card" delay={0.1}>
          <div className="eq-tabs" role="tablist" aria-label="Enquiry type">
            {[['retail', 'RETAIL'], ['wholesale', 'WHOLESALE']].map(([k, l]) => <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setState({ s: 'idle', msg: '' }) }}>{l}</button>)}
          </div>
          <form onSubmit={submit} noValidate>
            <div className="eq-grid">
              {ws && <label className="eq-f wide"><span>Business or shop name *</span><input required value={f.business} onChange={set('business')} autoComplete="organization" /></label>}
              <label className="eq-f"><span>{ws ? 'Contact person' : 'Your name'} *</span><input required value={f.name} onChange={set('name')} autoComplete="name" /></label>
              <label className="eq-f"><span>Phone *</span><input required type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" /></label>
              <label className="eq-f"><span>Email</span><input type="email" value={f.email} onChange={set('email')} autoComplete="email" /></label>
              <label className="eq-f"><span>{ws ? 'Product interest' : 'Which saree are you looking for?'}</span><input value={f.interest} onChange={set('interest')} placeholder="e.g. silk, cotton, bridal" /></label>
              {ws && <label className="eq-f"><span>Approximate quantity</span><input value={f.quantity} onChange={set('quantity')} placeholder="e.g. 50 sarees" /></label>}
              <label className="eq-f wide"><span>Message</span><textarea rows="3" value={f.message} onChange={set('message')} /></label>
              <label className="eq-hp" aria-hidden="true">Website<input tabIndex="-1" autoComplete="off" value={f.website} onChange={set('website')} /></label>
            </div>
            {state.msg && <p role={state.s === 'error' ? 'alert' : 'status'} className={`eq-msg ${state.s}`}>{state.msg}</p>}
            <div className="eq-actions">
              <button className="bh-btn" disabled={state.s === 'busy'}><span>{state.s === 'busy' ? 'SENDING…' : 'SEND ENQUIRY'}</span><b aria-hidden="true"><i>→</i></b></button>
              {wa && <a className="bh-link" href={wa} target="_blank" rel="noopener noreferrer">OR CONTINUE ON WHATSAPP</a>}
            </div>
          </form>
        </Reveal>
      </div>
    </section>
  );
}
