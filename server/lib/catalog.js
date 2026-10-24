import { rows, one } from '../db/index.js';

const BASE_SELECT = `
  SELECT p.id, p.slug, p.name, p.description, c.name AS category, c.slug AS category_slug,
         p.base_price AS price, p.material, p.currency,
         (SELECT image_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.display_order, i.id OFFSET 1 LIMIT 1) AS image2, p.tax_rate AS gst_rate, p.featured, p.created_at,
         (SELECT image_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.display_order, i.id LIMIT 1) AS image,
         (SELECT CASE WHEN focus_x IS NOT NULL THEN focus_x || '% ' || focus_y || '%' END FROM product_images i WHERE i.product_id = p.id ORDER BY i.display_order, i.id LIMIT 1) AS image_pos,
         COALESCE(st.stock, 0)::int AS stock, st.single_variant,
         COALESCE(st.sizes, ARRAY[]::text[]) AS sizes, COALESCE(st.colors, ARRAY[]::text[]) AS colors
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN LATERAL (
    SELECT SUM(v.stock_quantity) AS stock,
           array_agg(DISTINCT v.size) FILTER (WHERE v.stock_quantity > 0) AS sizes,
           array_agg(DISTINCT v.color) FILTER (WHERE v.stock_quantity > 0) AS colors,
           CASE WHEN COUNT(*) FILTER (WHERE v.stock_quantity > 0) = 1 THEN MIN(v.id) FILTER (WHERE v.stock_quantity > 0) END AS single_variant
    FROM product_variants v WHERE v.product_id = p.id AND v.active
  ) st ON true`;

const like = s => `%${s.replace(/[\\%_]/g, m => '\\' + m)}%`;

// Builds a parameterised WHERE clause. `scope` = true limits to the facet base (no user filters).
function where(f, { baseOnly = false } = {}) {
  const w = ["p.status = 'active'"], a = [];
  const add = v => { a.push(v); return '$' + a.length };
  if (f.collection) w.push(`EXISTS (SELECT 1 FROM collection_products cp JOIN collections col ON col.id = cp.collection_id WHERE cp.product_id = p.id AND col.slug = ${add(f.collection)} AND col.status = 'published')`);
  if (f.slugs?.length) w.push(`p.slug = ANY(${add(f.slugs)})`);
  if (f.q) { const p = add(like(f.q)); w.push(`(p.name ILIKE ${p} OR p.description ILIKE ${p} OR c.name ILIKE ${p} OR p.material ILIKE ${p})`) }
  if (f.featured) w.push('p.featured');
  if (!baseOnly) {
    if (f.category?.length) w.push(`c.slug = ANY(${add(f.category)})`);
    if (f.material?.length) w.push(`p.material = ANY(${add(f.material)})`);
    if (f.size?.length) w.push(`EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active AND v.stock_quantity > 0 AND v.size = ANY(${add(f.size)}))`);
    if (f.color?.length) w.push(`EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active AND v.stock_quantity > 0 AND v.color = ANY(${add(f.color)}))`);
    if (f.min != null) w.push(`p.base_price >= ${add(f.min)}`);
    if (f.max != null) w.push(`p.base_price <= ${add(f.max)}`);
    if (f.stock) w.push('COALESCE(st.stock, 0) > 0');
  }
  return { sql: w.join(' AND '), a };
}

const ORDER = {
  featured: 'p.featured DESC, p.id DESC',
  newest: 'p.created_at DESC, p.id DESC',
  'price-asc': 'p.base_price ASC, p.id DESC',
  'price-desc': 'p.base_price DESC, p.id DESC',
};

