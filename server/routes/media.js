import express, { Router } from 'express';
import { z } from 'zod';
import { one, rows } from '../db/index.js';
import { HttpError, wrap } from '../lib/http.js';
import { audit } from '../lib/orders.js';

const MAX_BYTES = 4 * 1024 * 1024; // stays under typical serverless request limits
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Never trust the declared type: identify the image from its first bytes. SVG is deliberately not accepted.
export function sniff(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 8).equals(PNG)) return 'image/png';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
  return null;
}

export const mediaUrl = z.string().max(500).refine(u => /^\/api\/media\/\d+$/.test(u) || /^https:\/\/\S+$/.test(u), 'Use an uploaded file or an https URL');
export const imageUrl = z.string().max(500).refine(u => /^\/api\/media\/\d+$/.test(u) || /^https:\/\/\S+$/.test(u), 'Use an uploaded image or an https URL');
const ref = id => `/api/media/${id}`;

// Removes an uploaded file once nothing references it any more.
async function dropIfOrphan(db, url) {
  const m = /^\/api\/media\/(\d+)$/.exec(url || ''); if (!m) return;
  const id = Number(m[1]);
  const used = await one(db, `SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM product_images WHERE image_url = $1)
    OR EXISTS (SELECT 1 FROM categories WHERE image_url = $1) OR EXISTS (SELECT 1 FROM collections WHERE hero_image = $1)
    OR EXISTS (SELECT 1 FROM store_settings WHERE value::text LIKE '%' || $1 || '"%')`, [ref(id)]);
  if (!used) await db.query('DELETE FROM media_files WHERE id = $1', [id]);
}

export function mediaPublic({ db }) {
  const r = Router();
  r.get('/media/:id', wrap(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const etag = `"m${id}"`;
    if (req.get('if-none-match') === etag) return res.status(304).end();
    const f = await one(db, 'SELECT data, mime FROM media_files WHERE id = $1', [id]);
    if (!f) throw new HttpError(404, 'Image not found');
    const total = f.data.length;
    const base = { 'Content-Type': f.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable', ETag: etag, 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin' };
    const rg = /^bytes=(\d*)-(\d*)$/.exec(req.get('range') || '');
    if (rg && (rg[1] || rg[2])) {
      let s = rg[1] === '' ? total - Number(rg[2]) : Number(rg[1]), e = rg[1] === '' || rg[2] === '' ? total - 1 : Math.min(Number(rg[2]), total - 1);
      s = Math.max(0, s);
      if (s > e || s >= total) { res.statusCode = 416; res.setHeader('Content-Range', `bytes */${total}`); return res.end() }
      res.statusCode = 206; for (const [k, v] of Object.entries({ ...base, 'Content-Range': `bytes ${s}-${e}/${total}`, 'Content-Length': e - s + 1 })) res.setHeader(k, v);
      return res.end(f.data.subarray(s, e + 1));
    }
    res.statusCode = 200; for (const [k, v] of Object.entries({ ...base, 'Content-Length': total })) res.setHeader(k, v);
    res.end(f.data);
  }));
  return r;
}

