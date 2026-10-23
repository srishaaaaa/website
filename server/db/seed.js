import bcrypt from 'bcryptjs';
import { one } from './index.js';

// Placeholder catalog so the storefront has something real to render. Replace with genuine inventory in /admin.
const CATEGORIES = [['Sarees', 'sarees'], ['Kurtas', 'kurtas'], ['Dresses', 'dresses'], ['Co-ords', 'co-ords'], ['Festive', 'festive']];
// [slug, name, category, price(paise), gst%, featured, colors, stockBySize]
const PRODUCTS = [
  ['banarasi-silk-saree', 'Banarasi Silk Saree', 'sarees', 1850000, 5, true, ['Default'], { S: 10, M: 10, L: 10 }],
  ['midnight-kurta-set', 'Midnight Kurta Set', 'kurtas', 680000, 5, true, ['Midnight', 'Ivory'], { S: 8, M: 8, L: 0 }],
  ['champagne-co-ord', 'Champagne Co-ord Set', 'co-ords', 540000, 5, true, ['Default'], { S: 10, M: 10, L: 10 }],
  ['rose-organza-dress', 'Rose Organza Dress', 'dresses', 920000, 12, false, ['Default'], { S: 6, M: 6, L: 6 }],
  ['plum-festive-lehenga', 'Plum Festive Lehenga', 'festive', 3200000, 12, true, ['Default'], { S: 4, M: 4, L: 4 }],
  ['ivory-chanderi-saree', 'Ivory Chanderi Saree', 'sarees', 1280000, 5, false, ['Default'], { S: 5, M: 5, L: 5 }],
  ['onyx-anarkali-kurta', 'Onyx Anarkali Kurta', 'kurtas', 890000, 5, false, ['Default'], { S: 0, M: 0, L: 0 }],
  ['gold-thread-co-ord', 'Gold Thread Co-ord', 'co-ords', 760000, 5, false, ['Default'], { S: 7, M: 7, L: 7 }],
  ['dusk-silk-dress', 'Dusk Silk Dress', 'dresses', 1150000, 12, true, ['Default'], { S: 3, M: 3, L: 3 }],
];

export async function seed(db, cfg, log = console.log) {
  await db.tx(async t => {
    for (const [i, [name, slug]] of CATEGORIES.entries())
      await t.query('INSERT INTO categories (name, slug, display_order) VALUES ($1,$2,$3) ON CONFLICT (slug) DO NOTHING', [name, slug, i]);
    await t.query(`INSERT INTO shipping_methods (code, name, base_amount, free_over) VALUES ('standard','Standard shipping',9900,500000) ON CONFLICT (code) DO NOTHING`);

    for (const [slug, name, cat, price, gst, featured, colors, stock] of PRODUCTS) {
      const c = await one(t, 'SELECT id FROM categories WHERE slug = $1', [cat]);
      const p = await one(t, `INSERT INTO products (slug, name, description, category_id, base_price, tax_rate, status, featured)
        VALUES ($1,$2,'Replace with your real product description.',$3,$4,$5,'active',$6) ON CONFLICT (slug) DO NOTHING RETURNING id`, [slug, name, c.id, price, gst, featured]);
      if (!p) continue;
      for (const color of colors) for (const [size, qty] of Object.entries(stock)) {
        const sku = `${slug}-${color}-${size}`.toUpperCase().replace(/[^A-Z0-9]+/g, '-');
        const v = await one(t, 'INSERT INTO product_variants (product_id, sku, size, color, stock_quantity) VALUES ($1,$2,$3,$4,$5) RETURNING id', [p.id, sku, size, color, qty]);
        if (qty) await t.query(`INSERT INTO inventory_movements (variant_id, quantity_change, reason) VALUES ($1,$2,'initial_stock')`, [v.id, qty]);
      }
    }

    const col = async (slug, name, description, order, products) => {
      const c = await one(t, `INSERT INTO collections (slug, name, description, display_order) VALUES ($1,$2,$3,$4) ON CONFLICT (slug) DO NOTHING RETURNING id`, [slug, name, description, order]);
      if (!c) return;
      for (const [i, ps] of products.entries()) await t.query('INSERT INTO collection_products (collection_id, product_id, display_order) SELECT $1, id, $2 FROM products WHERE slug = $3', [c.id, i, ps]);
    };
    await col('curated-edit', 'The Curated Edit', 'Pieces chosen by the boutique.', 0, ['banarasi-silk-saree', 'midnight-kurta-set', 'champagne-co-ord', 'dusk-silk-dress']);
    await col('festive-edit', 'The Festive Edit', 'For celebrations.', 1, ['plum-festive-lehenga', 'banarasi-silk-saree', 'gold-thread-co-ord']);
    await col('evening-edit', 'The Evening Edit', 'After-dark silhouettes.', 2, ['rose-organza-dress', 'dusk-silk-dress', 'midnight-kurta-set']);

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
