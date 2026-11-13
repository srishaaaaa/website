import { HttpError } from './http.js';
import { one } from '../db/index.js';

const getSetting = async (db, key, fallback) => (await one(db, 'SELECT value FROM pos_settings WHERE key = $1', [key]))?.value ?? fallback;

// Delivery charge rules (Admin → POS Settings → Delivery charge). Dhanya delivers across India. The fee is worked out from:
//   1. the order value:  free over `freeOver`; `orderTiers` [{ minOrder, fee }] cap the fee for bigger baskets;
//   2. the distance:     straight-line km from the shop's PIN (`storePin`) to the customer's PIN, priced by `bands` [{ upToKm, fee }],
//                        with an optional `maxKm` (we do not deliver beyond it) and `perKmBeyond` (extra per km after the last band);
//   3. PIN zones:        `zones` [{ name, prefixes, fee }] still work and override the distance bands for the PINs they cover;
//   4. weight:           with `weightMode` on, the total weight of the bag (grams) is priced by the customer's region: `weightRegions`
//                        [{ name, active, prefixes, tiers: [{ minGrams, maxGrams (null = no upper limit), fee }] }]. A region is chosen by the PIN
//                        prefix; a region without prefixes is the "everywhere else" default. A region without tiers delivers free.
//   5. `blockedPrefixes` are never delivered to; `note` is the shipping note shown to customers.
// PINs are looked up with OpenStreetMap Nominatim (public, no key) and cached; if either lookup fails the first band applies.
// All money is in paise. With `enabled: false` the shipping method's own flat fee and free-over amount apply, as before.
export const DEFAULT_RULES = {
  enabled: true, note: 'Delivered within 5 to 7 working days across India. You will get a message when your order ships.',
  storePin: '', productLines: [], weightMode: true, defaultFee: 9900,
  // Until the owner sets their own: one "All India" region priced by the bag's weight.
  weightRegions: [{ name: 'All India', active: true, prefixes: [], tiers: [{ minGrams: 0, maxGrams: 500, fee: 6000 }, { minGrams: 500, maxGrams: 1000, fee: 9000 }, { minGrams: 1000, maxGrams: 2000, fee: 13000 }, { minGrams: 2000, maxGrams: null, fee: 18000 }] }], freeOver: 500000, maxKm: 0, perKmBeyond: 0, bands: [], zones: [], orderTiers: [], blockedPrefixes: [],
};

export const loadRules = async db => ({ ...DEFAULT_RULES, ...(await getSetting(db, 'delivery_rules', {})) });

