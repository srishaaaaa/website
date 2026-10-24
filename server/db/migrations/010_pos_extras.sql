-- Dhanya POS extras: customer birthday, coupons, settings (GSTIN, delivery presets) and a wholesale channel. Additive only.
ALTER TABLE pos_sales ADD COLUMN customer_dob DATE;
ALTER TABLE pos_sales ADD COLUMN coupon_code TEXT;
ALTER TABLE pos_sales ADD COLUMN channel TEXT NOT NULL DEFAULT 'retail' CHECK (channel IN ('retail','wholesale'));
CREATE INDEX pos_sales_channel_idx ON pos_sales (channel, created_at DESC);

-- Invoice numbers run in a separate series per channel (DP-… retail, DW-… wholesale).
ALTER TABLE pos_counters ADD COLUMN channel TEXT NOT NULL DEFAULT 'retail';
ALTER TABLE pos_counters DROP CONSTRAINT pos_counters_pkey;
ALTER TABLE pos_counters ADD PRIMARY KEY (year, channel);

CREATE TABLE pos_coupons (
  id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code           TEXT NOT NULL,
  discount_type  TEXT NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value INT NOT NULL CHECK (discount_value > 0),     -- percent (1-100) or paise
  min_order      INT NOT NULL DEFAULT 0 CHECK (min_order >= 0),
  expires_on     DATE,
  usage_limit    INT CHECK (usage_limit IS NULL OR usage_limit > 0),
  used_count     INT NOT NULL DEFAULT 0,
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (discount_type <> 'percent' OR discount_value <= 100)
);
CREATE UNIQUE INDEX pos_coupons_code_key ON pos_coupons (upper(code));

CREATE TABLE pos_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Wholesale catalogue: simple items (code, company/manufacturer, colour). Prices and quantities are entered per bill.
CREATE TABLE pos_ws_items (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       TEXT NOT NULL,
  company    TEXT NOT NULL DEFAULT '',
  colour     TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pos_ws_items_key ON pos_ws_items (upper(code), upper(company), upper(colour));
