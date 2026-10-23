import { rows, one } from '../db/index.js';
import { HttpError } from './http.js';
import { CART_COOKIE, cookieOpts, randomToken, sha256 } from './auth.js';

export const MAX_QTY = 10;
const GUEST_DAYS = 90;

// Finds the caller's cart. Signed-in customers get a user cart (a guest cart in the cookie is merged into it).
// Guests get a cookie-bound cart; only the token's SHA-256 hash is stored.
export async function resolveCart({ db, cfg }, req, res, { create = false } = {}) {
  const token = req.cookies?.[CART_COOKIE];
  const guest = token ? await one(db, 'SELECT id FROM carts WHERE guest_token_hash = $1', [sha256(token)]) : null;

  if (req.user) {
    let cart = await one(db, 'SELECT id FROM carts WHERE user_id = $1', [req.user.id]);
    if (!cart && (create || guest)) {
      cart = await one(db, 'INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO UPDATE SET updated_at = now() RETURNING id', [req.user.id]);
    }
    if (cart && guest) { await mergeCarts(db, guest.id, cart.id); res.clearCookie(CART_COOKIE, { ...cookieOpts(cfg), maxAge: undefined }) }
    return cart;
  }
  if (guest) return guest;
  if (!create) return null;
  const fresh = randomToken();
  const cart = await one(db, 'INSERT INTO carts (guest_token_hash) VALUES ($1) RETURNING id', [sha256(fresh)]);
  res.cookie(CART_COOKIE, fresh, cookieOpts(cfg, GUEST_DAYS * 86_400_000));
  return cart;
}

// Moves guest items into the user's cart, capping each line at available stock and MAX_QTY.
export async function mergeCarts(db, fromId, toId) {
  await db.tx(async t => {
    const items = await rows(t, `SELECT ci.variant_id, ci.quantity, v.stock_quantity AS stock FROM cart_items ci
                                 JOIN product_variants v ON v.id = ci.variant_id WHERE ci.cart_id = $1`, [fromId]);
    for (const it of items) {
      const cap = Math.max(1, Math.min(MAX_QTY, it.stock));
      await t.query(`INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES ($1, $2, LEAST($3::int, $4::int))
                     ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = LEAST($4::int, cart_items.quantity + EXCLUDED.quantity)`,
        [toId, it.variant_id, it.quantity, cap]);
    }
    await t.query('DELETE FROM carts WHERE id = $1', [fromId]);
    await t.query('UPDATE carts SET updated_at = now() WHERE id = $1', [toId]);
  });
}

// Authoritative cart lines: prices and stock always come from the database.
export function cartLines(q, cartId) {
  return rows(q, `
    SELECT v.id AS "variantId", p.id AS "productId", p.slug, p.name, v.sku, v.size, v.color, ci.quantity AS qty,
           v.stock_quantity AS stock, COALESCE(v.price_override, p.base_price) AS price, p.tax_rate AS "taxRate",
           (v.active AND p.status = 'active') AS available,
           (SELECT image_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.display_order, i.id LIMIT 1) AS image
    FROM cart_items ci
    JOIN product_variants v ON v.id = ci.variant_id
    JOIN products p ON p.id = v.product_id
    WHERE ci.cart_id = $1 ORDER BY ci.id`, [cartId]);
}

export async function shippingFor(q, subtotal) {
  const m = await one(q, `SELECT id, code, name, base_amount, free_over FROM shipping_methods WHERE active ORDER BY id LIMIT 1`);
  if (!m) return { id: null, amount: 0, name: 'Shipping' };
  return { id: m.id, name: m.name, amount: m.free_over != null && subtotal >= m.free_over ? 0 : m.base_amount, freeOver: m.free_over };
}

export function issueFor(l) {
  if (!l.available) return 'unavailable';
  if (l.stock < 1) return 'sold_out';
  if (l.stock < l.qty) return 'insufficient_stock';
  return null;
}

export async function cartView(db, cart) {
  const lines = cart ? await cartLines(db, cart.id) : [];
  const items = lines.map(l => ({ variantId: l.variantId, slug: l.slug, name: l.name, size: l.size, color: l.color, price: l.price, qty: l.qty, stock: l.stock, image: l.image, issue: issueFor(l) }));
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const ship = await shippingFor(db, subtotal);
  return { items, count: items.reduce((s, i) => s + i.qty, 0), subtotal, shipping: { amount: items.length ? ship.amount : 0, freeOver: ship.freeOver ?? null }, hasIssues: items.some(i => i.issue) };
}

export async function setQuantity(db, cartId, variantId, quantity, { add = false } = {}) {
  const v = await one(db, `SELECT v.stock_quantity AS stock, (v.active AND p.status = 'active') AS available
                           FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = $1`, [variantId]);
  if (!v || !v.available) throw new HttpError(404, 'This piece is no longer available', 'unavailable');
  if (v.stock < 1) throw new HttpError(409, 'This size is sold out', 'sold_out');
  const limit = Math.min(MAX_QTY, v.stock);
  const existing = await one(db, 'SELECT quantity FROM cart_items WHERE cart_id = $1 AND variant_id = $2', [cartId, variantId]);
  const target = add ? (existing?.quantity ?? 0) + quantity : quantity;
  if (target > limit) throw new HttpError(409, limit < MAX_QTY ? `Only ${v.stock} available in this size` : `Maximum ${MAX_QTY} per piece`, 'limit');
  if (target < 1) { await db.query('DELETE FROM cart_items WHERE cart_id = $1 AND variant_id = $2', [cartId, variantId]); return }
  await db.query(`INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES ($1, $2, $3)
                  ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = EXCLUDED.quantity`, [cartId, variantId, target]);
  await db.query('UPDATE carts SET updated_at = now() WHERE id = $1', [cartId]);
}