const cache = new Map();
// Indian PIN -> coordinates (Nominatim). Cached for the life of the process; null when it cannot be found. Only the PIN is sent.
export async function geocode(pin, fetcher = fetch) {
  if (!/^\d{6}$/.test(pin || '')) return null;
  if (cache.has(pin)) return cache.get(pin);
  try {
    const r = await fetcher(`https://nominatim.openstreetmap.org/search?postalcode=${pin}&countrycodes=in&format=json&limit=1`, { headers: { 'User-Agent': 'boutique-delivery-estimate/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(4000) });
    const d = await r.json(); const x = Array.isArray(d) ? d[0] : null;
    const v = x ? { lat: +x.lat, lng: +x.lon } : null;
    if (v && Number.isFinite(v.lat) && Number.isFinite(v.lng)) { cache.set(pin, v); return v }
    return null;
  } catch { return null }
}
export const haversineKm = (a, b) => {
  const R = 6371, rad = d => d * Math.PI / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// Weight tiers of a region: min is inclusive, max is exclusive (null = no upper limit). No tiers = free delivery. A weight beyond every tier uses the last tier.
export function weightFee(region, grams) {
  const tiers = [...(region?.tiers || [])].sort((a, b) => a.minGrams - b.minGrams);
  if (!tiers.length) return 0;
  for (const t of tiers) if (grams >= t.minGrams && (t.maxGrams == null || grams < t.maxGrams)) return t.fee;
  return tiers.at(-1).fee;
}
export function regionFor(rules, pin) {
  const p = String(pin ?? '').replace(/\D/g, ''); const on = (rules.weightRegions || []).filter(r => r.active !== false);
  return (p.length === 6 ? on.find(r => r.prefixes?.some(x => x && p.startsWith(x))) : null) || on.find(r => !r.prefixes?.length) || null;
}
const kg = g => `${Math.round(g / 100) / 10} kg`;

// Pure rule maths (unit-tested). `km` is the distance, or null when it is not known. Returns null when the rules are switched off.
export function feeFor(rules, subtotal, pin, km = null, grams = 0) {
  const p = String(pin ?? '').replace(/\D/g, '');
  if (!rules.enabled) return null;
  if (p.length === 6 && rules.blockedPrefixes?.some(x => x && p.startsWith(x))) throw new HttpError(400, 'Sorry, we do not deliver to that PIN code yet.', 'out_of_range');
  if (rules.freeOver != null && rules.freeOver > 0 && subtotal >= rules.freeOver) return { amount: 0, zone: null, km, note: 'Free delivery on this order' };
  const region = rules.weightMode ? regionFor(rules, p) : null;
  if (region) {
    let fee = weightFee(region, grams);
    const tier = [...(rules.orderTiers || [])].filter(t => subtotal >= t.minOrder).sort((a, b) => b.minOrder - a.minOrder)[0];
    if (tier) fee = Math.min(fee, tier.fee);
    return { amount: fee, zone: region.name, km: null, grams, note: `${region.name} · ${kg(grams)}` };
  }
  const zone = p.length === 6 ? rules.zones?.find(z => z.prefixes?.some(x => x && p.startsWith(x))) : null;
  const bands = [...(rules.bands || [])].sort((a, b) => a.upToKm - b.upToKm);
  let fee, note = null;
  if (zone) { fee = zone.fee; note = `${zone.name} delivery` }
  else if (bands.length) {
    if (km == null) { fee = bands[0].fee; note = 'Estimated: distance could not be worked out yet' }
    else {
      const band = bands.find(b => km <= b.upToKm);
      if (band) fee = band.fee;
      else {
        if (rules.maxKm > 0 && km > rules.maxKm) throw new HttpError(400, `We do not deliver beyond ${rules.maxKm} km`, 'out_of_range');
        const last = bands.at(-1);
        fee = last.fee + Math.round((km - last.upToKm) * (rules.perKmBeyond || 0));
      }
    }
  } else fee = rules.defaultFee;
  if (km != null && rules.maxKm > 0 && km > rules.maxKm && !zone) throw new HttpError(400, `We do not deliver beyond ${rules.maxKm} km`, 'out_of_range');
  const tier = [...(rules.orderTiers || [])].filter(t => subtotal >= t.minOrder).sort((a, b) => b.minOrder - a.minOrder)[0];
  if (tier) fee = Math.min(fee, tier.fee);
  return { amount: fee, zone: zone?.name ?? null, km, note };
}

// What the cart and checkout charge. Falls back to the shipping method (the old behaviour) when the rules are switched off.
export async function shippingWithRules(db, subtotal, pin, fallback, { grams = 0, geo = geocode } = {}) {
  const rules = await loadRules(db).catch(() => DEFAULT_RULES);
  const policy = rules.note || '';
  if (!rules.enabled) return { ...fallback, policy };
  const needKm = !rules.weightMode && rules.storePin && rules.bands?.length && /^\d{6}$/.test(String(pin ?? '').trim()) && !(rules.freeOver > 0 && subtotal >= rules.freeOver);
  let km = null;
  if (needKm) { const [a, b] = await Promise.all([geo(rules.storePin), geo(String(pin).trim())]); if (a && b) km = Math.round(haversineKm(a, b) * 10) / 10 }
  const r = feeFor(rules, subtotal, pin, km, grams);
  return { ...fallback, amount: r.amount, freeOver: rules.freeOver ?? null, zone: r.zone, km: r.km, note: r.note, policy, weightGrams: grams };
}
