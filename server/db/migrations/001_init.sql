-- DHANYA core schema (PostgreSQL). Money is stored as integer minor units (paise): exact, no floating point.

CREATE TABLE profiles (
  id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email          TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  full_name      TEXT NOT NULL DEFAULT '',
  phone          TEXT,
  role           TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','owner','admin','cashier','inventory')),
  email_verified_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_email_lower_key ON profiles (lower(email));

CREATE TABLE categories (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  description   TEXT,
  image_url     TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0
);

CREATE TABLE collections (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  hero_image  TEXT,
  status      TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  display_order INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  category_id INT REFERENCES categories(id) ON DELETE SET NULL,
  base_price  INT NOT NULL CHECK (base_price >= 0),
  currency    CHAR(3) NOT NULL DEFAULT 'INR',
  tax_rate    INT NOT NULL DEFAULT 5 CHECK (tax_rate BETWEEN 0 AND 28),
  material    TEXT,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  featured    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX products_category_idx ON products (category_id);
CREATE INDEX products_status_featured_idx ON products (status, featured);

CREATE TABLE product_variants (
  id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id     INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku            TEXT NOT NULL UNIQUE,
  size           TEXT NOT NULL,
  color          TEXT NOT NULL DEFAULT 'Default',
  price_override INT CHECK (price_override IS NULL OR price_override >= 0),
  stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  active         BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (product_id, size, color)
);
CREATE INDEX product_variants_product_idx ON product_variants (product_id);

CREATE TABLE product_images (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id    INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id    INT REFERENCES product_variants(id) ON DELETE SET NULL,
  image_url     TEXT NOT NULL,
  alt_text      TEXT NOT NULL DEFAULT '',
  display_order INT NOT NULL DEFAULT 0
);
CREATE INDEX product_images_product_idx ON product_images (product_id, display_order);

CREATE TABLE collection_products (
  collection_id INT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  product_id    INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  display_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, product_id)
);

-- Carts: one per signed-in customer, or one per guest (only a SHA-256 hash of the guest token is stored).
CREATE TABLE carts (
  id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id          INT REFERENCES profiles(id) ON DELETE CASCADE,
  guest_token_hash TEXT UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR guest_token_hash IS NOT NULL)
);
CREATE UNIQUE INDEX carts_user_key ON carts (user_id) WHERE user_id IS NOT NULL;

CREATE TABLE cart_items (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cart_id    INT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id INT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity   INT NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cart_id, variant_id)
);

CREATE TABLE wishlists (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    INT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE wishlist_items (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wishlist_id INT NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
  product_id  INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wishlist_id, product_id)
);

CREATE TABLE addresses (
  id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        INT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_name TEXT NOT NULL,
  phone          TEXT NOT NULL,
  address_line_1 TEXT NOT NULL,
  address_line_2 TEXT,
  city           TEXT NOT NULL,
  state          TEXT NOT NULL,
  postal_code    TEXT NOT NULL,
  country        TEXT NOT NULL DEFAULT 'IN',
  is_default     BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX addresses_user_idx ON addresses (user_id);

CREATE TABLE shipping_methods (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  base_amount INT NOT NULL CHECK (base_amount >= 0),
  free_over   INT CHECK (free_over IS NULL OR free_over >= 0),
  active      BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE discounts (
  id                INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code              TEXT NOT NULL,
  discount_type     TEXT NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value    INT NOT NULL CHECK (discount_value > 0),
  minimum_order_value INT NOT NULL DEFAULT 0,
  starts_at         TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  usage_limit       INT,
  used_count        INT NOT NULL DEFAULT 0,
  active            BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX discounts_code_lower_key ON discounts (lower(code));

CREATE TABLE orders (
  id                        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id                   INT REFERENCES profiles(id) ON DELETE SET NULL,
  order_number              TEXT NOT NULL UNIQUE,
  email                     TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','packed','shipped','delivered','cancelled')),
  payment_status            TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','failed','cancelled','refunded')),
  subtotal                  INT NOT NULL,
  discount_amount           INT NOT NULL DEFAULT 0,
  shipping_amount           INT NOT NULL DEFAULT 0,
  tax_amount                INT NOT NULL DEFAULT 0,
  total_amount              INT NOT NULL,
  currency                  CHAR(3) NOT NULL DEFAULT 'INR',
  shipping_address_snapshot JSONB NOT NULL,
  discount_code             TEXT,
  shipping_method_id        INT REFERENCES shipping_methods(id),
  reservation_expires_at    TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_user_idx ON orders (user_id, id DESC);
CREATE INDEX orders_pending_idx ON orders (reservation_expires_at) WHERE payment_status = 'pending';

CREATE TABLE order_items (
  id                    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id              INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id            INT REFERENCES products(id) ON DELETE SET NULL,
  variant_id            INT REFERENCES product_variants(id) ON DELETE SET NULL,
  product_name_snapshot TEXT NOT NULL,
  sku_snapshot          TEXT NOT NULL,
  variant_snapshot      JSONB NOT NULL,
  unit_price            INT NOT NULL,
  quantity              INT NOT NULL CHECK (quantity > 0),
  line_total            INT NOT NULL
);
CREATE INDEX order_items_order_idx ON order_items (order_id);

CREATE TABLE payments (
  id                  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id            INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL,
  provider_order_id   TEXT NOT NULL,
  provider_payment_id TEXT,
  amount              INT NOT NULL,
  currency            CHAR(3) NOT NULL DEFAULT 'INR',
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','captured','failed','cancelled','refunded')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_order_id)
);
CREATE UNIQUE INDEX payments_provider_payment_key ON payments (provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;

CREATE TABLE inventory_movements (
  id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  variant_id      INT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity_change INT NOT NULL,
  reason          TEXT NOT NULL,
  reference_id    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_variant_idx ON inventory_movements (variant_id, id DESC);

CREATE TABLE journal_articles (
  id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title        TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  excerpt      TEXT,
  content      TEXT NOT NULL DEFAULT '',
  cover_image  TEXT,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at TIMESTAMPTZ
);

CREATE TABLE newsletter_subscribers (
  id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email        TEXT NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source       TEXT NOT NULL DEFAULT 'footer'
);
CREATE UNIQUE INDEX newsletter_email_lower_key ON newsletter_subscribers (lower(email));

CREATE TABLE audit_events (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id   INT REFERENCES profiles(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  meta       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_entity_idx ON audit_events (entity, entity_id);