export function mediaAdmin({ db, auth }) {
  const r = Router();
  const staff = auth.role('owner', 'admin');

  r.post('/media', staff, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'], limit: MAX_BYTES }), wrap(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'Send the file as the request body (JPEG, PNG, WebP, MP4 or WebM, up to 4 MB)');
    const mime = sniff(req.body);
    if (!mime || mime !== req.get('content-type')?.split(';')[0]) throw new HttpError(400, 'That file is not a valid JPEG, PNG, WebP, MP4 or WebM file');
    const name = String(req.query.name || '').slice(0, 120) || null;
    const f = await one(db, 'INSERT INTO media_files (data, mime, bytes, original_name, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id, bytes', [req.body, mime, req.body.length, name, req.user.id]);
    res.status(201).json({ id: f.id, url: ref(f.id), bytes: f.bytes });
  }));

  // ---- products: list + image gallery management ----
  r.get('/products', staff, wrap(async (req, res) => {
    const q = z.string().max(80).default('').parse(req.query.q ?? '');
    const like = `%${q.replace(/[\\%_]/g, m => '\\' + m)}%`;
    res.json(await rows(db, `
      SELECT p.id, p.slug, p.name, p.status, p.is_sample, c.name AS category,
             COALESCE((SELECT array_agg(DISTINCT v.color ORDER BY v.color) FROM product_variants v WHERE v.product_id = p.id), ARRAY[]::text[]) AS colors,
             (SELECT COUNT(*)::int FROM product_images i WHERE i.product_id = p.id) AS image_count,
             (SELECT image_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.display_order, i.id LIMIT 1) AS image
      FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE $1 = '' OR p.name ILIKE $2 OR p.slug ILIKE $2 ORDER BY (SELECT COUNT(*) FROM product_images i WHERE i.product_id = p.id), p.id DESC LIMIT 300`, [q, like]));
  }));
  const gallery = (productId) => rows(db, 'SELECT id, image_url AS url, alt_text AS alt, color, focus_x AS "focusX", focus_y AS "focusY", display_order FROM product_images WHERE product_id = $1 ORDER BY display_order, id', [productId]);
  const pid = z.coerce.number().int().positive();

  r.get('/products/:id/images', staff, wrap(async (req, res) => res.json(await gallery(pid.parse(req.params.id)))));
  r.post('/products/:id/images', staff, wrap(async (req, res) => {
    const id = pid.parse(req.params.id);
    const d = z.object({ url: imageUrl, alt: z.string().trim().max(200).default(''), color: z.string().trim().max(40).nullable().default(null) }).parse(req.body);
    if (!(await one(db, 'SELECT 1 AS x FROM products WHERE id = $1', [id]))) throw new HttpError(404, 'Product not found');
    await db.query(`INSERT INTO product_images (product_id, image_url, alt_text, color, display_order)
                    VALUES ($1, $2, $3, $4, COALESCE((SELECT MAX(display_order) + 1 FROM product_images WHERE product_id = $1), 0))`, [id, d.url, d.alt, d.color]);
    await audit(db, req.user.id, 'product.image.add', 'product', id, { url: d.url });
    res.status(201).json(await gallery(id));
  }));
  r.put('/products/:id/images/order', staff, wrap(async (req, res) => {
    const id = pid.parse(req.params.id);
    const { ids } = z.object({ ids: z.array(z.number().int()).max(60) }).parse(req.body);
    await db.tx(async t => { for (const [i, imgId] of ids.entries()) await t.query('UPDATE product_images SET display_order = $1 WHERE id = $2 AND product_id = $3', [i, imgId, id]) });
    res.json(await gallery(id));
  }));
  r.patch('/images/:imageId', staff, wrap(async (req, res) => {
    const pct = z.number().int().min(0).max(100).nullable();
    const d = z.object({ alt: z.string().trim().max(200).optional(), color: z.string().trim().max(40).nullable().optional(), focusX: pct.optional(), focusY: pct.optional() })
      .refine(b => b.alt !== undefined || b.color !== undefined || b.focusX !== undefined || b.focusY !== undefined, 'Nothing to change')
      .refine(b => (b.focusX === undefined) === (b.focusY === undefined) && ((b.focusX === null) === (b.focusY === null)), 'Set both focus values, or clear both').parse(req.body);
    const u = await db.query(`UPDATE product_images SET alt_text = CASE WHEN $2::boolean THEN $3 ELSE alt_text END, color = CASE WHEN $4::boolean THEN $5 ELSE color END,
                              focus_x = CASE WHEN $6::boolean THEN $7::smallint ELSE focus_x END, focus_y = CASE WHEN $6::boolean THEN $8::smallint ELSE focus_y END WHERE id = $1 RETURNING product_id`,
      [pid.parse(req.params.imageId), d.alt !== undefined, d.alt ?? null, d.color !== undefined, d.color || null, d.focusX !== undefined, d.focusX ?? null, d.focusY ?? null]);
    if (!u.rows.length) throw new HttpError(404, 'Image not found');
    res.json(await gallery(u.rows[0].product_id));
  }));
  r.delete('/images/:imageId', staff, wrap(async (req, res) => {
    const d = await db.query('DELETE FROM product_images WHERE id = $1 RETURNING product_id, image_url', [pid.parse(req.params.imageId)]);
    if (!d.rows.length) throw new HttpError(404, 'Image not found');
    await dropIfOrphan(db, d.rows[0].image_url);
    await audit(db, req.user.id, 'product.image.remove', 'product', d.rows[0].product_id);
    res.json(await gallery(d.rows[0].product_id));
  }));

  // ---- category + collection cover images ----
  const covers = (table, col, posCol, fallbackSql) => {
    // `fallback` is the product photo the site uses while no cover is uploaded, so staff can position the photo that is really shown.
    r.get(`/${table}`, staff, wrap(async (_req, res) => res.json(await rows(db, `SELECT t.id, t.name, t.slug, t.${col} AS image, t.${posCol} AS pos, (${fallbackSql}) AS fallback FROM ${table} t ORDER BY t.display_order, t.id`))));
    r.put(`/${table}/:id/focus`, staff, wrap(async (req, res) => {
      const { pos } = z.object({ pos: z.string().regex(/^\d{1,3}% \d{1,3}%$/).nullable() }).parse(req.body);
      const u = await db.query(`UPDATE ${table} SET ${posCol} = $2 WHERE id = $1 RETURNING id`, [pid.parse(req.params.id), pos]);
      if (!u.rows.length) throw new HttpError(404, 'Not found');
      await audit(db, req.user.id, `${table}.focus`, table, req.params.id);
      res.json({ ok: true });
    }));
    r.put(`/${table}/:id/image`, staff, wrap(async (req, res) => {
      const { url } = z.object({ url: imageUrl.nullable() }).parse(req.body);
      const old = await one(db, `SELECT ${col} AS image FROM ${table} WHERE id = $1`, [pid.parse(req.params.id)]);
      if (!old) throw new HttpError(404, 'Not found');
      await db.query(`UPDATE ${table} SET ${col} = $2 WHERE id = $1`, [pid.parse(req.params.id), url]);
      await dropIfOrphan(db, old.image);
      await audit(db, req.user.id, `${table}.image`, table, req.params.id);
      res.json({ ok: true });
    }));
  };
  covers('categories', 'image_url', 'image_pos', `SELECT image_url FROM product_images i JOIN products p ON p.id = i.product_id WHERE p.category_id = t.id AND p.status = 'active' ORDER BY p.featured DESC, i.display_order, i.id LIMIT 1`);
  covers('collections', 'hero_image', 'hero_pos', `SELECT (SELECT image_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.display_order, i.id LIMIT 1) FROM collection_products cp JOIN products p ON p.id = cp.product_id WHERE cp.collection_id = t.id AND p.status = 'active' ORDER BY cp.display_order, p.id LIMIT 1`);
  return r;
}
