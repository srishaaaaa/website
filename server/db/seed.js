import bcrypt from 'bcryptjs';
import { one } from './index.js';
import { CATEGORIES, COLLECTIONS_BY_FLAG, CORE, DEMO_REVIEWS, MORE, SIZE_SETS } from './catalog-data.js';

const skuOf = (...p) => p.join('-').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
// Deterministic stock so the sample catalogue shows a realistic mix (in stock, low, sold out) every time it is seeded.
const stockFor = (slug, size, flags) => {
  if (flags.includes('X')) return 0;
  let h = 0; for (const ch of slug + size) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 7 === 0 ? 0 : 1 + (h % 9);
};
const gstFor = rupees => (rupees <= 2500 ? 5 : 18);

async function addProduct(t, { slug, name, category, price, gst, featured, material, variants }) {
  const c = await one(t, 'SELECT id FROM categories WHERE slug = $1', [category]);
  const p = await one(t, `INSERT INTO products (slug, name, description, category_id, base_price, tax_rate, material, status, featured, is_sample)
    VALUES ($1,$2,'Sample product. Replace with your real product description.',$3,$4,$5,$6,'active',$7,true) ON CONFLICT (slug) DO NOTHING RETURNING id`, [slug, name, c.id, price, gst, material ?? null, featured]);
  if (!p) return false;
  const params = [], values = [];
  for (const v of variants) { params.push(p.id, v.sku, v.size, v.color, v.stock); const n = params.length; values.push(`($${n - 4},$${n - 3},$${n - 2},$${n - 1},$${n})`) }
  const rows = (await t.query(`INSERT INTO product_variants (product_id, sku, size, color, stock_quantity) VALUES ${values.join(',')} RETURNING id, stock_quantity`, params)).rows;
  const stocked = rows.filter(r => r.stock_quantity > 0);
  if (stocked.length) {
    const mp = [], mv = [];
    for (const r of stocked) { mp.push(r.id, r.stock_quantity); const n = mp.length; mv.push(`($${n - 1},$${n},'initial_stock')`) }
    await t.query(`INSERT INTO inventory_movements (variant_id, quantity_change, reason) VALUES ${mv.join(',')}`, mp);
  }
  return true;
}

