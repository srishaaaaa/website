import { HttpError } from './http.js';
import { one } from '../db/index.js';

const getSetting = async (db, key, fallback) => (await one(db, 'SELECT value FROM pos_settings WHERE key = $1', [key]))?.value ?? fallback;

// Delivery charge rules (Admin → POS Settings → Delivery charge). Dhanya delivers across India, so the fee is worked out from the PIN code's zone
// (the first digits of the 6-digit PIN) and the order value, not from a map distance:
//   zones:      [{ name, prefixes: ['6', '56'], fee }]   the first zone whose prefix starts the PIN wins; no match = the default fee
//   orderTiers: [{ minOrder, fee }]                      a bigger order can only lower the fee (the lowest matching tier caps it)
//   freeOver:   the order value from which delivery is free
// All money is in paise. With `enabled: false` the shipping method's own flat fee and free-over amount apply, as before.
export const DEFAULT_RULES = { enabled: false, defaultFee: 9900, freeOver: 500000, zones: [], orderTiers: [], blockedPrefixes: [] };

export const loadRules = async db => ({ ...DEFAULT_RULES, ...(await getSetting(db, 'delivery_rules', {})) });

export function feeFor(rules, subtotal, pin) {
  const p = String(pin ?? '').replace(/\D/g, '');
  if (!rules.enabled) return null;
  if (p.length === 6 && rules.blockedPrefixes?.some(x => x && p.startsWith(x))) throw new HttpError(400, 'Sorry, we do not deliver to that PIN code yet.', 'no_delivery');
  if (rules.freeOver != null && subtotal >= rules.freeOver) return { amount: 0, zone: null, note: 'Free delivery' };
  const zone = p.length === 6 ? rules.zones?.find(z => z.prefixes?.some(x => x && p.startsWith(x))) : null;
  let fee = zone ? zone.fee : rules.defaultFee;
  for (const t of rules.orderTiers ?? []) if (subtotal >= t.minOrder && t.fee < fee) fee = t.fee;
  return { amount: fee, zone: zone?.name ?? null, note: zone ? `${zone.name} delivery` : null };
}

// What the cart and checkout charge. Falls back to the shipping method (the old behaviour) when the rules are switched off.
export async function shippingWithRules(db, subtotal, pin, fallback) {
  const rules = await loadRules(db).catch(() => DEFAULT_RULES);
  const r = feeFor(rules, subtotal, pin);
  if (!r) return fallback;
  return { ...fallback, amount: r.amount, freeOver: rules.freeOver ?? null, zone: r.zone, note: r.note };
}
