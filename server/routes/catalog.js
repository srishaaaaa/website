import { Router } from 'express';
import { z } from 'zod';
import { HttpError, csv, wrap } from '../lib/http.js';
import { collectionBySlug, facets, listCategories, listCollections, listProducts, productBySlug } from '../lib/catalog.js';
import { rows } from '../db/index.js';

const num = z.coerce.number().int().min(0).optional();
const query = z.object({
  q: z.string().trim().max(100).optional(), collection: z.string().max(80).optional(), featured: z.enum(['1', 'true']).optional(),
  category: csv, material: csv, size: csv, color: csv, slugs: csv, min: num, max: num, stock: z.enum(['1', 'true']).optional(),
  sort: z.enum(['featured', 'newest', 'price-asc', 'price-desc']).default('featured'),
  page: z.coerce.number().int().min(1).max(500).default(1), limit: z.coerce.number().int().min(1).max(48).default(12),
  facets: z.enum(['1']).optional(),
}).transform(v => ({ ...v, featured: !!v.featured, stock: !!v.stock }));

export default function catalog({ db }) {
  const r = Router();

  r.get('/products', wrap(async (req, res) => {
    const f = query.parse(req.query);
    const result = await listProducts(db, f);
    res.json(f.facets ? { ...result, facets: await facets(db, f) } : result);
  }));

  r.get('/products/:slug', wrap(async (req, res) => {
    const p = await productBySlug(db, req.params.slug);
    if (!p) throw new HttpError(404, 'Product not found');
    res.json(p);
  }));

  r.get('/categories', wrap(async (_req, res) => res.json(await listCategories(db))));
  r.get('/collections', wrap(async (_req, res) => res.json(await listCollections(db))));
  r.get('/collections/:slug', wrap(async (req, res) => {
    const c = await collectionBySlug(db, req.params.slug);
    if (!c) throw new HttpError(404, 'Collection not found');
    res.json(c);
  }));

  // Live search suggestions: products + matching categories and collections.
  r.get('/search/suggest', wrap(async (req, res) => {
    const { q } = z.object({ q: z.string().trim().min(1).max(100) }).parse(req.query);
    const { items } = await listProducts(db, { q, limit: 5, sort: 'featured' });
    const like = `%${q.replace(/[\\%_]/g, m => '\\' + m)}%`;
    const [categories, collections] = await Promise.all([
      rows(db, `SELECT name, slug FROM categories WHERE active AND name ILIKE $1 ORDER BY display_order LIMIT 3`, [like]),
      rows(db, `SELECT name, slug FROM collections WHERE status = 'published' AND name ILIKE $1 ORDER BY display_order LIMIT 3`, [like]),
    ]);
    res.json({ products: items, categories, collections });
  }));
  return r;
}
