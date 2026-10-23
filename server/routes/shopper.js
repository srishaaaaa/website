import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { one, rows } from '../db/index.js';
import { HttpError, wrap } from '../lib/http.js';
import { cartView, resolveCart, setQuantity } from '../lib/cart.js';
import { readSetting } from './settings.js';

const variantId = z.coerce.number().int().positive();
const qty = z.number().int().min(1).max(10);

export function cartRoutes(ctx) {
  const { db, auth } = ctx;
  const r = Router();
  r.use(auth.optional);
  const view = async (res, cart) => res.json(await cartView(db, cart));

  r.get('/', wrap(async (req, res) => view(res, await resolveCart(ctx, req, res))));
  r.post('/items', wrap(async (req, res) => {
    const d = z.object({ variantId, quantity: qty.default(1) }).parse(req.body);
    const cart = await resolveCart(ctx, req, res, { create: true });
    await setQuantity(db, cart.id, d.variantId, d.quantity, { add: true });
    await view(res, cart);
  }));
  r.patch('/items/:variantId', wrap(async (req, res) => {
    const id = variantId.parse(req.params.variantId);
    const d = z.object({ quantity: z.number().int().min(0).max(10) }).parse(req.body);
    const cart = await resolveCart(ctx, req, res);
    if (!cart) throw new HttpError(404, 'Cart not found');
    await setQuantity(db, cart.id, id, d.quantity);
    await view(res, cart);
  }));
  r.delete('/items/:variantId', wrap(async (req, res) => {
    const id = variantId.parse(req.params.variantId);
    const cart = await resolveCart(ctx, req, res);
    if (cart) await db.query('DELETE FROM cart_items WHERE cart_id = $1 AND variant_id = $2', [cart.id, id]);
    await view(res, cart);
  }));
  r.delete('/', wrap(async (req, res) => {
    const cart = await resolveCart(ctx, req, res);
    if (cart) await db.query('DELETE FROM cart_items WHERE cart_id = $1', [cart.id]);
    await view(res, cart);
  }));
  return r;
}