export async function listProducts(q, f) {
  const { sql, a } = where(f);
  const limit = Math.min(f.limit ?? 12, 48), page = Math.max(f.page ?? 1, 1);
  const items = await rows(q, `${BASE_SELECT} WHERE ${sql} ORDER BY ${ORDER[f.sort] || ORDER.featured} LIMIT ${limit} OFFSET ${(page - 1) * limit}`, a);
  const { total } = await one(q, `SELECT COUNT(*)::int AS total FROM products p LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN LATERAL (SELECT SUM(v.stock_quantity) AS stock FROM product_variants v WHERE v.product_id = p.id AND v.active) st ON true WHERE ${sql}`, a);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

// Filter options for the current base set (collection / search), independent of the user's own selections.
export async function facets(q, f) {
  const { sql, a } = where(f, { baseOnly: true });
  const from = `FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE ${sql}`;
  const [categories, sizes, colors, price, materials] = await Promise.all([
    rows(q, `SELECT DISTINCT c.slug, c.name, c.display_order ${from} AND c.id IS NOT NULL ORDER BY c.display_order, c.name`, a),
    rows(q, `SELECT DISTINCT v.size FROM product_variants v JOIN products p ON p.id = v.product_id LEFT JOIN categories c ON c.id = p.category_id WHERE v.active AND v.stock_quantity > 0 AND ${sql}`, a),
    rows(q, `SELECT DISTINCT v.color FROM product_variants v JOIN products p ON p.id = v.product_id LEFT JOIN categories c ON c.id = p.category_id WHERE v.active AND v.stock_quantity > 0 AND ${sql}`, a),
    one(q, `SELECT COALESCE(MAX(p.base_price), 0)::int AS max ${from}`, a),
    rows(q, `SELECT DISTINCT p.material ${from} AND p.material IS NOT NULL ORDER BY p.material`, a),
  ]);
  return { categories: categories.map(({ slug, name }) => ({ slug, name })), sizes: sizes.map(r => r.size), colors: colors.map(r => r.color).sort(), materials: materials.map(r => r.material), maxPrice: price.max };
}

export async function productBySlug(q, slug) {
  const p = await one(q, `${BASE_SELECT} WHERE p.status = 'active' AND p.slug = $1`, [slug]);
  if (!p) return null;
  const extra = await one(q, 'SELECT material FROM products WHERE id = $1', [p.id]);
  const [variants, images] = await Promise.all([
    rows(q, `SELECT v.id, v.sku, v.size, v.color, v.stock_quantity AS stock, COALESCE(v.price_override, $2) AS price
             FROM product_variants v WHERE v.product_id = $1 AND v.active ORDER BY v.id`, [p.id, p.price]),
    rows(q, 'SELECT image_url AS url, alt_text AS alt, variant_id, color, focus_x AS "focusX", focus_y AS "focusY" FROM product_images WHERE product_id = $1 ORDER BY display_order, id', [p.id]),
  ]);
  const related = await rows(q, `${BASE_SELECT} WHERE p.status = 'active' AND p.id <> $1 ORDER BY (p.category_id IS NOT DISTINCT FROM (SELECT category_id FROM products WHERE id = $1)) DESC, p.featured DESC, p.id DESC LIMIT 4`, [p.id]);
  return { ...p, material: extra.material, variants, images, related };
}

export const listCategories = (q) => rows(q, `
  SELECT c.id, c.name, c.slug, c.description, c.image_url, c.image_pos,
         (SELECT image_url FROM product_images i JOIN products p ON p.id = i.product_id WHERE p.category_id = c.id AND p.status = 'active' ORDER BY p.featured DESC, i.display_order, i.id LIMIT 1) AS cover_image,
         (SELECT COUNT(*)::int FROM products p WHERE p.category_id = c.id AND p.status = 'active') AS product_count
  FROM categories c WHERE c.active ORDER BY c.display_order, c.name`);

export const listCollections = (q) => rows(q, `
  SELECT col.id, col.name, col.slug, col.description, col.hero_image, col.hero_pos,
         (SELECT COUNT(*)::int FROM collection_products cp JOIN products p ON p.id = cp.product_id WHERE cp.collection_id = col.id AND p.status = 'active') AS product_count,
         (SELECT json_build_object('slug', p.slug, 'name', p.name, 'image', (SELECT image_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.display_order, i.id LIMIT 1))
            FROM collection_products cp JOIN products p ON p.id = cp.product_id
            WHERE cp.collection_id = col.id AND p.status = 'active' ORDER BY cp.display_order, p.id LIMIT 1) AS cover
  FROM collections col WHERE col.status = 'published'
  ORDER BY col.display_order, col.id`).then(r => r.filter(c => c.product_count > 0));

export const collectionBySlug = (q, slug) => one(q, `SELECT id, name, slug, description, hero_image FROM collections WHERE slug = $1 AND status = 'published'`, [slug]);
