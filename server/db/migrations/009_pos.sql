-- DHANYA POS: in-store billing. Purely additive: no existing table or column is altered.
-- Stock is NOT duplicated: sales decrement product_variants.stock_quantity and write inventory_movements,
-- exactly like online orders. POS sales live in their own tables so online-order stats and fulfilment are untouched.
-- Money is integer paise, like the rest of the schema.

CREATE TABLE pos_counters (
  year INT PRIMARY KEY,
  last INT NOT NULL DEFAULT 0
);

CREATE TABLE pos_sales (
  id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_no      TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,            -- a double-clicked / retried checkout can never create two bills
  status          TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','voided')),
  customer_name   TEXT NOT NULL DEFAULT '',
  customer_phone  TEXT NOT NULL DEFAULT '',
  is_gst          BOOLEAN NOT NULL DEFAULT true,
  subtotal        INT NOT NULL CHECK (subtotal >= 0),         -- GST-exclusive, before discount
  discount_type   TEXT NOT NULL DEFAULT 'fixed' CHECK (discount_type IN ('percent','fixed')),
  discount_value  INT NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  discount_amount INT NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount      INT NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  delivery_fee    INT NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  total_amount    INT NOT NULL CHECK (total_amount >= 0),     -- subtotal - discount + tax + delivery
  payment_mode    TEXT NOT NULL CHECK (payment_mode IN ('cash','upi','card','split')),
  pay_cash        INT NOT NULL DEFAULT 0 CHECK (pay_cash >= 0),
  pay_upi         INT NOT NULL DEFAULT 0 CHECK (pay_upi >= 0),
  pay_card        INT NOT NULL DEFAULT 0 CHECK (pay_card >= 0),
  cash_tendered   INT NOT NULL DEFAULT 0 CHECK (cash_tendered >= 0),
  change_given    INT NOT NULL DEFAULT 0 CHECK (change_given >= 0),
  payment_ref     TEXT,                                       -- UPI txn id / card slip no. typed by the cashier
  notes           TEXT,
  cashier_id      INT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  voided_at       TIMESTAMPTZ,
  voided_by       INT REFERENCES profiles(id) ON DELETE SET NULL,
  void_reason     TEXT,
  CHECK (pay_cash + pay_upi + pay_card = total_amount)
);
CREATE INDEX pos_sales_created_idx ON pos_sales (created_at DESC);
CREATE INDEX pos_sales_phone_idx ON pos_sales (customer_phone);

CREATE TABLE pos_sale_items (
  id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sale_id          INT NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  product_id       INT REFERENCES products(id) ON DELETE SET NULL,
  variant_id       INT REFERENCES product_variants(id) ON DELETE SET NULL,
  name_snapshot    TEXT NOT NULL,
  sku_snapshot     TEXT NOT NULL,
  variant_snapshot JSONB NOT NULL,
  unit_price       INT NOT NULL CHECK (unit_price >= 0),
  quantity         INT NOT NULL CHECK (quantity > 0),
  line_total       INT NOT NULL,                              -- unit_price * quantity, before discount
  discount_alloc   INT NOT NULL DEFAULT 0,                    -- this line's share of the bill discount
  tax_rate         INT NOT NULL DEFAULT 0,
  tax_amount       INT NOT NULL DEFAULT 0
);
CREATE INDEX pos_sale_items_sale_idx ON pos_sale_items (sale_id);
CREATE INDEX pos_sale_items_variant_idx ON pos_sale_items (variant_id);