// `sample: false` creates only the structure (categories, shipping) and the owner account: no demo products.
export async function seed(db, cfg, log = console.log, { sample = true } = {}) {
  await db.tx(async t => {
    for (const [i, [name, slug]] of CATEGORIES.entries()) {
      await t.query('INSERT INTO categories (name, slug, display_order) VALUES ($1,$2,$3) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order', [name, slug, i]);
    }
    await t.query(`INSERT INTO shipping_methods (code, name, base_amount, free_over) VALUES ('standard','Standard shipping',9900,500000) ON CONFLICT (code) DO NOTHING`);

    if (sample) for (const [slug, name, category, price, gst, featured, colors, stock, material] of CORE) {
      const variants = colors.flatMap(color => Object.entries(stock).map(([size, qty]) => ({ sku: skuOf(slug, color, size), size, color, stock: qty })));
      await addProduct(t, { slug, name, category, price, gst, featured, material, variants });
      await t.query('UPDATE products SET material = $2 WHERE slug = $1 AND material IS NULL', [slug, material]);
    }
    const flagged = { T: [], B: [] };
    if (sample) for (const [slug, name, category, rupees, material, colors, sizeSet, flags] of MORE) {
      const variants = colors.flatMap(color => SIZE_SETS[sizeSet].map(size => ({ sku: skuOf(slug, color, size), size, color, stock: stockFor(slug, size + color, flags) })));
      if (!flags.includes('X') && variants.every(v => v.stock === 0)) variants[0].stock = 3;
      await addProduct(t, { slug, name, category, price: rupees * 100, gst: gstFor(rupees), featured: flags.includes('F'), material, variants });
      for (const f of ['T', 'B']) if (flags.includes(f)) flagged[f].push(slug);
    }

    const col = async (slug, name, description, order, products) => {
      const c = await one(t, `INSERT INTO collections (slug, name, description, display_order) VALUES ($1,$2,$3,$4) ON CONFLICT (slug) DO NOTHING RETURNING id`, [slug, name, description, order]);
      if (!c) return;
      for (const [i, ps] of products.entries()) await t.query('INSERT INTO collection_products (collection_id, product_id, display_order) SELECT $1, id, $2 FROM products WHERE slug = $3', [c.id, i, ps]);
    };
    if (sample) {
    await col('curated-edit', 'The Curated Edit', 'Pieces chosen by the boutique.', 0, ['banarasi-silk-saree', 'midnight-kurta-set', 'champagne-co-ord', 'dusk-silk-dress']);
    await col('festive-edit', 'The Festive Edit', 'For celebrations.', 1, ['plum-festive-lehenga', 'banarasi-silk-saree', 'gold-thread-co-ord']);
    await col('evening-edit', 'The Evening Edit', 'After-dark silhouettes.', 2, ['rose-organza-dress', 'dusk-silk-dress', 'midnight-kurta-set']);
    for (const [slug, name, description, order, flag] of COLLECTIONS_BY_FLAG) await col(slug, name, description, order, flagged[flag]);
    // "New Arrivals" (made by migration 020) starts with the 12 newest pieces when it is still empty; the admin edits it afterwards.
    await t.query(`INSERT INTO collection_products (collection_id, product_id, display_order)
      SELECT c.id, p.id, ROW_NUMBER() OVER (ORDER BY p.created_at DESC, p.id DESC) - 1
      FROM collections c, (SELECT id, created_at FROM products WHERE status = 'active' ORDER BY created_at DESC, id DESC LIMIT 12) p
      WHERE c.slug = 'new-arrivals' AND NOT EXISTS (SELECT 1 FROM collection_products x WHERE x.collection_id = c.id)`);
    // products created by an earlier seed (before the sample flag existed) are flagged too, so they can be deleted from the admin
    await t.query('UPDATE products SET is_sample = true WHERE slug = ANY($1)', [[...CORE.map(p => p[0]), ...MORE.map(p => p[0])]]);
    }

    // Store settings start empty: no invented address, hours or social handles.
    await t.query(`INSERT INTO store_settings (key, value) VALUES ('store', $1), ('social', $2) ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify({ name: 'DHANYA', address: null, phone: null, email: null, timeZone: 'Asia/Kolkata', hours: null }), JSON.stringify({ instagram: { handle: null, url: null, posts: [] }, links: [] })]);

    if (cfg.ADMIN_EMAIL && cfg.ADMIN_PASSWORD) {
      await t.query(`INSERT INTO profiles (email, password_hash, full_name, role) VALUES ($1,$2,'Owner','owner') ON CONFLICT (lower(email)) DO NOTHING`,
        [cfg.ADMIN_EMAIL, await bcrypt.hash(cfg.ADMIN_PASSWORD, 12)]);
    }
  });
  log('Seeded (idempotent). Sample products are placeholders — replace with real inventory and images.');
}

// Sample reviews: clearly flagged (is_demo), labelled "Sample review" in the UI, switchable off via flags.demoReviews.
export async function seedDemoReviews(db, log = console.log) {
  // Tops up any missing sample review (matched by product + author). Existing ones are left alone.
  await db.tx(async t => {
    let n = 0;
    for (const [i, [slug, author, rating, body]] of DEMO_REVIEWS.entries()) {
      const r = await t.query(`INSERT INTO product_reviews (product_id, user_id, rating, body, status, is_demo, author_name, created_at)
        SELECT p.id, NULL, $2, $3, 'published', true, $4, now() - ($5 || ' hours')::interval FROM products p
        WHERE p.slug = $1 AND NOT EXISTS (SELECT 1 FROM product_reviews x WHERE x.product_id = p.id AND x.is_demo AND x.author_name = $4)
        RETURNING id`, [slug, rating, body, author, String(i * 9)]);
      n += r.rows.length;
    }
    await t.query(`INSERT INTO store_settings (key, value) VALUES ('flags', $1) ON CONFLICT (key) DO NOTHING`, [JSON.stringify({ demoReviews: true })]);
    log(`Sample reviews: ${n} added (flagged as samples).`);
  });
}

const ENQ = [
  ['retail', 'Priya (sample)', null, '99999 00001', 'priya.sample@example.com', 'Red Kanjivaram silk saree for a wedding', null, 'Sample enquiry. Do you have this in stock?'],
  ['retail', 'Meena (sample)', null, '99999 00002', null, 'Cotton sarees for daily wear', null, 'Sample enquiry.'],
  ['wholesale', 'Ravi (sample)', 'Sample Textiles', '99999 00003', 'ravi.sample@example.com', 'Silk sarees for resale', '50 sarees', 'Sample wholesale enquiry. Please share your rates.'],
  ['wholesale', 'Kavitha (sample)', 'Sample Saree Mahal', '99999 00004', null, 'Bridal collection', '20 sarees', 'Sample wholesale enquiry.'],
];
// Sample enquiries so the admin inbox is not empty. Flagged so they can be deleted (individually or via Admin → Sample data).
export async function seedDemoEnquiries(db, log = console.log) {
  const has = await one(db, 'SELECT 1 AS x FROM enquiries WHERE is_sample LIMIT 1');
  if (has) return;
  for (const e of ENQ) await db.query('INSERT INTO enquiries (kind, name, business, phone, email, interest, quantity, message, is_sample) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)', e);
  log('Sample enquiries added (flagged as samples).');
}