export function wishlistRoutes(ctx) {
  const { db, auth } = ctx;
  const r = Router();
  r.use(auth.required);
  const slugs = async userId => (await rows(db, `SELECT p.slug FROM wishlists w JOIN wishlist_items wi ON wi.wishlist_id = w.id JOIN products p ON p.id = wi.product_id
                                                  WHERE w.user_id = $1 AND p.status = 'active' ORDER BY wi.created_at`, [userId])).map(x => x.slug);
  const listId = async userId => (await one(db, 'INSERT INTO wishlists (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id', [userId])).id;
  const add = async (userId, slug) => {
    const p = await one(db, `SELECT id FROM products WHERE slug = $1 AND status = 'active'`, [slug]);
    if (!p) return;
    await db.query('INSERT INTO wishlist_items (wishlist_id, product_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [await listId(userId), p.id]);
  };
  const slug = z.string().min(1).max(120);

  r.get('/', wrap(async (req, res) => res.json({ slugs: await slugs(req.user.id) })));
  r.post('/', wrap(async (req, res) => { await add(req.user.id, slug.parse(req.body?.slug)); res.json({ slugs: await slugs(req.user.id) }) }));
  r.post('/merge', wrap(async (req, res) => {
    const list = z.array(slug).max(100).parse(req.body?.slugs ?? []);
    for (const s of list) await add(req.user.id, s);
    res.json({ slugs: await slugs(req.user.id) });
  }));
  r.delete('/:slug', wrap(async (req, res) => {
    await db.query(`DELETE FROM wishlist_items WHERE product_id = (SELECT id FROM products WHERE slug = $2) AND wishlist_id = (SELECT id FROM wishlists WHERE user_id = $1)`, [req.user.id, req.params.slug]);
    res.json({ slugs: await slugs(req.user.id) });
  }));
  return r;
}

export function newsletterRoutes({ db, cfg }) {
  const r = Router();
  const limiter = rateLimit({ windowMs: 60_000, limit: cfg.NODE_ENV === 'test' ? 1000 : 10, standardHeaders: true, legacyHeaders: false });
  r.post('/', limiter, wrap(async (req, res) => {
    const d = z.object({ email: z.string().trim().email().max(254), consent: z.literal(true) }).parse(req.body);
    const ins = await db.query('INSERT INTO newsletter_subscribers (email) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id', [d.email]);
    res.json({ status: ins.rows.length ? 'subscribed' : 'duplicate' });
  }));
  return r;
}

// Reviews: shown publicly only once moderated; only customers with a PAID order for the product can write one.
export function reviewRoutes(ctx) {
  const { db, auth } = ctx;
  const r = Router();

  r.get('/', wrap(async (req, res) => {
    const { page, limit } = z.object({ page: z.coerce.number().int().min(1).max(200).default(1), limit: z.coerce.number().int().min(1).max(24).default(6) }).parse(req.query);
    const { demoReviews } = await readSetting(db, 'flags');
    const visible = "rv.status = 'published' AND (NOT rv.is_demo OR $1::boolean)";
    const summary = await one(db, `SELECT COUNT(*)::int AS count, COALESCE(ROUND(AVG(rv.rating)::numeric, 1), 0)::float AS average, COALESCE(BOOL_AND(rv.is_demo), false) AS "onlySamples"
      FROM product_reviews rv WHERE ${visible}`, [!!demoReviews]);
    const items = await rows(db, `
      SELECT rv.id, rv.rating, rv.body, rv.created_at, rv.is_demo AS demo, rv.author_name, split_part(pr.full_name, ' ', 1) AS first_name,
             left(trim(substr(pr.full_name, length(split_part(pr.full_name, ' ', 1)) + 1)), 1) AS last_initial,
             p.name AS product_name, p.slug AS product_slug,
             (SELECT image_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.display_order, i.id LIMIT 1) AS product_image
      FROM product_reviews rv LEFT JOIN profiles pr ON pr.id = rv.user_id JOIN products p ON p.id = rv.product_id
      WHERE ${visible} ORDER BY rv.created_at DESC, rv.id DESC LIMIT $2 OFFSET $3`, [!!demoReviews, limit, (page - 1) * limit]);
    res.json({ ...summary, page, hasMore: page * limit < summary.count, items: items.map(i => ({
      id: i.id, rating: i.rating, body: i.body, created_at: i.created_at, product_name: i.product_name, product_slug: i.product_slug, product_image: i.product_image,
      author: i.author_name || [i.first_name || 'Customer', i.last_initial && i.last_initial + '.'].filter(Boolean).join(' '),
      demo: i.demo, verified: !i.demo })) });
  }));

  r.get('/eligible', auth.required, wrap(async (req, res) => res.json(await rows(db, `
    SELECT DISTINCT p.slug, p.name FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id
    WHERE o.user_id = $1 AND o.payment_status = 'paid'
      AND NOT EXISTS (SELECT 1 FROM product_reviews rv WHERE rv.product_id = p.id AND rv.user_id = $1) ORDER BY p.name`, [req.user.id]))));

  r.post('/', auth.required, wrap(async (req, res) => {
    const d = z.object({ slug: z.string().min(1).max(120), rating: z.number().int().min(1).max(5), body: z.string().trim().min(10, 'Please write at least 10 characters').max(600) }).parse(req.body);
    const bought = await one(db, `SELECT p.id FROM products p JOIN order_items oi ON oi.product_id = p.id JOIN orders o ON o.id = oi.order_id
                                  WHERE p.slug = $1 AND o.user_id = $2 AND o.payment_status = 'paid' LIMIT 1`, [d.slug, req.user.id]);
    if (!bought) throw new HttpError(403, 'Only customers who purchased this piece can review it', 'not_purchased');
    const ins = await db.query(`INSERT INTO product_reviews (product_id, user_id, rating, body) VALUES ($1,$2,$3,$4) ON CONFLICT (product_id, user_id) DO NOTHING RETURNING id`, [bought.id, req.user.id, d.rating, d.body]);
    if (!ins.rows.length) throw new HttpError(409, 'You have already reviewed this piece', 'duplicate');
    res.status(201).json({ ok: true, status: 'pending' });
  }));
  return r;
}
