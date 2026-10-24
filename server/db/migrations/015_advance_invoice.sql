-- Shareable invoice links (unguessable token, not the invoice number) and advance orders (booked with a deposit, billed on collection). Additive only.
ALTER TABLE pos_sales ADD COLUMN share_token TEXT;
UPDATE pos_sales SET share_token = substr(md5(random()::text || clock_timestamp()::text || id::text) || md5(id::text || random()::text), 1, 22);
ALTER TABLE pos_sales ALTER COLUMN share_token SET NOT NULL;
CREATE UNIQUE INDEX pos_sales_share_token_key ON pos_sales (share_token);

CREATE TABLE pos_advances (
  id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','completed','cancelled')),
  customer_name    TEXT NOT NULL DEFAULT '',
  customer_phone   TEXT NOT NULL DEFAULT '',
  customer_address TEXT NOT NULL DEFAULT '',
  is_gst           BOOLEAN NOT NULL DEFAULT false,
  gst_rate         INT CHECK (gst_rate IS NULL OR gst_rate BETWEEN 0 AND 28),
  discount_type    TEXT NOT NULL DEFAULT 'fixed' CHECK (discount_type IN ('percent','fixed')),
  discount_value   INT NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  delivery_fee     INT NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  items            JSONB NOT NULL,                       -- price snapshot taken at booking
  subtotal         INT NOT NULL CHECK (subtotal >= 0),
  discount_amount  INT NOT NULL DEFAULT 0,
  tax_amount       INT NOT NULL DEFAULT 0,
  total_amount     INT NOT NULL CHECK (total_amount >= 0),
  deposit          INT NOT NULL DEFAULT 0 CHECK (deposit >= 0),
  deposit_mode     TEXT NOT NULL DEFAULT 'cash' CHECK (deposit_mode IN ('cash','upi','card')),
  delivery_date    DATE,
  notes            TEXT,
  finalized_invoice TEXT,
  finalized_at     TIMESTAMPTZ,
  cancelled_at     TIMESTAMPTZ,
  created_by       INT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (deposit <= total_amount)
);
CREATE INDEX pos_advances_status_idx ON pos_advances (status, created_at DESC);
