-- Dhanya POS customers (name, mobile, date of birth). Filled from bills and editable by staff. Additive only.
-- phone is stored as the last 10 digits so "98765 43210", "+91 9876543210" and "9876543210" are the same customer.
CREATE TABLE pos_customers (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  phone      TEXT NOT NULL,
  dob        DATE,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pos_customers_phone_key ON pos_customers (phone);

-- Backfill from existing bills (latest name / birthday per mobile number).
INSERT INTO pos_customers (name, phone, dob)
SELECT DISTINCT ON (p) COALESCE(NULLIF(customer_name, ''), ''), p, customer_dob
FROM (SELECT right(regexp_replace(customer_phone, '\D', '', 'g'), 10) AS p, customer_name, customer_dob, id FROM pos_sales WHERE status = 'completed') s
WHERE length(p) >= 7
ORDER BY p, id DESC
ON CONFLICT (phone) DO NOTHING;

-- Bill details the IGMOLS billing panel captures: bill date (custom / past), customer address, order source (offline POS vs online order),
-- and an optional flat GST % for the whole bill (otherwise each item's own GST rate applies).
ALTER TABLE pos_sales ADD COLUMN bill_date DATE;
UPDATE pos_sales SET bill_date = (created_at AT TIME ZONE 'Asia/Kolkata')::date;
ALTER TABLE pos_sales ALTER COLUMN bill_date SET NOT NULL;
ALTER TABLE pos_sales ALTER COLUMN bill_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date);
ALTER TABLE pos_sales ADD COLUMN customer_address TEXT NOT NULL DEFAULT '';
ALTER TABLE pos_sales ADD COLUMN source TEXT NOT NULL DEFAULT 'offline' CHECK (source IN ('offline','online'));
ALTER TABLE pos_sales ADD COLUMN gst_rate INT CHECK (gst_rate IS NULL OR gst_rate BETWEEN 0 AND 28);
CREATE INDEX pos_sales_bill_date_idx ON pos_sales (bill_date DESC);

-- Money out, for net earnings in analytics.
CREATE TABLE pos_expenses (
  id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title        TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'General',
  amount       INT NOT NULL CHECK (amount > 0),
  payment_mode TEXT NOT NULL DEFAULT 'cash' CHECK (payment_mode IN ('cash','upi','card')),
  notes        TEXT,
  expense_date DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date),
  created_by   INT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pos_expenses_date_idx ON pos_expenses (expense_date DESC);
