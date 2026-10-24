import { Router } from 'express';
import { z } from 'zod';
import { one } from '../db/index.js';
import { HttpError, wrap } from '../lib/http.js';
import { audit } from '../lib/orders.js';

// Removes uploaded files that nothing references any more (after products etc. are deleted).
export const sweepMedia = (db, grace = false) => db.query(`
  DELETE FROM media_files m
  WHERE (NOT $1::boolean OR m.created_at < now() - interval '5 minutes')
    AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.image_url = '/api/media/' || m.id)
    AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.image_url = '/api/media/' || m.id)
    AND NOT EXISTS (SELECT 1 FROM collections c WHERE c.hero_image = '/api/media/' || m.id)
    AND NOT EXISTS (SELECT 1 FROM store_settings s WHERE s.value::text LIKE '%/api/media/' || m.id || '"%')`, [grace]);

// Admin tools for demo data and product removal. Every deletion is a real, audited action done by staff.
export default function sampleAdmin({ db, auth }) {
  const r = Router();
  const staff = auth.role('owner', 'admin');

  const counts = () => one(db, `SELECT
    (SELECT COUNT(*)::int FROM products WHERE is_sample) AS products,
    (SELECT COUNT(*)::int FROM product_reviews WHERE is_demo) AS reviews,
    (SELECT COUNT(*)::int FROM enquiries WHERE is_sample) AS enquiries,
    (SELECT COUNT(*)::int FROM products) AS "allProducts"`);

  r.get('/sample-data', staff, wrap(async (_req, res) => res.json(await counts())));

  // One action removes every piece of sample data. Real products, real reviews and real enquiries are never touched.
  r.delete('/sample-data', staff, wrap(async (req, res) => {
    const removed = await db.tx(async t => {
      const p = await t.query('DELETE FROM products WHERE is_sample RETURNING id');
      const v = await t.query('DELETE FROM product_reviews WHERE is_demo RETURNING id');
      const e = await t.query('DELETE FROM enquiries WHERE is_sample RETURNING id');
      await t.query(`INSERT INTO store_settings (key, value) VALUES ('flags', '{"demoReviews": false}') ON CONFLICT (key) DO UPDATE SET value = jsonb_set(store_settings.value, '{demoReviews}', 'false'), updated_at = now()`);
      await audit(t, req.user.id, 'sample-data.delete', 'sample', 'all', { products: p.rows.length, reviews: v.rows.length, enquiries: e.rows.length });
      return { products: p.rows.length, reviews: v.rows.length, enquiries: e.rows.length };
    });
    await sweepMedia(db);
    res.json({ ok: true, removed });
  }));

  // Delete a single product (its variants, photos, collection links and wishlist/cart rows go with it).
  // Past orders keep their own name/price snapshot, so order history is unaffected.
  r.delete('/products/:id', staff, wrap(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const d = await db.query('DELETE FROM products WHERE id = $1 RETURNING slug, name', [id]);
    if (!d.rows.length) throw new HttpError(404, 'Product not found');
    await audit(db, req.user.id, 'product.delete', 'product', d.rows[0].slug, { name: d.rows[0].name });
    await sweepMedia(db);
    res.json({ ok: true });
  }));
  return r;
}
