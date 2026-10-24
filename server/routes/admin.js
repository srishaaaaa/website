import { Router } from 'express';
import { z } from 'zod';
import { one, rows } from '../db/index.js';
import { HttpError, wrap } from '../lib/http.js';
import bcrypt from 'bcryptjs';
import { audit } from '../lib/orders.js';

// Server-side RBAC: every route sits behind a role check that reads the role fresh from the database.
export default function admin({ db, auth }) {
  const r = Router();
  const staff = auth.role('owner', 'admin');
  const stock = auth.role('owner', 'admin', 'inventory');

  r.get('/stats', staff, wrap(async (_req, res) => res.json(await one(db, `
    SELECT COUNT(*)::int AS "paidOrders", COALESCE(SUM(total_amount), 0)::int AS gross,
           COALESCE(AVG(total_amount), 0)::int AS "averageOrder"
    FROM orders WHERE payment_status = 'paid'`))));

  r.get('/orders', staff, wrap(async (_req, res) => res.json(await rows(db, `
    SELECT o.id, o.order_number, o.email, o.status, o.payment_status, o.total_amount AS total, o.created_at,
           (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count
    FROM orders o ORDER BY o.id DESC LIMIT 200`))));

  r.patch('/orders/:number', staff, wrap(async (req, res) => {
    const { status } = z.object({ status: z.enum(['confirmed', 'packed', 'shipped', 'delivered', 'cancelled']) }).parse(req.body);
    const o = await one(db, 'SELECT status, payment_status FROM orders WHERE order_number = $1', [req.params.number]);
    if (!o) throw new HttpError(404, 'Order not found');
    if (o.payment_status !== 'paid' && status !== 'cancelled') throw new HttpError(409, 'Only paid orders can be fulfilled');
    await db.query('UPDATE orders SET status = $2, updated_at = now() WHERE order_number = $1', [req.params.number, status]);
    await audit(db, req.user.id, 'order.status', 'order', req.params.number, { from: o.status, to: status });
    res.json({ ok: true });
  }));

  r.get('/reviews', staff, wrap(async (_req, res) => res.json(await rows(db, `
    SELECT rv.id, rv.rating, rv.body, rv.status, rv.created_at, rv.is_demo, p.name AS product_name, COALESCE(pr.email, rv.author_name || ' (sample)') AS email
    FROM product_reviews rv JOIN products p ON p.id = rv.product_id LEFT JOIN profiles pr ON pr.id = rv.user_id
    ORDER BY rv.status = 'pending' DESC, rv.id DESC LIMIT 200`))));
  r.patch('/reviews/:id', staff, wrap(async (req, res) => {
    const { status } = z.object({ status: z.enum(['published', 'rejected', 'pending']) }).parse(req.body);
    const id = z.coerce.number().int().parse(req.params.id);
    const u = await db.query('UPDATE product_reviews SET status = $2 WHERE id = $1 RETURNING id', [id, status]);
    if (!u.rows.length) throw new HttpError(404, 'Review not found');
    await audit(db, req.user.id, 'review.moderate', 'review', id, { status });
    res.json({ ok: true });
  }));

  r.delete('/reviews/:id', staff, wrap(async (req, res) => {
    const id = z.coerce.number().int().parse(req.params.id);
    const d = await db.query('DELETE FROM product_reviews WHERE id = $1 RETURNING id', [id]);
    if (!d.rows.length) throw new HttpError(404, 'Review not found');
    await audit(db, req.user.id, 'review.delete', 'review', id);
    res.json({ ok: true });
  }));

  const productBody = z.object({
    slug: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(1).max(160), description: z.string().max(5000).optional(),
    category: z.string().optional(), price: z.number().int().min(0), gst_rate: z.number().int().min(0).max(28).default(5),
    status: z.enum(['draft', 'active', 'archived']).default('draft'), featured: z.boolean().default(false),
    variants: z.array(z.object({ sku: z.string().min(1), size: z.string().min(1), color: z.string().default('Default'), stock: z.number().int().min(0).default(0) })).default([]),
  });
  r.post('/products', staff, wrap(async (req, res) => {
    const d = productBody.parse(req.body);
    const id = await db.tx(async t => {
      const cat = d.category ? await one(t, 'SELECT id FROM categories WHERE slug = $1', [d.category]) : null;
      const p = await one(t, `INSERT INTO products (slug, name, description, category_id, base_price, tax_rate, status, featured) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [d.slug, d.name, d.description ?? '', cat?.id ?? null, d.price, d.gst_rate, d.status, d.featured]);
      for (const v of d.variants) {
        const row = await one(t, 'INSERT INTO product_variants (product_id, sku, size, color, stock_quantity) VALUES ($1,$2,$3,$4,$5) RETURNING id', [p.id, v.sku, v.size, v.color, v.stock]);
        if (v.stock) await t.query('INSERT INTO inventory_movements (variant_id, quantity_change, reason) VALUES ($1,$2,$3)', [row.id, v.stock, 'initial_stock']);
      }
      await audit(t, req.user.id, 'product.create', 'product', d.slug);
      return p.id;
    }).catch(e => { if (e.code === '23505') throw new HttpError(409, 'Slug or SKU already exists'); throw e });
    res.status(201).json({ id });
  }));

  r.patch('/variants/:id/stock', stock, wrap(async (req, res) => {
    const { delta, reason } = z.object({ delta: z.number().int().refine(n => n !== 0), reason: z.string().max(100).default('manual_adjustment') }).parse(req.body);
    const id = z.coerce.number().int().parse(req.params.id);
    const left = await db.tx(async t => {
      const u = await t.query('UPDATE product_variants SET stock_quantity = stock_quantity + $1 WHERE id = $2 AND stock_quantity + $1 >= 0 RETURNING stock_quantity', [delta, id]);
      if (!u.rows.length) throw new HttpError(400, 'Invalid stock change');
      await t.query('INSERT INTO inventory_movements (variant_id, quantity_change, reason) VALUES ($1,$2,$3)', [id, delta, reason]);
      await audit(t, req.user.id, 'inventory.adjust', 'variant', id, { delta, reason });
      return u.rows[0].stock_quantity;
    });
    res.json({ ok: true, stock: left });
  }));
  // ---- categories & collections ("taxonomy") ----
  const slugOf = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item';
  const freeSlug = async (table, name) => { const base = slugOf(name); for (let i = 0; ; i++) { const slug = i ? `${base}-${i + 1}` : base; if (!(await one(db, `SELECT 1 AS x FROM ${table} WHERE slug = $1`, [slug]))) return slug } };
  r.get('/taxonomy', staff, wrap(async (_req, res) => res.json({
    categories: await rows(db, `SELECT c.id, c.name, c.slug, c.active, (SELECT COUNT(*)::int FROM products p WHERE p.category_id = c.id) AS products FROM categories c ORDER BY c.display_order, lower(c.name)`),
    collections: await rows(db, `SELECT c.id, c.name, c.slug, c.status, (SELECT COUNT(*)::int FROM collection_products cp WHERE cp.collection_id = c.id) AS products FROM collections c ORDER BY c.display_order, lower(c.name)`),
  })));
  const nameBody = z.object({ name: z.string().trim().min(1).max(80) });
  r.post('/categories', staff, wrap(async (req, res) => {
    const { name } = nameBody.parse(req.body);
    if (await one(db, 'SELECT 1 AS x FROM categories WHERE lower(name) = lower($1)', [name])) throw new HttpError(409, 'A category with that name already exists');
    const row = await one(db, 'INSERT INTO categories (name, slug, active, display_order) VALUES ($1,$2,true,(SELECT COALESCE(MAX(display_order), 0) + 1 FROM categories)) RETURNING id', [name, await freeSlug('categories', name)]);
    await audit(db, req.user.id, 'category.create', 'category', row.id, { name });
    res.status(201).json({ id: row.id });
  }));
  r.patch('/categories/:id', staff, wrap(async (req, res) => {
    const b = z.object({ active: z.boolean().optional(), name: z.string().trim().min(1).max(80).optional() }).parse(req.body);
    const id = z.coerce.number().int().parse(req.params.id);
    const u = await db.query('UPDATE categories SET active = COALESCE($2, active), name = COALESCE($3, name) WHERE id = $1 RETURNING id', [id, b.active ?? null, b.name ?? null]);
    if (!u.rows.length) throw new HttpError(404, 'Category not found');
    await audit(db, req.user.id, 'category.update', 'category', id, b);
    res.json({ ok: true });
  }));
  r.delete('/categories/:id', staff, wrap(async (req, res) => {
    const id = z.coerce.number().int().parse(req.params.id);
    const d = await db.query('DELETE FROM categories WHERE id = $1 RETURNING name', [id]);
    if (!d.rows.length) throw new HttpError(404, 'Category not found');
    await audit(db, req.user.id, 'category.delete', 'category', id, { name: d.rows[0].name });
    res.json({ ok: true });
  }));
  r.post('/collections', staff, wrap(async (req, res) => {
    const { name } = nameBody.parse(req.body);
    if (await one(db, 'SELECT 1 AS x FROM collections WHERE lower(name) = lower($1)', [name])) throw new HttpError(409, 'A collection with that name already exists');
    const row = await one(db, `INSERT INTO collections (name, slug, status, display_order) VALUES ($1,$2,'draft',(SELECT COALESCE(MAX(display_order), 0) + 1 FROM collections)) RETURNING id`, [name, await freeSlug('collections', name)]);
    await audit(db, req.user.id, 'collection.create', 'collection', row.id, { name });
    res.status(201).json({ id: row.id });
  }));
  r.patch('/collections/:id', staff, wrap(async (req, res) => {
    const b = z.object({ status: z.enum(['draft', 'published']).optional(), name: z.string().trim().min(1).max(80).optional() }).parse(req.body);
    const id = z.coerce.number().int().parse(req.params.id);
    const u = await db.query('UPDATE collections SET status = COALESCE($2, status), name = COALESCE($3, name) WHERE id = $1 RETURNING id', [id, b.status ?? null, b.name ?? null]);
    if (!u.rows.length) throw new HttpError(404, 'Collection not found');
    await audit(db, req.user.id, 'collection.update', 'collection', id, b);
    res.json({ ok: true });
  }));
  r.delete('/collections/:id', staff, wrap(async (req, res) => {
    const id = z.coerce.number().int().parse(req.params.id);
    const d = await db.query('DELETE FROM collections WHERE id = $1 RETURNING name', [id]);
    if (!d.rows.length) throw new HttpError(404, 'Collection not found');
    await audit(db, req.user.id, 'collection.delete', 'collection', id, { name: d.rows[0].name });
    res.json({ ok: true });
  }));

  // Users & roles. Everyone staff can see accounts; only an owner can change a role (never their own, never another owner's).
  r.get('/users', staff, wrap(async (_req, res) => res.json(await rows(db,
    `SELECT id, email, full_name AS name, role, created_at FROM profiles ORDER BY (role = 'customer'), id LIMIT 500`))));
  r.post('/users', auth.role('owner'), wrap(async (req, res) => {
    const d = z.object({ name: z.string().trim().max(120).default(''), email: z.string().trim().email().max(200), password: z.string().min(8).max(200),
      role: z.enum(['customer', 'cashier', 'inventory', 'admin']) }).parse(req.body);
    if (await one(db, 'SELECT 1 AS x FROM profiles WHERE lower(email) = lower($1)', [d.email])) throw new HttpError(409, 'That email is already registered', 'email_taken');
    const u = await one(db, 'INSERT INTO profiles (email, password_hash, full_name, role) VALUES ($1,$2,$3,$4) RETURNING id', [d.email, await bcrypt.hash(d.password, 12), d.name, d.role]);
    await audit(db, req.user.id, 'user.create', 'user', u.id, { role: d.role });
    res.status(201).json({ id: u.id });
  }));
  r.patch('/users/:id/role', auth.role('owner'), wrap(async (req, res) => {
    const { role } = z.object({ role: z.enum(['customer', 'cashier', 'inventory', 'admin']) }).parse(req.body);
    const id = z.coerce.number().int().parse(req.params.id);
    if (id === req.user.id) throw new HttpError(400, 'You cannot change your own role');
    const u = await one(db, 'SELECT role FROM profiles WHERE id = $1', [id]);
    if (!u) throw new HttpError(404, 'User not found');
    if (u.role === 'owner') throw new HttpError(403, 'An owner account cannot be changed here');
    await db.query('UPDATE profiles SET role = $2, updated_at = now() WHERE id = $1', [id, role]);
    await audit(db, req.user.id, 'user.role', 'user', id, { from: u.role, to: role });
    res.json({ ok: true });
  }));
  return r;
}
