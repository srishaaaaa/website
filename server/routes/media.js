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
             (SELECT COUNT(*)::int FROM product_images i WHERE i.product_id = p.id) AS image_count,
             (SELECT image_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.display_order, i.id LIMIT 1) AS image
      FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE $1 = '' OR p.name ILIKE $2 OR p.slug ILIKE $2 ORDER BY (SELECT COUNT(*) FROM product_images i WHERE i.product_id = p.id), p.id DESC LIMIT 300`, [q, like]));
  }));
  const gallery = (productId) => rows(db, 'SELECT id, image_url AS url, alt_text AS alt, display_order FROM product_images WHERE product_id = $1 ORDER BY display_order, id', [productId]);
  const pid = z.coerce.number().int().positive();

  r.get('/products/:id/images', staff, wrap(async (req, res) => res.json(await gallery(pid.parse(req.params.id)))));
  r.post('/products/:id/images', staff, wrap(async (req, res) => {
    const id = pid.parse(req.params.id);
    const d = z.object({ url: imageUrl, alt: z.string().trim().max(200).default('') }).parse(req.body);
    if (!(await one(db, 'SELECT 1 AS x FROM products WHERE id = $1', [id]))) throw new HttpError(404, 'Product not found');
    await db.query(`INSERT INTO product_images (product_id, image_url, alt_text, display_order)
                    VALUES ($1, $2, $3, COALESCE((SELECT MAX(display_order) + 1 FROM product_images WHERE product_id = $1), 0))`, [id, d.url, d.alt]);
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
    const { alt } = z.object({ alt: z.string().trim().max(200) }).parse(req.body);
    const u = await db.query('UPDATE product_images SET alt_text = $2 WHERE id = $1 RETURNING product_id', [pid.parse(req.params.imageId), alt]);
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
  const covers = (table, col) => {
    r.get(`/${table}`, staff, wrap(async (_req, res) => res.json(await rows(db, `SELECT id, name, slug, ${col} AS image FROM ${table} ORDER BY display_order, id`))));
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
  covers('categories', 'image_url');
  covers('collections', 'hero_image');
  return r;
}
