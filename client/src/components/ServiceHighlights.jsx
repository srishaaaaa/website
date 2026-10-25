import { useApp } from '../context/App';
import { Reveal } from './Motion';
import { inr } from '../lib/format';

const I = ({ children }) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
const Shield = () => <I><path d="M12 3 5 6v5c0 4.4 2.8 8.2 7 10 4.2-1.8 7-5.6 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></I>;
const Truck = () => <I><path d="M3 6h11v10H3z" /><path d="M14 9h4l3 3v4h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></I>;
const Clock = () => <I><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></I>;
const User = () => <I><circle cx="12" cy="8.5" r="3.6" /><path d="M5 20c.9-3.6 3.8-5.2 7-5.2s6.1 1.6 7 5.2" /></I>;

// Only statements that are true of how this store works. Shipping figures come from the database.
export default function ServiceHighlights() {
  const { site } = useApp();
  const ship = site.shipping;
  const shipText = !ship ? 'Delivery across India. Shipping is shown in your bag before you pay.'
    : ship.amount === 0 ? 'Complimentary shipping across India on every order.'
      : `${inr(ship.amount)} flat shipping across India${ship.freeOver != null ? `, complimentary on orders above ${inr(ship.freeOver)}` : ''}.`;
  const items = [
    [<Shield key="s" />, 'Secure payment', 'Pay safely online. Your payment is confirmed before your order is placed.'],
    [<Truck key="t" />, 'Shipping across India', shipText],
    [<Clock key="c" />, 'Kept aside for you', 'Your pieces are set aside while you check out, so they are still there when you pay.'],
    [<User key="u" />, 'Saved for you', 'Sign in to keep your bag and wishlist with you on every device.'],
  ];
  return (
    <section className="svc" aria-label="Why shop with DHANYA">
      <ul className="svc-grid">
        {items.map(([icon, title, body], i) => (
          <Reveal as="li" key={title} delay={i * 0.07} className="svc-item">
            <span className="svc-ico">{icon}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
