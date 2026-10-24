import { Router } from 'express';
import { z } from 'zod';
import { one } from '../db/index.js';
import { HttpError, wrap } from '../lib/http.js';
import { audit } from '../lib/orders.js';

const text = n => z.string().trim().max(n);
const nullableText = n => text(n).transform(v => v || null).nullable().default(null);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

export const storeSchema = z.object({
  name: text(80).default('DHANYA'),
  address: z.array(text(160).min(1)).max(5).nullable().default(null),
  phone: nullableText(30),
  email: z.string().trim().email().nullable().default(null),
  timeZone: text(60).default('Asia/Kolkata'),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable().default(null),
  mapsUrl: z.string().trim().url().nullable().default(null),
  hours: z.object({ label: text(120), open: hhmm, close: hhmm, days: z.array(z.number().int().min(0).max(6)).min(1).max(7) }).nullable().default(null),
});
export const socialSchema = z.object({
  instagram: z.object({
    handle: nullableText(60), url: z.string().trim().url().nullable().default(null),
    posts: z.array(z.object({ image: text(300).optional(), video: text(500).optional(), href: z.string().url().optional(), alt: text(160).default('') }).refine(p => p.image || p.video, 'Add an image or a video')).max(6).default([]),
  }).default({}),
  links: z.array(z.object({ label: text(40).min(1), url: z.string().url() })).max(6).default([]),
});
export const flagsSchema = z.object({ demoReviews: z.boolean().default(false) });
// Storefront imagery managed from the admin (each is an uploaded image URL or null to use the built-in default).
export const brandingSchema = z.object({
  heroCutout: z.string().max(500).nullable().default(null), heroDepth: z.string().max(500).nullable().default(null), heroAlt: z.string().trim().max(200).nullable().default(null),
  storyImage: z.string().max(500).nullable().default(null), storyAlt: z.string().trim().max(200).nullable().default(null),
});
export const pageSchema = z.object({ title: text(120).min(1), body: text(20000) });

const DEFAULTS = { store: storeSchema.parse({}), social: socialSchema.parse({}), flags: flagsSchema.parse({}), branding: brandingSchema.parse({}) };
const PAGE_SLUGS = ['privacy', 'terms', 'shipping-returns'];

export async function readSetting(db, key) {
  const r = await one(db, 'SELECT value FROM store_settings WHERE key = $1', [key]);
  return r ? r.value : DEFAULTS[key] ?? null;
}

export default function settingsRoutes({ db, cfg, auth }) {
  const r = Router();

  // Public: boutique location/hours/social. The map URL is only produced for a configured address.
  r.get('/store', wrap(async (_req, res) => {
    const [store, social] = await Promise.all([readSetting(db, 'store'), readSetting(db, 'social')]);
    let map = null;
    if (store.location || store.address?.length) {
      // Exact coordinates (from the boutique's Google Maps pin) win over a free-text address.
      const q = encodeURIComponent(store.location ? `${store.location.lat},${store.location.lng}` : [store.name, ...store.address].join(', '));
      const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${q}`;
      map = {
        embedUrl: cfg.GOOGLE_MAPS_API_KEY
          ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(cfg.GOOGLE_MAPS_API_KEY)}&q=${q}`
          : `https://www.google.com/maps?q=${q}&z=17&output=embed`,
        directionsUrl,
        placeUrl: store.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${q}`,
      };
    }
    const ship = await one(db, 'SELECT base_amount, free_over FROM shipping_methods WHERE active ORDER BY id LIMIT 1');
    const flags = await readSetting(db, 'flags');
    const branding = await readSetting(db, 'branding');
    res.json({ store, social, map, flags, branding, shipping: ship ? { amount: ship.base_amount, freeOver: ship.free_over } : null, checkout: { reservationMinutes: cfg.RESERVATION_MINUTES } });
  }));

  r.get('/pages/:slug', wrap(async (req, res) => {
    if (!PAGE_SLUGS.includes(req.params.slug)) throw new HttpError(404, 'Page not found');
    const p = await one(db, 'SELECT value FROM store_settings WHERE key = $1', ['page:' + req.params.slug]);
    if (!p) throw new HttpError(404, 'This page has not been published yet');
    res.json(p.value);
  }));

  // Staff only: owner/admin roles.
  const staff = auth.role('owner', 'admin');
  const save = async (req, key, value) => {
    await db.query(`INSERT INTO store_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [key, JSON.stringify(value)]);
    await audit(db, req.user.id, 'settings.update', 'settings', key);
  };
  r.put('/admin/settings/store', staff, wrap(async (req, res) => { const v = storeSchema.parse(req.body); await save(req, 'store', v); res.json(v) }));
  r.put('/admin/settings/social', staff, wrap(async (req, res) => { const v = socialSchema.parse(req.body); await save(req, 'social', v); res.json(v) }));
  r.put('/admin/settings/branding', staff, wrap(async (req, res) => { const v = brandingSchema.parse(req.body); await save(req, 'branding', v); res.json(v) }));
  r.put('/admin/settings/flags', staff, wrap(async (req, res) => { const v = flagsSchema.parse(req.body); await save(req, 'flags', v); res.json(v) }));
  r.put('/admin/pages/:slug', staff, wrap(async (req, res) => {
    if (!PAGE_SLUGS.includes(req.params.slug)) throw new HttpError(404, 'Unknown page');
    const v = pageSchema.parse(req.body); await save(req, 'page:' + req.params.slug, v); res.json(v);
  }));
  return r;
}
